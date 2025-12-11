# ANÁLISE PROFUNDA: PROBLEMA ROOT CAUSE E SOLUÇÃO

## 🔍 PROBLEMA IDENTIFICADO

### **Root Cause: `.or()` NÃO funciona em UPDATE do Supabase Client**

O código V5 tentava fazer um UPDATE atômico assim:

```typescript
const { data, error } = await supabaseAdmin
  .from("prospecting_sessions")
  .update({ batch_lock_id: webhookId, batch_lock_until: lockUntil })
  .eq("id", session.id)
  .or(`batch_lock_until.is.null,batch_lock_until.lt.${new Date().toISOString()}`)
  .select()
  .single();
```

### **O que acontecia:**

1. O Supabase Client **IGNORA** o `.or()` em operações de UPDATE
2. Apenas o `.eq()` era aplicado
3. Resultado: **TODOS os webhooks conseguiam fazer UPDATE simultaneamente**
4. Não havia verificação atômica se o lock estava livre
5. Race condition → múltiplas respostas enviadas ao cliente

### **Por que não funcionava:**

- `.or()` só funciona em **SELECT**
- Em UPDATE, o Supabase Client não suporta condições complexas
- O PostgreSQL subjacente SUPORTA, mas o client não expõe

## ✅ SOLUÇÃO IMPLEMENTADA: RPC Functions

### **V6: Lock Atômico via Stored Procedures**

Criamos 2 funções PostgreSQL:

#### 1. `acquire_batch_lock` - Adquirir Lock
```sql
CREATE OR REPLACE FUNCTION acquire_batch_lock(
  p_session_id UUID,
  p_webhook_id TEXT,
  p_lock_duration_seconds INTEGER DEFAULT 120
)
RETURNS TABLE(success BOOLEAN, lock_owner TEXT) 
LANGUAGE plpgsql
AS $$
DECLARE
  v_lock_owner TEXT;
  v_affected_rows INTEGER;
BEGIN
  -- UPDATE com WHERE complexo (FUNCIONA no PostgreSQL)
  UPDATE prospecting_sessions
  SET 
    batch_lock_id = p_webhook_id,
    batch_lock_until = NOW() + (p_lock_duration_seconds || ' seconds')::INTERVAL
  WHERE 
    id = p_session_id
    AND (
      batch_lock_until IS NULL 
      OR batch_lock_until < NOW()
    );
  
  GET DIAGNOSTICS v_affected_rows = ROW_COUNT;
  
  -- Se afetou 1 linha = conseguiu lock
  IF v_affected_rows > 0 THEN
    RETURN QUERY SELECT TRUE, p_webhook_id;
    RETURN;
  END IF;
  
  -- Senão, retorna quem tem o lock
  SELECT batch_lock_id INTO v_lock_owner
  FROM prospecting_sessions
  WHERE id = p_session_id;
  
  RETURN QUERY SELECT FALSE, v_lock_owner;
END;
$$;
```

#### 2. `release_batch_lock` - Liberar Lock
```sql
CREATE OR REPLACE FUNCTION release_batch_lock(
  p_session_id UUID,
  p_webhook_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_affected_rows INTEGER;
BEGIN
  -- Só libera se somos donos do lock
  UPDATE prospecting_sessions
  SET 
    batch_lock_id = NULL,
    batch_lock_until = NULL
  WHERE 
    id = p_session_id
    AND batch_lock_id = p_webhook_id;
  
  GET DIAGNOSTICS v_affected_rows = ROW_COUNT;
  
  RETURN v_affected_rows > 0;
END;
$$;
```

### **Uso no Edge Function:**

```typescript
// Adquirir lock
const { data: lockResult, error } = await supabaseAdmin
  .rpc('acquire_batch_lock', {
    p_session_id: session.id,
    p_webhook_id: webhookId,
    p_lock_duration_seconds: 120
  });

const lockAcquired = lockResult?.[0]?.success || false;

if (!lockAcquired) {
  // Não conseguiu - outro webhook tem o lock
  return Response({ batched: true });
}

// Processar mensagens...

// Liberar lock
await supabaseAdmin.rpc('release_batch_lock', {
  p_session_id: session.id,
  p_webhook_id: webhookId
});
```

## 🎯 BENEFÍCIOS DA SOLUÇÃO

### 1. **Atomicidade Garantida**
- O UPDATE no PostgreSQL é transacional
- `ROW_COUNT` verifica se realmente atualizou
- Apenas 1 webhook consegue lock por vez

### 2. **Segurança**
- `release_batch_lock` só funciona se você é o dono
- Ninguém pode liberar lock de outro

### 3. **Observabilidade**
- Retorna quem tem o lock se falhar
- Logs claros de quem conseguiu/falhou

### 4. **Performance**
- Executa tudo no banco (menos round trips)
- Mais rápido que múltiplas queries

## 📊 TESTE DE VALIDAÇÃO

Criamos `test-rpc-lock-simple.js` que simula 5 webhooks paralelos:

**Resultado Esperado:**
- ✅ 1 webhook consegue lock
- ❌ 4 webhooks são bloqueados
- ✅ Após release, outro pode adquirir

## 🚀 DEPLOY

**Versão:** 63 (V6)  
**Data:** 2025-12-11 17:07  
**Status:** ACTIVE  

### **Arquivos Modificados:**
1. `supabase/migrations/20251211_fix_atomic_lock.sql` - RPC functions
2. `supabase/functions/receive-whatsapp-message/index.ts` - Uso de RPC
3. `scripts/test-rpc-lock-simple.js` - Teste de validação
4. `scripts/test-atomic-lock-fix.ts` - Teste detalhado (Deno)

## 📝 PRÓXIMOS PASSOS

1. **Testar com mensagens reais no WhatsApp**
   - Enviar 5-6 mensagens rápidas
   - Verificar que IA responde apenas 1 vez
   - Validar nos logs que apenas 1 webhook processou

2. **Monitorar logs**
   ```bash
   # Buscar logs da função
   npx supabase functions logs receive-whatsapp-message --project-ref jufguvfzieysywthbafu
   ```

3. **Validar comportamento:**
   - ✅ Apenas 1 webhook mostra "LOCK ADQUIRIDO"
   - ✅ Outros mostram "Lock pertence a webhook-X"
   - ✅ Cliente recebe apenas 1 resposta consolidada
   - ✅ Lock é liberado após processamento

## 🔧 DEBUGGING

Se ainda houver duplicatas:

1. Verificar se RPC functions foram criadas:
   ```sql
   SELECT proname FROM pg_proc WHERE proname LIKE 'acquire_batch%';
   ```

2. Verificar logs de lock:
   ```
   Buscar por: "[BATCHING V6]"
   ```

3. Verificar se lock está sendo liberado:
   ```sql
   SELECT id, batch_lock_id, batch_lock_until 
   FROM prospecting_sessions 
   WHERE batch_lock_id IS NOT NULL;
   ```

## ✨ CONCLUSÃO

**ANTES (V5):**
- ❌ `.or()` ignorado em UPDATE
- ❌ Race condition
- ❌ Múltiplos webhooks processavam
- ❌ Duplicatas enviadas ao cliente

**DEPOIS (V6):**
- ✅ RPC com UPDATE atômico
- ✅ Apenas 1 webhook processa
- ✅ Lock seguro e observável
- ✅ Uma resposta consolidada ao cliente

---

**Data da Análise:** 2025-12-11  
**Versão Implementada:** V6 (versão 63)  
**Status:** PRONTO PARA TESTES REAIS
