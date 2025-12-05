-- CRM Contacts core tables

CREATE TABLE IF NOT EXISTS crm_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_client_code INTEGER UNIQUE NOT NULL,
  name TEXT NOT NULL,
  trade_name TEXT,
  document TEXT,
  is_active BOOLEAN DEFAULT true,
  kanban_funil_code INTEGER,
  kanban_funil_name TEXT,
  kanban_stage_code INTEGER,
  kanban_stage_name TEXT,
  kanban_status TEXT,
  owner_identifier TEXT,
  owner_name TEXT,
  phone TEXT,
  whatsapp TEXT,
  email TEXT,
  city TEXT,
  state TEXT,
  country TEXT DEFAULT 'Brasil',
  timezone TEXT DEFAULT 'America/Sao_Paulo',
  temperature TEXT,
  last_activity_at TIMESTAMPTZ,
  status_updated_at TIMESTAMPTZ,
  raw_payload JSONB DEFAULT '{}'::jsonb,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_contacts_stage
  ON crm_contacts(kanban_status, kanban_stage_code);

CREATE INDEX IF NOT EXISTS idx_crm_contacts_owner
  ON crm_contacts(owner_identifier);

CREATE INDEX IF NOT EXISTS idx_crm_contacts_temperature
  ON crm_contacts(temperature);


CREATE TABLE IF NOT EXISTS crm_contact_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('manual', 'dynamic')),
  filters JSONB DEFAULT '{}'::jsonb,
  created_by UUID DEFAULT auth.uid(),
  total_contacts INTEGER DEFAULT 0,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_contact_lists_creator
  ON crm_contact_lists(created_by);


CREATE TABLE IF NOT EXISTS crm_contact_list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID NOT NULL REFERENCES crm_contact_lists(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  crm_client_code INTEGER NOT NULL,
  added_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_list_contact_unique
  ON crm_contact_list_items(list_id, contact_id);


CREATE TABLE IF NOT EXISTS crm_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type TEXT NOT NULL CHECK (run_type IN ('manual', 'scheduled')),
  total_contacts INTEGER DEFAULT 0,
  inserted_count INTEGER DEFAULT 0,
  updated_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  duration_ms INTEGER,
  status TEXT NOT NULL CHECK (status IN ('success', 'error')),
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

-- Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION set_updated_at_tracking()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_crm_contacts_updated
  BEFORE UPDATE ON crm_contacts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_tracking();

CREATE TRIGGER trg_crm_contact_lists_updated
  BEFORE UPDATE ON crm_contact_lists
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_tracking();

-- Enable RLS and base policies
ALTER TABLE crm_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_contact_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_contact_list_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY crm_contacts_read ON crm_contacts
  FOR SELECT USING (true);

CREATE POLICY crm_contact_lists_select ON crm_contact_lists
  FOR SELECT USING (true);

CREATE POLICY crm_contact_lists_insert ON crm_contact_lists
  FOR INSERT WITH CHECK (created_by = auth.uid());

CREATE POLICY crm_contact_lists_write ON crm_contact_lists
  FOR UPDATE USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());

CREATE POLICY crm_contact_lists_delete ON crm_contact_lists
  FOR DELETE USING (created_by = auth.uid());

CREATE POLICY crm_contact_list_items_select ON crm_contact_list_items
  FOR SELECT USING (true);

CREATE POLICY crm_contact_list_items_mutation ON crm_contact_list_items
  FOR INSERT WITH CHECK (true);

CREATE POLICY crm_contact_list_items_delete ON crm_contact_list_items
  FOR DELETE USING (true);
