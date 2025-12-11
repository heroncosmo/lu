/**
 * TESTE LOCAL DA CONFIGURAÇÃO GPT-4.1-MINI
 * Simula exatamente o que o frontend faz no Assistente de Prompts
 */

// Simular prompt de 21k caracteres
function generate21kPrompt(): string {
  const basePrompt = `
Você é um Assistente de Atendimento profissional da LUCHOA IA, uma empresa inovadora de tecnologia.

## IDENTIDADE
- Nome: Assistente Virtual LUCHOA
- Empresa: LUCHOA IA - Soluções Inteligentes
- Função: Atendimento ao cliente e suporte técnico

## CONTEXTO DA EMPRESA
A LUCHOA IA é uma empresa brasileira especializada em soluções de inteligência artificial.

## PRODUTOS
### PLANO STARTER - R$197/mês
- 1.000 mensagens/mês
- 1 número de WhatsApp

### PLANO PROFESSIONAL - R$497/mês  
- 5.000 mensagens/mês
- 3 números de WhatsApp
- CRM integrado

### PLANO ENTERPRISE - R$997/mês
- Mensagens ilimitadas
- Números ilimitados
- IA personalizada

## FLUXO DE ATENDIMENTO
1. Saudação inicial
2. Identificação da necessidade
3. Qualificação
4. Proposta de valor
5. Tratamento de objeções
6. Fechamento

## REGRAS DE COMUNICAÇÃO
- Sempre responder em português brasileiro
- Usar linguagem profissional mas acessível
- Ser direto e objetivo
- Demonstrar empatia
`;

  let fullPrompt = basePrompt;
  while (fullPrompt.length < 21000) {
    fullPrompt += '\n' + basePrompt;
  }
  return fullPrompt.substring(0, 21000);
}

async function testGPT41Mini() {
  // Pedir API key do usuário
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    console.log('\n❌ OPENAI_API_KEY não definida.');
    console.log('   Para testar, execute: $env:OPENAI_API_KEY="sua-chave"; npx tsx scripts/test-local-speed.ts\n');
    
    // Mostrar o que DEVERIA acontecer
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📋 RESUMO DAS CORREÇÕES FEITAS:');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    console.log('ANTES (ERRADO):');
    console.log('  - Modelo: gpt-4.1-mini');
    console.log('  - Role: "developer" ❌');
    console.log('  - Token param: max_completion_tokens ❌');
    console.log('  - Resultado: API tentava usar formato de reasoning model = LENTO\n');
    
    console.log('DEPOIS (CORRETO):');
    console.log('  - Modelo: gpt-4.1-mini');
    console.log('  - Role: "system" ✅');  
    console.log('  - Token param: max_tokens ✅');
    console.log('  - Resultado: API usa formato correto de non-reasoning = RÁPIDO\n');
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🔧 ARQUIVOS CORRIGIDOS:');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('1. src/components/AgentPromptImprover.tsx');
    console.log('   - Modelo fixo: gpt-4.1-mini');
    console.log('   - Role: system');
    console.log('   - max_tokens (não max_completion_tokens)');
    console.log('');
    console.log('2. src/pages/AgentConfiguration.tsx');
    console.log('   - isReasoningModel = isGpt5Series || isOSeries');
    console.log('   - GPT-4.1 agora usa system role corretamente');
    console.log('   - max_tokens para non-reasoning models');
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📊 EXPECTATIVA DE PERFORMANCE:');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log('Com as correções:');
    console.log('  gpt-4.1-mini + system role + max_tokens');
    console.log('  → Esperado: 5-15 segundos para 21k chars');
    console.log('');
    console.log('Antes das correções:');
    console.log('  gpt-4.1-mini + developer role + max_completion_tokens');
    console.log('  → Resultado: 30-60+ segundos (API confusa com formato errado)');
    console.log('');
    return;
  }

  const prompt21k = generate21kPrompt();
  console.log(`\n📝 Prompt gerado: ${prompt21k.length} caracteres`);
  
  const systemPrompt = `Você é um assistente especializado em editar playbooks de vendas.
Você conversa naturalmente com o usuário E faz as edições solicitadas no documento.`;

  const userMessage = `DOCUMENTO ATUAL DO PLAYBOOK:
\`\`\`
${prompt21k}
\`\`\`

MENSAGEM DO USUÁRIO:
Deixe o tom mais persuasivo e agressivo nas vendas.`;

  // CONFIGURAÇÃO CORRETA PARA GPT-4.1-MINI (non-reasoning model)
  const model = 'gpt-4.1-mini';
  const systemRole = 'system'; // NÃO developer!
  
  const promptChars = prompt21k.length;
  const estimatedDocTokens = Math.ceil(promptChars / 3);
  const maxTokens = Math.min(Math.max(estimatedDocTokens + 2000, 4000), 32000);
  
  console.log(`\n🚀 Testando ${model} com configuração CORRETA:`);
  console.log(`   - Role: ${systemRole}`);
  console.log(`   - max_tokens: ${maxTokens}`);
  console.log(`   - Sem reasoning_effort (non-reasoning model)`);
  
  const startTime = Date.now();
  
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: systemRole, content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        max_tokens: maxTokens,
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

    const elapsed = Date.now() - startTime;

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.log(`\n❌ ERRO: ${error.error?.message || response.status}`);
      return;
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || '';
    
    console.log(`\n✅ SUCESSO!`);
    console.log(`⏱️  Tempo total: ${(elapsed / 1000).toFixed(2)} segundos`);
    console.log(`📊 Tokens usados:`, data.usage);
    console.log(`📝 Tamanho da resposta: ${content.length} caracteres`);
    
    // Parse JSON
    try {
      const parsed = JSON.parse(content);
      console.log(`\n💬 Resposta do chat: "${parsed.resposta_chat.substring(0, 200)}..."`);
      console.log(`📄 Documento atualizado: ${parsed.documento_atualizado.length} caracteres`);
      console.log(`✏️  Alteração feita: ${parsed.alteracao_feita}`);
    } catch (e) {
      console.log(`\n⚠️  Não foi possível parsear JSON, mas resposta recebida`);
    }

    if (elapsed < 15000) {
      console.log(`\n🎉 EXCELENTE! Tempo abaixo de 15 segundos!`);
    } else if (elapsed < 30000) {
      console.log(`\n✅ BOM! Tempo entre 15-30 segundos`);
    } else {
      console.log(`\n⚠️  LENTO! Tempo acima de 30 segundos`);
    }

  } catch (error: any) {
    console.log(`\n❌ ERRO: ${error.message}`);
  }
}

testGPT41Mini();
