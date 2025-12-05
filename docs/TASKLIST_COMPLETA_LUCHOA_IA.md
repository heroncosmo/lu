# 📋 TASKLIST COMPLETA — Luchoa-IA (showa-hazel.vercel.app)

> **Gerado em:** 25/11/2025  
> **Objetivo:** Documentar TUDO que o sistema deve fazer (visão) vs o que está implementado, parcial ou pendente.

---

## 📊 RESUMO EXECUTIVO

### Visão do Projeto (Especificação em https://showa-hazel.vercel.app/)

O sistema **Luchoa-IA** é uma plataforma de automação de vendas que:

1. **Conecta-se ao CRM Redsis** e sincroniza leads, perfis, notas e histórico
2. **Permite criar campanhas por produto** com regras de cadência, canais e idiomas
3. **Usa IA (GPT)** para gerar mensagens personalizadas com "Perfil Triplo":
   - Persona do vendedor (Leandro)
   - Perfil do cliente (do CRM)
   - Perfil da campanha
4. **Envia mensagens via WhatsApp/Email/SMS** respeitando cadências e quiet hours
5. **Interpreta intenções** do cliente (frio, quente, vago, marcou horário)
6. **Movimenta leads no Kanban** automaticamente conforme estado
7. **Suporta Owner Lock** para humanos assumirem leads
8. **Monitora SLA** baseado em prazos do CRM
9. **Feedback de mensagens** com blocklist por campanha
10. **Integra com Inventory** (Mobgran) para disponibilidade de chapas

---

## ✅ O QUE ESTÁ IMPLEMENTADO

### 1. Autenticação & Sessão
| Item | Status | Arquivos |
|------|--------|----------|
| Login com Supabase Auth | ✅ Completo | `Login.tsx`, `SessionContextProvider.tsx` |
| Rotas protegidas | ✅ Completo | `ProtectedRoute.tsx`, `App.tsx` |
| Redirect após login | ✅ Completo | `Login.tsx` |

### 2. Tabelas Supabase (Schema)
| Tabela | Status | Descrição |
|--------|--------|-----------|
| `agents` | ✅ Existe | Config do agente GPT |
| `prospecting_sessions` | ✅ Existe | Sessões de conversa |
| `whatsapp_messages` | ✅ Existe | Histórico de mensagens |
| `whatsapp_instances` | ✅ Existe | Multi-instância WhatsApp |
| `campaigns` | ✅ Existe | Campanhas com cadência |
| `campaign_participants` | ✅ Existe | Leads em campanhas |
| `crm_contacts` | ✅ Existe | Contatos sincronizados |
| `crm_contact_lists` | ✅ Existe | Listas de contatos |
| `message_feedback` | ✅ Existe | Feedback de mensagens |
| `agent_personas` | ✅ Existe | Perfis triplo (persona) |
| `client_profiles` | ✅ Existe | Perfis triplo (cliente) |
| `campaign_profiles` | ✅ Existe | Perfis triplo (campanha) |
| `sms_logs` | ✅ Existe | Logs de SMS |
| `email_logs` | ✅ Existe | Logs de email |
| `email_settings` | ✅ Existe | Config SMTP |
| `sms_settings` | ✅ Existe | Config Twilio |
| `app_settings` | ✅ Existe | Config geral (Redsis) |
| `crm_sync_logs` | ✅ Existe | Logs de sync CRM |

### 3. Edge Functions Supabase
| Função | Status | Descrição |
|--------|--------|-----------|
| `gpt-agent` | ✅ Implementado | Gera resposta GPT com contexto |
| `send-whatsapp-message` | ✅ Implementado | Envia via W-API |
| `receive-whatsapp-message` | ✅ Implementado | Webhook W-API |
| `send-sms-message` | ✅ Implementado | Envia via Twilio |
| `receive-sms-message` | ✅ Implementado | Webhook Twilio |
| `send-email` | ✅ Implementado | Envia via SMTP |
| `receive-email-message` | ✅ Implementado | Webhook email |
| `inventory-api` | ✅ Implementado | API Redsis estoque |
| `inventory-broadcast` | ✅ Implementado | Broadcast de produtos |
| `state-machine` | ⚠️ Parcial | Máquina de estados básica |
| `cadence-scheduler` | ⚠️ Parcial | Agendamento com quiet hours |
| `sla-monitoring` | ⚠️ Parcial | Análise de SLA |
| `sync-crm-contacts` | ✅ Implementado | Sync Redsis → Supabase |
| `sync-owner-lock` | ⚠️ Parcial | Sync owner lock bidirecional |

### 4. Páginas Front-end
| Página | Status | Rota |
|--------|--------|------|
| Dashboard | ✅ Existe | `/` |
| Login | ✅ Existe | `/login` |
| Campanhas | ✅ Existe | `/campaigns` |
| Campaign Builder | ✅ Existe | `/campaign-builder` |
| Kanban Board | ✅ Existe | `/kanban` |
| CRM Contacts | ✅ Existe | `/crm-contacts` |
| CRM Chat | ✅ Existe | `/crm-chat` |
| Contact Lists | ✅ Existe | `/contact-lists` |
| Participants | ✅ Existe | `/participants/:campaignId` |
| WhatsApp Instances | ✅ Existe | `/whatsapp-instances` |
| Prospecting | ✅ Existe | `/prospecting` |
| Feedback/Blocklist | ✅ Existe | `/feedback` |
| Agent Configuration | ✅ Existe | `/agent-configuration` |
| Webhook Config | ✅ Existe | `/webhook-config` |
| Redsis Config | ✅ Existe | `/redsis-config` |
| SMTP Config | ✅ Existe | `/smtp-config` |
| Twilio Config | ✅ Existe | `/twilio-config` |
| Reports | ✅ Existe | `/reports` |
| Inventory | ✅ Existe | `/inventory` |

---

## ⚠️ O QUE ESTÁ PARCIAL / PRECISA REVISÃO

### 1. State Machine (Máquina de Estados)

**Especificado:**
- Estados: A_TRABALHAR → PROSPECÇÃO → OFERTA → ORÇAMENTO → NEGOCIAÇÃO → PÓS-VENDA
- Transições automáticas baseadas em classificação de intenção
- Movimentação de colunas no CRM Redsis

**Implementado:**
- Classificação básica de intenção (hot patterns com regex)
- Atualização de `temperature` em `lead_states`
- Agendamento de followup

**Faltando:**
- [ ] Tabela `lead_states` não existe no banco (migrations não aplicadas?)
- [ ] Transições completas de estado (todas as colunas do Kanban)
- [ ] Integração real com API Redsis para mover colunas
- [ ] Logging de todas as transições em `state_history`
- [ ] Suporte a colunas de pós-negociação/logística

---

### 2. Cadence Scheduler

**Especificado:**
- D1 = 1-3h (aleatório): Reforço curto
- D2 = 12-36h (aleatório): Conteúdo de valor
- D3 = 2-5 dias (aleatório): "Ainda faz sentido?"
- P1/P2/P3 para respostas vagas
- Quiet hours por fuso do cliente
- Limite de 3 mensagens/semana por lead
- Intervalo mínimo de 24h entre envios

**Implementado:**
- Verificação de quiet hours
- Verificação de limite semanal e intervalo mínimo
- Fallback de canal (WhatsApp → Email)
- Tabela `cadence_queue` existe

**Faltando:**
- [ ] Tabela `cadence_queue` não existe no banco
- [ ] Delays aleatórios com jitter (min-max) não implementados
- [ ] Tipos de mensagem T0/T1/T2/T3 não diferenciados
- [ ] P1/P2/P3 para respostas vagas
- [ ] Check-in semanal/mensal automático
- [ ] Cron job para processar fila (`pg_cron` ou trigger)

---

### 3. Owner Lock & Handoff

**Especificado:**
- Se responsável ≠ IA ou coluna ≥ Negociação → IA não envia
- Humano pode "Assumir" e "Devolver" lead
- Logs de colisão e reativação no CRM
- Sync bidirecional Supabase ↔ Redsis

**Implementado:**
- Funções SQL `assume_lead()` e `release_lead()` nas migrations
- Função `sync-owner-lock` com sync bidirecional
- UI no Kanban com botões Lock/Unlock

**Faltando:**
- [ ] Migrations não parecem aplicadas (lead_states, handoff_log)
- [ ] Verificação automática antes de cada envio
- [ ] Detecção de mensagem humana no WhatsApp (pausa automática)
- [ ] Relatório "Pausado por mensagem humana"

---

### 4. SLA Monitoring

**Especificado:**
- Sincroniza campo "Prazo até" do CRM
- Cria/atualiza Atividades no CRM
- Reprioriza diariamente por urgência
- Alertas quando SLA estoura

**Implementado:**
- Busca atividades do Redsis com data_prazo
- Calcula urgency_score (0-100)
- Reprioriza itens na cadence_queue
- Actions: analyze, reprioritize, report

**Faltando:**
- [ ] Cron job diário para rodar automaticamente
- [ ] Criação de Atividades no CRM Redsis
- [ ] Notificações/alertas de SLA estourado
- [ ] Dashboard visual de SLA

---

### 5. Perfil Triplo (Builder de Contexto)

**Especificado:**
```json
{
  "persona_vendedor": "Leandro",
  "perfil_cliente_crm": { "idioma": "auto", "tom": "...", "preferencias": [...] },
  "perfil_campanha": { "segmento": "...", "diretrizes": [...] },
  "regras": { "mensagens_semana": 3, "intervalo_min_h": 24, ... }
}
```

**Implementado:**
- Tabelas existem: `agent_personas`, `client_profiles`, `campaign_profiles`
- `gpt-agent` usa instruções do agente + nome do cliente

**Faltando:**
- [ ] Montagem completa do payload Perfil Triplo antes de chamar GPT
- [ ] Uso de `client_profiles` e `campaign_profiles` no contexto
- [ ] Blocklist de frases por campanha no prompt
- [ ] Histórico de compras do cliente no contexto

---

### 6. Multicanal & Fallback

**Especificado:**
- Prioridade: WhatsApp → Email → Chamada
- Stickiness: mantém canal onde cliente respondeu
- Fallback: sem resposta após 3 msgs/15 dias, muda canal

**Implementado:**
- Envio por WhatsApp, SMS e Email funcionando
- Logs separados por canal
- Campo `priority_channel` e `fallback_channels` em campaigns

**Faltando:**
- [ ] Lógica de stickiness (salvar canal preferido do cliente)
- [ ] Lógica de fallback automático após 3 msgs/15 dias
- [ ] Chamada telefônica (apenas placeholder)

---

### 7. Multilíngue

**Especificado:**
- Idiomas: PT, EN, ES, AR
- Detecção automática por lead e conversa
- Fuso horário por cliente

**Implementado:**
- Campo `language` em `campaign_participants`
- Campo `timezone` em várias tabelas
- Array `languages` em campaigns

**Faltando:**
- [ ] Detecção automática de idioma na resposta
- [ ] Instruções de idioma no prompt do GPT
- [ ] Feriados regionais configuráveis

---

### 8. Feedback & Blocklist

**Especificado:**
- UI com 👍 Aprovar e 🚫 Reportar
- Frases reportadas alimentam blocklist
- Relatório de qualidade

**Implementado:**
- Tabela `message_feedback` existe
- Página `/feedback` existe
- Campo `blocklist` em `campaign_profiles`

**Faltando:**
- [ ] UI de feedback na conversa (CRM Chat)
- [ ] Atualização automática da blocklist
- [ ] Uso da blocklist no prompt do GPT
- [ ] Relatório de qualidade de mensagens

---

### 9. Módulo de Negociação

**Especificado:**
- IA conduz negociação com playbook do Leandro
- Orçamentos pré-definidos (sem cálculos)
- Botões "Assumir" e "Devolver"
- Ao fechar, cria tarefa "faturar" no CRM

**Implementado:**
- Migration `20250124_negotiation_module.sql` existe
- Tabela `quotations` definida
- Funções `assume_lead()` e `release_lead()`

**Faltando:**
- [ ] Tabela `quotations` não existe no banco (migration não aplicada)
- [ ] UI de criação de orçamentos
- [ ] Playbook de negociação no GPT
- [ ] Criação de tarefa "faturar" no CRM Redsis
- [ ] Estratégias de objeção configuráveis

---

### 10. Integração com Inventory

**Especificado:**
- Ler disponibilidade por material/bundle/chapa
- Deep links para itens no app
- Anexar foto/vídeo na conversa
- Registrar ID do bundle no CRM

**Implementado:**
- Função `inventory-api` busca chapas do Redsis
- Página `/inventory` existe

**Faltando:**
- [ ] Deep links para itens
- [ ] Anexar mídia do inventory na conversa
- [ ] Registro de bundle_id no CRM/orçamento
- [ ] Broadcast de novos produtos

---

## ❌ O QUE NÃO ESTÁ IMPLEMENTADO

### 1. Tabelas Faltantes (Migrations não aplicadas)
- [ ] `lead_states` - Estado atual do lead na máquina
- [ ] `cadence_queue` - Fila de mensagens agendadas
- [ ] `handoff_log` - Log de handoff humano/IA
- [ ] `blocklist_entries` - Frases bloqueadas por campanha
- [ ] `product_updates` - Novidades de produto
- [ ] `quotations` - Orçamentos de negociação
- [ ] `conversation_messages` - Mensagens unificadas (rename de whatsapp_messages)

### 2. Cron Jobs / Triggers
- [ ] Processamento automático da `cadence_queue`
- [ ] SLA monitoring diário
- [ ] Sync periódico com CRM Redsis
- [ ] Detecção de mensagem humana para pausa automática

### 3. Funcionalidades de Negócio
- [ ] Gatilho de produto novo (webhook CRM)
- [ ] Check-in semanal/mensal automático
- [ ] Relatório completo de qualidade de mensagens
- [ ] Dashboard de SLA visual
- [ ] Notificações internas de lead quente

---

## 📋 TASKLIST PRIORIZADA POR DOMÍNIO

### 🔴 CRÍTICO (Bloqueadores)

#### A1. Aplicar Migrations Pendentes
```bash
# Verificar quais migrations estão aplicadas
supabase db diff

# Aplicar todas as migrations
supabase db push
```
- [ ] `20250124_luchoa_schema.sql` - Tabelas base
- [ ] `20250124_negotiation_module.sql` - Negociação
- [ ] `20250124_notifications_language.sql` - Multilíngue
- [ ] `20250124_unified_multichannel.sql` - Multicanal

#### A2. Verificar Schema Atual
- [ ] Confirmar existência de `lead_states`
- [ ] Confirmar existência de `cadence_queue`
- [ ] Confirmar existência de `handoff_log`
- [ ] Confirmar existência de `quotations`

---

### 🟠 ALTA PRIORIDADE

#### B1. State Machine Completa
- [ ] Criar/verificar tabela `lead_states`
- [ ] Implementar todas as transições de estado
- [ ] Integrar com API Redsis para mover colunas
- [ ] Adicionar logging completo em `state_history`

#### B2. Cadence Scheduler Completo
- [ ] Criar/verificar tabela `cadence_queue`
- [ ] Implementar delays aleatórios (min-max + jitter)
- [ ] Diferenciar tipos T0/T1/T2/T3
- [ ] Implementar P1/P2/P3 para respostas vagas
- [ ] Criar cron job para processar fila

#### B3. Owner Lock Funcional
- [ ] Verificar/criar tabela `handoff_log`
- [ ] Implementar verificação antes de cada envio
- [ ] Detectar mensagem humana e pausar IA
- [ ] Sync completo Supabase ↔ Redsis

#### B4. Perfil Triplo no GPT
- [ ] Carregar `client_profiles` no contexto
- [ ] Carregar `campaign_profiles` no contexto
- [ ] Carregar blocklist no prompt
- [ ] Incluir histórico de compras

---

### 🟡 MÉDIA PRIORIDADE

#### C1. Multicanal Avançado
- [ ] Implementar stickiness de canal
- [ ] Implementar fallback automático (3 msgs/15 dias)
- [ ] Unificar logs em `conversation_messages`

#### C2. Multilíngue Completo
- [ ] Detectar idioma automaticamente
- [ ] Ajustar prompt GPT por idioma
- [ ] Configurar feriados regionais

#### C3. Feedback & Blocklist
- [ ] Adicionar UI de feedback na conversa
- [ ] Atualizar blocklist automaticamente
- [ ] Usar blocklist no prompt GPT
- [ ] Criar relatório de qualidade

#### C4. SLA Monitoring Automatizado
- [ ] Criar cron job diário
- [ ] Criar Atividades no CRM Redsis
- [ ] Implementar notificações de alerta
- [ ] Criar dashboard visual

---

### 🟢 BAIXA PRIORIDADE

#### D1. Módulo de Negociação
- [ ] Criar UI de orçamentos
- [ ] Implementar playbook no GPT
- [ ] Criar tarefa "faturar" no CRM
- [ ] Configurar estratégias de objeção

#### D2. Inventory Avançado
- [ ] Criar deep links para itens
- [ ] Permitir anexar mídia na conversa
- [ ] Registrar bundle_id nos orçamentos

#### D3. Automações Adicionais
- [ ] Gatilho de produto novo
- [ ] Check-in semanal/mensal
- [ ] Notificações internas de lead quente

---

## 🧪 PLANO DE TESTES (Supabase + Playwright)

### T1. Testes de Autenticação
```typescript
// Playwright: Login e acesso a rotas protegidas
test('login com credenciais válidas', async ({ page }) => {
  await page.goto('https://showa-hazel.vercel.app/login');
  await page.fill('input[type="email"]', 'calcadosdrielle@gmail.com');
  await page.fill('input[type="password"]', 'Ibira2019!');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/');
});
```

### T2. Testes de Tabelas Supabase
```typescript
// Verificar existência de tabelas críticas
const tables = await supabase.from('lead_states').select('*').limit(1);
const queue = await supabase.from('cadence_queue').select('*').limit(1);
```

### T3. Testes de Edge Functions
```typescript
// Testar state-machine
const response = await supabase.functions.invoke('state-machine', {
  body: { session_id: '...', event_type: 'message', message_content: 'quero um orçamento' }
});
expect(response.data.classification.temperature).toBe('hot');
```

### T4. Testes E2E de Campanhas
```typescript
// Criar campanha → Adicionar lead → Verificar cadence_queue
// ...
```

---

## 📌 PRÓXIMOS PASSOS RECOMENDADOS

1. **VERIFICAR MIGRATIONS**: Rodar `supabase db diff` para ver o que está aplicado
2. **APLICAR SCHEMA**: Rodar `supabase db push` ou aplicar migrations manualmente
3. **TESTAR AUTENTICAÇÃO**: Login com usuário de teste via Playwright
4. **VALIDAR TABELAS**: Usar MCP Supabase para listar tabelas e verificar schema
5. **IMPLEMENTAR STATE MACHINE**: Completar lógica de transições
6. **IMPLEMENTAR CADENCE**: Completar agendamento e cron job
7. **TESTAR FLUXO COMPLETO**: Campanha → Lead → Mensagem → Resposta → Transição

---

*Este documento deve ser atualizado conforme o progresso da implementação.*
