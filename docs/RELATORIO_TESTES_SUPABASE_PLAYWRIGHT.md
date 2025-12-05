# 🧪 RELATÓRIO DE TESTES — Supabase MCP + Playwright

> **Data:** 25/11/2025  
> **Ambiente:** http://localhost:32100 + Supabase Production  
> **Credenciais:** calcadosdrielle@gmail.com / Ibira2019!

---

## 📊 RESUMO DOS TESTES

### ✅ UI Tests (Playwright)

| Página | Rota | Status | Observações |
|--------|------|--------|-------------|
| Login | `/login` | ✅ PASS | Autenticação funcionando |
| Dashboard | `/` | ✅ PASS | Mostra 1 campanha ativa, 180 contatos, 1 WhatsApp |
| Contatos CRM | `/crm-contacts` | ✅ PASS | 180 contatos, 6 com WhatsApp, 1 ativo |
| Campanhas | `/campaigns` | ✅ PASS | 1 campanha "Campanha Teste CRM" ativa |
| Kanban | `/kanban` | ⚠️ VAZIO | Página carrega mas sem colunas/cards |
| WhatsApp | `/whatsapp-instances` | ✅ PASS | Botão "Nova Instância" presente |

### ✅ Database Tests (Supabase MCP)

| Tabela | Registros | Status | Observações |
|--------|-----------|--------|-------------|
| `agents` | 2 | ✅ OK | "Leandro ai" (GPT-4), "Agente Teste CRM" |
| `campaigns` | 1 | ✅ OK | "Campanha Teste CRM" ativa |
| `campaign_participants` | 0 | ⚠️ VAZIO | Campanha sem participantes! |
| `crm_contacts` | 180 | ✅ OK | 6 com WhatsApp, 180 com email, 1 ativo |
| `whatsapp_instances` | 1 | ✅ OK | "Leandro" (status: disconnected) |
| `whatsapp_messages` | 239 | ✅ OK | Mensagens trocadas |
| `prospecting_sessions` | 63 | ✅ OK | Sessões de prospecção |
| `sms_logs` | 0 | ⚠️ VAZIO | Nenhum SMS enviado |
| `email_logs` | 0 | ⚠️ VAZIO | Nenhum email enviado |

---

## 🔍 ANÁLISE DE PROBLEMAS DETECTADOS

### 1. ❌ Kanban Vazio

**Sintoma:** Página `/kanban` carrega mas não mostra colunas ou cards.

**Causa Identificada:** 
```sql
SELECT COUNT(DISTINCT kanban_funil_name) as kanban_funils FROM crm_contacts;
-- Result: 0 (todos campos kanban_funil_name/kanban_stage_name são NULL)
```

Os 180 contatos CRM não têm dados de Kanban (funil/etapa) preenchidos.

**Possível Solução:**
1. A função `sync-crm-contacts` não está mapeando os campos do Kanban da API Redsis
2. Ou a API Redsis não retorna esses dados
3. Verificar se os clientes no Redsis estão em algum funil

### 2. ⚠️ Campanha Sem Participantes

**Sintoma:** Campanha "Campanha Teste CRM" existe mas tem 0 participantes.

**Análise:**
```sql
SELECT participants_count FROM campaign_participants WHERE campaign_id = '7868c38d-...';
-- Result: 0
```

A campanha foi criada mas nenhum contato foi adicionado como participante.

**Possível Solução:**
- Adicionar participantes manualmente via UI
- Vincular uma lista de contatos à campanha
- Implementar sincronização automática de funil → campanha

### 3. ⚠️ WhatsApp Instance Desconectada

**Dados:**
```json
{
  "name": "Leandro",
  "instance_id": "LJ0I5H-XXXY4M-0STRA1",
  "status": "disconnected",
  "phone_number": "5517981679818"
}
```

A instância WhatsApp está com status `disconnected` - pode precisar reconectar via QR Code.

### 4. ⚠️ CRM Contacts - Poucos com WhatsApp

**Dados:**
- Total: 180 contatos
- Com WhatsApp: 6 (3.3%)
- Com Email: 180 (100%)
- Ativos: 1 (0.5%)

Apenas 6 dos 180 contatos têm número de WhatsApp preenchido, o que limita as campanhas de WhatsApp.

---

## 📋 TABELAS EXISTENTES NO SUPABASE (19 total)

1. `agent_personas`
2. `agents`
3. `app_settings`
4. `campaign_participants`
5. `campaign_profiles`
6. `campaigns`
7. `client_profiles`
8. `crm_contact_list_items`
9. `crm_contact_lists`
10. `crm_contacts`
11. `crm_sync_logs`
12. `email_logs`
13. `email_settings`
14. `message_feedback`
15. `prospecting_sessions`
16. `sms_logs`
17. `sms_settings`
18. `whatsapp_instances`
19. `whatsapp_messages`

### ❌ Tabelas Faltantes (Definidas em Migrations mas NÃO em Produção)

De acordo com os arquivos de migration analisados, as seguintes tabelas **NÃO existem** no schema:

| Tabela | Migração | Propósito |
|--------|----------|-----------|
| `lead_states` | `20250124_luchoa_schema.sql` | Estados do lead (cold→warm→hot→handoff) |
| `state_transitions` | `20250124_luchoa_schema.sql` | Histórico de transições |
| `cadence_queue` | `20250124_luchoa_schema.sql` | Fila de mensagens agendadas |
| `handoff_log` | `20250124_luchoa_schema.sql` | Log de passagem para humano |
| `quotations` | `20250124_negotiation_module.sql` | Cotações/propostas |
| `product_updates` | `20250124_inventory_module.sql` | Atualizações de estoque |
| `blocklist_entries` | `20250124_luchoa_schema.sql` | Blocklist global |

**⚠️ CRÍTICO:** As migrations precisam ser aplicadas ao banco de produção!

### ✅ Migration Criada para Resolver

Foi criada a migration `20251125_add_missing_core_tables.sql` que adiciona:
- `lead_states` - Estados do lead na máquina de estados
- `cadence_queue` - Fila de mensagens agendadas
- `handoff_log` - Registro de intervenções humanas
- `blocklist_entries` - Frases bloqueadas por campanha
- `state_transitions` - Histórico de transições de estado
- `quotations` - Cotações/propostas
- `product_updates` - Atualizações de produtos para broadcast

**Para aplicar:** Execute no Supabase SQL Editor ou via `supabase db push`

---

## 📊 DADOS DE PRODUÇÃO

### Agentes GPT

| Nome | Modelo | Ativo | Delay Resposta | Delay Palavra |
|------|--------|-------|----------------|---------------|
| Leandro ai | gpt-4 | ✅ | 30s | 1.6s |
| Agente Teste CRM | gpt-4 | ✅ | 30s | 1.6s |

### Sessões de Prospecção Recentes

| Cliente | WhatsApp | Status | Temperatura | IA | Msgs |
|---------|----------|--------|-------------|-----|------|
| João Silva (Lead Quente) | +5511999887766 | started | hot | ✅ | 2 |
| Pedro Costa (Morno) | +5511977665544 | started | warm | ✅ | 2 |
| Carlos Souza (Morno Manual) | +5511955443322 | started | warm | ❌ | 1 |
| Ana Oliveira (Frio) | +5511966554433 | started | cold | ✅ | 3 |
| Leandro | 17869533502 | closed | cold | ✅ | 26 |

### Campanha Ativa

| Nome | Canal | Tom | Instância WhatsApp | Agente | Participantes |
|------|-------|-----|-------------------|--------|---------------|
| Campanha Teste CRM | whatsapp | consultivo | (não vinculada) | Agente Teste CRM | 0 |

---

## 🎯 AÇÕES RECOMENDADAS

### PRIORIDADE CRÍTICA

1. **Aplicar Migrations Faltantes**
   ```bash
   supabase db push
   # ou aplicar manualmente via SQL Editor
   ```

2. **Sincronizar Dados de Kanban do CRM**
   - Verificar se API Redsis retorna dados de funil
   - Atualizar `sync-crm-contacts` para mapear campos

3. **Adicionar Participantes à Campanha**
   - Via UI em `/participants/:campaignId`
   - Ou via SQL direto

### PRIORIDADE ALTA

4. **Reconectar WhatsApp Instance**
   - Acessar W-API e escanear QR Code
   - Atualizar status na tabela

5. **Popular CRM com mais WhatsApps**
   - Apenas 6 de 180 contatos têm WhatsApp

### PRIORIDADE MÉDIA

6. **Testar Edge Functions**
   - `gpt-agent` - verificar se gera respostas
   - `send-whatsapp-message` - testar envio real
   - `cadence-scheduler` - verificar agendamento

7. **Implementar Funcionalidades Faltantes**
   - Máquina de estados completa
   - Cadence queue processing
   - SLA monitoring cron

---

## 📝 SCRIPTS SQL ÚTEIS

### Ver sessões sem resposta da IA
```sql
SELECT ps.client_name, ps.status, 
       MAX(wm.timestamp) as last_msg
FROM prospecting_sessions ps
LEFT JOIN whatsapp_messages wm ON wm.session_id = ps.id
WHERE ps.ai_enabled = true
GROUP BY ps.id
HAVING COUNT(wm.id) FILTER (WHERE wm.sender = 'agent') = 0;
```

### Ver contatos CRM com WhatsApp
```sql
SELECT name, trade_name, whatsapp, email, owner_name
FROM crm_contacts 
WHERE whatsapp IS NOT NULL 
ORDER BY name;
```

### Contar mensagens por sessão
```sql
SELECT ps.client_name, ps.lead_temperature,
       COUNT(*) as total_msgs,
       COUNT(*) FILTER (WHERE wm.sender = 'agent') as agent_msgs,
       COUNT(*) FILTER (WHERE wm.sender = 'client') as client_msgs
FROM prospecting_sessions ps
JOIN whatsapp_messages wm ON wm.session_id = ps.id
GROUP BY ps.id
ORDER BY total_msgs DESC
LIMIT 10;
```

---

## 🔚 CONCLUSÃO

O sistema **Luchoa-IA** está parcialmente funcional com:

- ✅ Autenticação funcionando
- ✅ 19 tabelas no Supabase
- ✅ 14 Edge Functions implementadas
- ✅ 18 páginas no front-end
- ✅ 180 contatos CRM sincronizados
- ✅ 239 mensagens WhatsApp históricas

**Principais Gaps:**
- ❌ Migrations não aplicadas (tabelas críticas faltando)
- ❌ Kanban sem dados de funil
- ❌ Campanhas sem participantes
- ❌ WhatsApp desconectado
- ⚠️ Poucos contatos com WhatsApp (3.3%)

**Próximos Passos:** Aplicar migrations e sincronizar dados do CRM para habilitar funcionalidades completas.
