-- Adicionar tabela de notificações
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL CHECK (type IN ('hot_lead', 'sla_alert', 'owner_transfer', 'system')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
    
    participant_id UUID REFERENCES public.campaign_participants(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
    
    metadata JSONB,
    read BOOLEAN DEFAULT false,
    read_at TIMESTAMPTZ,
    read_by UUID REFERENCES auth.users(id),
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_notifications_type ON public.notifications(type);
CREATE INDEX idx_notifications_severity ON public.notifications(severity);
CREATE INDEX idx_notifications_read ON public.notifications(read);
CREATE INDEX idx_notifications_participant ON public.notifications(participant_id);
CREATE INDEX idx_notifications_campaign ON public.notifications(campaign_id);
CREATE INDEX idx_notifications_created ON public.notifications(created_at DESC);

-- RLS Policies
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários autenticados podem ver notificações"
    ON public.notifications FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Sistema pode criar notificações"
    ON public.notifications FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Usuários podem marcar como lidas"
    ON public.notifications FOR UPDATE
    TO authenticated
    USING (true);

-- Adicionar coluna de idioma em campaign_participants
ALTER TABLE public.campaign_participants 
ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'pt-BR',
ADD COLUMN IF NOT EXISTS message_count INTEGER DEFAULT 0;

-- Índice para idioma
CREATE INDEX IF NOT EXISTS idx_participants_language ON public.campaign_participants(language);

-- Função para incrementar contador de mensagens
CREATE OR REPLACE FUNCTION increment_message_count()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_from_user = true THEN
        UPDATE public.campaign_participants
        SET message_count = message_count + 1
        WHERE id = NEW.participant_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para incrementar contador
DROP TRIGGER IF EXISTS trigger_increment_message_count ON public.whatsapp_messages;
CREATE TRIGGER trigger_increment_message_count
    AFTER INSERT ON public.whatsapp_messages
    FOR EACH ROW
    EXECUTE FUNCTION increment_message_count();

-- Adicionar coluna context_snapshot em cadence_queue se não existir
ALTER TABLE public.cadence_queue 
ADD COLUMN IF NOT EXISTS context_snapshot JSONB;

COMMENT ON TABLE public.notifications IS 'Sistema de notificações em tempo real';
COMMENT ON COLUMN public.campaign_participants.language IS 'Idioma detectado do participante';
COMMENT ON COLUMN public.campaign_participants.message_count IS 'Contador de mensagens do participante';
COMMENT ON COLUMN public.cadence_queue.context_snapshot IS 'Snapshot do Perfil Triplo no momento do agendamento';
