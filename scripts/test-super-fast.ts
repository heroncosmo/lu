// Script super rápido para testar Assistente de Prompts
// Sem dependências do Supabase, apenas testa a chamada OpenAI

const openaiKey = process.env.OPENAI_API_KEY;

if (!openaiKey) {
  console.log("❌ OPENAI_API_KEY não definida!");
  console.log(
    "💡 Execute: $env:OPENAI_API_KEY='sua-chave'; npx tsx scripts/test-super-fast.ts\n"
  );
  process.exit(1);
}

// Prompts de teste em diferentes tamanhos
const testPrompts = [
  {
    name: "Pequeno (200 chars)",
    content: `Melhore este prompt para ser mais persuasivo:
"Você é um especialista em vendas. Ajude o cliente a entender os benefícios do produto."`,
  },
  {
    name: "Médio (500 chars)",
    content: `Melhore este prompt tornando-o mais efetivo:
"Você é um especialista em estratégia de vendas e relacionamento com clientes. 
Seu objetivo é ajudar vendedores a aumentar suas conversões através de técnicas 
de persuasão ética. Você conhece psicologia de vendas, rapport, e técnicas de comunicação. 
Sempre mantenha a ética e o respeito ao cliente. Dê sugestões práticas e testadas."`,
  },
  {
    name: "Grande (1500 chars)",
    content: `Melhore este prompt tornando-o mais detalhado e efetivo:
"Você é um especialista em estratégia de vendas, relacionamento com clientes e psicologia comportamental. 
Seu objetivo é ajudar vendedores a aumentar significativamente suas conversões através de técnicas de persuasão ética e comprovadas. 

CONHECIMENTOS:
- Psicologia de vendas: AIDA, SPIN selling, técnicas de fechamento
- Rapport: Espelhamento, sincronização, linguagem hipnótica
- Negociação: Objeção handling, win-win negotiation
- Comunicação: Linguagem de padrões, storytelling, framing
- Ética: Sempre respeitar o cliente, transparência, honestidade

INSTRUÇÕES:
1. Analise o contexto da venda e do cliente
2. Identifique possíveis objeções e prepare antídotos
3. Sugira uma sequência de passos com linguagem específica
4. Mantenha total ética e respeito ao cliente
5. Considere o timing e o canal de comunicação
6. Dê exemplos práticos de fala que o vendedor pode usar
7. Sempre explique o 'por quê' das suas sugestões

RESULTADO ESPERADO:
Sugestões claras, práticas e imediatamente aplicáveis. Sem jargão desnecessário."`,
  },
];

async function testPrompt(prompt: {
  name: string;
  content: string;
}): Promise<void> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`🧪 Teste: ${prompt.name}`);
  console.log(`📝 Tamanho: ${prompt.content.length} caracteres`);
  console.log(`${"=".repeat(60)}\n`);

  const maxTokens = Math.ceil(prompt.content.length / 3) + 1500;
  console.log(`📊 Tokens calculados: ${maxTokens}`);

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
              "Você é um especialista em melhorar prompts de agentes. Seja direto e conciso.",
          },
          {
            role: "user",
            content: prompt.content,
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
      console.error(`❌ Erro (${response.status}):`, errorData.error?.message);
      return;
    }

    const result = await response.json();
    const responseContent = result.choices[0].message.content;

    console.log(`✅ Resposta em ${(responseTime / 1000).toFixed(2)}s\n`);
    console.log(`📤 Melhoria sugerida:`);
    console.log(responseContent.substring(0, 500) + "...\n");

    if (result.usage) {
      console.log(`📊 Tokens reais:`);
      console.log(
        `   Input: ${result.usage.prompt_tokens} | Output: ${result.usage.completion_tokens} | Total: ${result.usage.total_tokens}`
      );
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error("❌ Erro:", error.message);
    } else {
      console.error("❌ Erro:", error);
    }
  }
}

async function main() {
  console.log("\n");
  console.log("╔════════════════════════════════════════════════════════╗");
  console.log("║  TESTE SUPER RÁPIDO - ASSISTENTE DE PROMPTS GPT-5.1   ║");
  console.log("╚════════════════════════════════════════════════════════╝");

  for (const test of testPrompts) {
    await testPrompt(test);
  }

  console.log("\n╔════════════════════════════════════════════════════════╗");
  console.log("║  ✅ TODOS OS TESTES COMPLETADOS                       ║");
  console.log("╚════════════════════════════════════════════════════════╝\n");
}

main().catch(console.error);
