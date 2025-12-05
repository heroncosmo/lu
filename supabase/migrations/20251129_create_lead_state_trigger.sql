-- =============================================================================
-- MIGRATION: Trigger para criar lead_state automaticamente
-- Data: 29/11/2025
-- Descrição: Cria lead_state automaticamente quando participante é adicionado
-- =============================================================================

-- Função que cria lead_state automaticamente
CREATE OR REPLACE FUNCTION create_lead_state_for_participant()
RETURNS TRIGGER AS $$
BEGIN
  -- Inserir lead_state para o novo participante
  INSERT INTO public.lead_states (
    participant_id,
    current_stage,
    temperature,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    'PROSPECÇÃO', -- Ao entrar na campanha, vai para prospecção
    COALESCE(NEW.temperature, 'cold'),
    NOW(),
    NOW()
  )
  ON CONFLICT (participant_id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger que dispara após inserção de participante
DROP TRIGGER IF EXISTS trg_create_lead_state ON public.campaign_participants;
CREATE TRIGGER trg_create_lead_state
  AFTER INSERT ON public.campaign_participants
  FOR EACH ROW
  EXECUTE FUNCTION create_lead_state_for_participant();

-- Criar lead_states para participantes existentes que não têm
INSERT INTO public.lead_states (participant_id, current_stage, temperature, created_at, updated_at)
SELECT 
  cp.id,
  'PROSPECÇÃO',
  COALESCE(cp.temperature, 'cold'),
  NOW(),
  NOW()
FROM public.campaign_participants cp
WHERE NOT EXISTS (
  SELECT 1 FROM public.lead_states ls WHERE ls.participant_id = cp.id
);

COMMENT ON FUNCTION create_lead_state_for_participant() IS 'Cria lead_state automaticamente quando participante é adicionado à campanha';
