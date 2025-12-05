# 🔍 Auditoria de Segurança e Funcionalidade - Luchoa-IA

**Data:** Janeiro 2025  
**Status:** Correções Aplicadas ✅

---

## ✅ Problemas Corrigidos

### 1. Exposição de Credenciais (CRÍTICO) ✅
**Antes:** Credenciais Redsis CRM e GPT API keys expostas no bundle JavaScript do navegador.

**Correção:**
- Criada Edge Function `inventory-api` para proxy de todas as chamadas Redsis
- Criada Edge Function `inventory-broadcast` para chamadas GPT
- Frontend `Inventory.tsx` atualizado para usar `supabase.functions.invoke()`
- Credenciais ficam apenas no servidor (Supabase Secrets)

### 2. Bypass de Autenticação em /inventory (CRÍTICO) ✅
**Antes:** Rota `/inventory` estava fora do `ProtectedRoute` e tinha `// TODO: Reintroduzir autenticação depois dos testes`.

**Correção:**
- Rota movida para dentro do `ProtectedRoute` em `App.tsx`
- Verificação de autenticação restaurada em `Inventory.tsx`
- Redirecionamento para login se não autenticado

### 3. Multi-Instância WhatsApp Inbound (ALTO) ✅
**Antes:** `receive-whatsapp-message` usava env vars fixas `WHATSAPP_INSTANCE_ID/WHATSAPP_TOKEN`, sem suporte a múltiplas instâncias para mensagens de entrada.

**Correção:**
- Adicionada função `getWhatsAppInstance()` que busca instância no banco
- Suporta busca por `instance_id` do webhook ou `phone_number`
- Fallback para env vars se não encontrar (compatibilidade retroativa)
- Mensagens de saída usam a instância correta

### 4. KanbanBoard Owner-Lock com ID Errado (MÉDIO) ✅
**Antes:** Passava `atividade.codigo` (número do Redsis) para `assume_lead` RPC que espera UUID do `lead_states`.

**Correção:**
- Função `lockMutation` agora busca ou cria `lead_state` pelo `crm_atividade_codigo`
- Usa o UUID correto do `lead_states` para as RPCs
- Sincronização com Redsis usa o código da atividade corretamente

---

## ⚠️ Itens Pendentes / Parcialmente Implementados

### Funcionalidades Core

| Feature | Status | Observação |
|---------|--------|------------|
| Estado de Máquina | 🟡 80% | Funciona, mas alguns estados não têm transições completas |
| Cadência Automática | 🟡 60% | Edge function existe, cron job precisa ser configurado |
| Perfil Triplo GPT | 🟡 40% | Biblioteca existe, não integrada ao prompt principal |
| Negociação/Playbooks | 🔴 20% | Schema existe, UI não implementada |
| SLA Engine | 🟡 50% | Cálculo de urgência OK, alertas não implementados |
| Kanban Drag-and-Drop | 🟡 70% | Visualização OK, arrastar não implementado |
| Feedback/Blocklist | 🔴 30% | Schema existe, UI parcial |
| Inventário Broadcast | 🟢 90% | Corrigido, funciona via edge functions |
| Multi-language | 🟡 50% | Detecção OK, tradução de sistema não implementada |

### Integrações

| Integração | Status | Observação |
|------------|--------|------------|
| Redsis CRM | 🟢 85% | Funcionando, `getClientes()` com fallback |
| WhatsApp W-API | 🟢 90% | Multi-instance corrigido |
| OpenAI GPT | 🟢 90% | Movido para backend |
| Email SMTP | 🟡 50% | Configuração existe, envio não testado |
| Twilio SMS | 🟡 50% | Configuração existe, envio não testado |

### Segurança

| Item | Status |
|------|--------|
| RLS Policies | ✅ Configuradas |
| Autenticação | ✅ Supabase Auth |
| Rotas Protegidas | ✅ Corrigido |
| Credenciais em ENV | ✅ Corrigido |
| Service Role Key | ⚠️ Não usar no frontend |

---

## 📁 Arquivos Criados/Modificados

### Edge Functions Criadas
- `supabase/functions/inventory-api/index.ts` - Proxy para Redsis
- `supabase/functions/inventory-broadcast/index.ts` - Geração GPT

### Arquivos Modificados
- `src/App.tsx` - Rota /inventory dentro de ProtectedRoute
- `src/pages/Inventory.tsx` - Usa edge functions, auth restaurada
- `src/pages/KanbanBoard.tsx` - Owner-lock com ID correto
- `supabase/functions/receive-whatsapp-message/index.ts` - Multi-instance suporte

---

## 🧪 Como Testar

### 1. Autenticação
```bash
# Tentar acessar /inventory sem login deve redirecionar para /login
```

### 2. Edge Functions
```bash
# Deploy das edge functions
supabase functions deploy inventory-api
supabase functions deploy inventory-broadcast

# Verificar logs
supabase functions logs inventory-api
```

### 3. Multi-Instance WhatsApp
```bash
# Configurar instância no banco
INSERT INTO whatsapp_instances (name, instance_id, token, phone_number, is_active)
VALUES ('Loja 1', 'inst_xxx', 'token_xxx', '5511999999999', true);
```

---

## 📌 Recomendações Finais

1. **Secrets:** Mover todas as credenciais para Supabase Secrets
2. **Testes:** Implementar testes E2E com Playwright
3. **Documentação:** Atualizar docs para refletir estado real
4. **Monitoramento:** Configurar alertas para erros de edge functions
5. **Backup:** Configurar backup automático do banco

---

*Auditoria realizada e correções aplicadas com sucesso.*
