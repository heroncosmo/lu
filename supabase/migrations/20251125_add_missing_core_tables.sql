-- =============================================================================
-- MIGRATION: Adicionar tabelas faltantes para Luchoa-IA
-- Data: 25/11/2025
-- Descrição: Cria tabelas críticas que faltam no schema atual
-- =============================================================================

-- =============================================================================
-- 1. LEAD STATES - Estados do lead na máquina de estados
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.lead_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES campaign_participants(id) ON DELETE CASCADE,
  
  -- Current state
  current_stage TEXT NOT NULL DEFAULT 'A_TRABALHAR', -- 'A_TRABALHAR', 'PROSPECCAO', 'OFERTA', 'ORCAMENTO', 'NEGOCIACAO'
  atividade_codigo INTEGER, -- Redsis activity ID
  
  -- Classification
  temperature TEXT DEFAULT 'cold', -- 'cold', 'warm', 'hot'
  last_intent TEXT, -- 'pedido_orcamento', 'pedido_midia', 'negociacao', etc.
  
  -- Owner lock (human intervention)
  owner_id UUID REFERENCES auth.users(id),
  owner_locked_at TIMESTAMPTZ,
  owner_lock_reason TEXT,
  owner_lock BOOLEAN DEFAULT false,
  
  -- AI control
  ai_paused BOOLEAN DEFAULT false,
  ai_pause_reason TEXT,
  
  -- State history
  state_history JSONB DEFAULT '[]'::jsonb,
  
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(participant_id)
);

-- RLS
ALTER TABLE public.lead_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view lead states from their campaigns"
  ON public.lead_states FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM campaign_participants cp
      JOIN campaigns c ON cp.campaign_id = c.id
      WHERE cp.id = lead_states.participant_id
      AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage lead states from their campaigns"
  ON public.lead_states FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM campaign_participants cp
      JOIN campaigns c ON cp.campaign_id = c.id
      WHERE cp.id = lead_states.participant_id
      AND c.user_id = auth.uid()
    )
  );

-- Indexes
CREATE INDEX idx_lead_states_participant ON public.lead_states(participant_id);
CREATE INDEX idx_lead_states_temperature ON public.lead_states(temperature);
CREATE INDEX idx_lead_states_owner_lock ON public.lead_states(owner_lock) WHERE owner_lock = true;

-- =============================================================================
-- 2. CADENCE QUEUE - Fila de mensagens agendadas
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.cadence_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES campaign_participants(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  
  -- Scheduling
  scheduled_for TIMESTAMPTZ NOT NULL,
  window_start TIMESTAMPTZ,
  window_end TIMESTAMPTZ,
  
  -- Message details
  channel TEXT NOT NULL DEFAULT 'whatsapp', -- 'whatsapp', 'email', 'sms'
  message_type TEXT NOT NULL, -- 'T0', 'T1', 'T2', 'T3', 'check_in', 'clarification', 'followup'
  message_template TEXT,
  message_content TEXT,
  
  -- Perfil Triplo context
  context_snapshot JSONB,
  
  -- Execution tracking
  status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'failed', 'skipped', 'cancelled'
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  
  -- Retry control
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  priority INTEGER DEFAULT 50,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.cadence_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view cadence queue from their campaigns"
  ON public.cadence_queue FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = cadence_queue.campaign_id
      AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage cadence queue from their campaigns"
  ON public.cadence_queue FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = cadence_queue.campaign_id
      AND c.user_id = auth.uid()
    )
  );

-- Indexes
CREATE INDEX idx_cadence_queue_scheduled ON public.cadence_queue(scheduled_for) WHERE status = 'pending';
CREATE INDEX idx_cadence_queue_participant ON public.cadence_queue(participant_id);
CREATE INDEX idx_cadence_queue_priority ON public.cadence_queue(priority DESC, scheduled_for ASC) WHERE status = 'pending';
CREATE INDEX idx_cadence_queue_campaign ON public.cadence_queue(campaign_id);

-- =============================================================================
-- 3. HANDOFF LOG - Registro de intervenções humanas
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.handoff_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES campaign_participants(id) ON DELETE CASCADE,
  
  event_type TEXT NOT NULL, -- 'assume', 'devolver', 'manual_message', 'ai_pause', 'ai_resume'
  triggered_by UUID REFERENCES auth.users(id),
  reason TEXT,
  
  -- State before/after
  state_before JSONB,
  state_after JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.handoff_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view handoff log from their campaigns"
  ON public.handoff_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM campaign_participants cp
      JOIN campaigns c ON cp.campaign_id = c.id
      WHERE cp.id = handoff_log.participant_id
      AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert handoff log"
  ON public.handoff_log FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaign_participants cp
      JOIN campaigns c ON cp.campaign_id = c.id
      WHERE cp.id = handoff_log.participant_id
      AND c.user_id = auth.uid()
    )
  );

-- Indexes
CREATE INDEX idx_handoff_log_participant ON public.handoff_log(participant_id);
CREATE INDEX idx_handoff_log_event_type ON public.handoff_log(event_type);
CREATE INDEX idx_handoff_log_created ON public.handoff_log(created_at DESC);

-- =============================================================================
-- 4. BLOCKLIST ENTRIES - Frases bloqueadas por campanha
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.blocklist_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  phrase TEXT NOT NULL,
  reason TEXT,
  reported_by UUID REFERENCES auth.users(id),
  reported_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Usage tracking
  times_triggered INTEGER DEFAULT 0,
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.blocklist_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view blocklist entries from their campaigns"
  ON public.blocklist_entries FOR SELECT
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = blocklist_entries.campaign_id
      AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage blocklist entries from their campaigns"
  ON public.blocklist_entries FOR ALL
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = blocklist_entries.campaign_id
      AND c.user_id = auth.uid()
    )
  );

-- Indexes
CREATE INDEX idx_blocklist_campaign ON public.blocklist_entries(campaign_id) WHERE is_active = true;
CREATE INDEX idx_blocklist_phrase ON public.blocklist_entries USING gin(to_tsvector('portuguese', phrase));

-- =============================================================================
-- 5. STATE TRANSITIONS - Histórico de transições de estado
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.state_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_state_id UUID NOT NULL REFERENCES lead_states(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES campaign_participants(id) ON DELETE CASCADE,
  
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  from_temperature TEXT,
  to_temperature TEXT,
  
  trigger_type TEXT NOT NULL, -- 'message_received', 'timeout', 'manual', 'ai_classification'
  trigger_details JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.state_transitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view state transitions from their campaigns"
  ON public.state_transitions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM campaign_participants cp
      JOIN campaigns c ON cp.campaign_id = c.id
      WHERE cp.id = state_transitions.participant_id
      AND c.user_id = auth.uid()
    )
  );

-- Indexes
CREATE INDEX idx_state_transitions_lead_state ON public.state_transitions(lead_state_id);
CREATE INDEX idx_state_transitions_participant ON public.state_transitions(participant_id);
CREATE INDEX idx_state_transitions_created ON public.state_transitions(created_at DESC);

-- =============================================================================
-- 6. QUOTATIONS - Cotações/Propostas
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES campaign_participants(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Reference
  quotation_number TEXT,
  redsis_orcamento_codigo INTEGER,
  
  -- Status
  status TEXT DEFAULT 'draft', -- 'draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired'
  
  -- Values
  total_value DECIMAL(15, 2),
  currency TEXT DEFAULT 'BRL',
  
  -- Dates
  valid_until TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  
  -- Content
  items JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view quotations from their campaigns"
  ON public.quotations FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can manage quotations from their campaigns"
  ON public.quotations FOR ALL
  USING (user_id = auth.uid());

-- Indexes
CREATE INDEX idx_quotations_participant ON public.quotations(participant_id);
CREATE INDEX idx_quotations_campaign ON public.quotations(campaign_id);
CREATE INDEX idx_quotations_status ON public.quotations(status);
CREATE INDEX idx_quotations_user ON public.quotations(user_id);

-- =============================================================================
-- 7. PRODUCT UPDATES - Atualizações de produtos para broadcast
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.product_updates (
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

-- RLS
ALTER TABLE public.product_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their product updates"
  ON public.product_updates FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can manage their product updates"
  ON public.product_updates FOR ALL
  USING (user_id = auth.uid());

-- Indexes
CREATE INDEX idx_product_updates_user ON public.product_updates(user_id);
CREATE INDEX idx_product_updates_status ON public.product_updates(status);

-- =============================================================================
-- COMENTÁRIO FINAL
-- =============================================================================
COMMENT ON TABLE public.lead_states IS 'Estados atuais dos leads na máquina de estados do Luchoa-IA';
COMMENT ON TABLE public.cadence_queue IS 'Fila de mensagens agendadas para envio automático';
COMMENT ON TABLE public.handoff_log IS 'Log de intervenções humanas nos leads';
COMMENT ON TABLE public.blocklist_entries IS 'Frases bloqueadas para não serem usadas pela IA';
COMMENT ON TABLE public.state_transitions IS 'Histórico de transições de estado dos leads';
COMMENT ON TABLE public.quotations IS 'Cotações/propostas enviadas para leads';
COMMENT ON TABLE public.product_updates IS 'Atualizações de produtos para broadcast';
