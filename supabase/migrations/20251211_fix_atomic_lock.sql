-- Migration: Fix atomic lock acquisition with RPC function
-- Problem: Supabase client .or() doesn't work in UPDATE operations
-- Solution: Create a stored procedure that does atomic UPDATE with proper WHERE clause

CREATE OR REPLACE FUNCTION acquire_batch_lock(
  p_session_id UUID,
  p_webhook_id TEXT,
  p_lock_duration_seconds INTEGER DEFAULT 120
)
RETURNS TABLE(
  success BOOLEAN,
  lock_owner TEXT
) 
LANGUAGE plpgsql
AS $$
DECLARE
  v_lock_owner TEXT;
  v_affected_rows INTEGER;
BEGIN
  -- Try to acquire lock atomically
  -- Only succeeds if no lock exists or lock is expired
  UPDATE prospecting_sessions
  SET 
    batch_lock_id = p_webhook_id,
    batch_lock_until = NOW() + (p_lock_duration_seconds || ' seconds')::INTERVAL
  WHERE 
    id = p_session_id
    AND (
      batch_lock_until IS NULL 
      OR batch_lock_until < NOW()
    );
  
  -- Check how many rows were affected
  GET DIAGNOSTICS v_affected_rows = ROW_COUNT;
  
  -- If we updated a row, we got the lock
  IF v_affected_rows > 0 THEN
    RETURN QUERY SELECT TRUE, p_webhook_id;
    RETURN;
  END IF;
  
  -- If we didn't get the lock, return who has it
  SELECT batch_lock_id INTO v_lock_owner
  FROM prospecting_sessions
  WHERE id = p_session_id;
  
  RETURN QUERY SELECT FALSE, v_lock_owner;
END;
$$;

-- Function to release the lock
CREATE OR REPLACE FUNCTION release_batch_lock(
  p_session_id UUID,
  p_webhook_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_affected_rows INTEGER;
BEGIN
  -- Only release if we own the lock
  UPDATE prospecting_sessions
  SET 
    batch_lock_id = NULL,
    batch_lock_until = NULL
  WHERE 
    id = p_session_id
    AND batch_lock_id = p_webhook_id;
  
  GET DIAGNOSTICS v_affected_rows = ROW_COUNT;
  
  RETURN v_affected_rows > 0;
END;
$$;

COMMENT ON FUNCTION acquire_batch_lock IS 'Atomically acquire a batch processing lock for a session. Returns success=true if lock acquired, along with the lock owner ID.';
COMMENT ON FUNCTION release_batch_lock IS 'Release a batch processing lock. Only succeeds if the caller owns the lock.';
