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
  "Access-Control-Allow-Headers": "content-type, authorization, x-client-info, apikey",
};

// Buscar instância do banco de dados baseado no instance_id do webhook ou número de destino
async function getWhatsAppInstance(supabaseAdmin: any, instanceIdFromWebhook?: string, phoneNumber?: string) {
  // Primeiro: tentar buscar por instance_id se fornecido no webhook
  if (instanceIdFromWebhook) {
    const { data: instanceById, error } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("id, instance_id, token, name, phone_number, is_active")
      .eq("instance_id", instanceIdFromWebhook)
      .eq("is_active", true)
      .single();

    if (!error && instanceById) {
      console.log(`✅ Instância encontrada por instance_id: ${instanceById.name}`);
      return instanceById;
    }
  }

  // Segundo: tentar buscar por número de telefone de destino
  if (phoneNumber) {
    const normalizedPhone = phoneNumber.replace(/[^\d]/g, '');
    const { data: instanceByPhone } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("id, instance_id, token, name, phone_number, is_active")
      .eq("is_active", true)
      .or(`phone_number.ilike.%${normalizedPhone.slice(-10)}%,phone_number.ilike.%${normalizedPhone}%`);

    if (instanceByPhone && instanceByPhone.length > 0) {
      console.log(`✅ Instância encontrada por phone_number: ${instanceByPhone[0].name}`);
      return instanceByPhone[0];
    }
  }

  console.error("❌ Nenhuma instância WhatsApp ativa encontrada para o payload", {
    instanceIdFromWebhook,
    phoneNumber,
  });
  return null;
}

async function sendWhatsAppMessage(to: string, message: string, instance: { instance_id: string; token: string; name?: string }) {
  if (!instance?.instance_id || !instance?.token) {
    throw new Error("Credenciais do WhatsApp não configuradas.");
  }

  console.log(`Enviando mensagem para ${to} via instância ${instance.name || instance.instance_id}`);
  
  const response = await fetch(`https://api.w-api.app/v1/message/send-text?instanceId=${instance.instance_id}`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${instance.token}`
    },
    body: JSON.stringify({
      phone: to,
      message: message
    }),
  });

  console.log(`Resposta da API do WhatsApp: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("Erro detalhado da API do WhatsApp:", errorBody);
    throw new Error(`Falha ao enviar mensagem do WhatsApp: ${errorBody}`);
  }

  const responseData = await response.json();
  console.log("Mensagem enviada com sucesso:", responseData);
  return responseData;
}

serve(async (req) => {
  console.log("=== INICIANDO FUNÇÃO RECEIVE-WHATSAPP-MESSAGE ===");
  console.log("Método:", req.method);
  console.log("Headers:", Object.fromEntries(req.headers.entries()));
  
  if (req.method === "OPTIONS") {
    console.log("Requisição OPTIONS - retornando OK");
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Log do corpo da requisição
    const payload = await req.json();
    console.log("=== PAYLOAD RECEBIDO ===");
    console.log("Payload completo:", JSON.stringify(payload, null, 2));

    // Verificar se é um evento de webhookReceived
    if (payload.event !== "webhookReceived") {
      console.log("Evento não é webhookReceived, ignorando:", payload.event);
      return new Response("Evento ignorado", { status: 200 });
    }

    // Extrair dados do payload conforme documentação da W-API
    const clientNumber = payload.chat?.id;
    // Extrair instance_id do webhook para multi-instance support
    const instanceIdFromWebhook = payload.instanceId || payload.instance_id || payload.data?.instanceId;
    const destPhoneNumber = payload.to || payload.destPhone; // número de destino se disponível
    
    let clientMessage = "";
    let messageType = "text"; // Tipo padrão

    // Extrair mensagem conforme o tipo
    if (payload.msgContent?.conversation) {
      // Mensagem de texto simples
      clientMessage = payload.msgContent.conversation;
      messageType = "text";
    } else if (payload.msgContent?.extendedTextMessage?.text) {
      // Mensagem de texto estendida
      clientMessage = payload.msgContent.extendedTextMessage.text;
      messageType = "text";
    } else if (payload.msgContent?.imageMessage?.caption) {
      // Imagem com legenda
      clientMessage = payload.msgContent.imageMessage.caption;
      messageType = "image";
    } else if (payload.msgContent?.imageMessage) {
      // Imagem sem legenda
      clientMessage = "[Imagem recebida]";
      messageType = "image";
    } else if (payload.msgContent?.audioMessage) {
      // Mensagem de áudio
      clientMessage = "[Áudio recebido]";
      messageType = "audio";
    } else {
      console.log("Tipo de mensagem não suportado:", payload.msgContent);
      clientMessage = "[Mensagem não suportada]";
      messageType = "unsupported";
    }

    console.log("=== DADOS EXTRAÍDOS DO PAYLOAD ===");
    console.log("Número do cliente:", clientNumber);
    console.log("Mensagem do cliente:", clientMessage);
    console.log("Tipo de mensagem:", messageType);

    if (!clientNumber || !clientMessage) {
      console.error("Payload do webhook inválido. Campos ausentes:", { clientNumber, clientMessage });
      throw new Error("Payload do webhook inválido.");
    }

    // Buscar sessão ativa para este número
    console.log("=== BUSCANDO SESSÃO ATIVA ===");
    console.log("Buscando sessão para o número:", clientNumber);
    const { data: session, error: sessionError } = await supabaseAdmin
      .from("prospecting_sessions")
      .select("id, user_id, ai_enabled")
      .eq("client_whatsapp_number", clientNumber)
      .in("status", ["started", "active"])
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (sessionError || !session) {
      console.warn(`Nenhuma sessão ativa encontrada para o número: ${clientNumber}`);
      return new Response("Nenhuma sessão ativa encontrada.", { status: 200 });
    }

    console.log("=== SESSÃO ENCONTRADA ===");
    console.log("ID da sessão:", session.id);
    console.log("User ID:", session.user_id);

    // Inserir mensagem do cliente no banco
    console.log("=== INSERINDO MENSAGEM DO CLIENTE ===");
    const { data: insertedClientMessage, error: insertError } = await supabaseAdmin
      .from("whatsapp_messages")
      .insert({ session_id: session.id, sender: "client", message_content: clientMessage })
      .select()
      .single();

    if (insertError) {
      console.error("Erro ao inserir mensagem do cliente:", insertError);
      throw new Error("Erro ao salvar mensagem do cliente.");
    }

    console.log("=== MENSAGEM DO CLIENTE INSERIDA ===");
    console.log("Dados da mensagem:", JSON.stringify(insertedClientMessage, null, 2));

    // === VERIFICAR SE IA ESTÁ HABILITADA ===
    if (session.ai_enabled === false) {
      console.log("⚠️ IA desabilitada para esta sessão. Mensagem salva, mas sem resposta automática.");
      return new Response(JSON.stringify({ 
        success: true, 
        message: "Mensagem recebida (IA desabilitada)",
        ai_enabled: false 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
      });
    }

    // === GPT-POWERED ANALYSIS: INTENT, LANGUAGE & TEMPERATURE ===
    console.log("=== GPT ANALYZING: INTENT, LANGUAGE, TEMPERATURE ===");
    try {
      // Fetch campaign_id from session (if linked to campaign)
      const { data: sessionData } = await supabaseAdmin
        .from('prospecting_sessions')
        .select('id, agent_id, whatsapp_instance_id')
        .eq('id', session.id)
        .single();

      // Try to find campaign_participant by phone number
      const normalizedPhone = clientNumber.replace(/[^\d]/g, '');
      const { data: participant } = await supabaseAdmin
        .from('campaign_participants')
        .select('id, campaign_id, temperature, contact_count, crm_client_code, language')
        .ilike('client_whatsapp', `%${normalizedPhone.slice(-10)}%`)
        .single();

      if (participant) {
        console.log(`Found participant: campaign_id=${participant.campaign_id}`);

        // Get GPT API key from agent
        const { data: agent } = await supabaseAdmin
          .from('agents')
          .select('gpt_api_key')
          .eq('id', sessionData.agent_id)
          .single();

        if (agent?.gpt_api_key) {
          // === 1. DETECT LANGUAGE VIA GPT ===
          console.log("🌍 Detecting language via GPT...");
          const languagePrompt = `Detecte o idioma da seguinte mensagem e responda APENAS com o código ISO 639-1 (2 letras):

Mensagem: "${clientMessage}"

Responda SOMENTE com: pt, en, es ou ar`;

          const languageResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${agent.gpt_api_key}`,
            },
            body: JSON.stringify({
              model: 'gpt-4',
              messages: [{ role: 'user', content: languagePrompt }],
              max_tokens: 5,
              temperature: 0.1,
            }),
          });

          const languageData = await languageResponse.json();
          const detectedLanguage = languageData.choices[0]?.message?.content?.trim().toLowerCase() || 'pt';
          console.log(`Detected language: ${detectedLanguage}`);

          // Update language if different
          if (participant.language !== detectedLanguage) {
            await supabaseAdmin
              .from('campaign_participants')
              .update({ language: detectedLanguage })
              .eq('id', participant.id);
            
            // Also update client_profiles if exists
            if (participant.crm_client_code) {
              await supabaseAdmin
                .from('client_profiles')
                .upsert({
                  crm_client_code: participant.crm_client_code,
                  client_name: participant.client_name || 'Cliente',
                  preferred_language: detectedLanguage,
                  updated_at: new Date().toISOString(),
                });
            }
            
            console.log(`Language updated: ${participant.language} → ${detectedLanguage}`);
          }

          // === 2. ANALYZE INTENT VIA GPT ===
          console.log("🎯 Analyzing intent via GPT...");
          const intentPrompt = `Analise a seguinte mensagem do cliente e classifique a intenção com base no interesse comercial:

Mensagem: "${clientMessage}"

Classificações:
- "oferta": Cliente solicita proposta/orçamento/preço formal (palavras-chave: orçamento, proposta, preço, quanto custa, me manda)
- "quente": Cliente interessado, faz perguntas detalhadas, quer mais informações técnicas
- "morno": Cliente responde, mas de forma genérica ou com baixo comprometimento
- "frio": Cliente responde apenas para ser educado, sem interesse real, respostas vagas

Responda APENAS com: oferta, quente, morno ou frio`;

          const intentResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${agent.gpt_api_key}`,
            },
            body: JSON.stringify({
              model: 'gpt-4',
              messages: [{ role: 'user', content: intentPrompt }],
              max_tokens: 10,
              temperature: 0.3,
            }),
          });

          const intentData = await intentResponse.json();
          const intent = intentData.choices[0]?.message?.content?.trim().toLowerCase();
          console.log(`GPT detected intent: ${intent}`);

          // === 3. UPDATE TEMPERATURE BASED ON GPT ANALYSIS ===
          let newTemperature = participant.temperature;
          if (intent === 'oferta') {
            newTemperature = 'hot';
            console.log('🔥 Lead is HOT - requesting proposal!');
          } else if (intent === 'quente') {
            newTemperature = 'warm';
            console.log('🌡️ Lead is WARM - showing interest');
          } else if (intent === 'morno') {
            newTemperature = 'warm';
            console.log('🌡️ Lead is WARM - moderate engagement');
          } else if (intent === 'frio') {
            newTemperature = 'cold';
            console.log('❄️ Lead is COLD - low engagement');
          }

          // Update participant with all GPT insights
          if (newTemperature !== participant.temperature) {
            await supabaseAdmin
              .from('campaign_participants')
              .update({
                temperature: newTemperature,
                response_count: (participant.contact_count || 0) + 1,
                last_contact: new Date().toISOString(),
                metadata: {
                  ...participant.metadata,
                  last_intent: intent,
                  last_language: detectedLanguage,
                  gpt_analyzed_at: new Date().toISOString(),
                },
              })
              .eq('id', participant.id);

            console.log(`Temperature updated by GPT: ${participant.temperature} → ${newTemperature}`);
          }

          // === 4. SYNC TO CRM (create nota) ===
          if (participant.crm_client_code) {
            try {
              const redsisUrl = Deno.env.get('REDSIS_BASE_URL');
              const redsisToken = Deno.env.get('REDSIS_TOKEN');
              
              if (redsisUrl && redsisToken) {
                await fetch(`${redsisUrl}/clientes/${participant.crm_client_code}/anotacoes`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${redsisToken}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    tipo: 'WhatsApp',
                    conteudo: `[Cliente - ${detectedLanguage.toUpperCase()}] ${clientMessage}\n[Análise GPT: ${intent.toUpperCase()} - Temperatura: ${newTemperature.toUpperCase()}]`,
                    data_criacao: new Date().toISOString(),
                  }),
                });
                console.log('✅ Nota sincronizada no CRM com análise GPT');
              }
            } catch (crmError) {
              console.error('CRM sync failed (non-blocking):', crmError);
            }
          }
        }
      }
    } catch (gptAnalysisError) {
      console.error("GPT analysis failed (non-blocking):", gptAnalysisError);
    }

    // Broadcast removido - frontend usa postgres_changes subscription para receber updates
    // Isso resolve o problema de websockets em edge functions

    // === PROCESS STATE MACHINE ===
    console.log("=== PROCESSING STATE MACHINE ===");
    try {
      const stateMachineUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/state-machine`;
      await fetch(stateMachineUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`
        },
        body: JSON.stringify({
          session_id: session.id,
          event_type: 'MESSAGE_RECEIVED',
          message_content: clientMessage,
          sender: 'client'
        })
      });
      console.log("✅ State machine processed");
    } catch (smError) {
      console.error("State machine processing failed (non-blocking):", smError);
    }

    // === VERIFICAR SE DEVE GERAR RESPOSTA ===
    // Não gerar resposta para mensagens de áudio, imagem ou tipos não suportados
    if (messageType === "audio" || messageType === "image" || messageType === "unsupported") {
      console.log(`=== MENSAGEM DO TIPO ${messageType.toUpperCase()} - NÃO GERAR RESPOSTA ===`);
      
      // Apenas retornar sucesso sem gerar resposta
      return new Response(JSON.stringify({ 
        success: true, 
        clientMessageId: insertedClientMessage.id,
        agentMessageId: null,
        noResponse: true,
        reason: `Mensagem do tipo ${messageType} não gera resposta automática`
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Chamar a função GPT para gerar resposta (apenas para mensagens de texto)
    console.log("=== CHAMANDO FUNÇÃO GPT-AGENT ===");
    const edgeFunctionUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/gpt-agent`;
    console.log("URL da função GPT:", edgeFunctionUrl);
    
    let gptResponse;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        gptResponse = await fetch(edgeFunctionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`
            },
            body: JSON.stringify({ session_id: session.id })
        });

        console.log("=== RESPOSTA DA FUNÇÃO GPT-AGENT (TENTATIVA " + (retryCount + 1) + ") ===");
        console.log("Status da resposta:", gptResponse.status);
        console.log("Status text:", gptResponse.statusText);

        if (gptResponse.ok) {
          break; // Se a resposta for OK, sair do loop de retry
        }

        const errorBody = await gptResponse.json();
        console.error("Erro na resposta da função GPT:", errorBody);
        
        if (retryCount === maxRetries - 1) {
          throw new Error(`Função gpt-agent falhou após ${maxRetries} tentativas: ${errorBody.error}`);
        }
        
        // Esperar antes de tentar novamente
        await new Promise(resolve => setTimeout(resolve, 2000 * (retryCount + 1)));
        retryCount++;
        
      } catch (fetchError) {
        console.error("Erro ao chamar função GPT (tentativa " + (retryCount + 1) + "):", fetchError);
        
        if (retryCount === maxRetries - 1) {
          throw new Error(`Falha ao chamar função gpt-agent após ${maxRetries} tentativas: ${fetchError.message}`);
        }
        
        // Esperar antes de tentar novamente
        await new Promise(resolve => setTimeout(resolve, 2000 * (retryCount + 1)));
        retryCount++;
      }
    }

    const gptData = await gptResponse.json();
    console.log("=== DADOS DA FUNÇÃO GPT ===");
    console.log("Dados completos:", JSON.stringify(gptData, null, 2));
    
    const { reply: agentReply, delays } = gptData;
    console.log("Resposta do GPT:", agentReply);
    console.log("Informações de delay:", delays);

    // BUSCAR INSTÂNCIA WHATSAPP CORRETA PARA MULTI-INSTANCE
    console.log("=== BUSCANDO INSTÂNCIA WHATSAPP ===");
    const whatsappInstance = await getWhatsAppInstance(supabaseAdmin, instanceIdFromWebhook, destPhoneNumber);
    
    if (!whatsappInstance) {
      console.error("Nenhuma instância WhatsApp configurada");
      throw new Error("Nenhuma instância WhatsApp disponível para enviar resposta");
    }
    console.log(`Usando instância: ${whatsappInstance.name || whatsappInstance.instance_id}`);

    // ETAPA CRUCIAL: Enviar mensagem para o WhatsApp PRIMEIRO
    console.log("=== ENVIANDO RESPOSTA PARA O WHATSAPP (ETAPA CRUCIAL) ===");
    let whatsappResponse;
    let whatsappRetryCount = 0;
    const maxWhatsappRetries = 3;
    
    while (whatsappRetryCount < maxWhatsappRetries) {
      try {
        whatsappResponse = await sendWhatsAppMessage(clientNumber, agentReply, whatsappInstance);
        console.log("✅ Resposta enviada com sucesso para o WhatsApp:", whatsappResponse);
        break; // Se o envio for bem sucedido, sair do loop
      } catch (whatsappError) {
        console.error("Erro ao enviar mensagem para o WhatsApp (tentativa " + (whatsappRetryCount + 1) + "):", whatsappError);
        
        if (whatsappRetryCount === maxWhatsappRetries - 1) {
          console.error("Falha ao enviar mensagem para o WhatsApp após todas as tentativas");
          // Continuar o fluxo mesmo se falhar o envio para o WhatsApp
          // A mensagem ainda será salva no banco
          break;
        }
        
        // Esperar antes de tentar novamente
        await new Promise(resolve => setTimeout(resolve, 3000 * (whatsappRetryCount + 1)));
        whatsappRetryCount++;
      }
    }

    // Inserir resposta do agente no banco
    console.log("=== INSERINDO MENSAGEM DO AGENTE ===");
    const { data: insertedAgentMessage, error: agentInsertError } = await supabaseAdmin
      .from("whatsapp_messages")
      .insert({ session_id: session.id, sender: "agent", message_content: agentReply })
      .select()
      .single();

    if (agentInsertError) {
      console.error("Erro ao inserir mensagem do agente:", agentInsertError);
      throw new Error("Erro ao salvar mensagem do agente.");
    }

    console.log("=== MENSAGEM DO AGENTE INSERIDA ===");
    console.log("Dados da mensagem:", JSON.stringify(insertedAgentMessage, null, 2));
    console.log("Delays:", delays);
    
    // Atualizar a sessão para indicar que há nova mensagem
    // Isso dispara o postgres_changes que o frontend escuta
    await supabaseAdmin
      .from("prospecting_sessions")
      .update({ 
        last_message_at: new Date().toISOString(),
        status: 'active'
      })
      .eq("id", session.id);
    
    console.log("✅ Sessão atualizada - frontend receberá via postgres_changes");

    console.log("=== FUNÇÃO CONCLUÍDA COM SUCESSO ===");
    return new Response(JSON.stringify({ 
      success: true, 
      clientMessageId: insertedClientMessage.id,
      agentMessageId: insertedAgentMessage.id,
      delays: delays,
      whatsappSent: !!whatsappResponse
    }), {
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