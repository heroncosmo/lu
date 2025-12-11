-- Cole este script no SQL Editor do Supabase Dashboard
-- https://supabase.com/dashboard/project/ebnzhtkjulllrpezglxg/sql/new

-- Tabela de agendamentos
CREATE TABLE IF NOT EXISTS scheduled_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES prospecting_sessions(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  client_whatsapp_number TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'executed', 'cancelled', 'failed')),
  reason TEXT,
  context TEXT,
  executed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  error_message TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_contacts_session ON scheduled_contacts(session_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_contacts_scheduled_for ON scheduled_contacts(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_scheduled_contacts_status ON scheduled_contacts(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_contacts_pending_due ON scheduled_contacts(scheduled_for, status) WHERE status = 'pending' AND scheduled_for <= NOW();

CREATE OR REPLACE FUNCTION update_scheduled_contacts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_scheduled_contacts_updated_at ON scheduled_contacts;
CREATE TRIGGER trigger_update_scheduled_contacts_updated_at
  BEFORE UPDATE ON scheduled_contacts
  FOR EACH ROW
  EXECUTE FUNCTION update_scheduled_contacts_updated_at();

ALTER TABLE scheduled_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view all scheduled contacts" ON scheduled_contacts;
CREATE POLICY "Users can view all scheduled contacts" ON scheduled_contacts
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.user_id = auth.uid() AND up.is_active = true));

DROP POLICY IF EXISTS "Users can create scheduled contacts" ON scheduled_contacts;
CREATE POLICY "Users can create scheduled contacts" ON scheduled_contacts
  FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM user_profiles up WHERE up.user_id = auth.uid() AND up.is_active = true));

DROP POLICY IF EXISTS "Users can update scheduled contacts" ON scheduled_contacts;
CREATE POLICY "Users can update scheduled contacts" ON scheduled_contacts
  FOR UPDATE
  USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.user_id = auth.uid() AND up.is_active = true));

DROP POLICY IF EXISTS "Users can delete scheduled contacts" ON scheduled_contacts;
CREATE POLICY "Users can delete scheduled contacts" ON scheduled_contacts
  FOR DELETE
  USING (EXISTS (SELECT 1 FROM user_profiles up WHERE up.user_id = auth.uid() AND up.is_active = true));

CREATE OR REPLACE FUNCTION get_due_scheduled_contacts()
RETURNS TABLE (
  id UUID,
  session_id UUID,
  client_name TEXT,
  client_whatsapp_number TEXT,
  scheduled_for TIMESTAMPTZ,
  reason TEXT,
  context TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sc.id,
    sc.session_id,
    sc.client_name,
    sc.client_whatsapp_number,
    sc.scheduled_for,
    sc.reason,
    sc.context
  FROM scheduled_contacts sc
  WHERE sc.status = 'pending' AND sc.scheduled_for <= NOW()
  ORDER BY sc.scheduled_for ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION mark_scheduled_contact_executed(
  contact_id UUID,
  error_msg TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  IF error_msg IS NULL THEN
    UPDATE scheduled_contacts SET status = 'executed', executed_at = NOW(), updated_at = NOW() WHERE id = contact_id;
  ELSE
    UPDATE scheduled_contacts SET status = 'failed', error_message = error_msg, executed_at = NOW(), updated_at = NOW() WHERE id = contact_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE scheduled_contacts IS 'Armazena agendamentos de contatos futuros solicitados pelos clientes durante conversas';
COMMENT ON COLUMN scheduled_contacts.session_id IS 'Referência à sessão de prospecção onde o agendamento foi solicitado';
COMMENT ON COLUMN scheduled_contacts.scheduled_for IS 'Data e hora em que o contato deve ser iniciado';
COMMENT ON COLUMN scheduled_contacts.status IS 'Status do agendamento: pending, executed, cancelled, failed';
COMMENT ON COLUMN scheduled_contacts.reason IS 'Motivo/descrição do agendamento extraído da conversa';
COMMENT ON COLUMN scheduled_contacts.context IS 'Contexto da conversa para a IA usar ao retomar o contato';

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE scheduled_contacts;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE VIEW pending_scheduled_contacts AS
SELECT 
  sc.id,
  sc.session_id,
  sc.client_name,
  sc.client_whatsapp_number,
  sc.scheduled_for,
  sc.reason,
  sc.requested_at,
  EXTRACT(EPOCH FROM (sc.scheduled_for - NOW())) / 60 AS minutes_until_due,
  ps.status AS session_status,
  ps.agent_id
FROM scheduled_contacts sc
JOIN prospecting_sessions ps ON ps.id = sc.session_id
WHERE sc.status = 'pending' AND sc.scheduled_for <= NOW() + INTERVAL '15 minutes'
ORDER BY sc.scheduled_for ASC;

CREATE OR REPLACE FUNCTION test_scheduled_contact_worker()
RETURNS TEXT AS $$
DECLARE due_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO due_count FROM scheduled_contacts WHERE status = 'pending' AND scheduled_for <= NOW();
  RETURN format('Agendamentos pendentes para execução: %s', due_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
