/**
 * Aplicar policies direto no Supabase usando admin token
 */

const PROJECT_ID = 'jufguvfzieysywthbafu';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1Zmd1dmZ6aWV5c3l3dGhiYWZ1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDQ0NTEzMiwiZXhwIjoyMDc2MDIxMTMyfQ.c0-tJh9YpJMPvPWV-5fI4E9rVhsQPYP3n4_p_k3jdH0';

const sqlStatements = [
  `CREATE POLICY "Admins can view all agent prompt versions" ON agent_prompt_versions
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE user_id = auth.uid() 
        AND role = 'admin'
      )
    )`,
  
  `CREATE POLICY "Admins can insert all agent prompt versions" ON agent_prompt_versions
    FOR INSERT WITH CHECK (
      EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE user_id = auth.uid() 
        AND role = 'admin'
      )
    )`,
  
  `CREATE POLICY "Admins can update all agent prompt versions" ON agent_prompt_versions
    FOR UPDATE USING (
      EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE user_id = auth.uid() 
        AND role = 'admin'
      )
    )`,
  
  `CREATE POLICY "Admins can view all improvement sessions" ON agent_improvement_sessions
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE user_id = auth.uid() 
        AND role = 'admin'
      )
    )`,
  
  `CREATE POLICY "Admins can view all improvement messages" ON agent_improvement_messages
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE user_id = auth.uid() 
        AND role = 'admin'
      )
    )`
];

async function applyPolicies() {
  console.log('🔧 Aplicando admin access policies\n');
  
  for (let i = 0; i < sqlStatements.length; i++) {
    const sql = sqlStatements[i];
    console.log(`[${i+1}/${sqlStatements.length}] Executando: ${sql.substring(0, 40)}...`);
    
    try {
      const response = await fetch(`https://${PROJECT_ID}.supabase.co/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sql })
      });
      
      if (response.ok) {
        console.log(`   ✅ OK\n`);
      } else {
        const error = await response.text();
        console.log(`   ⚠️ Não encontrado ou erro: ${error.substring(0, 100)}\n`);
      }
    } catch (e: any) {
      console.log(`   ❌ Erro: ${e.message}\n`);
    }
  }
  
  console.log('✨ Conclusão');
  console.log('============');
  console.log('Se as policies foram criadas com sucesso, recarregue a página e teste!');
  console.log('\nCaso contrário, execute manualmente no Supabase Dashboard:');
  console.log('1. https://app.supabase.com/project/jufguvfzieysywthbafu/sql');
  console.log('2. Copie/cole o SQL acima');
  console.log('3. Clique em Run');
}

applyPolicies();
