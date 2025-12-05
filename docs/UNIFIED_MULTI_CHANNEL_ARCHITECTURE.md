# 🏗️ ARQUITETURA UNIFICADA - MULTI-CANAL (WhatsApp, SMS, Email)

## 📋 Análise do Sistema Atual

### ✅ O que já funciona (WhatsApp)
1. **Edge Function**: `receive-whatsapp-message` - recebe webhooks da W-API
2. **Tabelas**: 
   - `prospecting_sessions` - gerencia conversas ativas
   - `whatsapp_messages` - histórico de mensagens
   - `message_feedback` - aprovação/reprovação de mensagens
3. **Interface**: 
   - `Prospecting.tsx` - chat em tempo real com realtime subscriptions
   - `CRMChat.tsx` - lista de conversas ativas com toggle IA
4. **Fluxo**:
   - Webhook recebe mensagem → Salva no banco → IA responde (se habilitada) → Resposta enviada

---

## 🎯 REQUISITOS DO CLIENTE

### 1. **SMS e Email funcionarem IGUAL ao WhatsApp**
- ✅ Receber respostas de SMS (webhook Twilio)
- ✅ Receber respostas de Email (webhook + SMTP IMAP)
- ✅ IA responder automaticamente em TODOS os canais
- ✅ Humano poder desativar IA por conversa/contato
- ✅ Histórico unificado de mensagens

### 2. **CRM Chat Completo**
- ✅ Lista de contatos ativos em QUALQUER canal
- ✅ Filtro por temperatura (lead quente, frio, etc.)
- ✅ Clicar no contato → Abrir conversa
- ✅ Continuar conversa humanamente
- ✅ Toggle IA on/off por contato
- ✅ Badges de canal (WhatsApp/SMS/Email)
- ✅ Contador de mensagens não lidas

---

## 🗄️ NOVA ESTRUTURA DE BANCO DE DADOS

### 1. Unificar `prospecting_sessions` (Multi-canal)

```sql
ALTER TABLE prospecting_sessions 
  ADD COLUMN channel TEXT DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp', 'sms', 'email')),
  ADD COLUMN client_email TEXT,
  ADD COLUMN client_sms_number TEXT,
  ADD COLUMN lead_temperature TEXT DEFAULT 'cold' CHECK (lead_temperature IN ('cold', 'warm', 'hot')),
  ADD COLUMN crm_contact_id UUID REFERENCES crm_contacts(id),
  ADD COLUMN campaign_id UUID REFERENCES campaigns(id);

-- Renomear coluna para ser genérico
ALTER TABLE prospecting_sessions RENAME COLUMN phone TO client_phone;

-- Índices para performance
CREATE INDEX idx_sessions_channel ON prospecting_sessions(channel);
CREATE INDEX idx_sessions_temperature ON prospecting_sessions(lead_temperature);
CREATE INDEX idx_sessions_crm_contact ON prospecting_sessions(crm_contact_id);
CREATE INDEX idx_sessions_ai_enabled ON prospecting_sessions(ai_enabled);
```

### 2. Unificar `whatsapp_messages` → `conversation_messages`

```sql
-- Renomear tabela para ser multi-canal
ALTER TABLE whatsapp_messages RENAME TO conversation_messages;

-- Adicionar coluna de canal
ALTER TABLE conversation_messages
  ADD COLUMN channel TEXT DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp', 'sms', 'email')),
  ADD COLUMN email_subject TEXT,
  ADD COLUMN email_from TEXT,
  ADD COLUMN sms_from TEXT,
  ADD COLUMN sms_to TEXT,
  ADD COLUMN read_at TIMESTAMPTZ,
  ADD COLUMN sender TEXT DEFAULT 'client' CHECK (sender IN ('client', 'agent', 'system'));

-- Renomear colunas para serem genéricas
ALTER TABLE conversation_messages RENAME COLUMN content TO message_content;
ALTER TABLE conversation_messages RENAME COLUMN is_from_user TO is_from_client;

CREATE INDEX idx_messages_channel ON conversation_messages(channel);
CREATE INDEX idx_messages_read ON conversation_messages(read_at);
CREATE INDEX idx_messages_sender ON conversation_messages(sender);
```

### 3. Tabelas de Logs por Canal

```sql
-- Log de SMS enviados (Twilio)
CREATE TABLE sms_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES prospecting_sessions(id) ON DELETE CASCADE,
  participant_id UUID REFERENCES campaign_participants(id),
  
  to_number TEXT NOT NULL,
  from_number TEXT NOT NULL,
  message_content TEXT NOT NULL,
  
  twilio_sid TEXT,
  status TEXT DEFAULT 'sent', -- 'sent', 'delivered', 'failed', 'undelivered'
  error_message TEXT,
  
  trigger_reason TEXT, -- 'campaign', 'manual', 'ai_response'
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Log de Emails enviados (SMTP)
CREATE TABLE email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES prospecting_sessions(id) ON DELETE CASCADE,
  participant_id UUID REFERENCES campaign_participants(id),
  
  to_email TEXT NOT NULL,
  from_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message_content TEXT NOT NULL,
  
  smtp_message_id TEXT,
  status TEXT DEFAULT 'sent', -- 'sent', 'delivered', 'failed', 'bounced', 'opened'
  error_message TEXT,
  
  trigger_reason TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  opened_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sms_logs_session ON sms_logs(session_id);
CREATE INDEX idx_email_logs_session ON email_logs(session_id);
```

### 4. Configurações de Canal

```sql
-- Já existe email_settings e sms_settings, adicionar user_id
ALTER TABLE email_settings ADD COLUMN user_id UUID REFERENCES auth.users(id);
ALTER TABLE sms_settings ADD COLUMN user_id UUID REFERENCES auth.users(id);

-- Habilitar RLS
ALTER TABLE email_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own email settings" ON email_settings FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own sms settings" ON sms_settings FOR ALL USING (auth.uid() = user_id);
```

---

## 🔄 FLUXO UNIFICADO DE MENSAGENS

### Recebimento (Webhook)

```
┌─────────────────┐
│ Cliente envia   │
│ WhatsApp/SMS/   │
│ Email           │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│ Edge Function (por canal)       │
│ - receive-whatsapp-message      │
│ - receive-sms-message (NOVO)    │
│ - receive-email-message (NOVO)  │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ 1. Identificar/Criar Session    │
│    - Buscar por phone/email     │
│    - Criar se não existir       │
│    - Vincular a crm_contact     │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ 2. Salvar Mensagem              │
│    conversation_messages        │
│    - channel: whatsapp/sms/email│
│    - sender: 'client'           │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ 3. Verificar ai_enabled         │
│    na session                   │
└────────┬────────────────────────┘
         │
    ┌────┴────┐
    │ IA ON?  │
    └────┬────┘
         │
    ┌────▼────┐      ┌───────────┐
    │ SIM     │      │ NÃO       │
    │         │      │ (humano)  │
    └────┬────┘      └───────────┘
         │                │
         ▼                ▼
┌─────────────────┐  ┌──────────────┐
│ 4. Chamar IA    │  │ Notificar    │
│ gpt-agent       │  │ humano       │
│ - Contexto      │  │ (realtime)   │
│ - Histórico     │  └──────────────┘
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│ 5. Enviar Resposta              │
│    - send-whatsapp-message      │
│    - send-sms-message (NOVO)    │
│    - send-email-message (NOVO)  │
└─────────────────────────────────┘
```

### Envio (Campaign/Manual)

```
┌─────────────────┐
│ Campaign Cadence│
│ ou Manual       │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│ 1. Escolher Canal               │
│    - Prioridade campanha        │
│    - Fallback se falhar         │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ 2. Validar Configuração         │
│    - SMTP config OK?            │
│    - Twilio config OK?          │
│    - WhatsApp instance ativa?   │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ 3. Gerar Mensagem (IA)          │
│    gpt-agent com contexto       │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ 4. Enviar                       │
│    - API apropriada             │
│    - Log em XXX_logs            │
│    - Criar session se não existe│
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ 5. Aguardar Resposta            │
│    - Webhook retorna            │
│    - Ciclo recomeça             │
└─────────────────────────────────┘
```

---

## 📱 INTERFACE: CRM Chat Melhorado

### Funcionalidades

1. **Lista de Conversas Ativas**
   - Badge colorido por canal (🟢 WhatsApp, 🔵 SMS, 📧 Email)
   - Badge de temperatura (🔥 Hot, ☀️ Warm, ❄️ Cold)
   - Última mensagem + timestamp
   - Contador de não lidas
   - Toggle IA on/off

2. **Filtros**
   - Por canal (All, WhatsApp, SMS, Email)
   - Por temperatura (All, Hot, Warm, Cold)
   - Por status IA (IA Ativa, Manual)
   - Por campanha

3. **Visualização da Conversa**
   - Histórico completo multi-canal
   - Indicador quando mensagem vem de canal diferente
   - Responder pelo mesmo canal da última mensagem
   - Botão "Desativar IA" sempre visível
   - Informações do contato (CRM)

---

## 🛠️ EDGE FUNCTIONS A CRIAR/ATUALIZAR

### 1. `receive-sms-message` (NOVO)
- Webhook do Twilio para receber SMS
- Extrair: From, To, Body, MessageSid
- Criar/atualizar session
- Salvar em conversation_messages
- Acionar IA se habilitada

### 2. `receive-email-message` (NOVO)
- Webhook SMTP (usando SendGrid/Postmark ou polling IMAP)
- Extrair: From, To, Subject, Body
- Criar/atualizar session
- Salvar em conversation_messages
- Acionar IA se habilitada

### 3. `send-sms-message` (NOVO)
- Enviar SMS via Twilio
- Buscar config de sms_settings
- Log em sms_logs
- Retornar MessageSid

### 4. Atualizar `send-email-message`
- Usar email_settings do usuário
- SMTP real (não mock)
- Log em email_logs

### 5. Atualizar `gpt-agent`
- Suportar contexto multi-canal
- Retornar resposta apropriada para o canal
- Ajustar prompt baseado no canal

### 6. `unified-message-handler` (NOVO - Opcional)
- Função central que processa qualquer mensagem recebida
- Evita duplicação de código
- Redireciona para canal apropriado

---

## 🎨 COMPONENTES REACT A CRIAR/ATUALIZAR

### 1. `CRMChat.tsx` (MELHORADO)
```tsx
- Filtros por canal e temperatura
- Badge multi-canal
- Badge de temperatura
- Integrar com conversation_messages (não só whatsapp_messages)
```

### 2. `Prospecting.tsx` (MELHORADO)
```tsx
- Suportar múltiplos canais na mesma conversa
- Indicador visual de canal por mensagem
- Resposta automática no mesmo canal
- Botão "Mudar Canal" para forçar envio em outro canal
```

### 3. `UnifiedConversationView.tsx` (NOVO)
```tsx
- Componente reutilizável para exibir conversa
- Suporta todos os canais
- Timeline unificada com badges
- Input com seletor de canal
```

---

## ✅ CHECKLIST DE IMPLEMENTAÇÃO

### Fase 1: Banco de Dados (CRITICAL)
- [ ] Criar migration unificando tabelas
- [ ] Adicionar colunas de canal
- [ ] Criar sms_logs e email_logs
- [ ] Atualizar RLS policies

### Fase 2: Edge Functions
- [ ] Criar receive-sms-message
- [ ] Criar receive-email-message  
- [ ] Criar send-sms-message
- [ ] Atualizar send-email-message (SMTP real)
- [ ] Atualizar gpt-agent (multi-canal)

### Fase 3: Webhooks Externos
- [ ] Configurar Twilio webhook → receive-sms-message
- [ ] Configurar Email webhook (SendGrid/Postmark)

### Fase 4: Interface
- [ ] Melhorar CRMChat com filtros
- [ ] Atualizar Prospecting para multi-canal
- [ ] Criar badges de canal/temperatura
- [ ] Atualizar queries para usar conversation_messages

### Fase 5: Testes & Validação
- [ ] Testar recebimento SMS
- [ ] Testar recebimento Email
- [ ] Testar resposta automática IA em todos os canais
- [ ] Testar toggle IA on/off
- [ ] Testar filtros no CRM Chat

---

## 🔒 SEGURANÇA & PERFORMANCE

1. **Rate Limiting**: Limitar mensagens por minuto por canal
2. **Validação**: Verificar sender antes de responder
3. **Encryption**: Dados sensíveis (auth_token, smtp_password) criptografados
4. **Índices**: Já criados para queries rápidas
5. **RLS**: Todas as tabelas com políticas de segurança
6. **Realtime**: Apenas subscrições necessárias para evitar overhead

---

## 📊 MÉTRICAS A COLETAR

1. Taxa de resposta por canal
2. Tempo médio de resposta (IA vs Humano)
3. Taxa de conversão por canal
4. Temperatura de leads ao longo do tempo
5. Quantidade de vezes que IA foi desativada

---

## 🚀 PRÓXIMA AÇÃO

Implementar em ordem:
1. ✅ Criar migration SQL unificada
2. ✅ Atualizar Edge Functions existentes
3. ✅ Criar novas Edge Functions (SMS/Email)
4. ✅ Atualizar componentes React
5. ✅ Configurar webhooks Twilio
6. ✅ Testar fluxo completo
