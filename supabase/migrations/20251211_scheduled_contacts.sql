-- Migration: Sistema de Agendamento de Contatos
-- Permite que a IA agende contatos futuros quando o cliente solicitar
-- Data: 2025-12-11

-- Criar tabela de contatos agendados
CREATE TABLE IF NOT EXISTS scheduled_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES prospecting_sessions(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  client_whatsapp_number TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'executed', 'cancelled', 'failed')),
  reason TEXT, -- Motivo do agendamento (ex: "Cliente pediu para falar daqui 2 horas")
  context TEXT, -- Contexto da conversa para a IA usar quando retomar o contato
  executed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  error_message TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para melhor performance
CREATE INDEX idx_scheduled_contacts_session ON scheduled_contacts(session_id);
CREATE INDEX idx_scheduled_contacts_scheduled_for ON scheduled_contacts(scheduled_for);
CREATE INDEX idx_scheduled_contacts_status ON scheduled_contacts(status);
CREATE INDEX idx_scheduled_contacts_pending_due ON scheduled_contacts(scheduled_for, status) 
  WHERE status = 'pending' AND scheduled_for <= NOW();

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_scheduled_contacts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_scheduled_contacts_updated_at
  BEFORE UPDATE ON scheduled_contacts
  FOR EACH ROW
  EXECUTE FUNCTION update_scheduled_contacts_updated_at();

-- RLS Policies
ALTER TABLE scheduled_contacts ENABLE ROW LEVEL SECURITY;

-- Usuários ativos podem ver todos os agendamentos (sistema compartilhado)
CREATE POLICY "Users can view all scheduled contacts" ON scheduled_contacts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid()
      AND up.is_active = true
    )
  );

-- Usuários ativos podem criar agendamentos
CREATE POLICY "Users can create scheduled contacts" ON scheduled_contacts
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid()
      AND up.is_active = true
    )
  );

-- Usuários ativos podem atualizar agendamentos
CREATE POLICY "Users can update scheduled contacts" ON scheduled_contacts
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid()
      AND up.is_active = true
    )
  );

-- Usuários ativos podem deletar agendamentos
CREATE POLICY "Users can delete scheduled contacts" ON scheduled_contacts
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid()
      AND up.is_active = true
    )
  );

-- Função para buscar agendamentos pendentes que já venceram
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
  WHERE sc.status = 'pending'
    AND sc.scheduled_for <= NOW()
  ORDER BY sc.scheduled_for ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para marcar agendamento como executado
CREATE OR REPLACE FUNCTION mark_scheduled_contact_executed(
  contact_id UUID,
  error_msg TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  IF error_msg IS NULL THEN
    UPDATE scheduled_contacts
    SET 
      status = 'executed',
      executed_at = NOW(),
      updated_at = NOW()
    WHERE id = contact_id;
  ELSE
    UPDATE scheduled_contacts
    SET 
      status = 'failed',
      error_message = error_msg,
      executed_at = NOW(),
      updated_at = NOW()
    WHERE id = contact_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comentários para documentação
COMMENT ON TABLE scheduled_contacts IS 'Armazena agendamentos de contatos futuros solicitados pelos clientes durante conversas';
COMMENT ON COLUMN scheduled_contacts.session_id IS 'Referência à sessão de prospecção onde o agendamento foi solicitado';
COMMENT ON COLUMN scheduled_contacts.scheduled_for IS 'Data e hora em que o contato deve ser iniciado';
COMMENT ON COLUMN scheduled_contacts.status IS 'Status do agendamento: pending, executed, cancelled, failed';
COMMENT ON COLUMN scheduled_contacts.reason IS 'Motivo/descrição do agendamento extraído da conversa';
COMMENT ON COLUMN scheduled_contacts.context IS 'Contexto da conversa para a IA usar ao retomar o contato';

-- Habilitar realtime para esta tabela
ALTER PUBLICATION supabase_realtime ADD TABLE scheduled_contacts;
