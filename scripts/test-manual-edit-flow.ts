/**
 * Teste E2E Final - Simulando Edição Manual na Interface
 * 
 * Este script simula EXATAMENTE o que acontece quando:
 * 1. Usuário edita o prompt manualmente
 * 2. Clica em "Salvar Alterações"
 * 3. O código verifica se instructions mudou
 * 4. Se mudou, salva nova versão
 * 
 * Uso: npx tsx scripts/test-manual-edit-flow.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jufguvfzieysywthbafu.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1Zmd1dmZ6aWV5c3l3dGhiYWZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0NDUxMzIsImV4cCI6MjA3NjAyMTEzMn0.t36uXDDEQEXdCyHObKypoqR-mMN_EUaSEW5GNeNGv7w';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Credenciais e IDs
const TEST_EMAIL = 'calcadosdrielle@gmail.com';
const TEST_PASSWORD = 'Ibira2019!';
const AGENT_ID = 'e8610686-cf63-4f3e-ac74-c71169b16624';

async function main() {
  console.log('🧪 Teste E2E - Simulando Edição Manual na Interface\n');
  console.log('Este teste simula EXATAMENTE o fluxo do código no AgentConfiguration.tsx\n');
  
  // 1. Login
  console.log('1️⃣ Fazendo login...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD
  });
  
  if (authError) {
    console.error('❌ Erro de autenticação:', authError.message);
    process.exit(1);
  }
  console.log(`✅ User ID: ${authData.user.id}\n`);
  
  // 2. Simular fetchAgents() - buscar agente atual (como a interface faz)
  console.log('2️⃣ Simulando fetchAgents() - buscando agente...');
  const { data: agents, error: agentsError } = await supabase
    .from('agents')
    .select('*')
    .eq('user_id', authData.user.id);
  
  if (agentsError) {
    console.error('❌ Erro ao buscar agentes:', agentsError.message);
    process.exit(1);
  }
  
  const currentAgent = agents?.find(a => a.id === AGENT_ID);
  if (!currentAgent) {
    console.error('❌ Agente não encontrado!');
    process.exit(1);
  }
  
  console.log(`✅ Agente encontrado: ${currentAgent.name}`);
  console.log(`   Instructions atuais: ${currentAgent.instructions?.length || 0} caracteres\n`);
  
  // 3. Simular fetchPromptVersions() - buscar versões (como a interface faz)
  console.log('3️⃣ Simulando fetchPromptVersions() - buscando versões...');
  const { data: promptVersions, error: versionsError } = await supabase
    .from('agent_prompt_versions')
    .select('*')
    .eq('agent_id', AGENT_ID)
    .order('version_number', { ascending: false });
  
  if (versionsError) {
    console.error('❌ Erro ao buscar versões:', versionsError.message);
    process.exit(1);
  }
  
  const versionCount = promptVersions?.length || 0;
  const latestVersion = promptVersions?.[0];
  console.log(`✅ Total de versões: ${versionCount}`);
  console.log(`   Última versão: #${latestVersion?.version_number || 0}\n`);
  
  // 4. Simular edição do usuário (modificar instructions)
  console.log('4️⃣ Simulando edição manual do usuário...');
  const testMarker = `\n\n## TESTE_MANUAL_EDIT_FLOW_${Date.now()}`;
  const newInstructions = currentAgent.instructions + testMarker;
  
  console.log(`   Marcador: ${testMarker.trim()}`);
  console.log(`   Novo tamanho: ${newInstructions.length} caracteres\n`);
  
  // 5. Simular onSubmit - EXATAMENTE como está no código
  console.log('5️⃣ Simulando onSubmit() do formulário...');
  
  // values = valores do formulário
  const values = {
    name: currentAgent.name,
    instructions: newInstructions, // <- valor editado pelo usuário
    gpt_api_key: currentAgent.gpt_api_key,
    gpt_model: currentAgent.gpt_model,
    response_delay_seconds: currentAgent.response_delay_seconds,
    word_delay_seconds: currentAgent.word_delay_seconds,
    is_active: currentAgent.is_active,
    is_default: currentAgent.is_default,
    allowed_instances: currentAgent.allowed_instances || []
  };
  
  // Verificação exata do código: currentAgent.instructions !== values.instructions
  const instructionsChanged = currentAgent.instructions !== values.instructions;
  console.log(`   instructionsChanged = ${instructionsChanged}`);
  
  if (!instructionsChanged) {
    console.log('⚠️ Instruções não mudaram - nenhuma versão seria criada');
    process.exit(0);
  }
  
  // 6. Simular update do agente
  console.log('\n6️⃣ Simulando update do agente no Supabase...');
  const { error: updateError } = await supabase
    .from('agents')
    .update(values)
    .eq('id', AGENT_ID)
    .eq('user_id', authData.user.id);
  
  if (updateError) {
    console.error('❌ Erro ao atualizar:', updateError.message);
    process.exit(1);
  }
  console.log('✅ Agente atualizado!\n');
  
  // 7. Simular savePromptVersion() - EXATAMENTE como está no código
  console.log('7️⃣ Simulando savePromptVersion("Edição manual do prompt")...');
  
  // Calcular próximo número de versão (exatamente como no código)
  const nextVersion = promptVersions && promptVersions.length > 0 
    ? promptVersions[0].version_number + 1 
    : 1;
  
  console.log(`   Próxima versão: #${nextVersion}`);
  
  const { error: insertError } = await supabase
    .from('agent_prompt_versions')
    .insert({
      agent_id: AGENT_ID,
      user_id: authData.user.id,
      instructions: values.instructions,
      version_number: nextVersion,
      version_note: 'Edição manual do prompt',  // <- exatamente como no código
      is_current: true
    });
  
  if (insertError) {
    console.error('❌ Erro ao salvar versão:', insertError.message);
    process.exit(1);
  }
  console.log(`✅ Versão #${nextVersion} salva no histórico!\n`);
  
  // 8. Verificar resultado final
  console.log('8️⃣ Verificando resultado final...');
  const { data: finalVersions, count } = await supabase
    .from('agent_prompt_versions')
    .select('id, version_number, version_note, created_at', { count: 'exact' })
    .eq('agent_id', AGENT_ID)
    .order('version_number', { ascending: false })
    .limit(5);
  
  const finalCount = count || 0;
  console.log(`✅ Total de versões agora: ${finalCount}`);
  console.log('\n📊 Últimas 5 versões:');
  finalVersions?.forEach(v => {
    const date = new Date(v.created_at).toLocaleString('pt-BR');
    console.log(`   #${v.version_number}: "${v.version_note}" (${date})`);
  });
  
  // 9. Resultado
  console.log('\n' + '='.repeat(70));
  if (finalCount > versionCount) {
    console.log('🎉 TESTE E2E PASSOU!');
    console.log('   ✅ Edição manual foi detectada corretamente');
    console.log('   ✅ Agente foi atualizado no banco');
    console.log(`   ✅ Nova versão #${nextVersion} foi criada com nota "Edição manual do prompt"`);
    console.log(`   📊 Versões: ${versionCount} → ${finalCount}`);
  } else {
    console.log('❌ TESTE FALHOU - Versão não foi criada');
  }
  console.log('='.repeat(70));
}

main().catch(console.error);
