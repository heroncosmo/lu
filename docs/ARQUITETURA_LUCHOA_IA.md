# 🏗️ ARQUITETURA LUCHOA-IA

> **IMPORTANTE:** Este documento define a arquitetura fundamental do sistema. A IA deve sempre consultar este arquivo para entender o propósito do projeto.

---

## 🎯 O QUE É O LUCHOA-IA?

O **Luchoa-IA** é uma **CAMADA DE PROSPECÇÃO INTELIGENTE** que se integra ao CRM Redsis. 

### ❗ Conceito Fundamental

```
┌─────────────────────────────────────────────────────────────────────┐
│                        LUCHOA-IA                                    │
│   (Camada de Prospecção / Automação de Vendas com IA)               │
│                                                                     │
│   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐        │
│   │ WhatsApp │   │  Email   │   │   SMS    │   │  GPT-4   │        │
│   │  (W-API) │   │  (SMTP)  │   │ (Twilio) │   │ (OpenAI) │        │
│   └────┬─────┘   └────┬─────┘   └────┬─────┘   └────┬─────┘        │
│        │              │              │              │               │
│        └──────────────┴──────────────┴──────────────┘               │
│                           │                                         │
│                    ┌──────┴──────┐                                  │
│                    │   SUPABASE  │                                  │
│                    │  (Espelho)  │                                  │
│                    └──────┬──────┘                                  │
└───────────────────────────┼─────────────────────────────────────────┘
                            │
                            │ SINCRONIZAÇÃO BIDIRECIONAL
                            │
┌───────────────────────────┼─────────────────────────────────────────┐
│                    ┌──────┴──────┐                                  │
│                    │  CRM REDSIS │                                  │
│                    │   (Master)  │                                  │
│                    └─────────────┘                                  │
│                                                                     │
│   • Clientes (cadastro master)                                      │
│   • Kanban (funis de venda)                                         │
│   • Atividades (tarefas)                                            │
│   • Orçamentos (propostas)                                          │
│   • Vendedores (owners)                                             │
│                                                                     │
│                        CRM REDSIS (LUCHOA)                          │
└─────────────────────────────────────────────────────────────────────┘
```

### 🔑 Regras Fundamentais

1. **CRM Redsis é o MASTER** → Todos os dados de clientes, kanban, atividades e orçamentos residem no Redsis
2. **Luchoa-IA é o PROSPECTOR** → Automatiza a comunicação e prospecção, mas reflete no CRM
3. **Supabase é ESPELHO** → Mantém cópia sincronizada para operação rápida da IA
4. **Ações no Luchoa-IA → Refletem no CRM** → Movimentações de kanban, anotações, atividades

---

## 📊 FLUXO DE DADOS

```
┌─────────────────────────────────────────────────────────────────────┐
│                     FLUXO DE PROSPECÇÃO                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. SINCRONIZAÇÃO (CRM → Supabase)                                  │
│     └─ sync-crm-contacts busca clientes do Redsis                   │
│     └─ Popula crm_contacts com dados atualizados                    │
│     └─ Kanban espelhado reflete funis do CRM                        │
│                                                                     │
│  2. CAMPANHA (Configuração)                                         │
│     └─ Usuário cria campanha com produto/tom/cadência               │
│     └─ Adiciona participantes (de crm_contacts ou listas)           │
│     └─ Define regras de quiet hours e fallback                      │
│                                                                     │
│  3. PROSPECÇÃO (IA em ação)                                         │
│     └─ cadence-scheduler agenda mensagens                           │
│     └─ gpt-agent gera texto personalizado (Perfil Triplo)           │
│     └─ send-whatsapp-message envia via W-API                        │
│                                                                     │
│  4. RECEPÇÃO (Cliente responde)                                     │
│     └─ receive-whatsapp-message recebe webhook                      │
│     └─ state-machine classifica intenção (cold/warm/hot)            │
│     └─ IA responde ou escala para humano                            │
│                                                                     │
│  5. SINCRONIZAÇÃO (Supabase → CRM)                                  │
│     └─ Movimenta lead no Kanban do Redsis                           │
│     └─ Cria atividade/anotação no CRM                               │
│     └─ Owner-lock sincroniza vendedor responsável                   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🗄️ ESTRUTURA DE DADOS

### Tabelas que ESPELHAM o CRM Redsis

| Tabela | Descrição | Sincronização |
|--------|-----------|---------------|
| `crm_contacts` | Clientes do Redsis | CRM → Supabase |
| `crm_contact_lists` | Listas de segmentação | Interno |
| `crm_sync_logs` | Logs de sincronização | Interno |

### Tabelas de PROSPECÇÃO (Luchoa-IA)

| Tabela | Descrição | Relação com CRM |
|--------|-----------|-----------------|
| `campaigns` | Campanhas de prospecção | Pode vincular a funil do CRM |
| `campaign_participants` | Leads em prospecção | Referencia crm_contacts |
| `lead_states` | Estado atual do lead | Espelha etapa do Kanban CRM |
| `cadence_queue` | Fila de mensagens | Gera atividades no CRM |
| `handoff_log` | Passagem para humano | Registra no CRM |
| `quotations` | Propostas enviadas | Espelha orçamentos do CRM |

### Tabelas de COMUNICAÇÃO

| Tabela | Descrição | Canal |
|--------|-----------|-------|
| `whatsapp_messages` | Histórico WhatsApp | W-API |
| `sms_logs` | Histórico SMS | Twilio |
| `email_logs` | Histórico Email | SMTP |
| `prospecting_sessions` | Sessões de conversa | Multi-canal |

### Tabelas de CONFIGURAÇÃO

| Tabela | Descrição |
|--------|-----------|
| `agents` | Configuração do GPT |
| `agent_personas` | Perfil do vendedor (IA) |
| `client_profiles` | Perfil do cliente |
| `campaign_profiles` | Perfil da campanha |
| `whatsapp_instances` | Instâncias W-API |
| `sms_settings` | Config Twilio |
| `email_settings` | Config SMTP |
| `app_settings` | Config Redsis API |

---

## 🔄 KANBAN ESPELHADO

O Kanban no Luchoa-IA **NÃO é um Kanban separado**. Ele **ESPELHA** o Kanban do CRM Redsis.

### Como Funciona

```
┌─────────────────────────────────────────────────────────────────────┐
│                     KANBAN DO CRM REDSIS                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  A_TRABALHAR  │  PROSPECÇÃO  │  OFERTA  │  ORÇAMENTO  │  NEGOCIAÇÃO │
│      ↓        │      ↓       │    ↓     │      ↓      │      ↓      │
│   [Lead 1]    │   [Lead 2]   │ [Lead 3] │  [Lead 4]   │  [Lead 5]   │
│   [Lead 6]    │   [Lead 7]   │          │             │             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                            │
                            │ API REDSIS (sync)
                            ↓
┌─────────────────────────────────────────────────────────────────────┐
│                     KANBAN NO LUCHOA-IA                             │
│                     (Visualização Espelhada)                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  A_TRABALHAR  │  PROSPECÇÃO  │  OFERTA  │  ORÇAMENTO  │  NEGOCIAÇÃO │
│      ↓        │      ↓       │    ↓     │      ↓      │      ↓      │
│   [Lead 1]    │   [Lead 2]   │ [Lead 3] │  [Lead 4]   │  [Lead 5]   │
│   [Lead 6]    │   [Lead 7]   │          │             │             │
│                                                                     │
│  → Arrastar card AQUI → Atualiza no CRM via API                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Regras do Kanban

1. **Leitura**: Dados vêm da API Redsis (não do `crm_contacts.kanban_*`)
2. **Escrita**: Movimentar card chama API Redsis para atualizar
3. **Cache**: `crm_contacts` guarda última sincronização mas API é fonte
4. **Tempo Real**: Ideal ter polling ou webhook para atualizações

---

## 🤖 PERFIL TRIPLO (Personalização IA)

A IA gera mensagens usando 3 perfis combinados:

```
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│  AGENT PERSONA  │ + │ CLIENT PROFILE  │ + │CAMPAIGN PROFILE │
│  (Vendedor IA)  │   │    (Cliente)    │   │   (Produto)     │
├─────────────────┤   ├─────────────────┤   ├─────────────────┤
│ • Nome: Leandro │   │ • Segmento      │   │ • Produto       │
│ • Tom: Técnico  │   │ • Idioma        │   │ • Tom           │
│ • Estilo        │   │ • Histórico     │   │ • Benefícios    │
│ • Assinatura    │   │ • Pain points   │   │ • Objeções      │
└─────────────────┘   └─────────────────┘   └─────────────────┘
         │                    │                     │
         └────────────────────┼─────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  MENSAGEM IA    │
                    │  Personalizada  │
                    └─────────────────┘
```

---

## 📞 CANAIS DE COMUNICAÇÃO

### Prioridade de Canal

```
1. WhatsApp (W-API) → Canal principal
2. Email (SMTP)     → Fallback após X tentativas
3. SMS (Twilio)     → Fallback urgente
```

### Stickiness (Aderência)

Uma vez que cliente responde por um canal, a IA continua nesse canal.

---

## 🔒 OWNER LOCK

Quando vendedor humano assume lead:

1. `lead_states.owner_lock = true`
2. IA para de enviar mensagens automáticas
3. Sincroniza com campo "responsável" no CRM Redsis
4. Vendedor pode "devolver" lead para IA

---

## 📋 EDGE FUNCTIONS

| Função | Descrição | Trigger |
|--------|-----------|---------|
| `gpt-agent` | Gera resposta IA | Mensagem recebida |
| `send-whatsapp-message` | Envia WhatsApp | Cadence/Manual |
| `receive-whatsapp-message` | Webhook W-API | Mensagem entrada |
| `send-sms-message` | Envia SMS | Fallback |
| `receive-sms-message` | Webhook Twilio | SMS entrada |
| `send-email` | Envia email | Fallback |
| `receive-email-message` | Webhook email | Email entrada |
| `state-machine` | Classifica intenção | Mensagem recebida |
| `cadence-scheduler` | Agenda mensagens | Cron job |
| `sla-monitoring` | Verifica prazos | Cron job |
| `sync-crm-contacts` | Sincroniza CRM | Cron/Manual |
| `sync-owner-lock` | Sincroniza owner | Evento |
| `inventory-api` | API estoque | Query |
| `inventory-broadcast` | Broadcast produtos | Manual |

---

## 🎯 RESUMO PARA IA

> **Quando trabalhar neste projeto, lembre-se:**
>
> 1. **Luchoa-IA NÃO é um CRM** → É uma camada de prospecção que gerencia o CRM Redsis
> 2. **Kanban espelha o CRM** → Movimentações devem atualizar o Redsis via API
> 3. **Dados master no Redsis** → Supabase é cache/espelho para operação rápida
> 4. **IA age como funcionário** → Prospecta, conversa, agenda, mas reflete tudo no CRM
> 5. **Owner Lock = Humano assumiu** → IA para, vendedor continua no CRM
> 6. **Sincronização é bidirecional** → Luchoa-IA ↔ CRM Redsis

---

*Documento gerado em 25/11/2025*
