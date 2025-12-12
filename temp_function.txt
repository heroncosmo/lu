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

// Transcrever áudio usando Whisper API
async function transcribeAudio(audioUrl: string, apiKey: string): Promise<string> {
  console.log("🎤 Transcrevendo áudio com Whisper API...");
  
  try {
    // Baixar o áudio
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error("Falha ao baixar áudio");
    }
    const audioBlob = await audioResponse.blob();
    
    // Criar FormData para enviar ao Whisper
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.ogg');
    formData.append('model', 'whisper-1');
    formData.append('language', 'pt'); // Português como padrão
    
    const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: formData,
    });
    
    if (!whisperResponse.ok) {
      const error = await whisperResponse.text();
      console.error("Erro Whisper:", error);
      throw new Error("Falha na transcrição");
    }
    
    const result = await whisperResponse.json();
    console.log("✅ Áudio transcrito:", result.text);
    return result.text;
  } catch (error) {
    console.error("Erro ao transcrever áudio:", error);
    return "[Áudio não pôde ser transcrito]";
  }
}

// Interpretar imagem usando GPT Vision
async function interpretImage(imageUrl: string, caption: string | null, apiKey: string): Promise<string> {
  console.log("🖼️ Interpretando imagem com GPT Vision...");
  
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: caption 
                  ? `O cliente enviou esta imagem com a legenda: "${caption}". Descreva brevemente o que você vê na imagem e o contexto da mensagem.`
                  : 'O cliente enviou esta imagem sem legenda. Descreva brevemente o que você vê e qual pode ser a intenção do cliente.'
              },
              {
                type: 'image_url',
                image_url: { url: imageUrl }
              }
            ]
          }
        ],
        max_tokens: 300,
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error("Erro GPT Vision:", error);
      throw new Error("Falha na interpretação");
    }
    
    const result = await response.json();
    const description = result.choices[0]?.message?.content || "[Imagem não pôde ser interpretada]";
    console.log("✅ Imagem interpretada:", description);
    return description;
  } catch (error) {
    console.error("Erro ao interpretar imagem:", error);
    return "[Imagem não pôde ser interpretada]";
  }
}

// Baixar mídia via W-API usando mediaKey, directPath, type e mimetype
async function downloadMediaFromWAPI(
  mediaInfo: { mediaKey: string; directPath: string; mimetype: string; type: string }, 
  instanceId: string, 
  token: string
): Promise<string | null> {
  console.log("📥 Baixando mídia via W-API...");
  console.log("📥 MediaInfo:", JSON.stringify(mediaInfo, null, 2));
  console.log("📥 InstanceId:", instanceId);
  
  try {
    // Endpoint correto conforme documentação W-API: /v1/message/download-media
    const response = await fetch(
      `https://api.w-api.app/v1/message/download-media?instanceId=${instanceId}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          mediaKey: mediaInfo.mediaKey,
          directPath: mediaInfo.directPath,
          type: mediaInfo.type,
          mimetype: mediaInfo.mimetype
        })
      }
    );
    
    console.log("📥 Resposta W-API:", response.status, response.statusText);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Erro ao baixar mídia:", response.status, errorText);
      return null;
    }
    
    const data = await response.json();
    console.log("📥 Dados recebidos:", JSON.stringify(data, null, 2));
    
    if (data.error) {
      console.error("Erro na resposta:", data);
      return null;
    }
    
    // A API retorna fileLink com a URL da mídia
    if (data.fileLink) {
      console.log("✅ Mídia baixada com sucesso:", data.fileLink);
      return data.fileLink;
    }
    
    // Fallback para outros formatos de resposta
    return data.base64 ? `data:${data.mimetype || 'application/octet-stream'};base64,${data.base64}` : data.url;
  } catch (error) {
    console.error("Erro ao baixar mídia:", error);
    return null;
  }
}

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

  // Variáveis declaradas FORA do try para estar disponíveis no catch
  let webhookId: string | undefined;
  let session: { id: string } | null | undefined;
  let supabaseAdmin: any;

  try {
    supabaseAdmin = createClient(
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
    const messageId = payload.messageId || payload.message_id || payload.id?.id;
    
    let clientMessage = "";
    let messageType = "text"; // Tipo padrão
    let mediaUrl: string | null = null; // URL da mídia para enviar ao GPT
    let mediaBase64: string | null = null; // Base64 da mídia para enviar ao GPT Vision

    // Primeiro, verificar se temos clientNumber antes de continuar
    if (!clientNumber) {
      console.error("Número do cliente não encontrado no payload");
      return new Response("Número do cliente não encontrado", { status: 200 });
    }

    // Buscar sessão ativa para este número PRIMEIRO (para obter a API key do agente)
    console.log("=== BUSCANDO SESSÃO ATIVA ===");
    console.log("Buscando sessão para o número:", clientNumber);
    const { data: sessionData, error: sessionError } = await supabaseAdmin
      .from("prospecting_sessions")
      .select(`
        id, 
        user_id, 
        ai_enabled,
        agent_id,
        agents (
          gpt_api_key
        )
      `)
      .eq("client_whatsapp_number", clientNumber)
      .in("status", ["started", "active"])
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    
    // Atribuir à variável do escopo superior (para estar disponível no catch)
    session = sessionData;

    if (sessionError || !session) {
      console.warn(`Nenhuma sessão ativa encontrada para o número: ${clientNumber}`);
      return new Response("Nenhuma sessão ativa encontrada.", { status: 200 });
    }

    console.log("=== SESSÃO ENCONTRADA ===");
    console.log("ID da sessão:", session.id);
    console.log("MessageId do webhook:", messageId);

    // === DEDUPLICAÇÃO POR MESSAGE_ID ===
    // Verificar se esta mensagem já foi processada (evita duplicatas de webhooks)
    if (messageId) {
      const { data: existingMessage } = await supabaseAdmin
        .from("whatsapp_messages")
        .select("id")
        .eq("session_id", session.id)
        .eq("external_message_id", messageId)
        .single();
      
      if (existingMessage) {
        console.log(`⚠️ Mensagem ${messageId} já foi processada. Ignorando duplicata.`);
        return new Response(JSON.stringify({ 
          success: true, 
          duplicate: true,
          reason: "Mensagem já processada anteriormente"
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
    }
    console.log("User ID:", session.user_id);
    
    // Obter OpenAI API Key do agente (não de variável de ambiente)
    const agentData = session.agents as any;
    const openaiApiKey = agentData?.gpt_api_key;
    console.log("API Key do agente disponível:", openaiApiKey ? "Sim" : "Não");

    // Extrair mensagem conforme o tipo
    if (payload.msgContent?.conversation) {
      // Mensagem de texto simples
      clientMessage = payload.msgContent.conversation;
      messageType = "text";
    } else if (payload.msgContent?.extendedTextMessage?.text) {
      // Mensagem de texto estendida
      clientMessage = payload.msgContent.extendedTextMessage.text;
      messageType = "text";
    } else if (payload.msgContent?.imageMessage) {
      // Imagem (com ou sem legenda)
      const imageMsg = payload.msgContent.imageMessage;
      const caption = imageMsg.caption || "";
      messageType = "image";
      // Mensagem que será salva - se tiver caption, usar a caption; senão, descrever que enviou uma imagem
      // A imagem será enviada para GPT Vision junto com esta mensagem
      clientMessage = caption ? caption : "[O cliente enviou uma imagem]";
      
      console.log("📸 ImageMessage recebido:", JSON.stringify(imageMsg, null, 2));
      
      // Extrair dados necessários para download
      const mediaInfo = {
        mediaKey: imageMsg.mediaKey || "",
        directPath: imageMsg.directPath || "",
        mimetype: imageMsg.mimetype || "image/jpeg",
        type: "image"
      };
      
      // Baixar a imagem para enviar ao GPT Vision
      if (instanceIdFromWebhook && mediaInfo.mediaKey && mediaInfo.directPath) {
        console.log("📸 Baixando imagem para enviar ao GPT Vision...");
        const instance = await getWhatsAppInstance(supabaseAdmin, instanceIdFromWebhook, destPhoneNumber);
        if (instance) {
          const downloadedUrl = await downloadMediaFromWAPI(mediaInfo, instance.instance_id, instance.token, 'image');
          if (downloadedUrl) {
            mediaBase64 = downloadedUrl; // URL da imagem para GPT Vision
            console.log("✅ Imagem baixada com sucesso para GPT Vision");
          } else {
            console.log("❌ Falha ao baixar imagem");
          }
        }
      } else {
        console.log("❌ Faltando dados para baixar imagem:", { 
          hasInstanceId: !!instanceIdFromWebhook, 
          hasMediaKey: !!mediaInfo.mediaKey,
          hasDirectPath: !!mediaInfo.directPath
        });
      }
    } else if (payload.msgContent?.audioMessage) {
      // Mensagem de áudio - transcrever com Whisper (modelo mais barato)
      // O texto transcrito será enviado ao modelo configurado pelo usuário
      messageType = "audio";
      
      const audioMsg = payload.msgContent.audioMessage;
      
      // Log detalhado do audioMessage para debug
      console.log("🎤 AudioMessage completo:", JSON.stringify(audioMsg, null, 2));
      console.log("🎤 msgType do payload:", payload.msgType);
      console.log("🔑 Dados disponíveis - instanceId:", instanceIdFromWebhook);
      console.log("🔑 API Key disponível:", openaiApiKey ? "Sim" : "Não");
      
      // Extrair dados necessários para download
      // O type deve corresponder ao msgType do WhatsApp (audioMessage ou pttMessage)
      // Para W-API, pode ser: audio, ptt, audioMessage, pttMessage
      const isPtt = audioMsg.ptt === true || payload.msgType === 'pttMessage';
      const mediaInfo = {
        mediaKey: audioMsg.mediaKey || "",
        directPath: audioMsg.directPath || "",
        mimetype: audioMsg.mimetype || "audio/ogg",
        // Tentar diferentes formatos de type
        type: isPtt ? "ptt" : "audio"
      };
      
      console.log("🎤 MediaInfo extraído:", JSON.stringify(mediaInfo, null, 2));
      console.log("🎤 É PTT (push-to-talk)?", isPtt ? "Sim" : "Não");
      
      // Verificar se temos os dados necessários para baixar
      if (openaiApiKey && instanceIdFromWebhook && mediaInfo.mediaKey && mediaInfo.directPath) {
        console.log("🎤 Baixando áudio via W-API para transcrever...");
        const instance = await getWhatsAppInstance(supabaseAdmin, instanceIdFromWebhook, destPhoneNumber);
        console.log("🔑 Instância encontrada:", instance ? `${instance.name} (${instance.instance_id})` : "NÃO");
        
        if (instance) {
          const downloadedUrl = await downloadMediaFromWAPI(mediaInfo, instance.instance_id, instance.token);
          console.log("📥 Download resultado:", downloadedUrl ? "OK" : "FALHOU");
          
          if (downloadedUrl) {
            const transcription = await transcribeAudio(downloadedUrl, openaiApiKey);
            // Salvar apenas o texto transcrito (sem prefixo) para a IA responder naturalmente
            clientMessage = transcription;
            console.log("✅ Áudio transcrito com Whisper-1:", transcription);
          } else {
            clientMessage = "[O cliente enviou um áudio mas não foi possível processar]";
          }
        } else {
          clientMessage = "[O cliente enviou um áudio]";
        }
      } else {
        console.log("❌ Faltando dados para transcrição:", { 
          hasApiKey: !!openaiApiKey, 
          hasInstanceId: !!instanceIdFromWebhook, 
          hasMediaKey: !!mediaInfo.mediaKey,
          hasDirectPath: !!mediaInfo.directPath
        });
        clientMessage = "[O cliente enviou um áudio]";
      }
    } else {
      console.log("Tipo de mensagem não suportado:", payload.msgContent);
      clientMessage = "[Mensagem não suportada]";
      messageType = "unsupported";
    }

    console.log("=== DADOS EXTRAÍDOS DO PAYLOAD ===");
    console.log("Número do cliente:", clientNumber);
    console.log("Mensagem do cliente:", clientMessage);
    console.log("Tipo de mensagem:", messageType);
    console.log("Mídia disponível:", mediaBase64 ? "Sim (imagem)" : "Não");

    if (!clientMessage) {
      console.error("Mensagem do cliente vazia");
      throw new Error("Mensagem do cliente vazia.");
    }

    // Inserir mensagem do cliente no banco
    console.log("=== INSERINDO MENSAGEM DO CLIENTE ===");
    const { data: insertedClientMessage, error: insertError } = await supabaseAdmin
      .from("whatsapp_messages")
      .insert({ 
        session_id: session.id, 
        sender: "client", 
        message_content: clientMessage,
        external_message_id: messageId || null  // Para deduplicação
      })
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
    // Apenas mensagens não suportadas não geram resposta
    // Áudio e imagem agora são processados normalmente
    if (messageType === "unsupported") {
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

    // === MESSAGE BATCHING V5: LOCK ATÔMICO NO BANCO ===
    // OBJETIVO: Quando cliente envia várias mensagens rápidas, consolidar tudo em UMA resposta
    //
    // PROBLEMA DO V4: Race condition - múltiplos webhooks podiam passar pela verificação
    // "sou o mais novo?" simultaneamente porque SELECT não é atômico.
    //
    // SOLUÇÃO V5: Usar UPDATE atômico com condição para adquirir lock exclusivo.
    // Apenas o primeiro webhook que conseguir o UPDATE processa as mensagens.
    //
    // FLUXO:
    // 1. Gerar webhookId único
    // 2. Esperar tempo inicial (3s) para coletar mais mensagens
    // 3. Verificar se é a mensagem mais recente (filtro rápido)
    // 4. TENTAR ADQUIRIR LOCK ATÔMICO com UPDATE condicional
    // 5. Se conseguir lock → processar todas as mensagens
    // 6. Se não conseguir → encerrar silenciosamente
    
    // V6: Aumentados os tempos para capturar pausas maiores do cliente
    // Problema anterior: cliente fazia pausa de 14s entre mensagens e sistema considerava estável
    const INITIAL_WAIT_MS = 5000; // Espera inicial de 5s para coletar mensagens rápidas
    const STABILITY_WAIT_MS = 15000; // Considerar estável após 15s sem novas mensagens
    const MAX_TOTAL_WAIT_MS = 90000; // Máximo 90s total (aumentado para acomodar o novo STABILITY_WAIT)
    const CHECK_INTERVAL_MS = 3000; // Verificar a cada 3s
    const LOCK_DURATION_MS = 180000; // Lock expira em 3 minutos (aumentado)
    
    // Gerar ID único para este webhook (usando variável declarada no topo do try)
    webhookId = crypto.randomUUID();
    
    console.log(`=== BATCHING V5: LOCK ATÔMICO ===`);
    console.log(`WebhookID: ${webhookId}`);
    console.log(`Mensagem: ID=${insertedClientMessage.id}, Timestamp=${insertedClientMessage.timestamp}`);
    
    // PASSO 1: Espera inicial para coletar mais mensagens
    console.log(`⏳ Aguardando ${INITIAL_WAIT_MS}ms para coletar mais mensagens...`);
    await new Promise(resolve => setTimeout(resolve, INITIAL_WAIT_MS));
    
    // PASSO 2: Aguardar estabilização (sem novas mensagens por STABILITY_WAIT_MS)
    console.log(`⏳ Aguardando estabilização (${STABILITY_WAIT_MS}ms sem novas mensagens)...`);
    
    let startTime = Date.now();
    let lastSeenMsgId = insertedClientMessage.id;
    let lastNewMsgTime = Date.now();
    
    while (Date.now() - startTime < MAX_TOTAL_WAIT_MS) {
      const { data: checkMsg } = await supabaseAdmin
        .from("whatsapp_messages")
        .select("id, timestamp")
        .eq("session_id", session.id)
        .eq("sender", "client")
        .order("timestamp", { ascending: false })
        .limit(1)
        .single();
      
      if (checkMsg && checkMsg.id !== lastSeenMsgId) {
        console.log(`📨 Nova mensagem detectada: ${checkMsg.id}`);
        lastSeenMsgId = checkMsg.id;
        lastNewMsgTime = Date.now();
      }
      
      if (Date.now() - lastNewMsgTime >= STABILITY_WAIT_MS) {
        console.log(`✅ Estabilizado! ${Math.round((Date.now() - lastNewMsgTime) / 1000)}s sem novas mensagens.`);
        break;
      }
      
      console.log(`⏳ Aguardando... (${Math.round((Date.now() - startTime) / 1000)}s total)`);
      await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL_MS));
    }
    
    const totalWaitTime = Date.now() - startTime + INITIAL_WAIT_MS;
    console.log(`=== ESTABILIZAÇÃO CONCLUÍDA - TOTAL: ${Math.round(totalWaitTime / 1000)}s ===`);

    // PASSO 3: TENTAR ADQUIRIR LOCK ATÔMICO VIA RPC
    // PROBLEMA DO V5 ANTERIOR: .or() não funciona em UPDATE do Supabase Client
    // SOLUÇÃO: Usar RPC function com UPDATE ... WHERE nativo do PostgreSQL
    console.log(`🔒 Tentando adquirir lock atômico via RPC...`);
    
    const LOCK_TIMEOUT_SECONDS = 120;
    
    // Chamar RPC function que garante atomicidade real
    const { data: lockResult, error: lockError } = await supabaseAdmin
      .rpc('acquire_batch_lock', {
        p_session_id: session.id,
        p_webhook_id: webhookId,
        p_lock_duration_seconds: LOCK_TIMEOUT_SECONDS
      });
    
    if (lockError) {
      console.error(`❌ Erro ao tentar adquirir lock:`, lockError);
      return new Response(JSON.stringify({ 
        success: true, 
        clientMessageId: insertedClientMessage.id,
        batched: true,
        reason: "Erro ao adquirir lock",
        error: lockError.message
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }
    
    const lockAcquired = lockResult?.[0]?.success || false;
    const lockOwner = lockResult?.[0]?.lock_owner;
    
    if (!lockAcquired) {
      // Não conseguimos o lock - outro webhook já tem
      console.log(`❌ Lock não adquirido - pertence a: ${lockOwner}`);
      return new Response(JSON.stringify({ 
        success: true, 
        clientMessageId: insertedClientMessage.id,
        batched: true,
        reason: `Lock pertence a ${lockOwner}`
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }
    
    console.log(`🎯 LOCK ADQUIRIDO! WebhookID: ${webhookId}`);
    console.log(`🎯 Somos o webhook vencedor! Processando todas as mensagens...`);

    // Chamar a função GPT para gerar resposta (texto, áudio transcrito e imagem)
    console.log("=== CHAMANDO FUNÇÃO GPT-AGENT ===");
    const edgeFunctionUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/gpt-agent`;
    console.log("URL da função GPT:", edgeFunctionUrl);
    
    // Preparar payload com mídia se disponível
    const gptAgentPayload: any = { session_id: session.id };
    if (mediaBase64 && messageType === "image") {
      gptAgentPayload.image_url = mediaBase64;
      console.log("📸 Enviando imagem para GPT Vision junto com a conversa");
    }
      
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
              body: JSON.stringify(gptAgentPayload)
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
    
    // Verificar se a resposta foi cancelada por nova mensagem do cliente
    // NOTA: Isso não deve mais acontecer após correção V7 que removeu verificação do gpt-agent
    if (gptData.cancelled) {
      console.log(`⚠️ Resposta cancelada: ${gptData.reason}`);
      console.log(`   Liberando lock antes de encerrar...`);
      
      // CRÍTICO: Liberar lock para evitar travamento
      await supabaseAdmin.rpc('release_batch_lock', {
        p_session_id: session.id,
        p_webhook_id: webhookId
      });
      console.log(`[BATCHING V7] Lock liberado após cancelamento`);
      
      return new Response(JSON.stringify({ 
        success: true, 
        clientMessageId: insertedClientMessage.id,
        cancelled: true,
        reason: gptData.reason
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }
    
    let { reply: agentReply, delays } = gptData;
    console.log("Resposta do GPT:", agentReply);
    console.log("Informações de delay:", delays);
    
    // Se não há resposta válida, encerrar
    if (!agentReply) {
      console.log("⚠️ Nenhuma resposta do GPT-Agent");
      
      // CRÍTICO: Liberar lock antes de encerrar
      await supabaseAdmin.rpc('release_batch_lock', {
        p_session_id: session.id,
        p_webhook_id: webhookId
      });
      console.log(`[BATCHING V7] Lock liberado após noReply`);
      
      return new Response(JSON.stringify({ 
        success: true, 
        clientMessageId: insertedClientMessage.id,
        noReply: true,
        reason: "GPT-Agent não retornou resposta"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // === VERIFICAÇÃO FINAL: NOVAS MENSAGENS DURANTE PROCESSAMENTO GPT ===
    // CRÍTICO: Antes de enviar ao cliente, verificar se chegaram novas mensagens
    // enquanto o GPT estava processando. Se sim, REFAZER a resposta com contexto completo.
    console.log("=== VERIFICAÇÃO FINAL: NOVAS MENSAGENS? ===");
    const { data: newestMessage } = await supabaseAdmin
      .from("whatsapp_messages")
      .select("id, timestamp, message_content")
      .eq("session_id", session.id)
      .eq("sender", "client")
      .order("timestamp", { ascending: false })
      .limit(1)
      .single();
    
    if (newestMessage && newestMessage.id !== lastSeenMsgId) {
      console.log(`🔄 NOVA MENSAGEM DETECTADA durante processamento GPT!`);
      console.log(`   Última mensagem vista antes do GPT: ${lastSeenMsgId}`);
      console.log(`   Nova mensagem: ${newestMessage.id} - "${newestMessage.message_content}"`);
      console.log(`   🔄 REFAZENDO resposta com contexto completo...`);
      
      // Preparar payload com mídia se disponível
      const retryGptPayload: any = { session_id: session.id };
      if (mediaBase64 && messageType === "image") {
        retryGptPayload.image_url = mediaBase64;
      }
      
      // Chamar GPT novamente com contexto atualizado
      try {
        const retryGptResponse = await fetch(edgeFunctionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`
          },
          body: JSON.stringify(retryGptPayload)
        });
        
        if (retryGptResponse.ok) {
          const retryGptData = await retryGptResponse.json();
          console.log(`✅ Resposta refeita com sucesso!`);
          console.log(`   Nova resposta: ${retryGptData.reply?.substring(0, 100)}...`);
          
          // Atualizar variáveis com a nova resposta
          if (retryGptData.reply) {
            agentReply = retryGptData.reply;
            delays = retryGptData.delays;
            console.log(`🔄 Usando resposta atualizada que considera TODAS as mensagens`);
          }
        } else {
          console.warn(`⚠️ Falha ao refazer resposta (status ${retryGptResponse.status}), usando resposta original`);
        }
      } catch (retryError) {
        console.error(`⚠️ Erro ao refazer resposta:`, retryError);
        console.log(`   Usando resposta original`);
      }
    } else {
      console.log(`✅ Nenhuma mensagem nova - resposta GPT está atualizada`);
    }

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

    // ==============================================
    // LIBERAR O LOCK APÓS PROCESSAMENTO BEM SUCEDIDO
    // ==============================================
    console.log(`[BATCHING V6] Liberando lock via RPC para sessão ${session.id}...`);
    const { data: releaseResult } = await supabaseAdmin
      .rpc('release_batch_lock', {
        p_session_id: session.id,
        p_webhook_id: webhookId
      });
    
    if (releaseResult) {
      console.log(`[BATCHING V6] ✅ Lock liberado com sucesso`);
    } else {
      console.warn(`[BATCHING V6] ⚠️ Lock não foi liberado (não éramos mais donos ou já expirou)`);
    }

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
    
    // Tentar liberar o lock em caso de erro (se tivermos um)
    // @ts-ignore - webhookId e session podem não existir dependendo de onde o erro ocorreu
    if (typeof webhookId !== 'undefined' && typeof session !== 'undefined' && session?.id) {
      try {
        console.log(`[BATCHING V6] Tentando liberar lock após erro para sessão ${session.id}...`);
        const { data: releaseResult } = await supabaseAdmin
          .rpc('release_batch_lock', {
            p_session_id: session.id,
            p_webhook_id: webhookId
          });
        
        if (releaseResult) {
          console.log(`[BATCHING V6] Lock liberado após erro`);
        } else {
          console.warn(`[BATCHING V6] Lock não pôde ser liberado (não éramos donos)`);
        }
      } catch (lockError) {
        console.error(`[BATCHING V6] Erro ao liberar lock:`, lockError);
      }
    }
    
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});