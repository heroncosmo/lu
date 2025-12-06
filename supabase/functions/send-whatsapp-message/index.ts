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

  try {
    console.log("=== INICIANDO FUNÇÃO SEND-WHATSAPP-MESSAGE (API OFICIAL) ===");
    
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const body = await req.json();
    console.log("Payload recebido:", body);
    const { agent_id, client_name, client_whatsapp_number, whatsapp_instance_id, user_id: providedUserId, campaign_id, message_type, triple_profile, contact_count, internal_system_call, client_notes } = body;
    console.log("Flag internal_system_call:", internal_system_call);
    console.log("Anotações do cliente:", client_notes || "(nenhuma)");
    
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

    let sessionData;

    if (existingSession) {
      // Reutilizar sessão existente, mas alinhar com o agente/modelo escolhido agora
      console.log(`✅ Sessão existente encontrada: ${existingSession.id}`);
      sessionData = existingSession;

      const sessionUpdates: Record<string, any> = {};

      if (existingSession.agent_id !== agent_id) {
        sessionUpdates.agent_id = agent_id;
      }

      if (existingSession.whatsapp_instance_id !== whatsapp_instance_id) {
        sessionUpdates.whatsapp_instance_id = whatsapp_instance_id;
      }

      if (campaign_id && existingSession.campaign_id !== campaign_id) {
        sessionUpdates.campaign_id = campaign_id;
      }

      // Atualizar anotações se foram fornecidas
      if (client_notes && client_notes.trim()) {
        sessionUpdates.client_notes = client_notes;
      }

      if (Object.keys(sessionUpdates).length > 0) {
        console.log("Atualizando sessão reutilizada com o novo agente/modelo selecionado...", sessionUpdates);
        const { data: updatedSession, error: updateError } = await supabaseClient
          .from("prospecting_sessions")
          .update(sessionUpdates)
          .eq("id", existingSession.id)
          .select()
          .single();

        if (updateError) {
          throw new Error(`Erro ao atualizar sessão existente: ${updateError.message}`);
        }

        sessionData = updatedSession;
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
          client_notes: client_notes || null,
          status: "started",
          ai_enabled: true
        })
        .select()
        .single();

      if (sessionError) {
        throw new Error("Erro ao criar sessão: " + sessionError.message);
      }
      sessionData = newSessionData;
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

    // Usar o modelo configurado; cair em fallback apenas se não existir
    const gptModel = agent.gpt_model ?? (() => {
      console.warn("Agente sem gpt_model definido, usando fallback gpt-4o");
      return "gpt-4o";
    })();
    console.log(`=== CONFIGURAÇÃO DO AGENTE (MENSAGEM INICIAL) ===`);
    console.log(`Modelo GPT: ${gptModel}`);
    console.log(`Instruções: ${agent.instructions}`);

    // === BUSCAR ANOTAÇÕES DO CLIENTE (se houver) ===
    let clientAnnotations = '';
    
    // Primeiro, verificar se foram enviadas anotações diretamente do formulário
    if (client_notes && client_notes.trim()) {
      clientAnnotations = '\n\n📝 ANOTAÇÕES DO CLIENTE (use estas informações para personalizar a conversa):\n' + client_notes.trim();
      console.log("Anotações do formulário incluídas no prompt:", client_notes);
    }
    
    // Depois, buscar anotações adicionais do banco se houver campaign_id
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

    // === CONFIGURAÇÃO DE MODELOS OPENAI (Junho 2025) ===
    // Baseado na documentação oficial: https://platform.openai.com/docs/guides/latest-model
    // 
    // GPT-5 Series (gpt-5.1, gpt-5, gpt-5-mini, gpt-5-nano, gpt-5-pro):
    //   - Usa role "developer" (não "system")
    //   - Usa max_completion_tokens (não max_tokens)
    //   - TODOS requerem reasoning_effort obrigatório
    //   - gpt-5.1: suporta "none", "low", "medium", "high" (default: none)
    //   - gpt-5, gpt-5-mini, gpt-5-nano: suporta "low", "medium", "high" (NÃO suporta "none"!)
    //   - gpt-5-pro: suporta "medium", "high" (default: high, mais inteligente)
    //   - NÃO suporta temperature (exceto gpt-5.1 com reasoning=none)
    //
    // GPT-4.1 Series (gpt-4.1, gpt-4.1-mini, gpt-4.1-nano):
    //   - Usa role "developer" 
    //   - Usa max_completion_tokens
    //   - NÃO usa reasoning_effort (não é modelo de raciocínio)
    //   - Suporta temperature
    //
    // O-series (o3, o3-mini, o4-mini):
    //   - Usa role "developer"
    //   - Usa max_completion_tokens + reasoning_effort
    //
    // Modelos legados (gpt-4o, gpt-4-turbo, etc):
    //   - Usa role "system"
    //   - Usa max_tokens + temperature
    
    const isGpt5Series = gptModel.startsWith('gpt-5');
    const isGpt51 = gptModel.startsWith('gpt-5.1');
    const isGpt5Pro = gptModel === 'gpt-5-pro';
    const isGpt41Series = gptModel.startsWith('gpt-4.1');
    const isOSeries = gptModel.startsWith('o3') || gptModel.startsWith('o4');
    const isNewModel = isGpt5Series || isGpt41Series || isOSeries;
    
    // Role: developer para modelos novos, system para legados
    const systemRole = isNewModel ? "developer" : "system";
    
    // Parâmetros de tokens
    const tokenParam = isNewModel ? { max_completion_tokens: 500 } : { max_tokens: 500 };
    
    // Parâmetros extras (reasoning_effort / temperature)
    let extraParams: Record<string, any> = {};
    
    if (isGpt5Series) {
      // Todos os modelos GPT-5 requerem reasoning_effort
      if (isGpt5Pro) {
        // gpt-5-pro: default é high, é o mais inteligente
        extraParams = { reasoning_effort: "medium" };
      } else if (isGpt51) {
        // gpt-5.1: suporta "none" para resposta rápida
        extraParams = { reasoning_effort: "none" };
      } else {
        // gpt-5, gpt-5-mini, gpt-5-nano: mínimo é "low", NÃO suporta "none"
        extraParams = { reasoning_effort: "low" };
      }
    } else if (isOSeries) {
      // O-series também precisa de reasoning_effort
      extraParams = { reasoning_effort: "low" };
    } else if (isGpt41Series) {
      // GPT-4.1 não é modelo de raciocínio, suporta temperature
      extraParams = { temperature: 0.8 };
    } else if (!isNewModel) {
      // Modelos legados (gpt-4o, gpt-4-turbo, etc)
      extraParams = { temperature: 0.8 };
    }
    
    console.log(`🧠 Modelo: ${gptModel} | isNewModel: ${isNewModel} | systemRole: ${systemRole} | extraParams:`, JSON.stringify(extraParams));
    
    // Chamada primária
    let openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${agent.gpt_api_key}`,
      },
      body: JSON.stringify({
        model: gptModel,
        messages: [
          { role: systemRole, content: systemPrompt },
          { role: "user", content: `Gere uma mensagem inicial de prospecção para ${client_name} seguindo todas as regras acima.` }
        ],
        ...tokenParam,
        ...extraParams,
      }),
    });

    // SEM FALLBACK - vamos mostrar o erro real da API
    if (!openaiResponse.ok) {
      let errorBody: any = null;
      try { errorBody = await openaiResponse.json(); } catch { errorBody = await openaiResponse.text(); }
      console.error("❌ Erro na API da OpenAI:", typeof errorBody === 'string' ? errorBody : JSON.stringify(errorBody, null, 2));
      console.error("❌ Status:", openaiResponse.status);
      console.error("❌ Modelo usado:", gptModel);
      console.error("❌ isNewModel:", isNewModel);
      const errorMessage = (errorBody as any)?.error?.message || JSON.stringify(errorBody);
      throw new Error(`Erro na API da OpenAI (${openaiResponse.status}): ${errorMessage}`);
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

    // === CORREÇÃO DA API ===
    // 1. URL Base e Endpoint Corretos
    const whatsappApiUrl = `https://api.w-api.app/v1/message/send-text?instanceId=${WHATSAPP_INSTANCE_ID}`;
    
    // 2. Payload Correto
    const formattedNumber = client_whatsapp_number.includes('@') ? client_whatsapp_number.replace('@c.us', '') : client_whatsapp_number;
    
    const requestBody = {
      phone: formattedNumber,
      message: initialMessage
      // Removido: delayMessage: 2 (para evitar duplicação de tempo)
    };

    // 3. Headers Corretos (Autenticação Bearer)
    const fetchOptions: RequestInit = {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
      },
      body: JSON.stringify(requestBody),
    };

    console.log(`Enviando mensagem para: ${whatsappApiUrl}`);
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
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ 
      error: errorMessage,
      errorType: error instanceof Error ? error.name : typeof error,
      stack: error instanceof Error ? error.stack : undefined
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});