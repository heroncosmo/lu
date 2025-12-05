// ============================================================================
// Edge Function: send-sms-message
// Descrição: Envia SMS via Twilio API
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
  console.log("=== INICIANDO FUNÇÃO SEND-SMS-MESSAGE ===");

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const {
      session_id,
      participant_id,
      to_number,
      message_content,
      trigger_reason = "manual",
      user_id,
    } = body;

    if (!to_number || !message_content) {
      throw new Error("Campos obrigatórios: to_number, message_content");
    }

    console.log(`📱 Enviando SMS para: ${to_number}`);

    // ========================================================================
    // 1. OBTER CONFIGURAÇÃO TWILIO DO USUÁRIO
    // ========================================================================

    let twilioConfig: any = null;

    if (user_id) {
      const { data: settings, error: settingsError } = await supabaseAdmin
        .from("sms_settings")
        .select("*")
        .eq("user_id", user_id)
        .single();

      if (!settingsError && settings) {
        twilioConfig = settings;
      }
    }

    // Fallback para configuração global (env vars)
    if (!twilioConfig) {
      const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
      const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
      const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER");

      if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
        console.warn("⚠️ Twilio não configurado. Usando mock para desenvolvimento.");

        // MOCK: Simular envio de SMS
        const mockLog = {
          session_id,
          participant_id,
          user_id,
          to_number,
          from_number: "+15551234567",
          message_content,
          status: "mock_sent",
          trigger_reason,
          sent_at: new Date().toISOString(),
        };

        console.log("📱 [MOCK] SMS simulado:", mockLog);

        // Salvar log
        await supabaseAdmin.from("sms_logs").insert(mockLog);

        return new Response(
          JSON.stringify({
            success: true,
            message: "SMS mockado (Twilio não configurado)",
            mock: true,
            sid: "MOCK_" + Date.now(),
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          }
        );
      }

      twilioConfig = {
        account_sid: TWILIO_ACCOUNT_SID,
        auth_token: TWILIO_AUTH_TOKEN,
        phone_number: TWILIO_PHONE_NUMBER,
      };
    }

    // ========================================================================
    // 2. ENVIAR SMS VIA TWILIO API
    // ========================================================================

    console.log(`📤 Enviando SMS via Twilio de ${twilioConfig.phone_number}...`);

    // Twilio usa Basic Auth
    const authString = btoa(
      `${twilioConfig.account_sid}:${twilioConfig.auth_token}`
    );

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioConfig.account_sid}/Messages.json`;

    const formBody = new URLSearchParams({
      To: to_number,
      From: twilioConfig.phone_number,
      Body: message_content,
    });

    const twilioResponse = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${authString}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formBody.toString(),
    });

    if (!twilioResponse.ok) {
      const errorText = await twilioResponse.text();
      console.error("❌ Erro Twilio:", errorText);
      throw new Error(`Erro ao enviar SMS: ${errorText}`);
    }

    const twilioData = await twilioResponse.json();
    console.log("✅ SMS enviado via Twilio:", twilioData.sid);

    // ========================================================================
    // 3. SALVAR LOG NO BANCO
    // ========================================================================

    const logData = {
      session_id,
      participant_id,
      user_id,
      to_number,
      from_number: twilioConfig.phone_number,
      message_content,
      twilio_sid: twilioData.sid,
      twilio_status: twilioData.status,
      status: "sent",
      trigger_reason,
      sent_at: new Date().toISOString(),
    };

    const { error: logError } = await supabaseAdmin
      .from("sms_logs")
      .insert(logData);

    if (logError) {
      console.error("⚠️ Erro ao salvar log:", logError);
      // Não falhar a requisição por causa do log
    }

    // ========================================================================
    // 4. ATUALIZAR PARTICIPANT (se aplicável)
    // ========================================================================

    if (participant_id) {
      await supabaseAdmin
        .from("campaign_participants")
        .update({
          last_contact_at: new Date().toISOString(),
          preferred_channel: "sms",
        })
        .eq("id", participant_id);
    }

    // ========================================================================
    // 5. RETORNAR SUCESSO
    // ========================================================================

    return new Response(
      JSON.stringify({
        success: true,
        message: "SMS enviado com sucesso",
        sid: twilioData.sid,
        status: twilioData.status,
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
