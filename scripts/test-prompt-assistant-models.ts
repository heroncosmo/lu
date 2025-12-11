/**
 * Teste do Assistente de Prompts com diferentes modelos GPT
 * Objetivo: Verificar qual modelo é mais rápido e confiável
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

interface TestResult {
  model: string;
  success: boolean;
  timeMs: number;
  error?: string;
  tokensUsed?: number;
}

// Prompt simples para teste
const SYSTEM_PROMPT = `Você é um especialista em criar prompts para agentes de IA de vendas.
Seu objetivo é ajudar a melhorar o prompt do agente "Leandro".

PROMPT ATUAL DO AGENTE:
"""
**Missão:** cultivar e aprofundar **relacionamentos com clientes que já conhecem a Luchoa**, com presença humana, escuta genuína e movimentos de venda **apenas quando houver permissão**.
"""

Responda de forma breve e direta.`;

const USER_MESSAGE = 'fala mais persuasivo e com amor';

// Configuração para cada modelo
function getModelConfig(model: string) {
  const isGpt5Series = model.startsWith('gpt-5');
  const isGpt51 = model.startsWith('gpt-5.1');
  const isGpt41Series = model.startsWith('gpt-4.1');
  const isOSeries = model.startsWith('o3') || model.startsWith('o4');
  const isNewModel = isGpt5Series || isGpt41Series || isOSeries;
  
  const baseConfig: any = {
    model,
    messages: [
      { role: isNewModel ? 'developer' : 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: USER_MESSAGE }
    ]
  };
  
  // Tokens
  if (isNewModel) {
    baseConfig.max_completion_tokens = 500;
  } else {
    baseConfig.max_tokens = 500;
  }
  
  // Parâmetros extras
  if (isGpt5Series) {
    // GPT-5 séries: usar reasoning_effort
    baseConfig.reasoning_effort = isGpt51 ? 'none' : 'low';
    // GPT-5.1 com reasoning=none pode usar temperature
    if (isGpt51) {
      baseConfig.temperature = 0.7;
    }
  } else if (isOSeries) {
    baseConfig.reasoning_effort = 'low';
  } else {
    // GPT-4.1 e outros: usar temperature
    baseConfig.temperature = 0.7;
  }
  
  return baseConfig;
}

async function testModel(model: string, apiKey: string): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    const config = getModelConfig(model);
    console.log(`\n📝 Config para ${model}:`, JSON.stringify(config, null, 2));
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(config)
    });
    
    const timeMs = Date.now() - startTime;
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        model,
        success: false,
        timeMs,
        error: errorData.error?.message || `HTTP ${response.status}`
      };
    }
    
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const tokensUsed = data.usage?.total_tokens || 0;
    
    console.log(`\n✅ ${model} - Resposta (${tokensUsed} tokens):`);
    console.log(content.substring(0, 200) + (content.length > 200 ? '...' : ''));
    
    return {
      model,
      success: true,
      timeMs,
      tokensUsed
    };
  } catch (err: any) {
    return {
      model,
      success: false,
      timeMs: Date.now() - startTime,
      error: err.message
    };
  }
}

async function runTests() {
  console.log('🧪 TESTE DO ASSISTENTE DE PROMPTS - COMPARAÇÃO DE MODELOS\n');
  console.log('='.repeat(60));
  
  // Buscar API key do banco
  const API_KEY = await getApiKey();
  console.log(`✅ API Key obtida: ${API_KEY.substring(0, 20)}...`);
  
  // Modelos a testar (do mais rápido ao mais lento esperado)
  const models = [
    'gpt-4o-mini',      // Modelo básico, rápido
    'gpt-4.1-nano',     // Nano, ultra rápido
    'gpt-4.1-mini',     // Mini, rápido
    'gpt-4.1',          // Standard
    'gpt-4o',           // Modelo tradicional
    'gpt-5.1',          // GPT-5.1 com reasoning=none (deveria ser rápido)
  ];
  
  const results: TestResult[] = [];
  
  for (const model of models) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔄 Testando: ${model}...`);
    
    const result = await testModel(model, API_KEY);
    results.push(result);
    
    if (result.success) {
      console.log(`⏱️ Tempo: ${result.timeMs}ms (${(result.timeMs/1000).toFixed(2)}s)`);
    } else {
      console.log(`❌ ERRO: ${result.error}`);
    }
  }
  
  // Resumo
  console.log('\n' + '='.repeat(60));
  console.log('📊 RESUMO DOS RESULTADOS:');
  console.log('='.repeat(60));
  
  // Ordenar por tempo (apenas os bem-sucedidos)
  const successful = results.filter(r => r.success).sort((a, b) => a.timeMs - b.timeMs);
  const failed = results.filter(r => !r.success);
  
  console.log('\n✅ FUNCIONANDO (ordenado por velocidade):');
  successful.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.model.padEnd(15)} - ${(r.timeMs/1000).toFixed(2)}s (${r.tokensUsed} tokens)`);
  });
  
  if (failed.length > 0) {
    console.log('\n❌ COM ERRO:');
    failed.forEach(r => {
      console.log(`  - ${r.model}: ${r.error}`);
    });
  }
  
  // Recomendação
  if (successful.length > 0) {
    console.log(`\n🎯 RECOMENDAÇÃO: Usar "${successful[0].model}" no Assistente de Prompts`);
    console.log(`   Tempo médio: ${(successful[0].timeMs/1000).toFixed(2)}s`);
  }
}

runTests().catch(console.error);
