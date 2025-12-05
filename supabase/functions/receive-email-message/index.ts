// ============================================================================
// Edge Function: receive-email-message
// Descrição: Recebe webhooks quando cliente responde via Email
// Suporta: SendGrid Inbound Parse, Postmark, Mailgun
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
  console.log("=== INICIANDO FUNÇÃO RECEIVE-EMAIL-MESSAGE ===");
  console.log("Método:", req.method);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Detectar provedor baseado em headers
    const contentType = req.headers.get("content-type") || "";
    let emailData: any = {};

    // ========================================================================
    // PARSER MULTI-PROVEDOR
    // ========================================================================

    if (contentType.includes("application/json")) {
      // Postmark ou Mailgun (JSON)
      const jsonData = await req.json();
      console.log("📧 Email recebido (JSON):", JSON.stringify(jsonData, null, 2));

      // Postmark format
      if (jsonData.From && jsonData.TextBody) {
        emailData = {
          from: jsonData.From,
          to: jsonData.To,
          subject: jsonData.Subject || "Sem assunto",
          body: jsonData.TextBody || jsonData.HtmlBody,
          messageId: jsonData.MessageID,
          provider: "postmark",
        };
      }
      // Mailgun format
      else if (jsonData.sender && jsonData["body-plain"]) {
        emailData = {
          from: jsonData.sender,
          to: jsonData.recipient,
          subject: jsonData.subject || "Sem assunto",
          body: jsonData["body-plain"] || jsonData["body-html"],
          messageId: jsonData["Message-Id"],
          provider: "mailgun",
        };
      }
    } else {
      // SendGrid Inbound Parse (multipart/form-data)
      const formData = await req.formData();
      console.log("📧 Email recebido (FormData)");

      emailData = {
        from: formData.get("from"),
        to: formData.get("to"),
        subject: formData.get("subject") || "Sem assunto",
        body: formData.get("text") || formData.get("html"),
        messageId: formData.get("headers")?.toString() || Date.now().toString(),
        provider: "sendgrid",
      };
    }

    console.log("=== DADOS DO EMAIL PARSEADOS ===");
    console.log(JSON.stringify(emailData, null, 2));

    if (!emailData.from || !emailData.body) {
      throw new Error("Dados inválidos do email");
    }

    // Extrair email limpo (remover nome)
    const clientEmail = emailData.from.match(/<(.+?)>/)?.[1] || emailData.from;
    const messageBody = emailData.body;
    const subject = emailData.subject;

    console.log(`📧 Email de: ${clientEmail}`);
    console.log(`📋 Assunto: ${subject}`);
    console.log(`💬 Mensagem: ${messageBody.substring(0, 200)}...`);

    // ========================================================================
    // 1. IDENTIFICAR OU CRIAR SESSÃO
    // ========================================================================

    let session = null;
    let isNewSession = false;

    // Buscar sessão existente por email
    const { data: existingSessions, error: sessionError } = await supabaseAdmin
      .from("prospecting_sessions")
      .select("*")
      .eq("client_email", clientEmail)
      .eq("channel", "email")
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
      console.log("📝 Criando nova sessão Email...");

      // Tentar vincular com contato CRM
      const { data: crmContact } = await supabaseAdmin
        .from("crm_contacts")
        .select("id, name, user_id")
        .eq("email", clientEmail)
        .single();

      // Extrair nome do email se não encontrar no CRM
      const clientName =
        crmContact?.name ||
        emailData.from.match(/^(.+?)</)?.[1]?.trim() ||
        clientEmail.split("@")[0];

      const { data: newSession, error: createError } = await supabaseAdmin
        .from("prospecting_sessions")
        .insert({
          channel: "email",
          client_email: clientEmail,
          client_name: clientName,
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
        channel: "email",
        message_content: messageBody,
        is_from_client: true,
        sender: "client",
        email_from: clientEmail,
        email_to: emailData.to,
        email_subject: subject,
        whatsapp_message_id: emailData.messageId,
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

    // Atualizar last_message_at
    await supabaseAdmin
      .from("prospecting_sessions")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", session.id);

    // ========================================================================
    // 3. VERIFICAR SE IA ESTÁ HABILITADA
    // ========================================================================

    if (!session.ai_enabled) {
      console.log("⚠️ IA desabilitada para esta sessão. Notificando humano...");

      return new Response(
        JSON.stringify({
          success: true,
          message: "Email recebido. IA desabilitada - aguardando resposta manual.",
          session_id: session.id,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // ========================================================================
    // 4. CHAMAR IA PARA GERAR RESPOSTA
    // ========================================================================

    console.log("🤖 Chamando IA para gerar resposta...");

    // Buscar histórico
    const { data: messageHistory } = await supabaseAdmin
      .from("conversation_messages")
      .select("*")
      .eq("session_id", session.id)
      .order("timestamp", { ascending: true })
      .limit(20);

    // Buscar agente
    let agentId = session.agent_id;
    if (!agentId) {
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

    // Chamar IA
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
          channel: "email",
          message_history: messageHistory || [],
          context: {
            client_name: session.client_name,
            client_email: clientEmail,
            subject: subject,
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

    console.log(`🤖 IA respondeu: ${aiReply.substring(0, 200)}...`);

    // ========================================================================
    // 5. SALVAR RESPOSTA DA IA
    // ========================================================================

    await supabaseAdmin.from("conversation_messages").insert({
      session_id: session.id,
      channel: "email",
      message_content: aiReply,
      is_from_client: false,
      sender: "agent",
      agent_id: agentId,
      email_subject: `Re: ${subject}`,
      status: "sent",
      timestamp: new Date().toISOString(),
    });

    // ========================================================================
    // 6. ENVIAR RESPOSTA VIA EMAIL
    // ========================================================================

    console.log("📤 Enviando resposta via Email...");

    const sendResponse = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email-message`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          session_id: session.id,
          to_email: clientEmail,
          to_name: session.client_name,
          subject: `Re: ${subject}`,
          message_content: aiReply,
          trigger_reason: "ai_response",
          user_id: session.user_id,
        }),
      }
    );

    if (!sendResponse.ok) {
      console.error("Erro ao enviar email:", await sendResponse.text());
      throw new Error("Falha ao enviar email");
    }

    console.log("✅ Email enviado com sucesso!");

    return new Response(
      JSON.stringify({
        success: true,
        message: "Email recebido e respondido pela IA",
        session_id: session.id,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("❌ ERRO:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
