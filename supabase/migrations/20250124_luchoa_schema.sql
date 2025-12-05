-- Campaigns table
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  product_name TEXT,
  product_description TEXT,
  segment TEXT, -- 'architects', 'fabricators', 'distributors', 'real_estate'
  tone TEXT DEFAULT 'consultivo', -- 'premium', 'consultivo', 'technical'
  languages TEXT[] DEFAULT ARRAY['pt'], -- ['pt', 'en', 'es', 'ar']
  
  -- Cadence rules
  messages_per_week INTEGER DEFAULT 3,
  min_interval_hours INTEGER DEFAULT 24,
  quiet_hours_start TIME DEFAULT '18:00',
  quiet_hours_end TIME DEFAULT '09:00',
  
  -- Channel priorities
  primary_channel TEXT DEFAULT 'whatsapp', -- 'whatsapp', 'email', 'call'
  fallback_enabled BOOLEAN DEFAULT true,
  fallback_after_messages INTEGER DEFAULT 3,
  fallback_after_days INTEGER DEFAULT 15,
  
  -- Response rules
  cold_followup_days INTEGER DEFAULT 5,
  hot_followup_days INTEGER DEFAULT 3,
  clarification_min_minutes INTEGER DEFAULT 20,
  clarification_max_minutes INTEGER DEFAULT 40,
  
  -- Kanban mapping
  funil_id INTEGER,
  stage_mapping JSONB DEFAULT '{}'::jsonb,
  
  -- Auto product news
  auto_send_product_news BOOLEAN DEFAULT false,
  
  status TEXT DEFAULT 'active', -- 'active', 'paused', 'archived'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Campaign participants (leads in campaign)
CREATE TABLE IF NOT EXISTS campaign_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  
  -- CRM reference
  cliente_codigo INTEGER,
  cliente_nome TEXT,
  cliente_whatsapp TEXT,
  cliente_email TEXT,
  cliente_timezone TEXT DEFAULT 'America/Sao_Paulo',
  cliente_language TEXT DEFAULT 'pt',
  
  -- Profile from CRM
  cliente_profile JSONB DEFAULT '{}'::jsonb,
  
  -- Aliases for compatibility (ParticipantManagement UI)
  phone TEXT,
  email TEXT,
  name TEXT,
  status TEXT DEFAULT 'active',
  
  -- Redsis references (KanbanBoard)
  redsis_cliente_codigo INTEGER,
  redsis_atividade_codigo INTEGER,
  
  -- Participation control
  is_active BOOLEAN DEFAULT true,
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  last_contact_at TIMESTAMPTZ,
  messages_sent_count INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  timezone TEXT DEFAULT 'America/Sao_Paulo',
  language TEXT DEFAULT 'pt-BR',
  message_count INTEGER DEFAULT 0,
  
  -- Stickiness tracking
  preferred_channel TEXT,
  channel_history JSONB DEFAULT '[]'::jsonb,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lead states (tracks current stage in state machine)
CREATE TABLE IF NOT EXISTS lead_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES campaign_participants(id) ON DELETE CASCADE,
  campaign_participant_id UUID REFERENCES campaign_participants(id) ON DELETE CASCADE,
  
  -- Current state
  current_stage TEXT NOT NULL, -- 'A_TRABALHAR', 'PROSPECCAO', 'OFERTA', 'ORCAMENTO', 'NEGOCIACAO'
  atividade_codigo INTEGER, -- Redsis activity ID
  
  -- Classification
  temperature TEXT DEFAULT 'unknown', -- 'cold', 'warm', 'hot', 'unknown'
  last_intent TEXT, -- 'pedido_orcamento', 'pedido_midia', 'negociacao', etc.
  
  -- Owner lock (from negotiation module)
  owner_id UUID REFERENCES auth.users(id),
  owner_locked_at TIMESTAMPTZ,
  owner_lock_reason TEXT,
  owner_lock BOOLEAN DEFAULT false,
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  
  -- AI control
  ai_paused BOOLEAN DEFAULT false,
  ai_pause_reason TEXT,
  
  -- State history
  state_history JSONB DEFAULT '[]'::jsonb,
  
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(participant_id)
);

-- Cadence queue (scheduled messages)
CREATE TABLE IF NOT EXISTS cadence_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES campaign_participants(id) ON DELETE CASCADE,
  campaign_participant_id UUID REFERENCES campaign_participants(id) ON DELETE CASCADE,
  
  -- Scheduling
  scheduled_for TIMESTAMPTZ NOT NULL,
  scheduled_at TIMESTAMPTZ,
  window_start TIMESTAMPTZ,
  window_end TIMESTAMPTZ,
  
  -- Message details
  channel TEXT NOT NULL, -- 'whatsapp', 'email'
  message_type TEXT NOT NULL, -- 'T0', 'T1', 'T2', 'T3', 'check_in', 'clarification'
  message_template TEXT,
  message_content TEXT,
  channel_used TEXT,
  
  -- Perfil Triplo context
  context_snapshot JSONB,
  
  -- Execution tracking
  status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'failed', 'skipped', 'rescheduled', 'blocked'
  sent_at TIMESTAMPTZ,
  error TEXT,
  error_message TEXT,
  
  -- Retry control
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  priority INTEGER DEFAULT 50,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cadence_queue_scheduled ON cadence_queue(scheduled_for) WHERE status = 'pending';
CREATE INDEX idx_cadence_queue_participant ON cadence_queue(participant_id);
CREATE INDEX idx_cadence_queue_priority ON cadence_queue(priority DESC, scheduled_for ASC) WHERE status = 'pending';

-- Handoff log (human intervention tracking)
CREATE TABLE IF NOT EXISTS handoff_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES campaign_participants(id) ON DELETE CASCADE,
  campaign_participant_id UUID REFERENCES campaign_participants(id) ON DELETE CASCADE,
  
  event_type TEXT NOT NULL, -- 'assume', 'devolver', 'manual_message', 'ai_pause', 'ai_resume'
  triggered_by TEXT, -- user_id or 'system'
  reason TEXT,
  
  -- State before/after
  state_before JSONB,
  state_after JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_handoff_log_participant ON handoff_log(participant_id);

-- Blocklist entries (reported phrases)
CREATE TABLE IF NOT EXISTS blocklist_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  
  phrase TEXT NOT NULL,
  reason TEXT,
  reported_by UUID REFERENCES auth.users(id),
  reported_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Usage tracking
  times_triggered INTEGER DEFAULT 0,
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_blocklist_campaign ON blocklist_entries(campaign_id) WHERE is_active = true;

-- Product updates (news to send)
CREATE TABLE IF NOT EXISTS product_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  product_name TEXT NOT NULL,
  product_description TEXT,
  material_code INTEGER,
  media_urls TEXT[],
  
  -- Campaign targeting
  target_campaigns UUID[] DEFAULT ARRAY[]::UUID[],
  
  -- Send control
  sent_to_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending', -- 'pending', 'sending', 'sent'
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agents (GPT agent configurations)
CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  persona TEXT NOT NULL,
  model TEXT DEFAULT 'gpt-4o',
  temperature REAL DEFAULT 0.7,
  
  -- Behavior
  read_delay_seconds INTEGER DEFAULT 30,
  typing_speed_wps REAL DEFAULT 37.5,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Prospecting sessions (chat sessions)
CREATE TABLE IF NOT EXISTS prospecting_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  participant_id UUID REFERENCES campaign_participants(id) ON DELETE CASCADE,
  
  phone TEXT NOT NULL,
  contact_name TEXT,
  agent_id UUID REFERENCES agents(id),
  
  -- Session status
  is_active BOOLEAN DEFAULT true,
  ai_enabled BOOLEAN DEFAULT true,
  human_took_over BOOLEAN DEFAULT false,
  
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- WhatsApp messages (conversation log)
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES prospecting_sessions(id) ON DELETE CASCADE,
  participant_id UUID REFERENCES campaign_participants(id) ON DELETE CASCADE,
  
  -- Message content
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text', -- 'text', 'image', 'video', 'audio', 'document'
  media_url TEXT,
  
  -- Direction
  is_from_user BOOLEAN NOT NULL,
  from_phone TEXT,
  to_phone TEXT,
  
  -- Metadata
  whatsapp_message_id TEXT,
  status TEXT DEFAULT 'sent', -- 'sent', 'delivered', 'read', 'failed'
  
  -- AI context
  agent_id UUID REFERENCES agents(id),
  context_snapshot JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_whatsapp_messages_session ON whatsapp_messages(session_id);
CREATE INDEX idx_whatsapp_messages_participant ON whatsapp_messages(participant_id);
CREATE INDEX idx_whatsapp_messages_created ON whatsapp_messages(created_at DESC);

-- Message feedback (thumbs up/down)
CREATE TABLE IF NOT EXISTS message_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES prospecting_sessions(id) ON DELETE CASCADE,
  message_id UUID REFERENCES whatsapp_messages(id) ON DELETE CASCADE,
  
  feedback_type TEXT NOT NULL, -- 'approve', 'report'
  reason TEXT,
  
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(message_id)
);

-- RLS Policies
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE cadence_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE handoff_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocklist_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospecting_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own campaigns" ON campaigns FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own participants" ON campaign_participants FOR ALL USING (
  campaign_id IN (SELECT id FROM campaigns WHERE user_id = auth.uid())
);
CREATE POLICY "Users can view own lead states" ON lead_states FOR ALL USING (
  participant_id IN (
    SELECT id FROM campaign_participants WHERE campaign_id IN (
      SELECT id FROM campaigns WHERE user_id = auth.uid()
    )
  )
);
CREATE POLICY "Users can view own cadence queue" ON cadence_queue FOR ALL USING (
  participant_id IN (
    SELECT id FROM campaign_participants WHERE campaign_id IN (
      SELECT id FROM campaigns WHERE user_id = auth.uid()
    )
  )
);
CREATE POLICY "Users can view own handoff log" ON handoff_log FOR ALL USING (
  participant_id IN (
    SELECT id FROM campaign_participants WHERE campaign_id IN (
      SELECT id FROM campaigns WHERE user_id = auth.uid()
    )
  )
);
CREATE POLICY "Users can manage own blocklist" ON blocklist_entries FOR ALL USING (
  campaign_id IN (SELECT id FROM campaigns WHERE user_id = auth.uid())
);
CREATE POLICY "Users can manage own product updates" ON product_updates FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own message feedback" ON message_feedback FOR ALL USING (
  session_id IN (SELECT id FROM prospecting_sessions WHERE user_id = auth.uid())
);
CREATE POLICY "Users can manage own agents" ON agents FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own sessions" ON prospecting_sessions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can view own messages" ON whatsapp_messages FOR ALL USING (
  session_id IN (SELECT id FROM prospecting_sessions WHERE user_id = auth.uid())
);

-- Updated timestamp triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cadence_queue_updated_at BEFORE UPDATE ON cadence_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lead_states_updated_at BEFORE UPDATE ON lead_states
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
