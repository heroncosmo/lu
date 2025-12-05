-- Adicionar campos para controle de processamento assíncrono de mensagens
-- Migration: 20250127_async_campaign_processing.sql

-- Adicionar colunas para status de processamento de mensagens
ALTER TABLE campaign_participants 
ADD COLUMN IF NOT EXISTS message_status TEXT DEFAULT 'pending' CHECK (message_status IN ('pending', 'processing', 'sent', 'failed', 'skipped')),
ADD COLUMN IF NOT EXISTS last_processing_attempt TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_error TEXT,
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;

-- Criar índice para busca de participantes pendentes
CREATE INDEX IF NOT EXISTS idx_campaign_participants_message_status 
ON campaign_participants(campaign_id, status, message_status);

-- Criar índice para retry de falhas
CREATE INDEX IF NOT EXISTS idx_campaign_participants_failed 
ON campaign_participants(campaign_id, message_status, retry_count) 
WHERE message_status = 'failed';

-- Atualizar participantes existentes que já foram contatados
UPDATE campaign_participants 
SET message_status = 'sent' 
WHERE contact_count > 0 AND message_status IS NULL;

-- Comentários
COMMENT ON COLUMN campaign_participants.message_status IS 'Status do processamento da mensagem: pending, processing, sent, failed, skipped';
COMMENT ON COLUMN campaign_participants.last_processing_attempt IS 'Última tentativa de processamento';
COMMENT ON COLUMN campaign_participants.last_error IS 'Último erro ocorrido no envio';
COMMENT ON COLUMN campaign_participants.retry_count IS 'Número de tentativas de reenvio após falha';
