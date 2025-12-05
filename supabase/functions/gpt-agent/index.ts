// @ts-ignore
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

// Declaração inline do namespace Deno para resolver erros de compilação
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// Função para simular delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("=== INICIANDO FUNÇÃO GPT-AGENT ===");
    
    const { session_id } = await req.json();
    console.log("Session ID recebido:", session_id);
    
    if (!session_id) {
      throw new Error("session_id is required");
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Buscar dados completos da sessão com informações do cliente e configurações de delay
    console.log("Buscando dados da sessão...");
    const { data: sessionData, error: sessionError } = await supabaseAdmin
      .from("prospecting_sessions")
      .select(`
        id,
        client_name,
        client_whatsapp_number,
        status,
        agents (
          instructions,
          gpt_api_key,
          gpt_model,
          response_delay_seconds,
          word_delay_seconds
        )
      `)
      .eq("id", session_id)
      .single();

    if (sessionError || !sessionData) {
      console.error("Erro ao buscar sessão:", sessionError);
      throw new Error(`Sessão não encontrada: ${sessionError?.message}`);
    }

    console.log("Dados da sessão:", JSON.stringify(sessionData, null, 2));

    const agent = sessionData.agents as any;
    if (!agent || !agent.instructions || !agent.gpt_api_key) {
      console.error("Configuração do agente incompleta:", agent);
      throw new Error("A configuração do agente está incompleta.");
    }

    // Usar o modelo configurado ou padrão GPT-4
    const gptModel = agent.gpt_model || "gpt-4";
    const responseDelay = agent.response_delay_seconds || 30;
    const wordDelay = agent.word_delay_seconds || 1.6;
    
    console.log("=== CONFIGURAÇÃO DO AGENTE ===");
    console.log("Modelo GPT:", gptModel);
    console.log("Instruções:", agent.instructions);
    console.log("Delay de resposta (leitura):", responseDelay, "segundos");
    console.log("Delay por palavra (digitação):", wordDelay, "segundos");

    // Buscar histórico completo da conversa
    console.log("Buscando histórico de mensagens...");
    const { data: messages, error: messagesError } = await supabaseAdmin
      .from("whatsapp_messages")
      .select("sender, message_content, timestamp")
      .eq("session_id", session_id)
      .order("timestamp", { ascending: true });

    if (messagesError) {
      console.error("Erro ao buscar mensagens:", messagesError);
      throw new Error(`Falha ao buscar mensagens: ${messagesError.message}`);
    }

    console.log("=== HISTÓRICO DE MENSAGENS ===");
    console.log("Número de mensagens:", messages?.length || 0);
    console.log("Mensagens:", JSON.stringify(messages, null, 2));

    // === BUSCAR ANOTAÇÕES DO CLIENTE PARA CONTEXTO DA IA ===
    // Primeiro buscar o crm_contact para obter o crm_client_code
    let clientAnnotationsContext = "";
    const { data: crmContact } = await supabaseAdmin
      .from("crm_contacts")
      .select("id, crm_client_code, notes, segment, kanban_status")
      .eq("name", sessionData.client_name)
      .single();

    if (crmContact?.crm_client_code) {
      // Buscar anotações da IA sobre este cliente
      const { data: annotations } = await supabaseAdmin
        .from("client_annotations")
        .select("annotation_type, content, importance, created_at")
        .eq("crm_client_code", crmContact.crm_client_code)
        .eq("is_active", true)
        .order("importance", { ascending: false })
        .limit(10);

      if (annotations && annotations.length > 0) {
        console.log("=== ANOTAÇÕES DO CLIENTE ENCONTRADAS ===");
        console.log("Número de anotações:", annotations.length);
        
        clientAnnotationsContext = `

ANOTAÇÕES IMPORTANTES SOBRE O CLIENTE:
${annotations.map(a => `- [${a.annotation_type.toUpperCase()}] ${a.content}`).join('\n')}

USE ESTAS INFORMAÇÕES PARA PERSONALIZAR A CONVERSA. Por exemplo:
- Se o cliente é "calmo", use tom mais sereno
- Se há preferências de horário, respeite
- Se há contexto sobre saúde/família, demonstre empatia
- Se há histórico de negociação, lembre-se das condições`;
      }

      // Incluir notas gerais do CRM se existirem
      if (crmContact.notes) {
        clientAnnotationsContext += `

NOTAS DO CRM SOBRE O CLIENTE:
${crmContact.notes}`;
      }
    }

    // Construir o contexto da conversa com as instruções do agente
    const systemPrompt = `Você é um agente de prospecção de vendas com as seguintes características e instruções:

${agent.instructions}

CONTEXTO ATUAL:
- Cliente: ${sessionData.client_name}
- WhatsApp: ${sessionData.client_whatsapp_number}
- Status da conversa: ${sessionData.status}
${clientAnnotationsContext}

REGRAS IMPORTANTES PARA RESPOSTAS:
1. Seja sempre amigável, profissional e persuasivo
2. Personalize todas as mensagens para o cliente ${sessionData.client_name}
3. Seja breve e direto ao ponto
4. Mantenha o tom de conversa, não de discurso
5. Responda diretamente ao que o cliente disse
6. Não repita informações já mencionadas
7. Use linguagem coloquial e natural
8. SIGA EXATAMENTE AS INSTRUÇÕES DO AGENTE ACIMA

FORMATO DAS RESPOSTAS:
- Escreva TUDO EM UM ÚNICO PARÁGRAFO
- NÃO USE QUEBRAS DE LINHA
- Use apenas espaços simples entre as frases
- Pareça uma mensagem de WhatsApp real e natural
- Máximo 2-3 frases por resposta para não ficar muito longo

IMPORTANTE: Sua personalidade e forma de falar devem seguir EXATAMENTE as instruções do agente fornecidas acima.

Exemplo de formato correto:
Que bom ouvir isso, Rodrigo! Tudo tranquilo por aqui também, graças a Deus. Como estão as coisas por aí? Muita porreria ou tá de boa?`;

    // Construir o histórico da conversa para o GPT
    const formattedMessages: OpenAIMessage[] = [
      { role: "system", content: systemPrompt },
      ...messages.map((msg: any) => ({
        role: msg.sender === "agent" ? "assistant" : "user",
        content: msg.message_content,
      })),
    ];

    console.log("=== MENSAGENS FORMATADAS PARA O GPT ===");
    console.log("Número de mensagens formatadas:", formattedMessages.length);
    console.log("Última mensagem do usuário:", formattedMessages[formattedMessages.length - 1]?.content);

    // Simular tempo de leitura antes de gerar resposta
    console.log(`=== SIMULANDO TEMPO DE LEITURA ===`);
    console.log(`Aguardando ${responseDelay}s (tempo de leitura)...`);
    await delay(responseDelay * 1000);

    console.log("=== CHAMANDO API DA OPENAI ===");
    
    // GPT-5.x, GPT-4.1 e O-series usam max_completion_tokens, outros usam max_tokens
    // Aumentado para 1000 tokens para permitir respostas completas do agente
    const isNewModel = gptModel.startsWith('gpt-5') || gptModel.startsWith('gpt-4.1') || gptModel.startsWith('o3') || gptModel.startsWith('o4');
    const tokenParam = isNewModel ? { max_completion_tokens: 1000 } : { max_tokens: 1000 };
    
    // GPT-5 e O-series não suportam temperature diferente de 1
    const temperatureParam = isNewModel ? {} : { temperature: 0.8 };
    
    console.log(`=== PARÂMETROS DA API OPENAI ===`);
    console.log(`Modelo: ${gptModel}, isNewModel: ${isNewModel}`);
    console.log(`Token param:`, tokenParam);
    
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${agent.gpt_api_key}`,
      },
      body: JSON.stringify({
        model: gptModel,
        messages: formattedMessages,
        ...temperatureParam,
        ...tokenParam,
      }),
    });

    if (!openaiResponse.ok) {
      const errorBody = await openaiResponse.json();
      console.error("Erro na API da OpenAI:", errorBody);
      throw new Error(`Erro na API da OpenAI: ${errorBody.error.message}`);
    }

    const responseJson = await openaiResponse.json();
    let gptMessage = responseJson.choices[0].message.content.trim();
    
    console.log("=== RESPOSTA BRUTA DO GPT ===");
    console.log("Resposta completa:", JSON.stringify(gptMessage));
    
    // REMOVER ASPAS DUPLAS DO INÍCIO E FIM SE EXISTIREM
    // Verificar se a mensagem começa e termina com aspas duplas
    if (gptMessage.startsWith('"') && gptMessage.endsWith('"')) {
      console.log("Removendo aspas duplas do início e fim da mensagem");
      gptMessage = gptMessage.slice(1, -1);
    }
    
    console.log("=== MENSAGEM APÓS REMOÇÃO DE ASPAS ===");
    console.log(gptMessage);

    // === FORMATAÇÃO HUMANA DA MENSAGEM (CORRIGIDA PARA UM ÚNICO PARÁGRAFO) ===
    // Remover todas as quebras de linha e substituir por espaços simples
    gptMessage = gptMessage
      .replace(/\n+/g, ' ') // Substituir todas as quebras de linha por espaços
      .replace(/\s+/g, ' ') // Substituir múltiplos espaços por um único espaço
      .replace(/^\s+|\s+$/g, '') // Trim
      .replace(/\.\s+/g, '. ') // Garantir espaço após pontos
      .replace(/\?\s+/g, '? ') // Garantir espaço após pontos de interrogação
      .replace(/\!\s+/g, '! '); // Garantir espaço após pontos de exclamação

    console.log("=== MENSAGEM FORMATADA (ÚNICO PARÁGRAFO) ===");
    console.log("Mensagem final:", gptMessage);

    // === CÁLCULO DETALHADO DO TEMPO ===
    const wordCount = gptMessage.split(/\s+/).length;
    const typingDelay = wordCount * wordDelay * 1000;
    const totalDelay = responseDelay + (wordCount * wordDelay);
    
    console.log("=== CÁLCULO DE TEMPO DETALHADO ===");
    console.log("Mensagem final:", `"${gptMessage}"`);
    console.log("Número de palavras:", wordCount);
    console.log("Delay de resposta (leitura):", responseDelay, "segundos");
    console.log("Delay por palavra (digitação):", wordDelay, "segundos");
    console.log("Tempo de digitação:", wordCount * wordDelay, "segundos");
    console.log("Tempo total:", totalDelay, "segundos");
    console.log("Tempo total em ms:", totalDelay * 1000, "ms");

    // Simular tempo de digitação (delay por palavra)
    console.log(`=== SIMULANDO TEMPO DE DIGITAÇÃO ===`);
    console.log(`Simulando digitação de ${wordCount} palavras (${typingDelay}ms)...`);
    await delay(typingDelay);

    // === EXTRAÇÃO AUTOMÁTICA DE ANOTAÇÕES ===
    // Analisar a conversa para extrair insights sobre o cliente
    if (crmContact?.crm_client_code && messages && messages.length > 0) {
      try {
        console.log("=== ANALISANDO CONVERSA PARA EXTRAIR INSIGHTS ===");
        
        // Montar histórico para análise
        const conversationHistory = messages.map((m: any) => 
          `${m.sender === 'agent' ? 'Agente' : 'Cliente'}: ${m.message_content}`
        ).join('\n');
        
        const analysisPrompt = `Analise esta conversa de vendas e extraia APENAS insights RELEVANTES e NOVOS sobre o cliente.
Retorne um JSON com array "insights" contendo objetos com:
- "type": um de ["mood", "availability", "preference", "relationship", "context", "health", "business"]
- "content": texto descritivo breve (máximo 100 caracteres)
- "importance": número de 1 a 10 (10 = muito importante)

REGRAS:
1. Extraia APENAS informações que o CLIENTE revelou (não o agente)
2. Ignore saudações comuns e respostas genéricas
3. Foque em: humor, disponibilidade, preferências, problemas de saúde, situação familiar, interesse de negócio
4. Se não houver insights relevantes, retorne {"insights": []}
5. Máximo 3 insights por análise

CONVERSA:
${conversationHistory}

ÚLTIMA MENSAGEM DO CLIENTE: ${messages[messages.length - 1]?.message_content || 'N/A'}

Retorne APENAS o JSON, sem explicações.`;

        const analysisResponse = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${agent.gpt_api_key}`,
          },
          body: JSON.stringify({
            model: "gpt-3.5-turbo", // Usar modelo mais barato para análise
            messages: [{ role: "user", content: analysisPrompt }],
            max_tokens: 300,
            temperature: 0.3,
          }),
        });

        if (analysisResponse.ok) {
          const analysisJson = await analysisResponse.json();
          let analysisText = analysisJson.choices[0].message.content.trim();
          
          // Limpar markdown se existir
          analysisText = analysisText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
          
          try {
            const insights = JSON.parse(analysisText);
            console.log("Insights extraídos:", JSON.stringify(insights, null, 2));
            
            if (insights.insights && insights.insights.length > 0) {
              for (const insight of insights.insights) {
                // Salvar cada insight como anotação
                const { error: annotationError } = await supabaseAdmin.rpc('add_ai_annotation', {
                  p_crm_client_code: crmContact.crm_client_code,
                  p_annotation_type: insight.type,
                  p_title: insight.type.toUpperCase(),
                  p_content: insight.content,
                  p_relevance: insight.importance,
                  p_is_temporary: false,
                  p_expires_at: null,
                  p_source_message_id: null
                });
                
                if (annotationError) {
                  console.error("Erro ao salvar anotação:", annotationError);
                } else {
                  console.log(`✅ Anotação salva: [${insight.type}] ${insight.content}`);
                }
              }
            }
          } catch (parseError) {
            console.log("Não foi possível parsear insights (OK se não houver):", analysisText);
          }
        }
      } catch (analysisError) {
        // Não falhar a resposta principal por causa da análise
        console.log("Erro na análise de insights (não crítico):", analysisError);
      }
    }

    console.log("=== RETORNANDO RESPOSTA FINAL ===");
    const responseData = {
      reply: gptMessage, 
      gptModel,
      delays: {
        responseDelay,
        wordDelay,
        wordCount,
        totalDelay: totalDelay
      }
    };
    
    console.log("Dados de retorno:", JSON.stringify(responseData, null, 2));

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("=== ERRO NÃO TRATADO ===:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});