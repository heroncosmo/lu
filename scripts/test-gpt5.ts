/**
 * Teste específico do gpt-5.1 com JSON Schema
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://jufguvfzieysywthbafu.supabase.co', 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1Zmd1dmZ6aWV5c3l3dGhiYWZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0NDUxMzIsImV4cCI6MjA3NjAyMTEzMn0.t36uXDDEQEXdCyHObKypoqR-mMN_EUaSEW5GNeNGv7w'
);

async function test() {
  console.log('🧪 Teste GPT-5.1 com JSON Schema\n');
  
  await supabase.auth.signInWithPassword({ 
    email: 'calcadosdrielle@gmail.com', 
    password: 'Ibira2019!' 
  });
  
  const { data: agents } = await supabase.from('agents').select('*');
  const agent = agents?.find(a => a.name === 'Leandro 5.1');
  
  console.log(`API Key: ${agent?.gpt_api_key?.substring(0, 25)}...`);
  
  // Teste 1: gpt-5.1 sem max_tokens
  console.log('\n1️⃣ gpt-5.1 SEM max_tokens...');
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${agent?.gpt_api_key}`
      },
      body: JSON.stringify({
        model: 'gpt-5.1',
        messages: [
          { role: 'system', content: 'Você é um assistente.' },
          { role: 'user', content: 'Diga OK' }
        ],
        temperature: 0.3,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'Response',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                resposta: { type: 'string' },
                ok: { type: 'boolean' }
              },
              required: ['resposta', 'ok'],
              additionalProperties: false
            }
          }
        }
      })
    });
    
    if (!response.ok) {
      const err = await response.json();
      console.log(`   ❌ Erro: ${err.error?.message}`);
    } else {
      const data = await response.json();
      console.log(`   ✅ Funcionou!`);
      console.log(`   Resposta: ${data.choices[0]?.message?.content}`);
    }
  } catch (e: any) {
    console.log(`   ❌ ${e.message}`);
  }
  
  // Teste 2: gpt-5.1 com prompt grande (5k chars)
  console.log('\n2️⃣ gpt-5.1 com prompt médio (5k chars)...');
  const mediumText = agent?.instructions?.substring(0, 5000) || 'Texto de teste';
  
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${agent?.gpt_api_key}`
      },
      body: JSON.stringify({
        model: 'gpt-5.1',
        messages: [
          { role: 'system', content: 'Você edita documentos.' },
          { role: 'user', content: `Documento:\n${mediumText}\n\nMelhore a saudação.` }
        ],
        temperature: 0.3,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'Response',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                resposta_chat: { type: 'string' },
                documento_atualizado: { type: 'string' },
                alteracao_feita: { type: 'boolean' }
              },
              required: ['resposta_chat', 'documento_atualizado', 'alteracao_feita'],
              additionalProperties: false
            }
          }
        }
      })
    });
    
    if (!response.ok) {
      const err = await response.json();
      console.log(`   ❌ Erro: ${err.error?.message}`);
    } else {
      const data = await response.json();
      console.log(`   ✅ Funcionou! Tokens: ${data.usage?.total_tokens}`);
      const result = JSON.parse(data.choices[0]?.message?.content);
      console.log(`   resposta_chat: ${result.resposta_chat?.substring(0, 80)}...`);
    }
  } catch (e: any) {
    console.log(`   ❌ ${e.message}`);
  }
  
  // Teste 3: gpt-5.1 com prompt COMPLETO (21k chars)
  console.log('\n3️⃣ gpt-5.1 com prompt COMPLETO (21k chars)...');
  console.log('   ⏳ Pode demorar 1-3 minutos...');
  
  const start = Date.now();
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${agent?.gpt_api_key}`
      },
      body: JSON.stringify({
        model: 'gpt-5.1',
        messages: [
          { role: 'system', content: 'Você edita documentos. Preserve 100% do conteúdo não solicitado.' },
          { role: 'user', content: `Documento:\n\`\`\`\n${agent?.instructions}\n\`\`\`\n\nMelhore a saudação para ser mais calorosa.` }
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
                resposta_chat: { type: 'string' },
                documento_atualizado: { type: 'string' },
                alteracao_feita: { type: 'boolean' }
              },
              required: ['resposta_chat', 'documento_atualizado', 'alteracao_feita'],
              additionalProperties: false
            }
          }
        }
      })
    });
    
    const elapsed = (Date.now() - start) / 1000;
    
    if (!response.ok) {
      const text = await response.text();
      if (text.startsWith('<')) {
        console.log(`   ❌ ${elapsed.toFixed(1)}s - Retornou HTML (erro de proxy/servidor)`);
        console.log(`   Primeiros 300 chars: ${text.substring(0, 300)}`);
      } else {
        try {
          const err = JSON.parse(text);
          console.log(`   ❌ ${elapsed.toFixed(1)}s - Erro: ${err.error?.message}`);
        } catch {
          console.log(`   ❌ ${elapsed.toFixed(1)}s - Resposta inválida: ${text.substring(0, 200)}`);
        }
      }
    } else {
      const data = await response.json();
      console.log(`   ✅ SUCESSO em ${elapsed.toFixed(1)}s!`);
      console.log(`   Tokens: input=${data.usage?.prompt_tokens}, output=${data.usage?.completion_tokens}`);
      const result = JSON.parse(data.choices[0]?.message?.content);
      console.log(`   resposta_chat: ${result.resposta_chat?.substring(0, 100)}...`);
      console.log(`   documento_atualizado: ${result.documento_atualizado?.length} chars`);
    }
  } catch (e: any) {
    const elapsed = (Date.now() - start) / 1000;
    console.log(`   ❌ ${elapsed.toFixed(1)}s - ${e.message}`);
  }
}

test();
