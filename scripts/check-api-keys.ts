/**
 * Script para verificar as API Keys de todos os agentes
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jufguvfzieysywthbafu.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1Zmd1dmZ6aWV5c3l3dGhiYWZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0NDUxMzIsImV4cCI6MjA3NjAyMTEzMn0.t36uXDDEQEXdCyHObKypoqR-mMN_EUaSEW5GNeNGv7w';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const TEST_EMAIL = 'calcadosdrielle@gmail.com';
const TEST_PASSWORD = 'Ibira2019!';

async function main() {
  console.log('🔑 Verificando API Keys dos agentes\n');
  
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD
  });
  
  if (authError) {
    console.error('❌ Erro:', authError.message);
    return;
  }
  
  const { data: agents } = await supabase
    .from('agents')
    .select('id, name, gpt_model, gpt_api_key')
    .eq('user_id', authData.user.id);
  
  console.log('Agentes encontrados:', agents?.length);
  console.log('');
  
  for (const agent of agents || []) {
    const key = agent.gpt_api_key || '';
    const isOpenAI = key.startsWith('sk-');
    const isJWT = key.startsWith('eyJ');
    
    console.log(`📋 ${agent.name}`);
    console.log(`   Modelo: ${agent.gpt_model}`);
    console.log(`   API Key: ${key.substring(0, 30)}...`);
    console.log(`   Tipo: ${isOpenAI ? '✅ OpenAI válida' : isJWT ? '❌ JWT (inválido)' : '❓ Desconhecido'}`);
    
    if (isOpenAI) {
      // Testar a chave
      try {
        const resp = await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${key}` }
        });
        if (resp.ok) {
          console.log(`   Status: ✅ Funcionando!`);
        } else {
          const err = await resp.json();
          console.log(`   Status: ❌ ${err.error?.message}`);
        }
      } catch (e: any) {
        console.log(`   Status: ❌ ${e.message}`);
      }
    }
    console.log('');
  }
}

main();
