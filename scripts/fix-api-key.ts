/**
 * Corrigir a API Key do agente Leandro 5.1
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://jufguvfzieysywthbafu.supabase.co', 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1Zmd1dmZ6aWV5c3l3dGhiYWZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0NDUxMzIsImV4cCI6MjA3NjAyMTEzMn0.t36uXDDEQEXdCyHObKypoqR-mMN_EUaSEW5GNeNGv7w'
);

async function fix() {
  console.log('🔧 Corrigindo API Key do agente Leandro 5.1...\n');
  
  await supabase.auth.signInWithPassword({ 
    email: 'calcadosdrielle@gmail.com', 
    password: 'Ibira2019!' 
  });
  
  // Buscar todos os agentes para encontrar a chave válida
  const { data: allAgents } = await supabase
    .from('agents')
    .select('id, name, gpt_api_key');
  
  console.log('Agentes encontrados:', allAgents?.length);
  
  // Encontrar a chave que começa com sk-proj-eMtQqK (a válida)
  const validKey = allAgents?.find(a => a.gpt_api_key?.startsWith('sk-proj-eMtQqK'))?.gpt_api_key;
  
  if (!validKey) {
    console.error('❌ Chave válida não encontrada');
    return;
  }
  
  console.log('✅ Chave válida encontrada:', validKey.substring(0, 30) + '...');
  
  // Atualizar TODOS os agentes com chaves inválidas
  const invalidAgents = allAgents?.filter(a => !a.gpt_api_key?.startsWith('sk-')) || [];
  
  for (const agent of invalidAgents) {
    console.log(`   Atualizando ${agent.name}...`);
    const { error } = await supabase
      .from('agents')
      .update({ gpt_api_key: validKey })
      .eq('id', agent.id);
    
    if (error) {
      console.error(`   ❌ Erro: ${error.message}`);
    } else {
      console.log(`   ✅ ${agent.name} atualizado!`);
    }
  }
  
  console.log('\n🎉 Correção concluída!');
}

fix();
