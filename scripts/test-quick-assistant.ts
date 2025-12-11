import { createClient } from "@supabase/supabase-js";

// Initialize Supabase com credenciais corretas
const supabaseUrl = "https://jufguvfzieysywthbafu.supabase.co";
const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1Zmd1dmZ6aWV5c3l3dGhiYWZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0NDUxMzIsImV4cCI6MjA3NjAyMTEzMn0.t36uXDDEQEXdCyHObKypoqR-mMN_EUaSEW5GNeNGv7w";

const supabase = createClient(supabaseUrl, supabaseKey);

async function getAgentData() {
  console.log("📥 Buscando agente do Leandro no Supabase...\n");

  // Primeiro, busca todos os agentes para ver qual existe
  const { data: allAgents, error: allError } = await supabase
    .from("agents")
    .select("id, name");

  if (allError) {
    console.error("❌ Erro ao listar agentes:", allError.message);
    process.exit(1);
  }

  console.log("📋 Agentes disponíveis:");
  allAgents?.forEach((a) => console.log(`   - ${a.name}`));
  console.log("");

  // Busca o primeiro agente (provavelmente do Leandro)
  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .limit(1)
    .single();

  if (error) {
    console.error("❌ Erro ao buscar agente:", error.message);
    process.exit(1);
  }

  if (!data) {
    console.error("❌ Nenhum agente encontrado!");
    process.exit(1);
  }

  console.log("✅ Agente selecionado:");
  console.log(`   Nome: ${data.name}`);
  console.log(`   ID: ${data.id}`);
  console.log(`   Modelo: ${data.gpt_model}`);
  console.log(`   Instruções: ${data.instructions.substring(0, 100)}...\n`);

  return data;
}

async function testDirectOpenAI(agentInstructions: string) {
  console.log(
    "🚀 Testando chamada direta ao OpenAI (simulando Assistente de Prompts)...\n"
  );

  const openaiKey = process.env.OPENAI_API_KEY;

  if (!openaiKey) {
    console.log("⚠️  OPENAI_API_KEY não definida. Use: $env:OPENAI_API_KEY='sua-chave'\n");
    return;
  }

  const testPrompt = `Melhore estas instruções de agente tornando-as mais persuasivas:

${agentInstructions.substring(0, 500)}`;

  const maxTokens = Math.ceil(testPrompt.length / 3) + 1500;

  console.log(`📝 Prompt: ${testPrompt.length} caracteres`);
  console.log(`📊 Max tokens estimado: ${maxTokens}\n`);

  const startTime = Date.now();

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-5.1",
        messages: [
          {
            role: "developer",
            content:
              "Você é um especialista em melhorar prompts de agentes de IA. Seja conciso e direto.",
          },
          {
            role: "user",
            content: testPrompt,
          },
        ],
        temperature: 0.7,
        max_completion_tokens: Math.min(maxTokens, 16000),
        reasoning_effort: "none",
      }),
    });

    const responseTime = Date.now() - startTime;

    if (!response.ok) {
      const errorData = await response.json();
      console.error(`❌ Erro OpenAI (${response.status}):`, errorData.error?.message);
      return;
    }

    const result = await response.json();

    console.log(
      `✅ Resposta recebida em ${responseTime}ms (${(responseTime / 1000).toFixed(2)}s)\n`
    );

    const responseContent = result.choices[0].message.content;
    console.log("📤 Resposta:");
    console.log(responseContent.substring(0, 400) + "...\n");

    if (result.usage) {
      console.log(`📊 Tokens reais usados:`);
      console.log(`   Prompt: ${result.usage.prompt_tokens}`);
      console.log(`   Completion: ${result.usage.completion_tokens}`);
      console.log(`   Total: ${result.usage.total_tokens}`);
      console.log(`   ⏱️  Tempo: ${(responseTime / 1000).toFixed(2)}s\n`);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error("❌ Erro ao chamar OpenAI:", error.message);
    } else {
      console.error("❌ Erro ao chamar OpenAI:", error);
    }
  }
}

async function main() {
  console.log("========================================");
  console.log("  TESTE RÁPIDO - ASSISTENTE DE PROMPTS");
  console.log("========================================\n");

  try {
    // 1. Buscar agente do Leandro
    const agent = await getAgentData();

    // 2. Checar se tem OPENAI_API_KEY
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      console.log("🔑 Para testar com OpenAI, defina a variável de ambiente:");
      console.log(
        "   PowerShell: $env:OPENAI_API_KEY='sua-chave-aqui'\n"
      );
      console.log("💡 Você pode criar uma chave em: https://platform.openai.com/api-keys\n");
      return;
    }

    // 3. Testar com instruções reais
    console.log("✨ Iniciando teste com instruções reais do agente...\n");
    await testDirectOpenAI(agent.instructions);

    console.log("\n========================================");
    console.log("  ✅ TESTE COMPLETO!");
    console.log("========================================");
  } catch (error) {
    console.error("❌ Erro fatal:", error);
    process.exit(1);
  }
}

main();
