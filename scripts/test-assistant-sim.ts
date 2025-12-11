// ============================================================================
// TESTE DE PERFORMANCE DO ASSISTENTE - SIMULAÇÃO COMPLETA
// ============================================================================
// Este script simula EXATAMENTE a chamada do Assistente de Prompts
// com um prompt de 21k caracteres e testa diferentes configurações.
// ============================================================================

// Gerar prompt de 21k caracteres (simulando o do Leandro)
function generateLargePrompt(): string {
  const instruction = `Você é um especialista em estratégia de vendas, relacionamento com clientes e psicologia comportamental. 
Seu objetivo é ajudar vendedores a aumentar significativamente suas conversões através de técnicas de persuasão ética.

CONHECIMENTOS PROFUNDOS:
- Psicologia de vendas: AIDA (Atenção, Interesse, Desejo, Ação), SPIN selling, técnicas de fechamento provadas
- Rapport: Espelhamento neurolinguístico, sincronização corporal, linguagem hipnótica
- Negociação: Objeção handling estratégico, win-win negotiation, BATNA strategy
- Comunicação: Linguagem de padrões, storytelling persuasivo, framing cognitivo
- Ética: Sempre respeitar o cliente, transparência completa, honestidade radical

INSTRUÇÕES DETALHADAS:
1. Analise profundamente o contexto da venda e do perfil do cliente
2. Identifique possíveis objeções e prepare antídotos com base em psicologia
3. Sugira uma sequência de passos com linguagem específica e testada
4. Mantenha total ética e respeito ao cliente em toda interação
5. Considere o timing perfeito e o canal de comunicação mais efetivo
6. Dê exemplos práticos de fala exata que o vendedor pode usar
7. Sempre explique o 'por quê' das suas sugestões - educação, não manipulação

EXEMPLOS DE PADRÕES DE LINGUAGEM:
- "Eu entendo que você esteja preocupado com [objeção]..."
- "O que torna este produto diferente é [benefício]..."
- "Posso fazer uma pergunta?"
- "Imagine por um momento que você já resolveu..."

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

// Configurações para testar
interface TestConfig {
  name: string;
  model: string;
  maxTokens: number;
  reasoningEffort?: string;
  temperature: number;
  role: "developer" | "system";
}

const CONFIGS: TestConfig[] = [
  // Config atual do código
  {
    name: "ATUAL (gpt-5.1 + reasoning:none)",
    model: "gpt-5.1",
    maxTokens: 4000,
    reasoningEffort: "none",
    temperature: 0.7,
    role: "developer",
  },
  // gpt-4.1 (não-reasoning, pode ser mais rápido)
  {
    name: "gpt-4.1 (não-reasoning)",
    model: "gpt-4.1",
    maxTokens: 4000,
    temperature: 0.7,
    role: "system",
  },
  // gpt-4.1-mini (mais rápido)
  {
    name: "gpt-4.1-mini (econômico)",
    model: "gpt-4.1-mini",
    maxTokens: 4000,
    temperature: 0.7,
    role: "system",
  },
  // gpt-4o (modelo padrão)
  {
    name: "gpt-4o (padrão)",
    model: "gpt-4o",
    maxTokens: 4000,
    temperature: 0.7,
    role: "system",
  },
  // gpt-4o-mini (mais econômico)
  {
    name: "gpt-4o-mini (mais econômico)",
    model: "gpt-4o-mini",
    maxTokens: 4000,
    temperature: 0.7,
    role: "system",
  },
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
        { role: "user", content: userMessage },
      ],
      temperature: config.temperature,
    };

    // GPT-5.1 usa max_completion_tokens e reasoning_effort
    if (config.model.includes("5.1") || config.model.includes("o1") || config.model.includes("o3")) {
      body.max_completion_tokens = config.maxTokens;
      if (config.reasoningEffort) {
        body.reasoning_effort = config.reasoningEffort;
      }
    } else {
      body.max_tokens = config.maxTokens;
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
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
        error: errorData.error?.message || "Erro desconhecido",
      };
    }

    const data = await response.json();
    const responseContent = data.choices[0].message.content || "";

    return {
      config: config.name,
      time: elapsed,
      tokens: data.usage?.completion_tokens || 0,
      responseLength: responseContent.length,
      success: true,
    };
  } catch (error: any) {
    return {
      config: config.name,
      time: Date.now() - startTime,
      tokens: 0,
      responseLength: 0,
      success: false,
      error: error.message,
    };
  }
}

async function main() {
  // Verificar chave API
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.log("\n❌ OPENAI_API_KEY não definida!\n");
    console.log("Execute assim:");
    console.log("   $env:OPENAI_API_KEY='sk-proj-...'; npx tsx scripts/test-assistant-sim.ts\n");
    process.exit(1);
  }

  console.log("\n");
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║  TESTE DE PERFORMANCE DO ASSISTENTE DE PROMPTS                 ║");
  console.log("║  Prompt simulado: 21.679 caracteres (igual ao do Leandro)      ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  // Gerar prompt de 21k
  const agentInstructions = generateLargePrompt();
  const systemPrompt = buildSystemPrompt(agentInstructions);
  const userMessage = "fale mais persuasivo e inteligente";

  console.log(`📝 Instruções do agente: ${agentInstructions.length.toLocaleString()} caracteres`);
  console.log(`📋 System prompt total: ${systemPrompt.length.toLocaleString()} caracteres`);
  console.log(`💬 Mensagem do usuário: "${userMessage}"\n`);

  console.log("═".repeat(70));
  console.log("Testando cada modelo (pode demorar 2-3 min)...\n");

  const results: TestResult[] = [];

  for (const config of CONFIGS) {
    process.stdout.write(`🧪 ${config.name.padEnd(35)}... `);
    const result = await testConfig(config, systemPrompt, userMessage, apiKey);
    results.push(result);

    if (result.success) {
      console.log(
        `✅ ${(result.time / 1000).toFixed(2)}s | ${result.tokens} tokens`
      );
    } else {
      console.log(`❌ ${result.error?.substring(0, 40)}...`);
    }

    // Esperar 1s entre testes
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Ordenar por tempo
  const successResults = results.filter((r) => r.success);
  successResults.sort((a, b) => a.time - b.time);

  console.log("\n" + "═".repeat(70));
  console.log("\n📊 RANKING (mais rápido primeiro):\n");

  successResults.forEach((r, i) => {
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "  ";
    const timeStr = `${(r.time / 1000).toFixed(2)}s`.padEnd(8);
    const tokensStr = `${r.tokens} tokens`.padEnd(12);
    console.log(`${medal} ${timeStr} | ${tokensStr} | ${r.config}`);
  });

  if (successResults.length > 0) {
    const fastest = successResults[0];
    const current = results.find((r) => r.config.includes("ATUAL"));

    console.log("\n" + "═".repeat(70));
    console.log("\n🎯 ANÁLISE:\n");

    if (current && current.success) {
      console.log(`   Configuração ATUAL (gpt-5.1): ${(current.time / 1000).toFixed(2)}s`);
      console.log(`   Configuração mais rápida: ${(fastest.time / 1000).toFixed(2)}s`);

      if (fastest.config !== current.config) {
        const speedup = (((current.time - fastest.time) / current.time) * 100).toFixed(0);
        console.log(`\n   ⚡ Potencial de melhoria: ${speedup}% mais rápido!`);
        console.log(`   👉 Recomendo: ${fastest.config}`);
      } else {
        console.log(`\n   ✅ A configuração atual já é a mais rápida!`);
      }
    }
  }

  console.log("\n╔════════════════════════════════════════════════════════════════╗");
  console.log("║  TESTE COMPLETO                                                ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");
}

main().catch(console.error);
