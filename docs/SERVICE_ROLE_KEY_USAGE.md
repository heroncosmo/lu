# Service Role Key vs Anon Key Usage Guide

## Visão Geral

O Supabase oferece dois tipos principais de chaves de API:
- **Anon Key** (pública): Respeita Row Level Security (RLS)
- **Service Role Key** (privada): Bypassa RLS - acesso total ao banco

## 🔴 Quando usar SERVICE_ROLE_KEY

### Edge Functions que precisam acessar dados cross-user

**1. receive-whatsapp-message**
```typescript
// PRECISA de SERVICE_ROLE_KEY porque:
// - Cria mensagens para qualquer participant_id
// - Atualiza campaign_participants sem user_id no contexto
// - Sincroniza com CRM independente de auth

const supabase = createClient(
  SUPABASE_URL!,
  SUPABASE_SERVICE_ROLE_KEY! // ✅ Correto
);
```

**2. cadence-scheduler**
```typescript
// PRECISA de SERVICE_ROLE_KEY porque:
// - Query all campaign_participants scheduled para hoje
// - Sem filtro por user_id (campaigns podem ter múltiplos usuários)
// - Scheduled job rodando em background (sem auth context)

const supabase = createClient(
  SUPABASE_URL!,
  SUPABASE_SERVICE_ROLE_KEY! // ✅ Correto
);
```

**3. sync-owner-lock**
```typescript
// PRECISA de SERVICE_ROLE_KEY porque:
// - Atualiza lead_states.owner_id cross-user
// - Sincroniza ownership entre Supabase e Redsis CRM
// - Operação system-level (não user-level)

const supabase = createClient(
  SUPABASE_URL!,
  SUPABASE_SERVICE_ROLE_KEY! // ✅ Correto
);
```

**4. send-email**
```typescript
// PRECISA de SERVICE_ROLE_KEY porque:
// - Fallback automático após falhas WhatsApp
// - Triggered por sistema, não por user action
// - Precisa acessar participant data cross-campaign

const supabase = createClient(
  SUPABASE_URL!,
  SUPABASE_SERVICE_ROLE_KEY! // ✅ Correto
);
```

**5. gpt-agent (geração de mensagens)**
```typescript
// PRECISA de SERVICE_ROLE_KEY porque:
// - Gera mensagens para qualquer campaign
// - Acessa triple profile (agent_personas + client_profiles + campaign_profiles)
// - Chamado por outros edge functions via invoke()

const supabase = createClient(
  SUPABASE_URL!,
  SUPABASE_SERVICE_ROLE_KEY! // ✅ Correto
);
```

---

## 🟢 Quando usar ANON KEY

### Frontend Components (React)

**1. KanbanBoard.tsx**
```typescript
// USA ANON KEY porque:
// - Queries filtradas por user_id via RLS
// - User precisa ver apenas seus leads
// - assume_lead/release_lead RPCs validam ownership

const supabase = createClient(
  SUPABASE_URL!,
  SUPABASE_ANON_KEY! // ✅ Correto
);
```

**2. CampaignBuilder.tsx**
```typescript
// USA ANON KEY porque:
// - User cria campaigns próprias
// - RLS garante que campaigns.user_id = auth.uid()
// - Inserts respeitam ownership

const supabase = createClient(
  SUPABASE_URL!,
  SUPABASE_ANON_KEY! // ✅ Correto
);
```

**3. CampaignManagement.tsx**
```typescript
// USA ANON KEY porque:
// - Lista apenas campaigns do user logado
// - RLS filtra automaticamente por auth.uid()
// - Protege dados de outros users

const supabase = createClient(
  SUPABASE_URL!,
  SUPABASE_ANON_KEY! // ✅ Correto
);
```

---

## 🔒 Segurança

### SERVICE_ROLE_KEY

**NUNCA exponha SERVICE_ROLE_KEY no frontend:**
```typescript
// ❌ ERRADO
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SERVICE_ROLE_KEY // NUNCA!
);
```

**✅ Use apenas em Edge Functions:**
```typescript
// ✅ CORRETO (Deno edge function)
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
```

### Validação Manual de Business Logic

Mesmo com SERVICE_ROLE_KEY, valide regras de negócio:

```typescript
// MESMO bypassando RLS, valide business logic
const { data: campaign } = await supabase
  .from("campaigns")
  .select("*")
  .eq("id", campaign_id)
  .single();

// ✅ Validar se campaign.is_active
if (!campaign.is_active) {
  throw new Error("Campaign inativa");
}

// ✅ Validar quiet hours antes de enviar mensagem
if (isQuietHours(campaign.quiet_hours)) {
  console.log("Agendando para depois do quiet hours");
  return;
}
```

---

## 📋 Checklist por Contexto

### Edge Function Nova

```typescript
// ❓ Pergunta: Esta função precisa acessar dados de múltiplos users?
// ❓ Pergunta: Esta função é triggered por sistema (scheduler, webhook)?
// ❓ Pergunta: Esta função faz sync cross-system (CRM, WhatsApp)?

// Se SIM para qualquer pergunta:
const supabase = createClient(
  SUPABASE_URL!,
  SUPABASE_SERVICE_ROLE_KEY! // ✅ Use SERVICE_ROLE_KEY
);

// Se NÃO para todas:
const supabase = createClient(
  SUPABASE_URL!,
  SUPABASE_ANON_KEY! // ✅ Use ANON_KEY
);
```

### Frontend Component Novo

```typescript
// ❓ Pergunta: Component é user-specific?
// ❓ Pergunta: Queries devem respeitar ownership?

// Se SIM:
const supabase = createClient(
  SUPABASE_URL!,
  SUPABASE_ANON_KEY! // ✅ Use ANON_KEY
);

// Se NÃO (raro):
// Provavelmente você precisa de um edge function intermediário
```

---

## 🎯 Exemplos Reais

### Cenário 1: Enviar Mensagem WhatsApp

**Frontend (KanbanBoard):**
```typescript
// User clica "Enviar mensagem" no Kanban
const { data, error } = await supabase.functions.invoke('send-whatsapp-message', {
  body: { agent_id, client_name, client_whatsapp_number }
});
// ✅ Frontend usa ANON_KEY
```

**Edge Function (send-whatsapp-message):**
```typescript
// Dentro da edge function, busca campaign_participant
const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
// ✅ Edge function usa SERVICE_ROLE_KEY
// Porque: precisa criar whatsapp_messages para qualquer participant
```

### Cenário 2: Assumir Lead no Kanban

**Frontend (KanbanBoard):**
```typescript
// User clica "Assumir" no card
const { data, error } = await supabase.rpc('assume_lead', {
  lead_state_id: cardId,
  user_id: user.id,
  reason: 'manual'
});
// ✅ Frontend usa ANON_KEY
// ✅ RPC assume_lead valida que user_id = auth.uid()
```

**RPC assume_lead (SQL):**
```sql
CREATE FUNCTION assume_lead(lead_state_id UUID, user_id UUID, reason TEXT)
RETURNS void
SECURITY DEFINER -- ✅ Escalates privileges dentro da função
AS $$
BEGIN
  -- Validar que caller é o próprio user
  IF user_id != auth.uid() THEN
    RAISE EXCEPTION 'Não pode assumir lead para outro user';
  END IF;
  
  -- Update com SECURITY DEFINER bypassa RLS temporariamente
  UPDATE lead_states
  SET owner_id = user_id,
      owner_lock = true,
      owner_locked_at = NOW(),
      ai_paused = true
  WHERE id = lead_state_id;
END;
$$ LANGUAGE plpgsql;
```

---

## 🚨 Erros Comuns

### ❌ Erro 1: Usar ANON_KEY em edge function cross-user

```typescript
// ERRADO
const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);

// Tentando query all participants
const { data } = await supabase
  .from("campaign_participants")
  .select("*"); // ❌ RLS bloqueia se não filtrar por user_id
```

### ❌ Erro 2: Expor SERVICE_ROLE_KEY no frontend

```typescript
// ERRADO - NUNCA faça isso!
const supabase = createClient(
  "https://xxx.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." // ❌ SERVICE_ROLE_KEY exposta!
);
```

### ❌ Erro 3: Não validar business logic com SERVICE_ROLE_KEY

```typescript
// ERRADO - Bypassa RLS MAS não valida regras
const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

await supabase
  .from("lead_states")
  .update({ owner_id: new_user_id })
  .eq("id", lead_id); // ❌ Não valida se lead já está locked!

// CORRETO
const { data: lead } = await supabase
  .from("lead_states")
  .select("owner_id, owner_lock")
  .eq("id", lead_id)
  .single();

if (lead.owner_lock && lead.owner_id !== null) {
  throw new Error("Lead já assumido por outro user");
}
```

---

## 📚 Referências

- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [Edge Functions](https://supabase.com/docs/guides/functions)
- [Service Role vs Anon Key](https://supabase.com/docs/guides/api#api-keys)

---

## ✅ Resumo

| Contexto | Key | RLS | Validação |
|----------|-----|-----|-----------|
| Frontend Components | ANON_KEY | ✅ Sim | Automática (RLS) |
| User-specific RPCs | ANON_KEY | ✅ Sim | Via SECURITY DEFINER |
| Edge Functions (cross-user) | SERVICE_ROLE_KEY | ❌ Não | Manual (código) |
| Scheduled Jobs | SERVICE_ROLE_KEY | ❌ Não | Manual (código) |
| Webhooks (externos) | SERVICE_ROLE_KEY | ❌ Não | Manual (código) |

**Regra de ouro:** Se você não tem um user_id no contexto ou precisa acessar dados de múltiplos users, use SERVICE_ROLE_KEY + validação manual.
