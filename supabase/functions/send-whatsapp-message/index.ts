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
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
};

serve(async (req) => {
  // Handle OPTIONS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders, status: 200 });
  }

  // Declarar sessionData no escopo externo para acessar no catch
  let sessionData: any = null;
  let isNewSession = false;

  try {
    console.log("=== INICIANDO FUNÇÃO SEND-WHATSAPP-MESSAGE (API OFICIAL) ===");
    
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const body = await req.json();
    console.log("Payload recebido:", body);
    const { agent_id, client_name, client_whatsapp_number, whatsapp_instance_id, user_id: providedUserId, campaign_id, message_type, triple_profile, contact_count, internal_system_call } = body;
    console.log("Flag internal_system_call:", internal_system_call);
    
    // Verificar se é chamada interna (do cadence-scheduler) ou externa (do frontend)
    const authHeader = req.headers.get("Authorization") || '';
    const isInternalCall = internal_system_call === true || authHeader.includes(SUPABASE_SERVICE_ROLE_KEY!) || providedUserId;
    
    let userId: string;
    let supabaseClient;

    if (isInternalCall) {
      // Chamada interna do sistema (cadence-scheduler)
      console.log("Chamada interna detectada - usando service role");
      supabaseClient = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
      
      // Para chamadas internas, o user_id pode vir no body ou buscamos do agente
      if (providedUserId) {
        userId = providedUserId;
      } else {
        // Buscar user_id do agente
        const { data: agent } = await supabaseClient
          .from('agents')
          .select('user_id')
          .eq('id', agent_id)
          .single();
        userId = agent?.user_id;
      }
    } else {
      // Chamada externa do frontend - requer autenticação
      supabaseClient = createClient(
        SUPABASE_URL!,
        SUPABASE_ANON_KEY!,
        { global: { headers: { Authorization: authHeader } } }
      );

      const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
      if (authError || !user) {
        return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      userId = user.id;
    }

    if (!agent_id || !client_name || !client_whatsapp_number || !whatsapp_instance_id) {
      return new Response(JSON.stringify({ error: "Campos obrigatórios ausentes (agent_id, client_name, client_whatsapp_number, whatsapp_instance_id)" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // === BUSCAR INSTÂNCIA WHATSAPP SELECIONADA ===
    console.log("Buscando instância WhatsApp selecionada...");
    
    const { data: instanceData, error: instanceError } = await supabaseClient
      .from("whatsapp_instances")
      .select("instance_id, token, name, phone_number")
      .eq("id", whatsapp_instance_id)
      .eq("is_active", true)
      .single();

    if (instanceError || !instanceData) {
      throw new Error("Erro ao buscar instância WhatsApp: " + (instanceError?.message || "Instância não encontrada ou inativa"));
    }

    const WHATSAPP_TOKEN = instanceData.token;
    const WHATSAPP_INSTANCE_ID = instanceData.instance_id;
    
    console.log(`Usando instância: ${instanceData.name} (${instanceData.phone_number || 'sem número'})`);
    console.log(`Instance ID: ${WHATSAPP_INSTANCE_ID}`);

    // === VERIFICAR SE JÁ EXISTE SESSÃO ATIVA PARA ESTE NÚMERO ===
    console.log("Verificando se já existe sessão ativa para:", client_whatsapp_number);
    
    const { data: existingSession, error: existingSessionError } = await supabaseClient
      .from("prospecting_sessions")
      .select("*")
      .eq("client_whatsapp_number", client_whatsapp_number)
      .in("status", ["started", "active", "waiting_response"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingSession) {
      // Reutilizar sessão existente
      console.log(`✅ Sessão existente encontrada: ${existingSession.id}`);
      sessionData = existingSession;
      isNewSession = false;
      
      // Atualizar sessão com dados da campanha se necessário
      if (campaign_id && !existingSession.campaign_id) {
        await supabaseClient
          .from("prospecting_sessions")
          .update({ campaign_id, status: "active" })
          .eq("id", existingSession.id);
        sessionData.campaign_id = campaign_id;
      }
    } else {
      // Criar nova sessão
      console.log("🆕 Criando nova sessão...");
      const { data: newSessionData, error: sessionError } = await supabaseClient
        .from("prospecting_sessions")
        .insert({ 
          user_id: userId, 
          agent_id, 
          client_name, 
          client_whatsapp_number, 
          whatsapp_instance_id,
          campaign_id: campaign_id || null,
          status: "started",
          ai_enabled: true
        })
        .select()
        .single();

      if (sessionError) {
        throw new Error("Erro ao criar sessão: " + sessionError.message);
      }
      sessionData = newSessionData;
      isNewSession = true;
      console.log(`✅ Nova sessão criada: ${sessionData.id}`);
    }

    // === BUSCAR CONFIGURAÇÃO DO AGENTE ===
    console.log("Buscando configuração do agente...");
    
    const { data: agentData, error: agentError } = await supabaseClient
      .from("agents")
      .select("instructions, gpt_api_key, gpt_model")
      .eq("id", agent_id)
      .single();

    if (agentError || !agentData) {
      throw new Error("Erro ao buscar configuração do agente: " + (agentError?.message || "Agente não encontrado"));
    }

    const agent = agentData as any;
    if (!agent.instructions || !agent.gpt_api_key) {
      throw new Error("A configuração do agente está incompleta.");
    }

    // Usar o modelo configurado ou padrão GPT-4
    const gptModel = agent.gpt_model || "gpt-4";
    console.log(`=== CONFIGURAÇÃO DO AGENTE (MENSAGEM INICIAL) ===`);
    console.log(`Modelo GPT: ${gptModel}`);
    console.log(`Instruções: ${agent.instructions}`);

    // === BUSCAR ANOTAÇÕES DO CLIENTE (se houver) ===
    let clientAnnotations = '';
    if (campaign_id) {
      // Buscar anotações do cliente para personalização
      const { data: annotations } = await supabaseClient
        .from('client_annotations')
        .select('annotation_type, title, content')
        .eq('crm_contact_id', sessionData.crm_contact_id)
        .eq('is_active', true)
        .order('relevance_score', { ascending: false })
        .limit(5);

      if (annotations && annotations.length > 0) {
        clientAnnotations = '\n\nINFORMAÇÕES DO CLIENTE (use para personalizar):\n' + 
          annotations.map((a: any) => `- ${a.title}: ${a.content}`).join('\n');
      }
    }

    // === PERSONALIZAÇÃO POR ESTÁGIO DA CADÊNCIA ===
    let messageTypeContext = '';
    if (message_type) {
      const typeDescriptions: Record<string, string> = {
        'reinforcement': 'Esta é uma mensagem de REFORÇO (D1) - reafirme o valor inicial, seja breve',
        'value_content': 'Esta é uma mensagem de CONTEÚDO DE VALOR (D2) - compartilhe algo útil, uma dica ou insight',
        'clarification': 'Esta é uma mensagem de ESCLARECIMENTO (D3) - pergunte se ficou alguma dúvida ou se pode ajudar',
        'check_in': 'Esta é uma mensagem de CHECK-IN - mensagem amigável de acompanhamento',
        'follow_up': 'Esta é um FOLLOW-UP - continue a conversa naturalmente'
      };
      messageTypeContext = '\n\nTIPO DE MENSAGEM: ' + (typeDescriptions[message_type] || message_type);
    }

    // === CONTEXTO DO PERFIL TRIPLO ===
    let profileContext = '';
    if (triple_profile) {
      profileContext = `\n\nPERFIL DO CLIENTE:
- Perfil de Comunicação: ${triple_profile.communication_profile || 'não definido'}
- Perfil de Compra: ${triple_profile.purchase_profile || 'não definido'}  
- Histórico: ${triple_profile.history_summary || 'cliente novo'}`;
    }

    // === CONTEXTO DE CONTATOS ANTERIORES ===
    let contactContext = '';
    if (contact_count !== undefined) {
      if (contact_count === 0) {
        contactContext = '\n\nEste é o PRIMEIRO CONTATO com o cliente. Seja apresentativo mas não invasivo.';
      } else {
        contactContext = `\n\nJá foram feitos ${contact_count} contato(s) com este cliente. Continue a conversa naturalmente.`;
      }
    }

    // === GERAR MENSAGEM INICIAL USANDO O AGENTE ===
    console.log("Gerando mensagem personalizada usando o agente...");
    
    const systemPrompt = `Você é um agente de prospecção de vendas com as seguintes características e instruções:

${agent.instructions}

CONTEXTO ATUAL:
- Cliente: ${client_name}
- WhatsApp: ${client_whatsapp_number}${contactContext}${messageTypeContext}${profileContext}${clientAnnotations}

REGRAS IMPORTANTES:
1. Seja amigável, profissional e persuasivo
2. PERSONALIZE a mensagem para o cliente ${client_name} - USE O NOME DELE!
3. Não use saudações genéricas como "Olá, tudo bem?" ou "Como vai?"
4. Seja criativo e mostre que você conhece o cliente
5. Seja breve e direto ao ponto (máximo 2-3 frases)
6. Mantenha o tom de conversa, não de discurso
7. Use linguagem coloquial e natural
8. SIGA EXATAMENTE AS INSTRUÇÕES DO AGENTE ACIMA

FORMATO DA MENSAGEM:
- Escreva TUDO EM UM ÚNICO PARÁGRAFO
- NÃO USE QUEBRAS DE LINHA
- Use apenas espaços simples entre as frases
- Pareça uma mensagem de WhatsApp real e natural

IMPORTANTE: Sua personalidade e forma de falar devem seguir EXATAMENTE as instruções do agente fornecidas acima.

Exemplo de formato:
Oi ${client_name}! Vi seu perfil e achei interessante seu trabalho. Gostaria de saber se você tem interesse em uma solução que pode ajudar a otimizar seus resultados. Podemos conversar 5 minutos sobre isso?`;

    // GPT-5.x, GPT-4.1 e o-series usam max_completion_tokens, modelos antigos usam max_tokens
    const isNewModel = gptModel.startsWith('gpt-5') || gptModel.startsWith('gpt-4.1') || gptModel.startsWith('o3') || gptModel.startsWith('o4');
    const tokenParam = isNewModel ? { max_completion_tokens: 200 } : { max_tokens: 200 };
    // GPT-5 e o-series não suportam temperature diferente de 1
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
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Gere uma mensagem inicial de prospecção para ${client_name} seguindo todas as regras acima.` }
        ],
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
    let initialMessage = responseJson.choices[0].message.content.trim();
    
    console.log("=== MENSAGEM INICIAL GERADA ===");
    console.log("Mensagem bruta:", JSON.stringify(initialMessage));
    
    // REMOVER ASPAS DUPLAS DO INÍCIO E FIM SE EXISTIREM
    // Verificar se a mensagem começa e termina com aspas duplas
    if (initialMessage.startsWith('"') && initialMessage.endsWith('"')) {
      console.log("Removendo aspas duplas do início e fim da mensagem");
      initialMessage = initialMessage.slice(1, -1);
    }
    
    console.log("=== MENSAGEM APÓS REMOÇÃO DE ASPAS ===");
    console.log(initialMessage);

    // === FORMATAÇÃO HUMANA DA MENSAGEM (CORRIGIDA PARA UM ÚNICO PARÁGRAFO) ===
    // Remover todas as quebras de linha e substituir por espaços simples
    initialMessage = initialMessage
      .replace(/\n+/g, ' ') // Substituir todas as quebras de linha por espaços
      .replace(/\s+/g, ' ') // Substituir múltiplos espaços por um único espaço
      .replace(/^\s+|\s+$/g, '') // Trim
      .replace(/\.\s+/g, '. ') // Garantir espaço após pontos
      .replace(/\?\s+/g, '? ') // Garantir espaço após pontos de interrogação
      .replace(/\!\s+/g, '! '); // Garantir espaço após pontos de exclamação

    console.log("=== MENSAGEM FORMATADA (ÚNICO PARÁGRAFO) ===");
    console.log(initialMessage);

    // === CORREÇÃO DA API W-API (formato original que funcionava) ===
    // URL: https://api.w-api.app/v1/message/send-text?instanceId=X
    // Body: { phone, message, delayMessage }
    // Autenticação: Bearer token no header
    const whatsappApiUrl = `https://api.w-api.app/v1/message/send-text?instanceId=${WHATSAPP_INSTANCE_ID}`;
    
    // Formatar número (remover @c.us se existir)
    const formattedNumber = client_whatsapp_number.includes('@') 
      ? client_whatsapp_number.replace('@c.us', '') 
      : client_whatsapp_number;
    
    const requestBody = {
      phone: formattedNumber,
      message: initialMessage,
      delayMessage: 2
    };

    const fetchOptions: RequestInit = {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
      },
      body: JSON.stringify(requestBody),
    };

    console.log(`Enviando mensagem para: ${whatsappApiUrl}`);
    console.log("Instance ID:", WHATSAPP_INSTANCE_ID);
    console.log("Token (primeiros 10 chars):", WHATSAPP_TOKEN.substring(0, 10));
    console.log("Corpo da requisição:", requestBody);

    const response = await fetch(whatsappApiUrl, fetchOptions);
    const responseBodyText = await response.text();
    console.log(`Resposta da API do WhatsApp (Status: ${response.status}):`, responseBodyText);

    if (!response.ok) {
      await supabaseClient.from("prospecting_sessions").update({ status: "failed" }).eq("id", sessionData.id);
      
      // === RASTREAR FALHA DE WHATSAPP ===
      // Buscar participant_id se disponível
      const { data: sessionInfo } = await supabaseClient
        .from("prospecting_sessions")
        .select("id")
        .eq("id", sessionData.id)
        .single();

      if (sessionInfo) {
        // Incrementar contador de falhas
        const { data: participant } = await supabaseClient
          .from("campaign_participants")
          .select("id, whatsapp_failure_count, cliente_email")
          .eq("cliente_whatsapp", client_whatsapp_number)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (participant) {
          const newFailureCount = (participant.whatsapp_failure_count || 0) + 1;
          
          await supabaseClient
            .from("campaign_participants")
            .update({
              whatsapp_failure_count: newFailureCount,
              last_whatsapp_failure_at: new Date().toISOString(),
            })
            .eq("id", participant.id);

          console.log(`⚠️ WhatsApp falhou ${newFailureCount} vezes para ${client_whatsapp_number}`);

          // === ACIONAR EMAIL FALLBACK APÓS 3 FALHAS ===
          if (newFailureCount >= 3 && participant.cliente_email) {
            console.log(`📧 Acionando email fallback após 3 falhas para ${participant.cliente_email}`);
            
            try {
              const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
              
              await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": req.headers.get("Authorization")!,
                },
                body: JSON.stringify({
                  participant_id: participant.id,
                  to_email: participant.cliente_email,
                  to_name: client_name,
                  subject: "Mensagem importante",
                  message_content: initialMessage,
                  trigger_reason: "whatsapp_failure_fallback",
                }),
              });

              console.log("✅ Email fallback enviado");
            } catch (emailError) {
              console.error("❌ Erro ao enviar email fallback:", emailError);
            }
          }
        }
      }
      
      throw new Error(`Falha na API do WhatsApp: ${response.status} - ${responseBodyText}`);
    }

    // === RESETAR CONTADOR DE FALHAS EM CASO DE SUCESSO ===
    const { data: participant } = await supabaseClient
      .from("campaign_participants")
      .select("id, whatsapp_failure_count")
      .eq("cliente_whatsapp", client_whatsapp_number)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (participant && participant.whatsapp_failure_count > 0) {
      await supabaseClient
        .from("campaign_participants")
        .update({ whatsapp_failure_count: 0 })
        .eq("id", participant.id);
      
      console.log(`✅ Contador de falhas resetado para ${client_whatsapp_number}`);
    }

    const messageTimestamp = new Date().toISOString();

    await supabaseClient.from("whatsapp_messages").insert({ 
      session_id: sessionData.id, 
      sender: "agent", 
      message_content: initialMessage,
      whatsapp_instance_id,
      timestamp: messageTimestamp,
    });
    await supabaseClient
      .from("prospecting_sessions")
      .update({
        status: "active",
        last_message_at: messageTimestamp,
      })
      .eq("id", sessionData.id);

    return new Response(JSON.stringify({ 
      success: true, 
      sessionId: sessionData.id, 
      initialMessage: initialMessage,
      gptModel: gptModel,
      whatsappResponse: JSON.parse(responseBodyText) 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
        
  } catch (error) {
    console.error("=== ERRO NÃO TRATADO ===:", error);
    
    // Se uma NOVA sessão foi criada durante esta execução e houve erro,
    // deletar a sessão para não deixar sessões órfãs
    if (isNewSession && sessionData?.id) {
      try {
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        const cleanupClient = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
        
        // Deletar a sessão que foi criada mas falhou
        await cleanupClient.from("prospecting_sessions").delete().eq("id", sessionData.id);
        console.log(`🗑️ Sessão ${sessionData.id} deletada após erro`);
      } catch (cleanupError) {
        console.error("Erro ao limpar sessão órfã:", cleanupError);
      }
    }
    
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});