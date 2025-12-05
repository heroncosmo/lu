-- Adicionar tabela de orçamentos
CREATE TABLE IF NOT EXISTS public.quotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
    participant_id UUID REFERENCES public.campaign_participants(id) ON DELETE CASCADE,
    atividade_codigo INTEGER, -- Código da atividade no Redsis
    
    -- Dados do orçamento
    item_type TEXT CHECK (item_type IN ('chapa', 'cavalete', 'personalizado')),
    item_codigo INTEGER, -- Código no estoque Redsis
    item_descricao TEXT NOT NULL,
    quantidade DECIMAL(10,2) DEFAULT 1,
    preco_unitario DECIMAL(10,2),
    preco_total DECIMAL(10,2),
    desconto_percentual DECIMAL(5,2) DEFAULT 0,
    
    -- Status e owner lock
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'negotiating', 'accepted', 'rejected', 'expired')),
    owner_id UUID REFERENCES auth.users(id),
    owner_locked_at TIMESTAMPTZ,
    owner_lock_reason TEXT,
    
    -- Playbook e instruções
    playbook_template TEXT,
    negotiation_guidelines TEXT,
    max_discount_allowed DECIMAL(5,2) DEFAULT 10,
    
    -- Validade
    valid_until TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    
    -- Auditoria
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    accepted_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    rejection_reason TEXT
);

-- Índices
CREATE INDEX idx_quotations_participant ON public.quotations(participant_id);
CREATE INDEX idx_quotations_campaign ON public.quotations(campaign_id);
CREATE INDEX idx_quotations_status ON public.quotations(status);
CREATE INDEX idx_quotations_owner ON public.quotations(owner_id);

-- RLS Policies
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários autenticados podem ver orçamentos"
    ON public.quotations FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Usuários podem criar orçamentos"
    ON public.quotations FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Usuários podem atualizar orçamentos"
    ON public.quotations FOR UPDATE
    TO authenticated
    USING (true);

-- Trigger para updated_at
CREATE TRIGGER update_quotations_updated_at
    BEFORE UPDATE ON public.quotations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Adicionar campos de owner lock em lead_states
ALTER TABLE public.lead_states 
ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS owner_locked_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS owner_lock_reason TEXT,
ADD COLUMN IF NOT EXISTS ai_paused BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS ai_pause_reason TEXT;

-- Índice para owner lock
CREATE INDEX IF NOT EXISTS idx_lead_states_owner ON public.lead_states(owner_id);
CREATE INDEX IF NOT EXISTS idx_lead_states_ai_paused ON public.lead_states(ai_paused);

-- Função para assumir lead (owner lock)
CREATE OR REPLACE FUNCTION assume_lead(
    p_lead_state_id UUID,
    p_user_id UUID,
    p_reason TEXT DEFAULT 'Intervenção manual'
)
RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
BEGIN
    -- Atualizar lead_states
    UPDATE public.lead_states
    SET 
        owner_id = p_user_id,
        owner_locked_at = NOW(),
        owner_lock_reason = p_reason,
        ai_paused = true,
        ai_pause_reason = 'Lead assumido por ' || p_reason,
        updated_at = NOW()
    WHERE id = p_lead_state_id;
    
    -- Registrar em handoff_log
    INSERT INTO public.handoff_log (
        participant_id,
        from_ai,
        to_user_id,
        reason,
        current_stage
    )
    SELECT 
        participant_id,
        true,
        p_user_id,
        p_reason,
        current_stage
    FROM public.lead_states
    WHERE id = p_lead_state_id;
    
    -- Pausar mensagens pendentes na cadence_queue
    UPDATE public.cadence_queue
    SET 
        status = 'paused',
        error_message = 'Lead assumido manualmente'
    WHERE participant_id = (
        SELECT participant_id FROM public.lead_states WHERE id = p_lead_state_id
    )
    AND status = 'pending';
    
    v_result := jsonb_build_object(
        'success', true,
        'message', 'Lead assumido com sucesso',
        'locked_at', NOW()
    );
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para devolver lead (remover owner lock)
CREATE OR REPLACE FUNCTION release_lead(
    p_lead_state_id UUID,
    p_user_id UUID,
    p_reason TEXT DEFAULT 'Devolvendo para IA'
)
RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
BEGIN
    -- Verificar se o usuário é o owner
    IF NOT EXISTS (
        SELECT 1 FROM public.lead_states 
        WHERE id = p_lead_state_id AND owner_id = p_user_id
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Você não é o responsável por este lead'
        );
    END IF;
    
    -- Atualizar lead_states
    UPDATE public.lead_states
    SET 
        owner_id = NULL,
        owner_locked_at = NULL,
        owner_lock_reason = NULL,
        ai_paused = false,
        ai_pause_reason = NULL,
        updated_at = NOW()
    WHERE id = p_lead_state_id;
    
    -- Registrar em handoff_log
    INSERT INTO public.handoff_log (
        participant_id,
        from_ai,
        to_user_id,
        reason,
        current_stage
    )
    SELECT 
        participant_id,
        false, -- de humano para IA
        NULL,
        p_reason,
        current_stage
    FROM public.lead_states
    WHERE id = p_lead_state_id;
    
    -- Reativar mensagens pausadas
    UPDATE public.cadence_queue
    SET 
        status = 'pending',
        error_message = NULL
    WHERE participant_id = (
        SELECT participant_id FROM public.lead_states WHERE id = p_lead_state_id
    )
    AND status = 'paused';
    
    v_result := jsonb_build_object(
        'success', true,
        'message', 'Lead devolvido para IA com sucesso',
        'released_at', NOW()
    );
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE public.quotations IS 'Orçamentos gerados durante negociação';
COMMENT ON FUNCTION assume_lead IS 'Assumir responsabilidade de um lead (pausar IA)';
COMMENT ON FUNCTION release_lead IS 'Devolver lead para IA (remover owner lock)';
