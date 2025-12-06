-- Adicionar campo client_notes para anotações do cliente na sessão de prospecção
ALTER TABLE prospecting_sessions 
ADD COLUMN IF NOT EXISTS client_notes TEXT;

-- Comentário explicativo
COMMENT ON COLUMN prospecting_sessions.client_notes IS 'Anotações sobre o cliente que serão usadas pela IA para personalizar as respostas';
