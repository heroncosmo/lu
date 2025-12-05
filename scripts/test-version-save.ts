/**
 * Script Node.js para testar diretamente o salvamento de versões via API Supabase
 * 
 * Este script:
 * 1. Conecta ao Supabase
 * 2. Faz login como usuário
 * 3. Conta versões atuais do agente
 * 4. Simula uma edição no agente
 * 5. Verifica se nova versão foi criada
 * 
 * Uso: npx tsx scripts/test-version-save.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jufguvfzieysywthbafu.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1Zmd1dmZ6aWV5c3l3dGhiYWZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0NDUxMzIsImV4cCI6MjA3NjAyMTEzMn0.t36uXDDEQEXdCyHObKypoqR-mMN_EUaSEW5GNeNGv7w';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Credenciais de teste
const TEST_EMAIL = 'calcadosdrielle@gmail.com';
const TEST_PASSWORD = 'Ibira2019!';

// Agent ID do "Leandro ai"
const AGENT_ID = 'e8610686-cf63-4f3e-ac74-c71169b16624';

async function main() {
  console.log('🧪 Teste de Salvamento de Versões - Supabase API\n');
  
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
  
  console.log(`✅ Login bem sucedido! User ID: ${authData.user.id}\n`);
  
  // 2. Buscar agente atual
  console.log('2️⃣ Buscando dados do agente...');
  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('*')
    .eq('id', AGENT_ID)
    .single();
  
  if (agentError) {
    console.error('❌ Erro ao buscar agente:', agentError.message);
    process.exit(1);
  }
  
  console.log(`✅ Agente encontrado: ${agent.name}`);
  console.log(`   Instruções: ${agent.instructions?.length || 0} caracteres\n`);
  
  // 3. Contar versões atuais
  console.log('3️⃣ Contando versões atuais...');
  const { data: versions, error: versionsError } = await supabase
    .from('agent_prompt_versions')
    .select('id, version_number, version_note, created_at')
    .eq('agent_id', AGENT_ID)
    .order('version_number', { ascending: false });
  
  if (versionsError) {
    console.error('❌ Erro ao buscar versões:', versionsError.message);
    process.exit(1);
  }
  
  const currentVersionCount = versions?.length || 0;
  const latestVersion = versions?.[0];
  
  console.log(`✅ Total de versões: ${currentVersionCount}`);
  if (latestVersion) {
    console.log(`   Última versão: #${latestVersion.version_number} - "${latestVersion.version_note || 'sem nota'}"`);
    console.log(`   Criada em: ${new Date(latestVersion.created_at).toLocaleString('pt-BR')}`);
  }
  console.log('');
  
  // 4. Adicionar marcador de teste às instruções
  console.log('4️⃣ Modificando instruções com marcador de teste...');
  const testMarker = `\n\n## TESTE_SUPABASE_API_${Date.now()}`;
  const newInstructions = agent.instructions + testMarker;
  
  console.log(`   Adicionando marcador: ${testMarker.trim()}`);
  console.log(`   Novo tamanho: ${newInstructions.length} caracteres\n`);
  
  // 5. Salvar nova versão no histórico ANTES de atualizar o agente
  console.log('5️⃣ Salvando nova versão no histórico...');
  const newVersionNumber = (latestVersion?.version_number || 0) + 1;
  
  const { data: newVersion, error: insertError } = await supabase
    .from('agent_prompt_versions')
    .insert({
      agent_id: AGENT_ID,
      user_id: authData.user.id,
      version_number: newVersionNumber,
      instructions: newInstructions,
      version_note: 'Teste via API Supabase - Script automatizado'
    })
    .select()
    .single();
  
  if (insertError) {
    console.error('❌ Erro ao inserir versão:', insertError.message);
    process.exit(1);
  }
  
  console.log(`✅ Nova versão criada!`);
  console.log(`   Versão #${newVersion.version_number}`);
  console.log(`   ID: ${newVersion.id}\n`);
  
  // 6. Atualizar agente com novas instruções
  console.log('6️⃣ Atualizando agente com novas instruções...');
  const { error: updateError } = await supabase
    .from('agents')
    .update({ 
      instructions: newInstructions
    })
    .eq('id', AGENT_ID);
  
  if (updateError) {
    console.error('❌ Erro ao atualizar agente:', updateError.message);
    process.exit(1);
  }
  
  console.log('✅ Agente atualizado!\n');
  
  // 7. Verificar resultado final
  console.log('7️⃣ Verificando resultado final...');
  const { data: finalVersions, count } = await supabase
    .from('agent_prompt_versions')
    .select('id, version_number, version_note', { count: 'exact' })
    .eq('agent_id', AGENT_ID)
    .order('version_number', { ascending: false })
    .limit(5);
  
  const finalCount = count || finalVersions?.length || 0;
  console.log(`✅ Total de versões agora: ${finalCount}`);
  console.log('\n📊 Últimas 5 versões:');
  finalVersions?.forEach(v => {
    console.log(`   #${v.version_number}: ${v.version_note || '(sem nota)'}`);
  });
  
  // 8. Resultado do teste
  console.log('\n' + '='.repeat(60));
  if (finalCount > currentVersionCount) {
    console.log('🎉 TESTE PASSOU! Nova versão foi criada com sucesso!');
    console.log(`   Versões: ${currentVersionCount} → ${finalCount}`);
  } else {
    console.log('⚠️ TESTE INCONCLUSIVO - Número de versões não aumentou');
  }
  console.log('='.repeat(60));
}

main().catch(console.error);
