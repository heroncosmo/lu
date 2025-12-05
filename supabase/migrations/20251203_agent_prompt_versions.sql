-- Tabela para armazenar versões do prompt do agente
CREATE TABLE IF NOT EXISTS agent_prompt_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  instructions TEXT NOT NULL,
  version_number INTEGER NOT NULL DEFAULT 1,
  version_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  is_current BOOLEAN DEFAULT false,
  performance_score DECIMAL(3,2), -- Score de 0 a 1 baseado em métricas
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_agent_prompt_versions_agent_id ON agent_prompt_versions(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_prompt_versions_created_at ON agent_prompt_versions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_prompt_versions_is_current ON agent_prompt_versions(is_current) WHERE is_current = true;

-- Tabela para armazenar sessões de chat de melhoria do agente
CREATE TABLE IF NOT EXISTS agent_improvement_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Tabela para armazenar mensagens das sessões de melhoria
CREATE TABLE IF NOT EXISTS agent_improvement_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES agent_improvement_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  prompt_version_id UUID REFERENCES agent_prompt_versions(id),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_agent_improvement_sessions_agent_id ON agent_improvement_sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_improvement_sessions_user_id ON agent_improvement_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_improvement_messages_session_id ON agent_improvement_messages(session_id);

-- RLS Policies
ALTER TABLE agent_prompt_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_improvement_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_improvement_messages ENABLE ROW LEVEL SECURITY;

-- Policies para agent_prompt_versions
CREATE POLICY "Users can view own agent prompt versions" ON agent_prompt_versions
  FOR SELECT USING (
    agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can insert own agent prompt versions" ON agent_prompt_versions
  FOR INSERT WITH CHECK (
    agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can update own agent prompt versions" ON agent_prompt_versions
  FOR UPDATE USING (
    agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
  );

-- Policies para agent_improvement_sessions
CREATE POLICY "Users can view own improvement sessions" ON agent_improvement_sessions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own improvement sessions" ON agent_improvement_sessions
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own improvement sessions" ON agent_improvement_sessions
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own improvement sessions" ON agent_improvement_sessions
  FOR DELETE USING (user_id = auth.uid());

-- Policies para agent_improvement_messages
CREATE POLICY "Users can view own improvement messages" ON agent_improvement_messages
  FOR SELECT USING (
    session_id IN (SELECT id FROM agent_improvement_sessions WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can insert own improvement messages" ON agent_improvement_messages
  FOR INSERT WITH CHECK (
    session_id IN (SELECT id FROM agent_improvement_sessions WHERE user_id = auth.uid())
  );

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_agent_improvement_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_agent_improvement_session_timestamp
  BEFORE UPDATE ON agent_improvement_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_agent_improvement_session_timestamp();

-- Função para salvar versão do prompt automaticamente quando agente é atualizado
CREATE OR REPLACE FUNCTION save_agent_prompt_version()
RETURNS TRIGGER AS $$
DECLARE
  next_version INTEGER;
BEGIN
  -- Só salvar se instructions mudou
  IF OLD.instructions IS DISTINCT FROM NEW.instructions THEN
    -- Marcar versão anterior como não atual
    UPDATE agent_prompt_versions
    SET is_current = false
    WHERE agent_id = NEW.id AND is_current = true;
    
    -- Calcular próximo número de versão
    SELECT COALESCE(MAX(version_number), 0) + 1 INTO next_version
    FROM agent_prompt_versions
    WHERE agent_id = NEW.id;
    
    -- Inserir nova versão
    INSERT INTO agent_prompt_versions (
      agent_id,
      instructions,
      version_number,
      is_current,
      created_by
    ) VALUES (
      NEW.id,
      NEW.instructions,
      next_version,
      true,
      auth.uid()
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_save_agent_prompt_version
  AFTER UPDATE ON agents
  FOR EACH ROW
  EXECUTE FUNCTION save_agent_prompt_version();
