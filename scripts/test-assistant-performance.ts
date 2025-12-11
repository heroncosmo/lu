// ============================================================================
// TESTE REALISTA DO ASSISTENTE DE PROMPTS
// ============================================================================
// Este script simula EXATAMENTE o que o Assistente de Prompts faz,
// mas testa diferentes configurações para encontrar a mais rápida.
// ============================================================================

// Gerar prompt de 21k caracteres (como o do Leandro)
function generateLargePrompt(): string {
  const instruction = `Você é um especialista em estratégia de vendas, relacionamento com clientes e psicologia comportamental. 
Seu objetivo é ajudar vendedores a aumentar significativamente suas conversões através de técnicas de persuasão ética.

CONHECIMENTOS:
- Psicologia de vendas: AIDA, SPIN selling, técnicas de fechamento
- Rapport: Espelhamento, sincronização, linguagem hipnótica
- Negociação: Win-win, BATNA, objeção handling
- Comunicação: Storytelling, framing, linguagem de padrões

INSTRUÇÕES DETALHADAS:
1. Analise o contexto da venda e do cliente
2. Identifique objeções e prepare antídotos
3. Sugira passos com linguagem específica
4. Mantenha ética e respeito ao cliente
5. Considere timing e canal de comunicação
6. Dê exemplos práticos de fala
7. Explique o 'por quê' das sugestões

EXEMPLOS DE LINGUAGEM:
- "Eu entendo que você esteja preocupado..."
- "O que torna este produto diferente é..."
- "Posso fazer uma pergunta?"
- "Imagine por um momento..."

CASOS DE USO:
1. Vendas B2B: ROI, integração, suporte
2. Serviços: Outcomes, credibilidade
3. Consultivas: Diagnóstico, solução
4. Transacionais: Conveniência, preço`;

  let prompt = instruction;
  while (prompt.length < 21000) {
    prompt += "\n\n---\n" + instruction;
  }
  return prompt.substring(0, 21679);
}

// Construir system prompt IGUAL ao do código real
function buildSystemPrompt(agentInstructions: string): string {
  return `Você é um especialista em criar prompts para agentes de IA de vendas e atendimento.
Seu objetivo é ajudar a melhorar o prompt do agente "Leandro aí".

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
}

// Mensagem do usuário (típica do Assistente de Prompts)
const USER_MESSAGE = "fale mais persuasivo e inteligente";

// Configurações para testar
interface TestConfig {
  name: string;
  model: string;
  maxTokens: number;
  reasoningEffort?: string;
  temperature: number;
  role: 'developer' | 'system';
}

const CONFIGS: TestConfig[] = [
  // Config atual do código
  {
    name: "ATUAL (gpt-5.1 + 9k tokens)",
    model: "gpt-5.1",
    maxTokens: 9227,
    reasoningEffort: "none",
    temperature: 0.7,
    role: "developer"
  },
  // Teste com menos tokens (resposta mais curta)
  {
    name: "gpt-5.1 + 4k tokens (menos)",
    model: "gpt-5.1",
    maxTokens: 4000,
    reasoningEffort: "none",
    temperature: 0.7,
    role: "developer"
  },
  // Teste com gpt-4.1 (não-reasoning, mais rápido)
  {
    name: "gpt-4.1 + 4k tokens",
    model: "gpt-4.1",
    maxTokens: 4000,
    temperature: 0.7,
    role: "system"
  },
  // Teste com gpt-4.1-mini (mais rápido ainda)
  {
    name: "gpt-4.1-mini + 4k tokens",
    model: "gpt-4.1-mini",
    maxTokens: 4000,
    temperature: 0.7,
    role: "system"
  },
  // Teste com gpt-4o (modelo padrão, bom equilíbrio)
  {
    name: "gpt-4o + 4k tokens",
    model: "gpt-4o",
    maxTokens: 4000,
    temperature: 0.7,
    role: "system"
  }
];

interface TestResult {
  config: string;
  time: number;
  tokens: number;
  responseLength: number;
  success: boolean;
  error?: string;
}

async function testConfig(
  config: TestConfig,
  systemPrompt: string,
  userMessage: string,
  apiKey: string
): Promise<TestResult> {
  const startTime = Date.now();

  try {
    const body: any = {
      model: config.model,
      messages: [
        { role: config.role, content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      temperature: config.temperature
    };

    // GPT-5.1 usa max_completion_tokens e reasoning_effort
    if (config.model.includes("5.1") || config.model.includes("o1") || config.model.includes("o3")) {
      body.max_completion_tokens = config.maxTokens;
      if (config.reasoningEffort) {
        body.reasoning_effort = config.reasoningEffort;
      }
    } else {
      // Outros modelos usam max_tokens
      body.max_tokens = config.maxTokens;
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    const endTime = Date.now();
    const elapsed = endTime - startTime;

    if (!response.ok) {
      const errorData = await response.json();
      return {
        config: config.name,
        time: elapsed,
        tokens: 0,
        responseLength: 0,
        success: false,
        error: errorData.error?.message || "Erro desconhecido"
      };
    }

    const data = await response.json();
    const responseContent = data.choices[0].message.content || "";

    return {
      config: config.name,
      time: elapsed,
      tokens: data.usage?.completion_tokens || 0,
      responseLength: responseContent.length,
      success: true
    };
  } catch (error: any) {
    return {
      config: config.name,
      time: Date.now() - startTime,
      tokens: 0,
      responseLength: 0,
      success: false,
      error: error.message
    };
  }
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.log("❌ OPENAI_API_KEY não definida!");
    console.log("   Use: $env:OPENAI_API_KEY='sua-chave'; npx tsx scripts/test-assistant-performance.ts");
    process.exit(1);
  }

  console.log("\n");
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║  TESTE DE PERFORMANCE DO ASSISTENTE DE PROMPTS                 ║");
  console.log("║  Prompt: 21.679 caracteres (igual ao do Leandro)               ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  // Gerar prompt de 21k
  const agentInstructions = generateLargePrompt();
  const systemPrompt = buildSystemPrompt(agentInstructions);

  console.log(`📝 Instruções do agente: ${agentInstructions.length.toLocaleString()} caracteres`);
  console.log(`📋 System prompt total: ${systemPrompt.length.toLocaleString()} caracteres`);
  console.log(`💬 Mensagem do usuário: "${USER_MESSAGE}"\n`);

  console.log("═".repeat(70));
  console.log("Testando cada configuração...\n");

  const results: TestResult[] = [];

  for (const config of CONFIGS) {
    process.stdout.write(`🧪 ${config.name}... `);
    const result = await testConfig(config, systemPrompt, USER_MESSAGE, apiKey);
    results.push(result);

    if (result.success) {
      console.log(
        `✅ ${(result.time / 1000).toFixed(2)}s | ${result.tokens} tokens | ${result.responseLength} chars`
      );
    } else {
      console.log(`❌ ${result.error}`);
    }

    // Esperar 1s entre testes para não sobrecarregar
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Ordenar por tempo
  const successResults = results.filter((r) => r.success);
  successResults.sort((a, b) => a.time - b.time);

  console.log("\n" + "═".repeat(70));
  console.log("📊 RANKING (mais rápido primeiro):\n");

  successResults.forEach((r, i) => {
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "  ";
    const timeStr = `${(r.time / 1000).toFixed(2)}s`.padEnd(8);
    const tokensStr = `${r.tokens} tokens`.padEnd(12);
    console.log(`${medal} ${timeStr} | ${tokensStr} | ${r.config}`);
  });

  console.log("\n" + "═".repeat(70));

  if (successResults.length > 0) {
    const fastest = successResults[0];
    const current = results.find((r) => r.config.includes("ATUAL"));

    console.log("\n🎯 RECOMENDAÇÃO:\n");

    if (current && current.success && fastest.config !== current.config) {
      const speedup = ((current.time - fastest.time) / current.time * 100).toFixed(0);
      console.log(`   Configuração atual: ${(current.time / 1000).toFixed(2)}s`);
      console.log(`   Configuração mais rápida: ${(fastest.time / 1000).toFixed(2)}s`);
      console.log(`   Melhoria: ${speedup}% mais rápido! ⚡\n`);
      console.log(`   👉 Recomendo trocar para: ${fastest.config.split(" + ")[0]}`);
    } else if (fastest.config.includes("ATUAL")) {
      console.log("   ✅ A configuração atual já é a mais rápida!");
    }
  }

  console.log("\n╔════════════════════════════════════════════════════════════════╗");
  console.log("║  TESTE COMPLETO                                                ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");
}

main().catch(console.error);
