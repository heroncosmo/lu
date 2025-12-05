-- Add WhatsApp failure tracking to campaign_participants
ALTER TABLE campaign_participants
ADD COLUMN IF NOT EXISTS whatsapp_failure_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_whatsapp_failure_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS fallback_triggered BOOLEAN DEFAULT false;

-- Index for failure monitoring
CREATE INDEX IF NOT EXISTS idx_campaign_participants_failure_count 
ON campaign_participants(whatsapp_failure_count) WHERE whatsapp_failure_count >= 3;

COMMENT ON COLUMN campaign_participants.whatsapp_failure_count IS 'Consecutive WhatsApp send failures (reset on success)';
COMMENT ON COLUMN campaign_participants.last_whatsapp_failure_at IS 'Timestamp of last WhatsApp failure';
COMMENT ON COLUMN campaign_participants.fallback_triggered IS 'Whether email fallback has been triggered after 3 failures';
