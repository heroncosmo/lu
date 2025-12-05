-- Add INSERT and UPDATE policies for crm_contacts table
-- This allows authenticated users to insert and update contact records

-- Drop existing policies if they exist
DROP POLICY IF EXISTS crm_contacts_insert ON crm_contacts;
DROP POLICY IF EXISTS crm_contacts_update ON crm_contacts;

-- Create policies that check for authenticated user via auth.uid()
CREATE POLICY crm_contacts_insert ON crm_contacts
  FOR INSERT 
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY crm_contacts_update ON crm_contacts
  FOR UPDATE 
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
