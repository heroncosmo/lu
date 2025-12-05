// @ts-ignore
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    // Verificar autenticação
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { clients, productInfo, agentId } = body;

    if (!clients || !Array.isArray(clients) || clients.length === 0) {
      throw new Error("Lista de clientes é obrigatória");
    }

    if (!productInfo) {
      throw new Error("Informações do produto são obrigatórias");
    }

    // Buscar API key do agente (do banco, não do frontend)
    const { data: agent, error: agentError } = await supabaseClient
      .from("agents")
      .select("gpt_api_key, instructions")
      .eq("id", agentId)
      .single();

    if (agentError || !agent?.gpt_api_key) {
      // Fallback: buscar qualquer agente do usuário
      const { data: fallbackAgent } = await supabaseClient
        .from("agents")
        .select("gpt_api_key, instructions")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!fallbackAgent?.gpt_api_key) {
        throw new Error("Nenhum agente GPT configurado. Configure um agente primeiro.");
      }

      Object.assign(agent || {}, fallbackAgent);
    }

    console.log(`[INVENTORY-BROADCAST] Gerando ${clients.length} mensagens para user ${user.id}`);

    const results = [];

    for (const client of clients) {
      const systemPrompt = `Você é um especialista em vendas de mármore e granito.

CONTEXTO DO CLIENTE:
- Nome: ${client.nome}

PRODUTO DISPONÍVEL:
- Tipo: ${productInfo.type === 'chapa' ? 'Chapa' : 'Cavalete'}
- Material: ${productInfo.nome}
- Estoque: ${productInfo.estoque} m²
- Peças: ${productInfo.pecas}
- Preço: R$ ${productInfo.preco}/m²
${productInfo.lote ? `- Lote: ${productInfo.lote}` : ''}
${productInfo.bloco ? `- Bloco: ${productInfo.bloco}` : ''}

TAREFA:
Crie uma mensagem curta e amigável anunciando que temos este material em estoque.

REGRAS:
1. Use o nome do cliente ${client.nome}
2. Seja amigável e profissional
3. Mencione disponibilidade e qualidade
4. Inclua call-to-action claro
5. ESCREVA EM UM ÚNICO PARÁGRAFO (sem quebras de linha)
6. Máximo 3-4 frases
7. Use apenas 1 emoji no final`;

      try {
        const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${agent.gpt_api_key}`,
          },
          body: JSON.stringify({
            model: "gpt-4",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: `Gere a mensagem personalizada para ${client.nome}` },
            ],
            max_tokens: 200,
            temperature: 0.7,
          }),
        });

        if (!gptResponse.ok) {
          const errorData = await gptResponse.json();
          throw new Error(`GPT error: ${errorData.error?.message || gptResponse.status}`);
        }

        const gptData = await gptResponse.json();
        let message = gptData.choices[0].message.content.trim();

        // Remover aspas se GPT retornar com elas
        if (message.startsWith('"') && message.endsWith('"')) {
          message = message.slice(1, -1);
        }

        // Garantir um único parágrafo
        message = message.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();

        results.push({
          codigo: client.codigo,
          nome: client.nome,
          success: true,
          message,
        });

      } catch (gptError) {
        console.error(`Erro GPT para ${client.nome}:`, gptError);
        results.push({
          codigo: client.codigo,
          nome: client.nome,
          success: false,
          error: gptError.message,
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`[INVENTORY-BROADCAST] ${successCount}/${clients.length} mensagens geradas`);

    return new Response(JSON.stringify({ 
      success: true, 
      results,
      summary: {
        total: clients.length,
        success: successCount,
        failed: clients.length - successCount,
      }
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[INVENTORY-BROADCAST] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
