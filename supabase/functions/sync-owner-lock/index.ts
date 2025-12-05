/**
 * Owner Lock Sync with Redsis CRM
 * Sincroniza lead_states.owner_id <-> Redsis atividade.codigo_responsavel
 * Previne colisões quando vendedor assume lead manualmente no CRM
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { direction, lead_state_id, atividade_codigo } = await req.json();

    console.log("=== OWNER LOCK SYNC ===");
    console.log(`Direction: ${direction}`);
    console.log(`Lead State ID: ${lead_state_id}`);
    console.log(`Atividade Codigo: ${atividade_codigo}`);

    // Redsis API config
    const redsisBaseUrl = Deno.env.get("REDSIS_BASE_URL") || "https://api.redsis.com.br";
    const redsisUsuario = Deno.env.get("REDSIS_USUARIO") || "REDSIS";
    const redsisSenha = Deno.env.get("REDSIS_SENHA") || "1010";
    const redsisServidor = Deno.env.get("REDSIS_SERVIDOR") || "10.1.1.200";
    const redsisPorta = Deno.env.get("REDSIS_PORTA") || "8084";

    // Build Redsis auth token
    const redsisAuth = btoa(`${redsisUsuario}:${redsisSenha}`);
    const redsisHeaders = {
      "Authorization": `Basic ${redsisAuth}`,
      "Content-Type": "application/json",
    };

    if (direction === "from_supabase_to_redsis") {
      // SUPABASE → REDSIS
      // Quando owner_id muda no Supabase, atualiza codigo_responsavel no Redsis
      
      const { data: leadState, error: lsError } = await supabaseAdmin
        .from("lead_states")
        .select("owner_id, atividade_codigo, users:owner_id(id, email)")
        .eq("id", lead_state_id)
        .single();

      if (lsError || !leadState) {
        throw new Error("Lead state not found");
      }

      if (!leadState.atividade_codigo) {
        console.log("⚠️ No atividade_codigo linked - skipping Redsis sync");
        return new Response(JSON.stringify({ success: true, skipped: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get user's Redsis codigo_responsavel mapping
      // (Assumindo que temos uma tabela user_settings ou similar)
      const { data: userMapping } = await supabaseAdmin
        .from("app_settings")
        .select("value")
        .eq("key", `redsis_user_mapping_${leadState.owner_id}`)
        .single();

      const redsisCodigoResponsavel = userMapping?.value 
        ? parseInt(userMapping.value) 
        : 1; // Default to system user

      // Update Redsis atividade
      const redsisUrl = `${redsisBaseUrl}/atividades/${leadState.atividade_codigo}`;
      const redsisResponse = await fetch(redsisUrl, {
        method: "PATCH",
        headers: redsisHeaders,
        body: JSON.stringify({
          codigo_responsavel: redsisCodigoResponsavel,
          servidor: redsisServidor,
          porta: redsisPorta,
        }),
      });

      if (!redsisResponse.ok) {
        const errorText = await redsisResponse.text();
        throw new Error(`Redsis update failed: ${errorText}`);
      }

      console.log(`✅ Synced owner to Redsis: codigo_responsavel=${redsisCodigoResponsavel}`);

      return new Response(JSON.stringify({ 
        success: true, 
        direction: "supabase_to_redsis",
        redsis_codigo_responsavel: redsisCodigoResponsavel 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (direction === "from_redsis_to_supabase") {
      // REDSIS → SUPABASE
      // Quando codigo_responsavel muda no Redsis, atualiza owner_id no Supabase
      
      // Fetch atividade from Redsis
      const redsisUrl = `${redsisBaseUrl}/atividades/${atividade_codigo}`;
      const redsisResponse = await fetch(
        `${redsisUrl}?servidor=${redsisServidor}&porta=${redsisPorta}`,
        { headers: redsisHeaders }
      );

      if (!redsisResponse.ok) {
        throw new Error("Atividade not found in Redsis");
      }

      const atividade = await redsisResponse.json();
      const redsisCodigoResponsavel = atividade.codigo_responsavel;

      // Find Supabase user by Redsis codigo mapping
      const { data: userMapping } = await supabaseAdmin
        .from("app_settings")
        .select("key, value")
        .like("key", "redsis_user_mapping_%")
        .eq("value", redsisCodigoResponsavel.toString())
        .single();

      if (!userMapping) {
        console.log(`⚠️ No Supabase user mapped to codigo_responsavel=${redsisCodigoResponsavel}`);
        return new Response(JSON.stringify({ 
          success: true, 
          skipped: true,
          reason: "No user mapping found" 
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const supabaseUserId = userMapping.key.replace("redsis_user_mapping_", "");

      // Update lead_states
      const { error: updateError } = await supabaseAdmin
        .from("lead_states")
        .update({
          owner_id: supabaseUserId,
          owner_lock: true,
          owner_locked_at: new Date().toISOString(),
          owner_lock_reason: "Sync from Redsis",
        })
        .eq("atividade_codigo", atividade_codigo);

      if (updateError) {
        throw updateError;
      }

      console.log(`✅ Synced owner from Redsis: owner_id=${supabaseUserId}`);

      return new Response(JSON.stringify({ 
        success: true, 
        direction: "redsis_to_supabase",
        supabase_owner_id: supabaseUserId 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else {
      throw new Error("Invalid direction. Use 'from_supabase_to_redsis' or 'from_redsis_to_supabase'");
    }

  } catch (error) {
    console.error("=== SYNC ERROR ===", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
