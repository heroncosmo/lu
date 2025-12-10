/**
 * Script de Debug - Teste direto da API OpenAI
 * 
 * Verifica se o problema é:
 * 1. Na API OpenAI
 * 2. No código do frontend
 * 3. Na chave de API
 * 4. No modelo configurado
 * 
 * Uso: npx tsx scripts/debug-openai-call.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jufguvfzieysywthbafu.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1Zmd1dmZ6aWV5c3l3dGhiYWZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0NDUxMzIsImV4cCI6MjA3NjAyMTEzMn0.t36uXDDEQEXdCyHObKypoqR-mMN_EUaSEW5GNeNGv7w';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const TEST_EMAIL = 'calcadosdrielle@gmail.com';
const TEST_PASSWORD = 'Ibira2019!';

async function main() {
  console.log('🔍 Debug OpenAI API Call\n');
  console.log('Este script testa a chamada diretamente para identificar o problema.\n');
  
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
  
  // 2. Buscar agente com API Key
  console.log('2️⃣ Buscando agente...');
  const { data: agents, error: agentsError } = await supabase
    .from('agents')
    .select('*')
    .eq('user_id', authData.user.id);
  
  if (agentsError || !agents?.length) {
    console.error('❌ Erro ao buscar agentes:', agentsError?.message);
    process.exit(1);
  }
  
  const agent = agents[0];
  console.log(`✅ Agente: ${agent.name}`);
  console.log(`   Modelo: ${agent.gpt_model}`);
  console.log(`   API Key: ${agent.gpt_api_key?.substring(0, 20)}...`);
  console.log(`   Instructions: ${agent.instructions?.length || 0} caracteres\n`);
  
  // 3. Validar API Key
  console.log('3️⃣ Validando API Key com chamada simples (models/list)...');
  try {
    const modelsResponse = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${agent.gpt_api_key}`
      }
    });
    
    if (!modelsResponse.ok) {
      const error = await modelsResponse.json();
      console.error('❌ API Key inválida ou sem permissão:', error);
      process.exit(1);
    }
    console.log('✅ API Key válida!\n');
  } catch (e: any) {
    console.error('❌ Erro de conexão:', e.message);
    process.exit(1);
  }
  
  // 4. Teste de chamada simples (sem JSON Schema)
  console.log('4️⃣ Teste de chat simples (sem JSON Schema)...');
  const startSimple = Date.now();
  try {
    const simpleResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${agent.gpt_api_key}`
      },
      body: JSON.stringify({
        model: agent.gpt_model || 'gpt-4.1-mini',
        messages: [
          { role: 'user', content: 'Diga apenas "OK"' }
        ],
        max_tokens: 10
      })
    });
    
    const simpleTime = Date.now() - startSimple;
    
    if (!simpleResponse.ok) {
      const error = await simpleResponse.json();
      console.error('❌ Erro na chamada simples:', error);
      console.log(`   Modelo solicitado: ${agent.gpt_model}`);
      console.log(`   POSSÍVEL CAUSA: Modelo não existe ou não disponível para esta API Key`);
      process.exit(1);
    }
    
    const simpleData = await simpleResponse.json();
    console.log(`✅ Resposta em ${simpleTime}ms:`, simpleData.choices[0]?.message?.content);
    console.log(`   Tokens: ${simpleData.usage?.total_tokens}\n`);
  } catch (e: any) {
    console.error('❌ Erro:', e.message);
    process.exit(1);
  }
  
  // 5. Teste com JSON Schema (igual ao código real)
  console.log('5️⃣ Teste com JSON Schema (como no código real)...');
  const startSchema = Date.now();
  
  // Usar um prompt pequeno para teste
  const testInstructions = agent.instructions?.substring(0, 5000) || 'Instruções de teste';
  
  try {
    const schemaResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${agent.gpt_api_key}`
      },
      body: JSON.stringify({
        model: agent.gpt_model || 'gpt-4.1-mini',
        messages: [
          { 
            role: 'system', 
            content: `Você é um assistente especializado em editar playbooks de vendas.
Você conversa naturalmente com o usuário E faz as edições solicitadas no documento.` 
          },
          { 
            role: 'user', 
            content: `DOCUMENTO ATUAL DO PLAYBOOK:
\`\`\`
${testInstructions}
\`\`\`

MENSAGEM DO USUÁRIO:
Melhore a saudação para ser mais calorosa.` 
          }
        ],
        temperature: 0.3,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'ChatResponse',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                resposta_chat: {
                  type: 'string',
                  description: 'Resposta conversacional para o usuário.'
                },
                documento_atualizado: {
                  type: 'string',
                  description: 'O documento COMPLETO.'
                },
                alteracao_feita: {
                  type: 'boolean',
                  description: 'true se alguma alteração foi feita'
                }
              },
              required: ['resposta_chat', 'documento_atualizado', 'alteracao_feita'],
              additionalProperties: false
            }
          }
        }
      })
    });
    
    const schemaTime = Date.now() - startSchema;
    
    if (!schemaResponse.ok) {
      const error = await schemaResponse.json();
      console.error('❌ Erro na chamada com JSON Schema:', error);
      console.log(`\n   ⚠️ PROBLEMA IDENTIFICADO: O modelo ${agent.gpt_model} pode não suportar JSON Schema`);
      console.log(`   Tente usar: gpt-4o-mini, gpt-4o, gpt-4-turbo, ou gpt-3.5-turbo`);
      process.exit(1);
    }
    
    const schemaData = await schemaResponse.json();
    console.log(`✅ Resposta com JSON Schema em ${schemaTime}ms`);
    console.log(`   Tokens: ${schemaData.usage?.total_tokens}`);
    
    const content = schemaData.choices[0]?.message?.content;
    try {
      const parsed = JSON.parse(content);
      console.log(`   ✅ JSON válido!`);
      console.log(`   resposta_chat: ${parsed.resposta_chat?.substring(0, 100)}...`);
      console.log(`   alteracao_feita: ${parsed.alteracao_feita}`);
      console.log(`   documento_atualizado: ${parsed.documento_atualizado?.length} caracteres`);
    } catch {
      console.error('   ❌ JSON inválido na resposta');
    }
    
  } catch (e: any) {
    console.error('❌ Erro:', e.message);
    process.exit(1);
  }
  
  // 6. Teste com prompt COMPLETO (21k+ caracteres)
  console.log('\n6️⃣ Teste com prompt COMPLETO (~21k caracteres)...');
  console.log('   ⏳ Isso pode demorar de 30s a 2 minutos...');
  const startFull = Date.now();
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.error('   ⏰ Timeout de 180s atingido!');
      controller.abort();
    }, 180000);
    
    const fullResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${agent.gpt_api_key}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: agent.gpt_model || 'gpt-4.1-mini',
        messages: [
          { 
            role: 'system', 
            content: `Você é um assistente especializado em editar playbooks de vendas.
Você conversa naturalmente com o usuário E faz as edições solicitadas no documento.
IMPORTANTE:
- Seja conversacional e amigável na resposta do chat
- Explique o que você fez ou vai fazer
- Faça APENAS as mudanças solicitadas no documento
- PRESERVE 100% do resto do documento` 
          },
          { 
            role: 'user', 
            content: `DOCUMENTO ATUAL DO PLAYBOOK:
\`\`\`
${agent.instructions}
\`\`\`

MENSAGEM DO USUÁRIO:
Melhore a saudação para ser mais calorosa e empática.` 
          }
        ],
        temperature: 0.3,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'ChatResponse',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                resposta_chat: {
                  type: 'string',
                  description: 'Resposta conversacional para o usuário.'
                },
                documento_atualizado: {
                  type: 'string',
                  description: 'O documento COMPLETO.'
                },
                alteracao_feita: {
                  type: 'boolean',
                  description: 'true se alguma alteração foi feita'
                }
              },
              required: ['resposta_chat', 'documento_atualizado', 'alteracao_feita'],
              additionalProperties: false
            }
          }
        }
      })
    });
    
    clearTimeout(timeoutId);
    const fullTime = Date.now() - startFull;
    
    if (!fullResponse.ok) {
      const error = await fullResponse.json();
      console.error('❌ Erro na chamada completa:', error);
      process.exit(1);
    }
    
    const fullData = await fullResponse.json();
    console.log(`\n✅ SUCESSO! Resposta completa em ${(fullTime/1000).toFixed(1)}s`);
    console.log(`   Tokens input: ${fullData.usage?.prompt_tokens}`);
    console.log(`   Tokens output: ${fullData.usage?.completion_tokens}`);
    console.log(`   Tokens total: ${fullData.usage?.total_tokens}`);
    
    const content = fullData.choices[0]?.message?.content;
    try {
      const parsed = JSON.parse(content);
      console.log(`   ✅ JSON válido!`);
      console.log(`   resposta_chat: ${parsed.resposta_chat?.substring(0, 150)}...`);
      console.log(`   alteracao_feita: ${parsed.alteracao_feita}`);
      console.log(`   documento_atualizado: ${parsed.documento_atualizado?.length} caracteres`);
    } catch {
      console.error('   ❌ JSON inválido na resposta');
    }
    
  } catch (e: any) {
    const fullTime = Date.now() - startFull;
    console.error(`\n❌ FALHA após ${(fullTime/1000).toFixed(1)}s:`, e.message);
    
    if (e.name === 'AbortError') {
      console.log('\n⚠️ DIAGNÓSTICO: A requisição está demorando mais de 180s.');
      console.log('   Possíveis causas:');
      console.log('   1. O prompt é muito grande (~21k caracteres) + resposta completa');
      console.log('   2. O modelo gpt-4.1-mini pode estar lento/sobrecarregado');
      console.log('   3. Pode haver latência de rede');
      console.log('\n   💡 Solução sugerida:');
      console.log('   - Aumentar timeout para 300s (5 minutos)');
      console.log('   - OU usar streaming para evitar timeout');
    }
  }
  
  console.log('\n======================================================================');
  console.log('🔍 DEBUG COMPLETO');
  console.log('======================================================================');
}

main().catch(console.error);
