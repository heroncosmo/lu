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
    return new Response("ok", { headers: corsHeaders, status: 200 });
  }

  try {
    console.log("=== INICIANDO FUNÇÃO SEND-EMAIL ===");
    
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    const body = await req.json();
    const { 
      session_id,
      participant_id, 
      campaign_id, 
      to_email, 
      to_name, 
      subject, 
      message_content,
      trigger_reason = 'fallback',
      user_id
    } = body;

    if (!to_email || !message_content) {
      throw new Error("Campos obrigatórios: to_email, message_content");
    }

    console.log(`📧 Enviando email para: ${to_name} <${to_email}>`);

    // === OBTER CONFIGURAÇÃO DE EMAIL DO USUÁRIO ===
    let smtpSettings: any = null;

    if (user_id) {
      const { data: userSettings } = await supabase
        .from("email_settings")
        .select("*")
        .eq("user_id", user_id)
        .single();

      if (userSettings) {
        smtpSettings = userSettings;
      }
    }

    // Fallback para env vars ou SendGrid
    const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY");

    if (!smtpSettings && !SENDGRID_API_KEY) {
      console.warn("⚠️ Email não configurado. Usando mock...");
      
      // MOCK
      await supabase.from("email_logs").insert({
        session_id,
        participant_id,
        user_id,
        to_email,
        from_email: "noreply@mock.com",
        subject: subject || "Mensagem",
        message_content,
        status: "mock_sent",
        trigger_reason,
        sent_at: new Date().toISOString(),
      });

      if (participant_id) {
        await supabase
          .from("campaign_participants")
          .update({
            last_contact_at: new Date().toISOString(),
            preferred_channel: "email",
          })
          .eq("id", participant_id);
      }

      return new Response(
        JSON.stringify({ success: true, message: "Email mockado", mock: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // === ENVIAR VIA SENDGRID API ===
    if (SENDGRID_API_KEY) {
      console.log("📤 Enviando via SendGrid...");
      
      const fromEmail = smtpSettings?.from_email || Deno.env.get("SMTP_FROM_EMAIL") || "noreply@crm.com";
      const fromName = smtpSettings?.from_name || Deno.env.get("SMTP_FROM_NAME") || "CRM System";

      const sgResponse = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SENDGRID_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{
            to: [{ email: to_email, name: to_name || "Cliente" }],
            subject: subject || "Mensagem importante",
          }],
          from: { email: fromEmail, name: fromName },
          content: [{ type: "text/plain", value: message_content }],
        }),
      });

      if (!sgResponse.ok) {
        const errorText = await sgResponse.text();
        console.error("❌ Erro SendGrid:", errorText);
        throw new Error(`Erro SendGrid: ${errorText}`);
      }

      console.log("✅ Email enviado!");
      
      await supabase.from("email_logs").insert({
        session_id,
        participant_id,
        user_id,
        to_email,
        from_email: fromEmail,
        subject: subject || "Mensagem importante",
        message_content,
        status: "sent",
        trigger_reason,
        sent_at: new Date().toISOString(),
      });

      return new Response(
        JSON.stringify({ success: true, message: "Email enviado via SendGrid" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // === SMTP PURO (FUTURO) ===
    // TODO: Implementar SMTP puro quando necessário
    throw new Error("SMTP puro ainda não implementado. Use SendGrid.");

  } catch (error: any) {
    console.error("❌ Erro ao enviar email:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "Erro desconhecido" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
