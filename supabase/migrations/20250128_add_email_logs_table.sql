-- Email logs table for fallback tracking
CREATE TABLE IF NOT EXISTS email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID REFERENCES campaign_participants(id) ON DELETE CASCADE,
  to_email TEXT NOT NULL,
  subject TEXT,
  content TEXT NOT NULL,
  status TEXT NOT NULL, -- 'sent', 'failed', 'mock_sent'
  trigger_reason TEXT, -- 'whatsapp_failure_fallback', 'manual', 'scheduled'
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying by participant
CREATE INDEX IF NOT EXISTS idx_email_logs_participant 
ON email_logs(participant_id, sent_at DESC);

-- Index for fallback tracking
CREATE INDEX IF NOT EXISTS idx_email_logs_trigger 
ON email_logs(trigger_reason, sent_at DESC);

COMMENT ON TABLE email_logs IS 'Tracks all email sends including WhatsApp fallback';
COMMENT ON COLUMN email_logs.trigger_reason IS 'Why email was sent: whatsapp_failure_fallback, manual, scheduled';
