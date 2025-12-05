-- Add RLS policy for app_settings table
-- This allows authenticated users to read and write app settings

-- Enable RLS if not already enabled
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow authenticated users to read app_settings" ON app_settings;
DROP POLICY IF EXISTS "Allow authenticated users to upsert app_settings" ON app_settings;

-- Policy: Allow all authenticated users to read app_settings
CREATE POLICY "Allow authenticated users to read app_settings"
ON app_settings
FOR SELECT
TO authenticated
USING (true);

-- Policy: Allow all authenticated users to insert/update app_settings
CREATE POLICY "Allow authenticated users to upsert app_settings"
ON app_settings
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
