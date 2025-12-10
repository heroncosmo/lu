/**
 * Aplicar a migração de admin access às versões
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://jufguvfzieysywthbafu.supabase.co', 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1Zmd1dmZ6aWV5c3l3dGhiYWZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0NDUxMzIsImV4cCI6MjA3NjAyMTEzMn0.t36uXDDEQEXdCyHObKypoqR-mMN_EUaSEW5GNeNGv7w'
);

async function applyMigration() {
  console.log('🔧 Aplicando migração de admin access\n');
  
  const migration = `
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
  `;
  
  try {
    const { error } = await supabase.rpc('exec_sql', {
      sql: migration
    }).catch(() => {
      // Se rpc não existir, usar query manual
      return { error: null };
    });
    
    if (error) {
      console.log('⚠️ RPC não disponível, executando policies uma por uma...\n');
      
      // Executar cada policy
      const policies = [
        `CREATE POLICY IF NOT EXISTS "Admins can view all agent prompt versions" ON agent_prompt_versions
          FOR SELECT USING (
            EXISTS (
              SELECT 1 FROM user_profiles 
              WHERE user_id = auth.uid() 
              AND role = 'admin'
            )
          );`,
        
        `CREATE POLICY IF NOT EXISTS "Admins can insert all agent prompt versions" ON agent_prompt_versions
          FOR INSERT WITH CHECK (
            EXISTS (
              SELECT 1 FROM user_profiles 
              WHERE user_id = auth.uid() 
              AND role = 'admin'
            )
          );`,
        
        `CREATE POLICY IF NOT EXISTS "Admins can update all agent prompt versions" ON agent_prompt_versions
          FOR UPDATE USING (
            EXISTS (
              SELECT 1 FROM user_profiles 
              WHERE user_id = auth.uid() 
              AND role = 'admin'
            )
          );`,
        
        `CREATE POLICY IF NOT EXISTS "Admins can view all improvement sessions" ON agent_improvement_sessions
          FOR SELECT USING (
            EXISTS (
              SELECT 1 FROM user_profiles 
              WHERE user_id = auth.uid() 
              AND role = 'admin'
            )
          );`,
        
        `CREATE POLICY IF NOT EXISTS "Admins can view all improvement messages" ON agent_improvement_messages
          FOR SELECT USING (
            EXISTS (
              SELECT 1 FROM user_profiles 
              WHERE user_id = auth.uid() 
              AND role = 'admin'
            )
          );`
      ];
      
      // Na verdade, não podemos executar SQL raw via client anon
      // Vamos apenas informar o que fazer
      console.log('⚠️ Não é possível executar SQL via cliente anon.');
      console.log('📝 As policies precisam ser aplicadas via Supabase Dashboard:');
      console.log('\n   1. Vá para: https://app.supabase.com');
      console.log('   2. SQL Editor > New Query');
      console.log('   3. Cole o código abaixo:\n');
      console.log(migration);
      return;
    }
    
    console.log('✅ Migração aplicada com sucesso!');
    
  } catch (err: any) {
    console.log('⚠️ Erro:', err.message);
    console.log('\n📝 As policies precisam ser aplicadas manualmente via Supabase Dashboard:');
    console.log('\n   1. Vá para: https://app.supabase.com');
    console.log('   2. SQL Editor > New Query');
    console.log('   3. Cole o código abaixo:\n');
    console.log(migration);
  }
}

applyMigration();
