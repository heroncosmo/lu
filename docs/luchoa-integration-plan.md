# Luchoa-IA Integration Blueprint

## 1. Context & Goals
- **Objective**: Expand the existing WhatsApp + GPT prospecting app into the full Luchoa-IA platform with campaign orchestration, CRM synchronization (Redsis), and continuous cadenced prospection.
- **Scope**: Multi-channel cadences, Kanban machine of states, SLA governance, negotiation module, inventory linking, and human-in-the-loop controls.
- **CRM**: Redsis API (`https://api.redsis.com.br`) with bearer authentication via `POST /token`.

## 2. Redsis API Reference
- **Auth payload**: `{ usuario:"REDSIS", senha:"1010", app:"web", servidor:"10.1.1.200", porta:"8084" }` → returns `{ "token": "..." }`.
- **Core endpoints**:
  - **Kanban**: `/web/kanban/funis`, `/web/kanban/funis/{funil}/subfunis`.
  - **Activities (cards)**: `/web/atividades`, `/web/atividades/{funil}` (create), `/web/atividades/{codigo}/avancar`, `/retornar`, `/cancelar`.
  - **Notes & Tasks**: `/web/clientes/{cliente}/anotacoes`, `/informacoes`, `/atividades/{atividade}/tarefas`.
  - **Customers & Contacts**: `/web/clientes/*`, `/web/clientes/{cliente}/contatos`.
  - **Inventory**: `/web/estoque/chapas`, `/web/estoque/cavaletes`.
  - **Documents**: `/web/clientes/{cliente}/ofertas`, `/pedidos`.
- **Security**: store credentials as Supabase secrets; cache token with TTL < Redsis expiration; rotate automatically.

## 3. Architecture Overview
1. **Integration Layer (`redsisClient`)**
   - Ky/Axios wrapper with token auto-refresh, retries, circuit breaker, structured logs.
2. **Domain Services**
   - `crmLeadService`: CRUD for leads, notes, tasks, funil/subfunil mapping.
   - `stateMachineEngine`: interprets intents, decides stage transitions, logs actions.
   - `cadenceScheduler`: manages `cadence_queue`, enforces limits, quiet hours, stickiness, fallback.
   - `campaignEngine`: config UI + backend for Perfil Triplo, segments, media priorities, product-news triggers.
   - `inventoryAdapter`: caches chapas/cavaletes, attaches IDs/media to offers.
3. **Data Model (Supabase)**
   - `campaigns`, `campaign_participants`, `lead_states`, `cadence_queue`, `handoff_log`, `blocklist_entries`, `product_updates`.
4. **State Machine**
   - Events: `MESSAGE_RECEIVED`, `NO_RESPONSE`, `CLARIFICATION`, `LEAD_HOT`, `HUMAN_OVERRIDE`, `PRODUCT_EVENT`.
   - Actions: `advanceStage`, `retreatStage`, `createNote`, `createTask`, `notifyOwner`, `pauseAI`, `resumeAI`.
   - Mapping Funil/Subfunil stored as configuration (JSON) to allow runtime changes.
5. **Cadence Logic**
   - Max 3 msgs/semana, intervalo mínimo 24h, quiet hours por fuso.
   - Aleatoriedade triangular (min/mode/max) para T1–T3 + check-ins.
   - Stickiness por canal; fallback após 3 mensagens/15 dias sem resposta.
6. **Negotiation & Owner Lock**
   - Negociação stage habilita playbook com orçamentos pré-definidos.
   - Botões Assumir/Devolver criam/atualizam `owner_lock`; IA pausa em colunas ≥ Negociação.
7. **SLA Engine**
   - Usa `data_prazo` das atividades; alerta quando delta < 12h.
   - Reprograma cadências respeitando prioridades e quiet hours.
8. **Feedback & Blocklist**
   - UI para 👍/🚫 por mensagem → registra em `blocklist_entries`.
   - Frases bloqueadas alimentam pré-filtro antes do envio GPT.

## 4. Implementation Tasklist

| # | Milestone | Tasks |
|---|-----------|-------|
|1|**Integration Foundations**|1.1 Criar `src/integrations/redsis.ts` com auth cache; 1.2 Configurar secrets Supabase; 1.3 Implementar health-check + logger.|
|2|**Data Layer Setup**|2.1 Criar tabelas (`campaigns`, `cadence_queue`, etc.); 2.2 Seed mapping Funil/Subfunil; 2.3 Migrar agentes existentes para usar Perfil Triplo.|
|3|**State Machine Engine**|3.1 Definir DSL de regras (JSON/TS); 3.2 Conectar webhook WA → engine; 3.3 Implementar ações Redsis (advance, notes, tasks).|
|4|**Cadence Scheduler**|4.1 Scheduler Supabase (cron) para `cadence_queue`; 4.2 Respeitar quiet hours e limites; 4.3 Implementar fallback de canal e stickiness.|
|5|**Campaign Builder UI**|5.1 Página para configurar cadência/canais/segmentos; 5.2 Gestão de participantes importados do CRM; 5.3 Upload/playbook por campanha.|
|6|**Kanban & Ops Dashboards**|6.1 Painel Kanban live (dados Redsis); 6.2 Alertas SLA/leads quentes; 6.3 Botões Assumir/Devolver com owner lock.|
|7|**Negotiation + Inventory**|7.1 CRUD de orçamentos; 7.2 Integração `/web/estoque/chapas`/`cavaletes`; 7.3 Anexar mídia + registrar IDs na nota.|
|8|**Feedback & Blocklist**|8.1 UI 👍/🚫; 8.2 Motor para ajustar prompts; 8.3 Relatório de qualidade.|
|9|**Alerting & Observability**|9.1 Canal interno (WhatsApp/Slack) para leads quentes/SLA; 9.2 Métricas (cadence backlog, tokens GPT, falhas Redsis); 9.3 Testes unitários/contract/e2e.|

## 5. References & Best Practices
- **State machines**: usar grafo direcionado + versionamento por lead (auditoria).
- **Cadence randomness**: triangular distribution garante variabilidade humana controlada.
- **Prompt hygiene**: armazenar prompts/respostas (mascaradas) para auditoria e blocklist learning.
- **Token handling**: cache + circuit breaker para evitar bloqueios no Redsis.
- **Inventory linking**: sempre registrar ID do item enviado ao cliente.
- **Human override**: qualquer mensagem manual gera `handoff_log` e pausa IA até confirmação.

---
Este blueprint deve ser atualizado a cada sprint para refletir decisões implementadas e mudanças de integrações.
