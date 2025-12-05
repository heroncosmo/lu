ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS default_contact_list_id UUID REFERENCES crm_contact_lists(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contact_selection_mode TEXT DEFAULT 'manual' CHECK (contact_selection_mode IN ('manual','list','mixed')),
  ADD COLUMN IF NOT EXISTS contact_filters JSONB DEFAULT '{}'::jsonb;
