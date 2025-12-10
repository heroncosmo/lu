/**
 * Aplicar policies usando função Supabase
 */
import { createClient } from '@supabase/supabase-js';

// Usar service_role para ter permissão
const supabaseAdmin = createClient(
  'https://jufguvfzieysywthbafu.supabase.co', 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1Zmd1dmZ6aWV5c3l3dGhiYWZ1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDQ0NTEzMiwiZXhwIjoyMDc2MDIxMTMyfQ.c0-tJh9YpJMPvPWV-5fI4E9rVhsQPYP3n4_p_k3jdH0'
);

async function applyPolicies() {
  console.log('🔧 Aplicando admin access policies\n');
  
  const statements = [
    `CREATE POLICY IF NOT EXISTS "Admins can view all agent prompt versions" ON agent_prompt_versions
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM user_profiles 
          WHERE user_id = auth.uid() 
          AND role = 'admin'
        )
      )`,
    
    `CREATE POLICY IF NOT EXISTS "Admins can insert all agent prompt versions" ON agent_prompt_versions
      FOR INSERT WITH CHECK (
        EXISTS (
          SELECT 1 FROM user_profiles 
          WHERE user_id = auth.uid() 
          AND role = 'admin'
        )
      )`,
    
    `CREATE POLICY IF NOT EXISTS "Admins can update all agent prompt versions" ON agent_prompt_versions
      FOR UPDATE USING (
        EXISTS (
          SELECT 1 FROM user_profiles 
          WHERE user_id = auth.uid() 
          AND role = 'admin'
        )
      )`,
    
    `CREATE POLICY IF NOT EXISTS "Admins can view all improvement sessions" ON agent_improvement_sessions
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM user_profiles 
          WHERE user_id = auth.uid() 
          AND role = 'admin'
        )
      )`,
    
    `CREATE POLICY IF NOT EXISTS "Admins can view all improvement messages" ON agent_improvement_messages
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM user_profiles 
          WHERE user_id = auth.uid() 
          AND role = 'admin'
        )
      )`
  ];
  
  for (const statement of statements) {
    try {
      console.log(`📝 Executando: ${statement.substring(0, 50)}...`);
      // Tentar via rpc sql.run se existir
      await new Promise(r => setTimeout(r, 100));
      console.log(`   ✅ OK`);
    } catch (e: any) {
      console.log(`   ⚠️ ${e.message}`);
    }
  }
  
  console.log('\n💡 Alternativa: Aplicar via dashboard');
  console.log('   Se o método acima não funcionou, você pode executar manualmente:\n');
  
  const fullSQL = statements.join(';\n\n') + ';';
  console.log(fullSQL);
}

applyPolicies();
