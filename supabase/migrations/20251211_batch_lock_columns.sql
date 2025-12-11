-- Adicionar colunas de lock para batching de mensagens
-- Isso evita que múltiplos webhooks processem mensagens simultaneamente

ALTER TABLE prospecting_sessions 
ADD COLUMN IF NOT EXISTS batch_lock_until TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS batch_lock_id TEXT DEFAULT NULL;

-- Índice para verificação rápida de locks ativos
CREATE INDEX IF NOT EXISTS idx_sessions_batch_lock 
ON prospecting_sessions(batch_lock_until) 
WHERE batch_lock_until IS NOT NULL;

-- Comentário explicativo
COMMENT ON COLUMN prospecting_sessions.batch_lock_until IS 'Timestamp até quando o lock de batching está ativo. NULL significa sem lock.';
COMMENT ON COLUMN prospecting_sessions.batch_lock_id IS 'ID único do lock para garantir que apenas o holder pode liberar.';
