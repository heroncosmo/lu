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
  "Access-Control-Allow-Headers": "content-type, authorization",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { session_id, event_type, message_content, sender } = await req.json();

    console.log("[STATE MACHINE] Processing event:", { session_id, event_type });

    // Get session and participant info
    const { data: session } = await supabase
      .from("prospecting_sessions")
      .select("*, agents(gpt_api_key)")
      .eq("id", session_id)
      .single();

    if (!session) {
      throw new Error("Session not found");
    }

    // Get participant if exists
    const { data: participant } = await supabase
      .from("campaign_participants")
      .select("*, campaigns(*), lead_states(*)")
      .eq("cliente_whatsapp", session.client_whatsapp_number)
      .single();

    if (!participant) {
      console.log("[STATE MACHINE] No campaign participant found, skipping");
      return new Response(JSON.stringify({ skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check owner lock
    if (participant.lead_states?.owner_lock) {
      console.log("[STATE MACHINE] AI paused due to owner lock");
      return new Response(JSON.stringify({ paused: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Classify intent using GPT
    const classification = await classifyIntent(
      message_content,
      session.agents.gpt_api_key
    );

    console.log("[STATE MACHINE] Intent classified:", classification);

    // Update lead state
    if (classification.temperature !== "unknown") {
      await supabase
        .from("lead_states")
        .update({
          temperature: classification.temperature,
          last_intent: classification.intent,
          updated_at: new Date().toISOString(),
        })
        .eq("participant_id", participant.id);
    }

    // Execute actions based on classification
    const actions = [];

    // Hot lead notification
    if (classification.temperature === "hot") {
      actions.push({
        type: "notify_owner",
        message: `🔥 Lead quente! ${participant.cliente_nome} - ${classification.intent}`,
      });

      // Auto-advance to negotiation
      if (["negociacao", "confirmacao_pedido"].includes(classification.intent)) {
        actions.push({
          type: "advance_stage",
          target: "NEGOCIACAO",
        });
      }
    }

    // Stage transition
    if (classification.nextStage) {
      actions.push({
        type: "advance_stage",
        target: classification.nextStage,
      });
    }

    // Schedule followup
    const followupDays =
      classification.temperature === "cold"
        ? participant.campaigns.cold_followup_days
        : participant.campaigns.hot_followup_days;

    await supabase.from("cadence_queue").insert({
      participant_id: participant.id,
      scheduled_for: new Date(Date.now() + followupDays * 86400000).toISOString(),
      channel: participant.preferred_channel || "whatsapp",
      message_type:
        classification.temperature === "cold" ? "cold_followup" : "warm_followup",
      status: "pending",
    });

    // Create note in CRM via Redsis (TODO: implement actual Redsis call)
    console.log("[STATE MACHINE] Actions to execute:", actions);

    return new Response(
      JSON.stringify({
        success: true,
        classification,
        actions,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[STATE MACHINE] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

// Intent classification function (simplified)
async function classifyIntent(message: string, gptApiKey: string) {
  const hotPatterns = [
    /disponibilidade.*(?:chapa|bundle)/i,
    /reserv(?:a|ar)|hold/i,
    /medida|planta/i,
    /pre[cç]o|or[cç]amento/i,
  ];

  const intent = hotPatterns.some((p) => p.test(message))
    ? "pedido_orcamento"
    : "unknown";
  const temperature = hotPatterns.some((p) => p.test(message)) ? "hot" : "warm";

  return {
    intent,
    temperature,
    confidence: 0.8,
    nextStage: intent === "pedido_orcamento" ? "ORCAMENTO" : undefined,
  };
}
