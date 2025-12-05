ALTER TABLE campaign_participants
  ADD COLUMN IF NOT EXISTS crm_contact_id UUID REFERENCES crm_contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'manual' CHECK (source_type IN ('manual','crm_contact','crm_list')),
  ADD COLUMN IF NOT EXISTS source_reference TEXT;

CREATE INDEX IF NOT EXISTS idx_campaign_participants_crm_contact
  ON campaign_participants(crm_contact_id);
