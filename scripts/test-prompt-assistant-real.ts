/**
 * Teste EXATO do fluxo do Assistente de Prompts
 * Simula a chamada real para verificar tempo e funcionamento
 */

import { createClient } from '@supabase/supabase-js';

// Buscar API key do banco de dados
async function getApiKey(): Promise<string> {
  const supabase = createClient(
    'https://jufguvfzieysywthbafu.supabase.co', 
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1Zmd1dmZ6aWV5c3l3dGhiYWZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0NDUxMzIsImV4cCI6MjA3NjAyMTEzMn0.t36uXDDEQEXdCyHObKypoqR-mMN_EUaSEW5GNeNGv7w'
  );
  
  await supabase.auth.signInWithPassword({ 
    email: 'calcadosdrielle@gmail.com', 
    password: 'Ibira2019!' 
  });
  
  const { data: agents } = await supabase.from('agents').select('gpt_api_key').limit(1);
  if (!agents?.[0]?.gpt_api_key) throw new Error('API key não encontrada');
  return agents[0].gpt_api_key;
}

const ASSISTANT_MODEL = 'gpt-5.1';

const agentName = 'Leandro 4.1';
const agentInstructions = `**Missão:** cultivar e aprofundar **relacionamentos com clientes que já conhecem a Luchoa**, com presença humana, escuta genuína e movimentos de venda **apenas quando houver permissão**.`;

const systemPrompt = `Você é um especialista em criar prompts para agentes de IA de vendas e atendimento.
Seu objetivo é ajudar a melhorar o prompt do agente "${agentName}".

PROMPT ATUAL DO AGENTE:
"""
${agentInstructions}
"""

REGRAS:
1. Quando o usuário pedir melhorias, sugira alterações específicas e explique o porquê
2. Quando você propor um novo prompt, formate-o EXATAMENTE assim:
   [NOVO_PROMPT_INICIO]
   <o prompt completo aqui>
   [NOVO_PROMPT_FIM]
3. Seja específico e prático nas sugestões
4. Mantenha o tom profissional do agente
5. Sugira melhorias baseadas em boas práticas de vendas e persuasão
6. Pergunte sobre o contexto e objetivos antes de fazer grandes mudanças

Responda em português brasileiro.`;

async function testAssistant(userMessage: string, apiKey: string) {
  console.log(`\n📤 Mensagem: "${userMessage}"`);
  console.log('⏳ Aguardando resposta do GPT-5.1...\n');
  
  const startTime = Date.now();
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: ASSISTANT_MODEL,
        messages: [
          { role: 'developer', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        max_completion_tokens: 1000,
        reasoning_effort: 'none',
        temperature: 0.7
      })
    });
    
    clearTimeout(timeoutId);
    const timeMs = Date.now() - startTime;
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.log(`❌ ERRO HTTP ${response.status}: ${errorData.error?.message}`);
      return { success: false, timeMs };
    }
    
    const data = await response.json();
    const assistantMessage = data.choices[0].message.content;
    const tokensUsed = data.usage?.total_tokens || 0;
    
    console.log('━'.repeat(60));
    console.log(`✅ RESPOSTA (${(timeMs/1000).toFixed(2)}s, ${tokensUsed} tokens):`);
    console.log('━'.repeat(60));
    console.log(assistantMessage);
    console.log('━'.repeat(60));
    
    // Verificar se tem proposta de prompt
    const promptMatch = assistantMessage.match(/\[NOVO_PROMPT_INICIO\]([\s\S]*?)\[NOVO_PROMPT_FIM\]/);
    if (promptMatch) {
      console.log('\n🎯 NOVO PROMPT PROPOSTO DETECTADO!');
    }
    
    return { success: true, timeMs, tokensUsed };
  } catch (err: any) {
    const timeMs = Date.now() - startTime;
    if (err.name === 'AbortError') {
      console.log(`❌ TIMEOUT após ${(timeMs/1000).toFixed(2)}s`);
    } else {
      console.log(`❌ ERRO: ${err.message}`);
    }
    return { success: false, timeMs };
  }
}

async function runTests() {
  console.log('🧪 TESTE DO ASSISTENTE DE PROMPTS - FLUXO REAL');
  console.log('='.repeat(60));
  console.log(`Modelo: ${ASSISTANT_MODEL}`);
  console.log(`Agente: ${agentName}`);
  console.log('='.repeat(60));
  
  // Buscar API key do banco
  const API_KEY = await getApiKey();
  console.log(`✅ API Key obtida: ${API_KEY.substring(0, 20)}...`);
  
  // Teste 1: Pedido simples
  const test1 = await testAssistant('fala mais persuasivo e com amor', API_KEY);
  
  // Teste 2: Pedido mais complexo
  const test2 = await testAssistant('adicione uma técnica de rapport inicial para quebrar o gelo', API_KEY);
  
  // Teste 3: Pedido direto para gerar novo prompt
  const test3 = await testAssistant('gere um novo prompt completo com tom mais amigável e empático', API_KEY);
  
  // Resumo
  console.log('\n' + '='.repeat(60));
  console.log('📊 RESUMO DOS TESTES:');
  console.log('='.repeat(60));
  
  console.log(`Teste 1 (simples):   ${test1.success ? '✅' : '❌'} ${(test1.timeMs/1000).toFixed(2)}s`);
  console.log(`Teste 2 (técnica):   ${test2.success ? '✅' : '❌'} ${(test2.timeMs/1000).toFixed(2)}s`);
  console.log(`Teste 3 (novo prompt): ${test3.success ? '✅' : '❌'} ${(test3.timeMs/1000).toFixed(2)}s`);
  
  const allPassed = test1.success && test2.success && test3.success;
  const avgTime = ((test1.timeMs + test2.timeMs + test3.timeMs) / 3 / 1000).toFixed(2);
  
  console.log('\n' + (allPassed ? '✅ TODOS OS TESTES PASSARAM!' : '❌ ALGUNS TESTES FALHARAM'));
  console.log(`⏱️ Tempo médio: ${avgTime}s`);
}

runTests().catch(console.error);
