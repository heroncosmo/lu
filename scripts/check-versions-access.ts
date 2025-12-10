/**
 * Script para verificar se as versões estão sendo carregadas para ambos usuários
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://jufguvfzieysywthbafu.supabase.co', 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1Zmd1dmZ6aWV5c3l3dGhiYWZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0NDUxMzIsImV4cCI6MjA3NjAyMTEzMn0.t36uXDDEQEXdCyHObKypoqR-mMN_EUaSEW5GNeNGv7w'
);

async function checkVersions() {
  console.log('🔍 Verificando acesso às versões dos prompts\n');
  
  const users = [
    { email: 'leandro@luchoacorp.com', password: 'Ibira2019!' },
    { email: 'calcadosdrielle@gmail.com', password: 'Ibira2019!' }
  ];
  
  for (const user of users) {
    console.log(`\n📋 Testando com: ${user.email}`);
    console.log('='.repeat(60));
    
    // Login
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword(user);
    
    if (authError) {
      console.log(`   ❌ Erro de login: ${authError.message}`);
      continue;
    }
    
    console.log(`   ✅ Login bem-sucedido\n`);
    
    // Buscar agentes
    const { data: agents, error: agentsError } = await supabase
      .from('agents')
      .select('id, name');
    
    if (agentsError) {
      console.log(`   ❌ Erro ao buscar agentes: ${agentsError.message}`);
      continue;
    }
    
    console.log(`   Agentes encontrados: ${agents?.length}`);
    
    if (agents && agents.length > 0) {
      console.log(`\n   Verificando versões para TODOS os agentes:`);
      
      for (const agent of agents) {
        // Buscar versões
        const { data: versions, error: versionsError } = await supabase
          .from('agent_prompt_versions')
          .select('*')
          .eq('agent_id', agent.id)
          .order('version_number', { ascending: false })
          .limit(25);
        
        if (versionsError) {
          console.log(`   ❌ ${agent.name}: Erro - ${versionsError.message}`);
        } else {
          const count = versions?.length || 0;
          console.log(`   ${count > 0 ? '✅' : '⚠️'} ${agent.name}: ${count} versões`);
          if (count > 0 && versions && versions.length > 0) {
            console.log(`      • Última versão: #${versions[0].version_number}`);
          }
        }
      }
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Teste concluído');
}

checkVersions();
