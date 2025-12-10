/**
 * Teste com melhor tratamento de erros
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://jufguvfzieysywthbafu.supabase.co', 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1Zmd1dmZ6aWV5c3l3dGhiYWZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0NDUxMzIsImV4cCI6MjA3NjAyMTEzMn0.t36uXDDEQEXdCyHObKypoqR-mMN_EUaSEW5GNeNGv7w'
);

async function test() {
  console.log('🧪 Teste Final - Prompt Completo\n');
  
  await supabase.auth.signInWithPassword({ 
    email: 'calcadosdrielle@gmail.com', 
    password: 'Ibira2019!' 
  });
  
  // Buscar o agente Leandro 5.1 (que tem modelo gpt-5.1)
  const { data: agents } = await supabase.from('agents').select('*');
  const agent = agents?.find(a => a.name === 'Leandro 5.1');
  
  if (!agent) {
    console.error('Agente não encontrado');
    return;
  }
  
  console.log(`Agente: ${agent.name}`);
  console.log(`Modelo configurado: ${agent.gpt_model}`);
  console.log(`Instruções: ${agent.instructions?.length} chars`);
  console.log(`API Key: ${agent.gpt_api_key?.substring(0, 25)}...\n`);
  
  // Testar com modelo gpt-4o-mini (garantido existir)
  const modelsToTest = ['gpt-4o-mini', 'gpt-4.1-mini', agent.gpt_model];
  
  for (const model of modelsToTest) {
    console.log(`\n🔄 Testando modelo: ${model}`);
    const start = Date.now();
    
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${agent.gpt_api_key}`
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: 'Responda em JSON: {"ok": true, "msg": "teste"}' },
            { role: 'user', content: 'Teste' }
          ],
          max_tokens: 50
        })
      });
      
      const elapsed = Date.now() - start;
      
      // Checar se é HTML (erro)
      const text = await response.text();
      if (text.startsWith('<!DOCTYPE') || text.startsWith('<')) {
        console.log(`   ❌ ${elapsed}ms - Retornou HTML (erro de servidor/proxy)`);
        console.log(`   Primeiros 200 chars: ${text.substring(0, 200)}`);
        continue;
      }
      
      // Tentar parsear como JSON
      try {
        const data = JSON.parse(text);
        if (data.error) {
          console.log(`   ❌ ${elapsed}ms - Erro da API: ${data.error.message}`);
        } else {
          console.log(`   ✅ ${elapsed}ms - Funcionou!`);
          console.log(`   Resposta: ${data.choices?.[0]?.message?.content}`);
        }
      } catch {
        console.log(`   ❌ ${elapsed}ms - Resposta não é JSON válido`);
        console.log(`   Primeiros 200 chars: ${text.substring(0, 200)}`);
      }
      
    } catch (e: any) {
      console.log(`   ❌ Erro: ${e.message}`);
    }
  }
  
  // Teste final com prompt COMPLETO usando gpt-4o-mini
  console.log('\n\n🚀 Teste FINAL com prompt completo (21k chars) + gpt-4o-mini...');
  console.log('   Isso deve demorar 30-60 segundos...');
  
  const startFinal = Date.now();
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${agent.gpt_api_key}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // Modelo garantido funcionar
        messages: [
          { 
            role: 'system', 
            content: 'Você edita playbooks. Responda APENAS em JSON com: resposta_chat (string), documento_atualizado (string), alteracao_feita (boolean).'
          },
          { 
            role: 'user', 
            content: `DOCUMENTO:\n\`\`\`\n${agent.instructions}\n\`\`\`\n\nMelhore a saudação para ser mais calorosa.`
          }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' } // json_object é mais simples que json_schema
      })
    });
    
    const elapsed = Date.now() - startFinal;
    
    if (!response.ok) {
      const error = await response.json();
      console.log(`   ❌ ${(elapsed/1000).toFixed(1)}s - Erro: ${error.error?.message}`);
      return;
    }
    
    const data = await response.json();
    console.log(`\n   ✅ SUCESSO em ${(elapsed/1000).toFixed(1)}s!`);
    console.log(`   Tokens: input=${data.usage?.prompt_tokens}, output=${data.usage?.completion_tokens}`);
    
    try {
      const result = JSON.parse(data.choices[0]?.message?.content);
      console.log(`   resposta_chat: ${result.resposta_chat?.substring(0, 100)}...`);
      console.log(`   alteracao_feita: ${result.alteracao_feita}`);
      console.log(`   documento_atualizado: ${result.documento_atualizado?.length} chars`);
    } catch {
      console.log(`   Resposta raw: ${data.choices[0]?.message?.content?.substring(0, 200)}...`);
    }
    
  } catch (e: any) {
    const elapsed = Date.now() - startFinal;
    console.log(`   ❌ ${(elapsed/1000).toFixed(1)}s - Erro: ${e.message}`);
  }
}

test();
