-- ============================================================================
-- MIGRATION: Unified Multi-Channel System (WhatsApp, SMS, Email)
-- Autor: AI Assistant
-- Data: 2025-01-24
-- Descrição: Unifica sistema de mensagens para suportar múltiplos canais
-- ============================================================================

-- ============================================================================
-- PARTE 1: ATUALIZAR prospecting_sessions PARA MULTI-CANAL
-- ============================================================================

-- Adicionar coluna de canal (whatsapp, sms, email)
ALTER TABLE prospecting_sessions 
  ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'whatsapp' 
    CHECK (channel IN ('whatsapp', 'sms', 'email'));

-- Adicionar email e sms como opções
ALTER TABLE prospecting_sessions 
  ADD COLUMN IF NOT EXISTS client_email TEXT,
  ADD COLUMN IF NOT EXISTS client_sms_number TEXT;

-- Adicionar temperatura do lead
ALTER TABLE prospecting_sessions 
  ADD COLUMN IF NOT EXISTS lead_temperature TEXT DEFAULT 'cold' 
    CHECK (lead_temperature IN ('cold', 'warm', 'hot'));

-- Vincular com CRM
ALTER TABLE prospecting_sessions 
  ADD COLUMN IF NOT EXISTS crm_contact_id UUID REFERENCES crm_contacts(id) ON DELETE SET NULL;

-- Vincular com campanha
ALTER TABLE prospecting_sessions 
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;

-- Renomear phone para ser genérico (se não existir client_phone)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'prospecting_sessions' AND column_name = 'client_phone'
  ) THEN
    ALTER TABLE prospecting_sessions RENAME COLUMN phone TO client_phone;
  END IF;
END $$;

-- Adicionar colunas de controle
ALTER TABLE prospecting_sessions 
  ADD COLUMN IF NOT EXISTS client_whatsapp_number TEXT,
  ADD COLUMN IF NOT EXISTS client_name TEXT;

-- Copiar dados de phone para client_whatsapp_number se channel é whatsapp
UPDATE prospecting_sessions 
SET client_whatsapp_number = client_phone 
WHERE channel = 'whatsapp' AND client_whatsapp_number IS NULL;

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_sessions_channel ON prospecting_sessions(channel);
CREATE INDEX IF NOT EXISTS idx_sessions_temperature ON prospecting_sessions(lead_temperature);
CREATE INDEX IF NOT EXISTS idx_sessions_crm_contact ON prospecting_sessions(crm_contact_id);
CREATE INDEX IF NOT EXISTS idx_sessions_campaign ON prospecting_sessions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_sessions_ai_enabled ON prospecting_sessions(ai_enabled);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON prospecting_sessions(is_active);

-- ============================================================================
-- PARTE 2: RENOMEAR whatsapp_messages → conversation_messages
-- ============================================================================

-- Renomear tabela se não foi renomeada ainda
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'whatsapp_messages'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'conversation_messages'
  ) THEN
    ALTER TABLE whatsapp_messages RENAME TO conversation_messages;
  END IF;
END $$;

-- Adicionar coluna de canal
ALTER TABLE conversation_messages
  ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'whatsapp' 
    CHECK (channel IN ('whatsapp', 'sms', 'email'));

-- Adicionar campos específicos de email
ALTER TABLE conversation_messages
  ADD COLUMN IF NOT EXISTS email_subject TEXT,
  ADD COLUMN IF NOT EXISTS email_from TEXT,
  ADD COLUMN IF NOT EXISTS email_to TEXT;

-- Adicionar campos específicos de SMS
ALTER TABLE conversation_messages
  ADD COLUMN IF NOT EXISTS sms_from TEXT,
  ADD COLUMN IF NOT EXISTS sms_to TEXT;

-- Adicionar timestamp de leitura
ALTER TABLE conversation_messages
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

-- Adicionar sender genérico
ALTER TABLE conversation_messages
  ADD COLUMN IF NOT EXISTS sender TEXT DEFAULT 'client' 
    CHECK (sender IN ('client', 'agent', 'system'));

-- Renomear colunas se necessário
DO $$ 
BEGIN
  -- Renomear is_from_user para is_from_client
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'conversation_messages' AND column_name = 'is_from_user'
  ) THEN
    ALTER TABLE conversation_messages RENAME COLUMN is_from_user TO is_from_client;
  END IF;
  
  -- Garantir que message_content existe
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'conversation_messages' AND column_name = 'message_content'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'conversation_messages' AND column_name = 'content'
  ) THEN
    ALTER TABLE conversation_messages RENAME COLUMN content TO message_content;
  END IF;
END $$;

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_messages_channel ON conversation_messages(channel);
CREATE INDEX IF NOT EXISTS idx_messages_read ON conversation_messages(read_at);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON conversation_messages(sender);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON conversation_messages(timestamp);

-- Atualizar coluna sender baseado em is_from_client
UPDATE conversation_messages 
SET sender = CASE 
  WHEN is_from_client = true THEN 'client' 
  ELSE 'agent' 
END 
WHERE sender IS NULL;

-- ============================================================================
-- PARTE 3: CRIAR TABELAS DE LOGS
-- ============================================================================

-- Tabela de logs de SMS (Twilio)
CREATE TABLE IF NOT EXISTS sms_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES prospecting_sessions(id) ON DELETE CASCADE,
  participant_id UUID REFERENCES campaign_participants(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Dados do SMS
  to_number TEXT NOT NULL,
  from_number TEXT NOT NULL,
  message_content TEXT NOT NULL,
  
  -- Twilio metadata
  twilio_sid TEXT,
  twilio_status TEXT,
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'failed', 'undelivered')),
  error_message TEXT,
  
  -- Rastreamento
  trigger_reason TEXT CHECK (trigger_reason IN ('campaign', 'manual', 'ai_response', 'fallback')),
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de logs de Email (SMTP)
CREATE TABLE IF NOT EXISTS email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES prospecting_sessions(id) ON DELETE CASCADE,
  participant_id UUID REFERENCES campaign_participants(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Dados do Email
  to_email TEXT NOT NULL,
  to_name TEXT,
  from_email TEXT NOT NULL,
  from_name TEXT,
  subject TEXT NOT NULL,
  message_content TEXT NOT NULL,
  
  -- SMTP metadata
  smtp_message_id TEXT,
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'failed', 'bounced', 'opened', 'clicked')),
  error_message TEXT,
  
  -- Rastreamento
  trigger_reason TEXT CHECK (trigger_reason IN ('campaign', 'manual', 'ai_response', 'fallback')),
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para logs
CREATE INDEX IF NOT EXISTS idx_sms_logs_session ON sms_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_sms_logs_participant ON sms_logs(participant_id);
CREATE INDEX IF NOT EXISTS idx_sms_logs_status ON sms_logs(status);
CREATE INDEX IF NOT EXISTS idx_sms_logs_sent_at ON sms_logs(sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_logs_session ON email_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_participant ON email_logs(participant_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_logs_sent_at ON email_logs(sent_at DESC);

-- ============================================================================
-- PARTE 4: ATUALIZAR TABELAS DE CONFIGURAÇÃO
-- ============================================================================

-- Adicionar user_id em email_settings
ALTER TABLE email_settings 
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Adicionar user_id em sms_settings
ALTER TABLE sms_settings 
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- ============================================================================
-- PARTE 5: RLS (Row Level Security)
-- ============================================================================

-- Habilitar RLS nas novas tabelas
ALTER TABLE sms_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

-- Políticas para sms_logs
DROP POLICY IF EXISTS "Users can view own sms logs" ON sms_logs;
CREATE POLICY "Users can view own sms logs" ON sms_logs 
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own sms logs" ON sms_logs;
CREATE POLICY "Users can insert own sms logs" ON sms_logs 
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Políticas para email_logs
DROP POLICY IF EXISTS "Users can view own email logs" ON email_logs;
CREATE POLICY "Users can view own email logs" ON email_logs 
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own email logs" ON email_logs;
CREATE POLICY "Users can insert own email logs" ON email_logs 
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Atualizar políticas de configurações
DROP POLICY IF EXISTS "Users manage own email settings" ON email_settings;
CREATE POLICY "Users manage own email settings" ON email_settings 
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own sms settings" ON sms_settings;
CREATE POLICY "Users manage own sms settings" ON sms_settings 
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- PARTE 6: FUNCTIONS & TRIGGERS
-- ============================================================================

-- Function para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para atualizar updated_at
DROP TRIGGER IF EXISTS update_prospecting_sessions_updated_at ON prospecting_sessions;
CREATE TRIGGER update_prospecting_sessions_updated_at
  BEFORE UPDATE ON prospecting_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_sms_logs_updated_at ON sms_logs;
CREATE TRIGGER update_sms_logs_updated_at
  BEFORE UPDATE ON sms_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_email_logs_updated_at ON email_logs;
CREATE TRIGGER update_email_logs_updated_at
  BEFORE UPDATE ON email_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function para atualizar temperatura do lead automaticamente
CREATE OR REPLACE FUNCTION update_lead_temperature()
RETURNS TRIGGER AS $$
DECLARE
  message_count INT;
  response_count INT;
  last_message_time TIMESTAMPTZ;
BEGIN
  -- Contar mensagens na sessão
  SELECT COUNT(*) INTO message_count
  FROM conversation_messages
  WHERE session_id = NEW.session_id;
  
  -- Contar respostas do cliente
  SELECT COUNT(*) INTO response_count
  FROM conversation_messages
  WHERE session_id = NEW.session_id AND is_from_client = true;
  
  -- Pegar última mensagem
  SELECT MAX(timestamp) INTO last_message_time
  FROM conversation_messages
  WHERE session_id = NEW.session_id;
  
  -- Atualizar temperatura baseado em engajamento
  UPDATE prospecting_sessions SET
    lead_temperature = CASE
      -- HOT: Respondeu nas últimas 24h E tem 3+ mensagens
      WHEN last_message_time > NOW() - INTERVAL '24 hours' 
        AND response_count >= 3 
        AND message_count >= 5 
      THEN 'hot'
      
      -- WARM: Respondeu nas últimas 72h E tem 2+ mensagens
      WHEN last_message_time > NOW() - INTERVAL '72 hours' 
        AND response_count >= 2 
      THEN 'warm'
      
      -- COLD: Resto
      ELSE 'cold'
    END,
    last_message_at = last_message_time
  WHERE id = NEW.session_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para atualizar temperatura automaticamente
DROP TRIGGER IF EXISTS update_lead_temperature_trigger ON conversation_messages;
CREATE TRIGGER update_lead_temperature_trigger
  AFTER INSERT ON conversation_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_lead_temperature();

-- ============================================================================
-- PARTE 7: VIEWS ÚTEIS
-- ============================================================================

-- View para estatísticas por canal
CREATE OR REPLACE VIEW channel_statistics AS
SELECT 
  ps.user_id,
  ps.channel,
  COUNT(DISTINCT ps.id) as total_sessions,
  COUNT(DISTINCT CASE WHEN ps.is_active = true THEN ps.id END) as active_sessions,
  COUNT(DISTINCT CASE WHEN ps.ai_enabled = true THEN ps.id END) as ai_enabled_sessions,
  COUNT(cm.id) as total_messages,
  COUNT(CASE WHEN cm.is_from_client = true THEN 1 END) as client_messages,
  COUNT(CASE WHEN cm.is_from_client = false THEN 1 END) as agent_messages
FROM prospecting_sessions ps
LEFT JOIN conversation_messages cm ON cm.session_id = ps.id
GROUP BY ps.user_id, ps.channel;

-- View para conversas ativas (últimas 72h)
CREATE OR REPLACE VIEW active_conversations AS
SELECT 
  ps.id as session_id,
  ps.user_id,
  ps.channel,
  ps.client_name,
  ps.client_phone,
  ps.client_email,
  ps.client_whatsapp_number,
  ps.client_sms_number,
  ps.lead_temperature,
  ps.ai_enabled,
  ps.last_message_at,
  ps.campaign_id,
  c.name as campaign_name,
  crm.name as crm_contact_name,
  crm.trade_name as crm_contact_trade_name,
  COUNT(cm.id) FILTER (WHERE cm.is_from_client = true AND cm.read_at IS NULL) as unread_count,
  (
    SELECT cm2.message_content 
    FROM conversation_messages cm2 
    WHERE cm2.session_id = ps.id 
    ORDER BY cm2.timestamp DESC 
    LIMIT 1
  ) as last_message_content,
  (
    SELECT cm2.sender 
    FROM conversation_messages cm2 
    WHERE cm2.session_id = ps.id 
    ORDER BY cm2.timestamp DESC 
    LIMIT 1
  ) as last_message_sender
FROM prospecting_sessions ps
LEFT JOIN campaigns c ON c.id = ps.campaign_id
LEFT JOIN crm_contacts crm ON crm.id = ps.crm_contact_id
LEFT JOIN conversation_messages cm ON cm.session_id = ps.id
WHERE ps.last_message_at > NOW() - INTERVAL '72 hours'
  AND ps.is_active = true
GROUP BY 
  ps.id, ps.user_id, ps.channel, ps.client_name, ps.client_phone, 
  ps.client_email, ps.client_whatsapp_number, ps.client_sms_number,
  ps.lead_temperature, ps.ai_enabled, ps.last_message_at, 
  ps.campaign_id, c.name, crm.name, crm.trade_name;

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================

-- Log de conclusão
DO $$ 
BEGIN
  RAISE NOTICE 'Migration completed successfully: Unified Multi-Channel System';
END $$;
