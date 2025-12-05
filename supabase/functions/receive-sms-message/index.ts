// ============================================================================
// Edge Function: receive-sms-message
// Descrição: Recebe webhooks do Twilio quando cliente responde via SMS
// ============================================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  console.log("=== INICIANDO FUNÇÃO RECEIVE-SMS-MESSAGE ===");
  console.log("Método:", req.method);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Twilio envia webhooks como application/x-www-form-urlencoded
    const formData = await req.formData();
    
    const twilioData = {
      MessageSid: formData.get("MessageSid"),
      From: formData.get("From"), // +5527999999999
      To: formData.get("To"),     // Número Twilio
      Body: formData.get("Body"), // Mensagem do cliente
      NumMedia: formData.get("NumMedia"),
      AccountSid: formData.get("AccountSid"),
    };

    console.log("=== DADOS DO TWILIO ===");
    console.log(JSON.stringify(twilioData, null, 2));

    if (!twilioData.From || !twilioData.Body) {
      throw new Error("Dados inválidos do Twilio");
    }

    const clientNumber = twilioData.From as string;
    const messageBody = twilioData.Body as string;
    const twilioMessageSid = twilioData.MessageSid as string;

    console.log(`📱 SMS recebido de: ${clientNumber}`);
    console.log(`💬 Mensagem: ${messageBody}`);

    // ========================================================================
    // 1. IDENTIFICAR OU CRIAR SESSÃO
    // ========================================================================
    
    let session = null;
    let isNewSession = false;

    // Buscar sessão existente por número SMS
    const { data: existingSessions, error: sessionError } = await supabaseAdmin
      .from("prospecting_sessions")
      .select("*")
      .eq("client_sms_number", clientNumber)
      .eq("channel", "sms")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1);

    if (sessionError) {
      console.error("Erro ao buscar sessão:", sessionError);
      throw sessionError;
    }

    if (existingSessions && existingSessions.length > 0) {
      session = existingSessions[0];
      console.log(`✅ Sessão existente encontrada: ${session.id}`);
    } else {
      // Criar nova sessão
      console.log("📝 Criando nova sessão SMS...");
      
      // Tentar vincular com contato CRM
      const { data: crmContact } = await supabaseAdmin
        .from("crm_contacts")
        .select("id, name, user_id")
        .or(`phone.eq.${clientNumber},whatsapp.eq.${clientNumber}`)
        .single();

      const { data: newSession, error: createError } = await supabaseAdmin
        .from("prospecting_sessions")
        .insert({
          channel: "sms",
          client_sms_number: clientNumber,
          client_phone: clientNumber,
          client_name: crmContact?.name || `Cliente SMS ${clientNumber.slice(-4)}`,
          ai_enabled: true,
          is_active: true,
          user_id: crmContact?.user_id || null,
          crm_contact_id: crmContact?.id || null,
          lead_temperature: "cold",
        })
        .select()
        .single();

      if (createError) {
        console.error("Erro ao criar sessão:", createError);
        throw createError;
      }

      session = newSession;
      isNewSession = true;
      console.log(`✅ Nova sessão criada: ${session.id}`);
    }

    // ========================================================================
    // 2. SALVAR MENSAGEM DO CLIENTE
    // ========================================================================
    
    const { data: savedMessage, error: messageError } = await supabaseAdmin
      .from("conversation_messages")
      .insert({
        session_id: session.id,
        channel: "sms",
        message_content: messageBody,
        is_from_client: true,
        sender: "client",
        sms_from: clientNumber,
        sms_to: twilioData.To,
        whatsapp_message_id: twilioMessageSid,
        status: "received",
        timestamp: new Date().toISOString(),
      })
      .select()
      .single();

    if (messageError) {
      console.error("Erro ao salvar mensagem:", messageError);
      throw messageError;
    }

    console.log(`✅ Mensagem salva: ${savedMessage.id}`);

    // Atualizar last_message_at da sessão
    await supabaseAdmin
      .from("prospecting_sessions")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", session.id);

    // ========================================================================
    // 3. VERIFICAR SE IA ESTÁ HABILITADA
    // ========================================================================
    
    if (!session.ai_enabled) {
      console.log("⚠️ IA desabilitada para esta sessão. Notificando humano...");
      
      // Retornar TwiML vazio (não responder)
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <!-- IA desabilitada - Aguardando resposta manual -->
</Response>`;

      return new Response(twiml, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/xml",
        },
        status: 200,
      });
    }

    // ========================================================================
    // 4. CHAMAR IA PARA GERAR RESPOSTA
    // ========================================================================
    
    console.log("🤖 Chamando IA para gerar resposta...");

    // Buscar histórico de mensagens para contexto
    const { data: messageHistory } = await supabaseAdmin
      .from("conversation_messages")
      .select("*")
      .eq("session_id", session.id)
      .order("timestamp", { ascending: true })
      .limit(20);

    // Buscar agente associado à sessão
    let agentId = session.agent_id;
    if (!agentId) {
      // Buscar agente padrão do usuário
      const { data: defaultAgent } = await supabaseAdmin
        .from("agents")
        .select("id")
        .eq("user_id", session.user_id)
        .eq("is_active", true)
        .order("is_default", { ascending: false })
        .limit(1)
        .single();

      agentId = defaultAgent?.id;
    }

    // Chamar função gpt-agent
    const gptResponse = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/gpt-agent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          agent_id: agentId,
          session_id: session.id,
          user_message: messageBody,
          channel: "sms",
          message_history: messageHistory || [],
          context: {
            client_name: session.client_name,
            client_number: clientNumber,
            is_new_session: isNewSession,
          },
        }),
      }
    );

    if (!gptResponse.ok) {
      throw new Error(`Erro ao chamar IA: ${gptResponse.statusText}`);
    }

    const gptData = await gptResponse.json();
    const aiReply = gptData.response || gptData.message;

    console.log(`🤖 IA respondeu: ${aiReply}`);

    // ========================================================================
    // 5. SALVAR RESPOSTA DA IA
    // ========================================================================
    
    await supabaseAdmin
      .from("conversation_messages")
      .insert({
        session_id: session.id,
        channel: "sms",
        message_content: aiReply,
        is_from_client: false,
        sender: "agent",
        agent_id: agentId,
        sms_from: twilioData.To,
        sms_to: clientNumber,
        status: "sent",
        timestamp: new Date().toISOString(),
      });

    // ========================================================================
    // 6. ENVIAR RESPOSTA VIA TWILIO (usando send-sms-message)
    // ========================================================================
    
    console.log("📤 Enviando resposta via Twilio...");

    const sendResponse = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-sms-message`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          session_id: session.id,
          to_number: clientNumber,
          message_content: aiReply,
          trigger_reason: "ai_response",
        }),
      }
    );

    if (!sendResponse.ok) {
      console.error("Erro ao enviar SMS:", await sendResponse.text());
      throw new Error("Falha ao enviar SMS");
    }

    console.log("✅ SMS enviado com sucesso!");

    // Retornar TwiML vazio (já enviamos via API)
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <!-- Resposta enviada via API Twilio -->
</Response>`;

    return new Response(twiml, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/xml",
      },
      status: 200,
    });

  } catch (error: any) {
    console.error("❌ ERRO:", error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
        status: 500,
      }
    );
  }
});
