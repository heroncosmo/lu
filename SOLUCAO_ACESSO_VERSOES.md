# ⚠️ Solução para o Problema de Acesso às Versões

## Problema
O usuário `leandro@luchoacorp.com` (admin) não consegue ver as versões dos prompts criadas por outros usuários devido à política de RLS (Row Level Security).

## Causa Raiz
A política no Supabase permite que cada usuário veja apenas as versões dos agentes que **ele próprio criou**:
```sql
CREATE POLICY "Users can view own agent prompt versions" ON agent_prompt_versions
  FOR SELECT USING (
    agent_id IN (SELECT id FROM agents WHERE user_id = auth.uid())
  );
```

## Solução Rápida (via Dashboard Supabase)

1. Abra https://app.supabase.com
2. Selecione o projeto "jufguvfzieysywthbafu"
3. Clique em **SQL Editor** (ou vá para **Authentication > Policies**)
4. Crie uma nova query e copie/cole este código:

```sql
-- Adicionar policies de admin para ver todas as versões
CREATE POLICY "Admins can view all agent prompt versions" ON agent_prompt_versions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

CREATE POLICY "Admins can insert all agent prompt versions" ON agent_prompt_versions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update all agent prompt versions" ON agent_prompt_versions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

-- Adicionar policies para improvement sessions
CREATE POLICY "Admins can view all improvement sessions" ON agent_improvement_sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );

CREATE POLICY "Admins can view all improvement messages" ON agent_improvement_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_id = auth.uid() 
      AND role = 'admin'
    )
  );
```

5. Clique em **Run** (Ctrl+Enter)
6. Você verá: "Success! No rows returned"

Pronto! Agora `leandro@luchoacorp.com` conseguirá ver todas as versões.

## Verificação

Depois de aplicar o SQL, o usuário `leandro@luchoacorp.com` deve:
1. Recarregar a página
2. Ir para **Agentes IA**
3. Selecionar o agente "Leandro ai"
4. Ver "20 versões" aparecer junto com o histórico completo

## Alternativa: Já está Pronto?

Se você preferir, pode ir direto ao dashboard e executar o SQL acima. Leva apenas 2 minutos!
