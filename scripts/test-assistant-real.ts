// ============================================================================
// TESTE REALISTA DO ASSISTENTE DE PROMPTS - BUSCA CHAVE DO SUPABASE
// ============================================================================

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://bnfpcuzjvycudccycqqt.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJuZnBjdXpqdnljdWRjY3ljcXF0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjM1MzM4OSwiZXhwIjoyMDc3OTI5Mzg5fQ.EIfKg_UwNVTtSiXa5L6eVYfl6_zlJU1m7EGP0jXa0us";

const supabase = createClient(supabaseUrl, supabaseKey);

// Construir system prompt IGUAL ao do código real
function buildSystemPrompt(agentName: string, agentInstructions: string): string {
  return `Você é um especialista em criar prompts para agentes de IA de vendas e atendimento.
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
  role: "developer" | "system";
}

const CONFIGS: TestConfig[] = [
  // Config atual do código
  {
    name: "ATUAL (gpt-5.1 + 9k tokens)",
    model: "gpt-5.1",
    maxTokens: 9227,
    reasoningEffort: "none",
    temperature: 0.7,
    role: "developer",
  },
  // Teste com menos tokens (resposta mais curta)
  {
    name: "gpt-5.1 + 4k tokens (menos)",
    model: "gpt-5.1",
    maxTokens: 4000,
    reasoningEffort: "none",
    temperature: 0.7,
    role: "developer",
  },
  // Teste com gpt-4.1 (não-reasoning, mais rápido)
  {
    name: "gpt-4.1 + 4k tokens",
    model: "gpt-4.1",
    maxTokens: 4000,
    temperature: 0.7,
    role: "system",
  },
  // Teste com gpt-4.1-mini (mais rápido ainda)
  {
    name: "gpt-4.1-mini + 4k tokens",
    model: "gpt-4.1-mini",
    maxTokens: 4000,
    temperature: 0.7,
    role: "system",
  },
  // Teste com gpt-4o (modelo padrão, bom equilíbrio)
  {
    name: "gpt-4o + 4k tokens",
    model: "gpt-4o",
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
    if (
      config.model.includes("5.1") ||
      config.model.includes("o1") ||
      config.model.includes("o3")
    ) {
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
  console.log("\n");
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║  TESTE DE PERFORMANCE DO ASSISTENTE DE PROMPTS                 ║");
  console.log("║  Usando dados REAIS do Supabase (agente do Leandro)            ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  // Buscar agente do Supabase
  console.log("📥 Buscando agente do Supabase...");
  
  const { data: agents, error } = await supabase
    .from("agents")
    .select("*")
    .limit(5);

  if (error) {
    console.error("❌ Erro ao buscar agentes:", error.message);
    process.exit(1);
  }

  if (!agents || agents.length === 0) {
    console.error("❌ Nenhum agente encontrado!");
    process.exit(1);
  }

  // Mostrar agentes disponíveis
  console.log("\n📋 Agentes disponíveis:");
  agents.forEach((a, i) => {
    console.log(`   ${i + 1}. ${a.name} (${a.instructions?.length || 0} chars)`);
  });

  // Usar o primeiro agente com instruções grandes
  const agent = agents.find(a => (a.instructions?.length || 0) > 5000) || agents[0];

  if (!agent) {
    console.error("❌ Nenhum agente com instruções longas encontrado!");
    process.exit(1);
  }

  console.log(`\n✅ Usando agente: ${agent.name}`);
  console.log(`   Instruções: ${agent.instructions?.length || 0} caracteres`);
  console.log(`   Modelo: ${agent.gpt_model}`);

  if (!agent.gpt_api_key) {
    console.error("❌ Agente não tem chave API configurada!");
    process.exit(1);
  }

  // Construir prompts
  const systemPrompt = buildSystemPrompt(agent.name, agent.instructions || "");

  console.log(`\n📋 System prompt total: ${systemPrompt.length.toLocaleString()} caracteres`);
  console.log(`💬 Mensagem do usuário: "${USER_MESSAGE}"\n`);

  console.log("═".repeat(70));
  console.log("Testando cada configuração (pode demorar 1-2 min)...\n");

  const results: TestResult[] = [];

  for (const config of CONFIGS) {
    process.stdout.write(`🧪 ${config.name}... `);
    const result = await testConfig(
      config,
      systemPrompt,
      USER_MESSAGE,
      agent.gpt_api_key
    );
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
      const speedup = (
        ((current.time - fastest.time) / current.time) *
        100
      ).toFixed(0);
      console.log(`   Configuração atual: ${(current.time / 1000).toFixed(2)}s`);
      console.log(
        `   Configuração mais rápida: ${(fastest.time / 1000).toFixed(2)}s`
      );
      console.log(`   Melhoria: ${speedup}% mais rápido! ⚡\n`);
      console.log(`   👉 Recomendo trocar para: ${fastest.config.split(" + ")[0]}`);
    } else if (current && fastest.config.includes("ATUAL")) {
      console.log("   ✅ A configuração atual já é a mais rápida!");
    }
  }

  console.log(
    "\n╔════════════════════════════════════════════════════════════════╗"
  );
  console.log(
    "║  TESTE COMPLETO                                                ║"
  );
  console.log(
    "╚════════════════════════════════════════════════════════════════╝\n"
  );
}

main().catch(console.error);
