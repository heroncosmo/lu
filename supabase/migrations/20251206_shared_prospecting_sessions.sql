-- Migration: Allow team members to view all prospecting sessions (shared system)
-- But only edit/delete their own sessions
-- Date: 2025-12-06

-- Drop old policy that restricted to user's own sessions
DROP POLICY IF EXISTS "Users can manage own sessions" ON prospecting_sessions;

-- New policy: Everyone can VIEW all sessions (company-wide shared system)
CREATE POLICY "Everyone can view all active sessions" ON prospecting_sessions
  FOR SELECT
  USING (
    -- Check if user has permission to view prospecting/playground
    (
      EXISTS (
        SELECT 1 FROM user_profiles up
        WHERE up.user_id = auth.uid()
        AND up.is_active = true
      )
    )
    AND
    -- Additional check: user must be active in user_profiles
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid()
      AND up.is_active = true
    )
  );

-- Policy: Users can CREATE sessions
CREATE POLICY "Users can create new sessions" ON prospecting_sessions
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.user_id = auth.uid()
      AND up.is_active = true
    )
  );

-- Policy: Users can UPDATE only their own sessions
CREATE POLICY "Users can update own sessions" ON prospecting_sessions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can DELETE only their own sessions
CREATE POLICY "Users can delete own sessions" ON prospecting_sessions
  FOR DELETE
  USING (auth.uid() = user_id);

-- Update whatsapp_messages policy to allow viewing messages from any session
-- (since now all sessions are visible)
DROP POLICY IF EXISTS "Users can view own messages" ON whatsapp_messages;

CREATE POLICY "Users can view messages from visible sessions" ON whatsapp_messages
  FOR SELECT
  USING (
    -- Can view messages from any session (shared system)
    EXISTS (
      SELECT 1 FROM prospecting_sessions ps
      WHERE ps.id = session_id
      AND EXISTS (
        SELECT 1 FROM user_profiles up
        WHERE up.user_id = auth.uid()
        AND up.is_active = true
      )
    )
  );

-- Policy: Users can INSERT messages into any visible session
CREATE POLICY "Users can insert messages into visible sessions" ON whatsapp_messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM prospecting_sessions ps
      WHERE ps.id = session_id
      AND EXISTS (
        SELECT 1 FROM user_profiles up
        WHERE up.user_id = auth.uid()
        AND up.is_active = true
      )
    )
  );

-- Keep update/delete restricted to own user's sessions
-- (messages are created and stored for audit trail)
DROP POLICY IF EXISTS "Users can manage own message feedback" ON message_feedback;

CREATE POLICY "Users can view message feedback from visible sessions" ON message_feedback
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM prospecting_sessions ps
      WHERE ps.id = session_id
      AND EXISTS (
        SELECT 1 FROM user_profiles up
        WHERE up.user_id = auth.uid()
        AND up.is_active = true
      )
    )
  );

CREATE POLICY "Users can add message feedback to visible sessions" ON message_feedback
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM prospecting_sessions ps
      WHERE ps.id = session_id
      AND EXISTS (
        SELECT 1 FROM user_profiles up
        WHERE up.user_id = auth.uid()
        AND up.is_active = true
      )
    )
  );
