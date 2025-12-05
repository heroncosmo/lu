-- User Profiles Table with Roles
-- Gerenciamento de usuários com roles: admin (pode gerenciar) e team_member (visualiza tudo)

-- Criar enum para roles
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('admin', 'team_member');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Tabela de perfis de usuário
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Info básica
  full_name TEXT,
  email TEXT NOT NULL,
  avatar_url TEXT,
  
  -- Role e permissões
  role TEXT NOT NULL DEFAULT 'team_member' CHECK (role IN ('admin', 'team_member')),
  
  -- Admin que criou este usuário (para rastreabilidade)
  created_by UUID REFERENCES auth.users(id),
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index para busca rápida
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role);

-- RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Admins podem ver todos os perfis
CREATE POLICY "Admins can view all profiles"
  ON user_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up 
      WHERE up.user_id = auth.uid() AND up.role = 'admin'
    )
    OR user_id = auth.uid()
  );

-- Policy: Admins podem criar novos perfis
CREATE POLICY "Admins can create profiles"
  ON user_profiles FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles up 
      WHERE up.user_id = auth.uid() AND up.role = 'admin'
    )
    OR NOT EXISTS (SELECT 1 FROM user_profiles) -- Primeiro usuário pode se cadastrar
  );

-- Policy: Admins podem atualizar perfis
CREATE POLICY "Admins can update profiles"
  ON user_profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up 
      WHERE up.user_id = auth.uid() AND up.role = 'admin'
    )
    OR user_id = auth.uid() -- Usuário pode atualizar próprio perfil (exceto role)
  );

-- Policy: Admins podem deletar perfis (exceto o próprio)
CREATE POLICY "Admins can delete profiles"
  ON user_profiles FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up 
      WHERE up.user_id = auth.uid() AND up.role = 'admin'
    )
    AND user_id != auth.uid() -- Não pode deletar próprio perfil
  );

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_user_profile_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_user_profile_updated_at();

-- Função para criar perfil automaticamente após signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  is_first_user BOOLEAN;
  admin_email TEXT := 'calcadosdrielle@gmail.com';
BEGIN
  -- Verificar se é o primeiro usuário
  SELECT NOT EXISTS (SELECT 1 FROM user_profiles) INTO is_first_user;
  
  -- Inserir perfil
  INSERT INTO user_profiles (user_id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    CASE 
      WHEN is_first_user OR NEW.email = admin_email THEN 'admin'
      ELSE 'team_member'
    END
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para criar perfil após signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- Inserir perfil para usuários existentes que não têm perfil
INSERT INTO user_profiles (user_id, email, full_name, role)
SELECT 
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
  CASE 
    WHEN u.email = 'calcadosdrielle@gmail.com' THEN 'admin'
    ELSE 'team_member'
  END
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM user_profiles up WHERE up.user_id = u.id
);

-- Função helper para verificar se usuário é admin
CREATE OR REPLACE FUNCTION is_user_admin(check_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE user_id = check_user_id AND role = 'admin' AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função helper para obter role do usuário
CREATE OR REPLACE FUNCTION get_user_role(check_user_id UUID DEFAULT auth.uid())
RETURNS TEXT AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role 
  FROM user_profiles 
  WHERE user_id = check_user_id AND is_active = true;
  
  RETURN COALESCE(user_role, 'team_member');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
