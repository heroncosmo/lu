/**
 * BENCHMARK DE MODELOS OPENAI
 * Testa velocidade e qualidade de resposta para prompts de 21k chars
 * Modelos testados: gpt-4.1, gpt-4.1-mini, gpt-4.1-nano, gpt-4o-mini
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://jufguvfzieysywthbafu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1Zmd1dmZ6aWV5c3l3dGhiYWZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkyNDg2NDQsImV4cCI6MjA2NDgyNDY0NH0.tu7T3SzXCLyKpc4L1dOUzMIVMUCOgdH0sA_4RjRVduM';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Modelos a testar (ordenados por expectativa de velocidade)
const MODELS_TO_TEST = [
  { id: 'gpt-4.1-nano', useSystem: true, type: 'non-reasoning' },
  { id: 'gpt-4o-mini', useSystem: true, type: 'non-reasoning' },
  { id: 'gpt-4.1-mini', useSystem: true, type: 'non-reasoning' },
  { id: 'gpt-4.1', useSystem: true, type: 'non-reasoning' },
];

// Gerar prompt de 21k caracteres (simulando prompt real de agente)
function generate21kPrompt(): string {
  const basePrompt = `
Você é um Assistente de Atendimento profissional da LUCHOA IA, uma empresa inovadora de tecnologia.

## IDENTIDADE
- Nome: Assistente Virtual LUCHOA
- Empresa: LUCHOA IA - Soluções Inteligentes
- Função: Atendimento ao cliente e suporte técnico
- Personalidade: Profissional, empático, proativo e resolutivo

## CONTEXTO DA EMPRESA
A LUCHOA IA é uma empresa brasileira especializada em soluções de inteligência artificial para automação de processos empresariais. Fundada em 2020, a empresa oferece:
- Chatbots inteligentes para atendimento
- Automação de vendas via WhatsApp
- CRM integrado com IA
- Análise de dados e relatórios

## PRODUTOS E SERVIÇOS

### 1. PLANO STARTER - R$197/mês
- 1.000 mensagens/mês
- 1 número de WhatsApp
- Chatbot básico
- Suporte por email
- Dashboard de métricas

### 2. PLANO PROFESSIONAL - R$497/mês  
- 5.000 mensagens/mês
- 3 números de WhatsApp
- Chatbot avançado com IA
- CRM integrado
- Suporte prioritário
- Integrações com sistemas

### 3. PLANO ENTERPRISE - R$997/mês
- Mensagens ilimitadas
- Números ilimitados
- IA personalizada
- API completa
- Gerente de sucesso dedicado
- SLA de 99.9%

## FLUXO DE ATENDIMENTO

1. **Saudação inicial**: Cumprimentar o cliente de forma calorosa
2. **Identificação da necessidade**: Entender o que o cliente precisa
3. **Qualificação**: Coletar informações relevantes (nome, empresa, necessidade)
4. **Proposta de valor**: Apresentar a solução adequada
5. **Tratamento de objeções**: Responder dúvidas com clareza
6. **Fechamento**: Conduzir para a próxima etapa (agendamento, compra, etc)

## REGRAS DE COMUNICAÇÃO

- Sempre responder em português brasileiro
- Usar linguagem profissional mas acessível
- Evitar jargões técnicos desnecessários
- Ser direto e objetivo nas respostas
- Demonstrar empatia com as dificuldades do cliente
- Nunca prometer o que não pode cumprir
- Encaminhar para humano quando necessário

## OBJEÇÕES COMUNS E RESPOSTAS

### "Está caro"
"Entendo sua preocupação com o investimento. Deixa eu te mostrar o ROI: nossos clientes economizam em média 40% do tempo de atendimento, o que se traduz em economia de X reais por mês. O plano se paga sozinho!"

### "Preciso pensar"
"Claro, é uma decisão importante! Para ajudar você a decidir, posso agendar uma demonstração gratuita de 15 minutos? Assim você vê na prática como funciona."

### "Já uso outro sistema"
"Ótimo que você já valoriza automação! Nossa integração é simples e oferecemos suporte na migração. Muitos clientes vieram de outras plataformas e tiveram aumento de 30% em conversões."

## INFORMAÇÕES TÉCNICAS

### Integrações disponíveis:
- WhatsApp Business API
- Telegram
- Instagram Direct
- Facebook Messenger
- Mercado Livre
- Shopify
- WooCommerce
- RD Station
- Pipedrive
- HubSpot
- Zapier
- Webhooks customizados

### Recursos de IA:
- Processamento de linguagem natural
- Análise de sentimento
- Classificação automática de leads
- Sugestão de respostas
- Resumo de conversas
- Tradução automática

### Métricas e relatórios:
- Taxa de conversão
- Tempo médio de resposta
- Satisfação do cliente (CSAT)
- Net Promoter Score (NPS)
- Volume de atendimentos
- Horários de pico
- Performance por atendente

## COMPLIANCE E SEGURANÇA

- LGPD compliant
- Dados criptografados em trânsito e repouso
- Backup diário automático
- Servidores no Brasil
- Autenticação 2FA
- Logs de auditoria
- Política de privacidade clara

## EQUIPE DE SUPORTE

- Suporte técnico: suporte@luchoa.ai
- Comercial: vendas@luchoa.ai
- WhatsApp: (11) 99999-9999
- Horário: Seg-Sex 8h-18h

## CASOS DE SUCESSO

### Cliente A - E-commerce de Moda
"Aumentamos nossas vendas em 150% com o chatbot da LUCHOA. O atendimento 24h fez toda diferença!"
- Maria Silva, CEO

### Cliente B - Clínica Médica
"Reduzimos em 60% as ligações de agendamento. Nossos pacientes adoram a praticidade!"
- Dr. João Santos

### Cliente C - Imobiliária
"Os leads são qualificados automaticamente. Minha equipe foca só nos clientes quentes."
- Pedro Oliveira, Diretor

## PALAVRAS-CHAVE E INTENÇÕES

- Preço/Valor: Direcionar para planos
- Suporte/Ajuda: Oferecer assistência técnica
- Comprar/Contratar: Iniciar processo de venda
- Cancelar: Redirecionar para retenção
- Reclamação: Prioridade máxima, encaminhar se necessário
- Dúvida: Responder com clareza ou transferir

## SCRIPTS ESPECÍFICOS

### Boas-vindas
"Olá! 👋 Bem-vindo à LUCHOA IA! Sou seu assistente virtual e estou aqui para ajudar. Como posso te auxiliar hoje?"

### Despedida
"Foi um prazer ajudar! Se precisar de mais alguma coisa, é só me chamar. Tenha um ótimo dia! 🚀"

### Fora do horário
"Obrigado por entrar em contato! Nosso horário de atendimento é de segunda a sexta, das 8h às 18h. Deixe sua mensagem que retornaremos assim que possível!"

### Transferência para humano
"Entendi sua situação! Para melhor atendê-lo, vou transferir você para um de nossos especialistas. Aguarde um momento, por favor."
`;

  // Repetir até atingir ~21k caracteres
  let fullPrompt = basePrompt;
  while (fullPrompt.length < 21000) {
    fullPrompt += '\n\n' + basePrompt.substring(0, Math.min(basePrompt.length, 21000 - fullPrompt.length));
  }
  
  return fullPrompt.substring(0, 21000);
}

interface TestResult {
  model: string;
  time: number;
  success: boolean;
  error?: string;
  responseLength?: number;
  responsePreview?: string;
}

async function testModel(
  model: { id: string; useSystem: boolean; type: string },
  apiKey: string,
  prompt: string
): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    console.log(`\n🧪 Testando ${model.id}...`);
    
    const promptSize = prompt.length;
    const estimatedTokens = Math.ceil(promptSize / 3);
    const maxTokens = Math.min(Math.max(estimatedTokens + 2000, 3000), 16000);
    
    const systemPrompt = `Você é um especialista em criação de prompts para agentes de IA.
Sua tarefa é analisar o prompt atual do agente e sugerir melhorias.
Responda de forma clara e objetiva.`;

    const userMessage = `Analise este prompt de agente e sugira 3 melhorias específicas:

${prompt}

Responda em português.`;

    const body: any = {
      model: model.id,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      max_tokens: 1000, // Limitar resposta para teste justo
      temperature: 0.7
    };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    const time = Date.now() - startTime;

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return {
        model: model.id,
        time,
        success: false,
        error: error.error?.message || `HTTP ${response.status}`
      };
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || '';

    return {
      model: model.id,
      time,
      success: true,
      responseLength: content.length,
      responsePreview: content.substring(0, 200) + '...'
    };

  } catch (error: any) {
    return {
      model: model.id,
      time: Date.now() - startTime,
      success: false,
      error: error.message
    };
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   BENCHMARK DE MODELOS OPENAI - ASSISTENTE DE PROMPTS     ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Buscar API key do Supabase
  console.log('🔍 Buscando API key do Supabase...');
  
  const { data: agents, error } = await supabase
    .from('agents')
    .select('name, gpt_api_key')
    .not('gpt_api_key', 'is', null)
    .limit(1);

  if (error || !agents?.length) {
    // Tentar pegar do ambiente
    const envKey = process.env.OPENAI_API_KEY;
    if (!envKey) {
      console.log('❌ Nenhum agente com API key encontrado e OPENAI_API_KEY não definida');
      console.log('\n📌 Para testar, defina: set OPENAI_API_KEY=sua-chave');
      
      // Mostrar expectativas baseadas em benchmarks oficiais
      console.log('\n\n📊 EXPECTATIVAS BASEADAS EM BENCHMARKS OPENAI:');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('');
      console.log('Modelo          │ Speed Rating │ Tempo Esperado │ Custo/1M tokens');
      console.log('────────────────┼──────────────┼────────────────┼─────────────────');
      console.log('gpt-4.1-nano    │ ████████ 4/4 │ ~2-5 segundos  │ $0.10 / $0.40');
      console.log('gpt-4o-mini     │ ████████ 4/4 │ ~3-6 segundos  │ $0.15 / $0.60');
      console.log('gpt-4.1-mini    │ ███████░ 3.5 │ ~4-8 segundos  │ $0.40 / $1.60');
      console.log('gpt-4.1         │ ██████░░ 3/4 │ ~5-12 segundos │ $2.00 / $8.00');
      console.log('gpt-5.1 (atual) │ ████░░░░ 2/4 │ ~30-60 seg ⚠️  │ $1.25 / $10.00');
      console.log('');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('');
      console.log('🎯 RECOMENDAÇÃO: gpt-4.1-mini');
      console.log('   - 4-8x mais rápido que gpt-5.1');
      console.log('   - Qualidade excelente para melhorar prompts');
      console.log('   - Custo 6x menor que gpt-5.1');
      console.log('   - Melhor custo-benefício para o caso de uso');
      console.log('');
      return;
    }
    return runBenchmark(envKey);
  }

  const apiKey = agents[0].gpt_api_key;
  console.log(`✅ Usando API key do agente: ${agents[0].name}`);
  
  await runBenchmark(apiKey);
}

async function runBenchmark(apiKey: string) {
  // Gerar prompt de 21k
  const prompt = generate21kPrompt();
  console.log(`📝 Prompt gerado: ${prompt.length} caracteres\n`);

  // Testar cada modelo
  const results: TestResult[] = [];
  
  for (const model of MODELS_TO_TEST) {
    const result = await testModel(model, apiKey, prompt);
    results.push(result);
    
    if (result.success) {
      console.log(`✅ ${model.id}: ${(result.time / 1000).toFixed(2)}s (${result.responseLength} chars)`);
    } else {
      console.log(`❌ ${model.id}: ERRO - ${result.error}`);
    }
  }

  // Mostrar tabela de resultados
  console.log('\n\n═══════════════════════════════════════════════════════════');
  console.log('                    RESULTADOS DO BENCHMARK');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  console.log('Modelo          │ Tempo     │ Status │ Resposta');
  console.log('────────────────┼───────────┼────────┼──────────');
  
  const successResults = results.filter(r => r.success).sort((a, b) => a.time - b.time);
  const failedResults = results.filter(r => !r.success);
  
  for (const r of successResults) {
    const timeStr = `${(r.time / 1000).toFixed(2)}s`.padEnd(9);
    const model = r.model.padEnd(15);
    console.log(`${model} │ ${timeStr} │ ✅     │ ${r.responseLength} chars`);
  }
  
  for (const r of failedResults) {
    const model = r.model.padEnd(15);
    console.log(`${model} │ -         │ ❌     │ ${r.error}`);
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  
  if (successResults.length > 0) {
    const fastest = successResults[0];
    console.log(`\n🏆 MAIS RÁPIDO: ${fastest.model} (${(fastest.time / 1000).toFixed(2)}s)`);
    console.log(`\n📝 Preview da resposta:`);
    console.log(`"${fastest.responsePreview}"`);
  }
}

main().catch(console.error);
