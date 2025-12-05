// @ts-nocheck
// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RedsisActivity = {
  codigo: number;
  codigo_cliente: number;
  cliente_nome?: string;
  situacao?: string;
  codigo_funil?: number;
  funil?: string;
  codigo_subfunil?: number;
  subfunil?: string;
  codigo_responsavel?: number;
  responsavel_nome?: string;
  data_atualizacao?: string;
};

type RedsisClientPayload = {
  codigo: number;
  nome?: string;
  razao_social?: string;
  nome_fantasia?: string;
  cnpj?: string;
  cpf?: string;
  telefone?: string;
  celular?: string;
  whatsapp?: string;
  email?: string;
  cidade?: string;
  estado?: string;
  pais?: string;
  timezone?: string;
  temperatura?: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = performance.now();
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const inferredRunType = body.run_type || (req.headers.has("x-cron-trigger") ? "scheduled" : "manual");
    const runType: "manual" | "scheduled" = inferredRunType === "scheduled" ? "scheduled" : "manual";
    const allowedStatuses: string[] = body.statuses || ["A_TRABALHAR"];

    // Load Redsis configuration
    const { data: redsisConfigRow } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "redsis_config")
      .single();

    const redsisConfig = redsisConfigRow?.value || {};

    const redsisBaseUrl = redsisConfig.baseURL || Deno.env.get("REDSIS_BASE_URL") || "https://api.redsis.com.br";
    const redsisUsuario = redsisConfig.usuario || Deno.env.get("REDSIS_USUARIO") || "REDSIS";
    const redsisSenha = redsisConfig.senha || Deno.env.get("REDSIS_SENHA") || "1010";
    const redsisServidor = redsisConfig.servidor || Deno.env.get("REDSIS_SERVIDOR") || "10.1.1.200";
    const redsisPorta = redsisConfig.porta || Deno.env.get("REDSIS_PORTA") || "8084";

    const redsisAuth = btoa(`${redsisUsuario}:${redsisSenha}`);
    const redsisHeaders = {
      "Authorization": `Basic ${redsisAuth}`,
      "Content-Type": "application/json",
    };

    console.log("=== CRM CONTACT SYNC START ===");
    console.log(`Statuses: ${allowedStatuses.join(", ")}`);

    const atividades: RedsisActivity[] = [];

    for (const status of allowedStatuses) {
      const url = new URL(`${redsisBaseUrl}/web/atividades`);
      url.searchParams.set("situacao", status);
      url.searchParams.set("servidor", redsisServidor);
      url.searchParams.set("porta", redsisPorta);

      const response = await fetch(url, { headers: redsisHeaders });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Erro ao buscar atividades: ${response.status} ${text}`);
      }

      const json = await response.json();
      const result = Array.isArray(json) ? json : json.result || [];
      atividades.push(...(result as RedsisActivity[]));
    }

    console.log(`Atividades carregadas: ${atividades.length}`);

    const clientCodes = Array.from(
      new Set(
        atividades
          .map((a) => a.codigo_cliente)
          .filter((codigo): codigo is number => typeof codigo === "number")
      )
    );

    if (clientCodes.length === 0) {
      console.log("Nenhum cliente encontrado nas atividades.");
      await logSyncResult(supabaseAdmin, {
        run_type: runType,
        total_contacts: 0,
        inserted_count: 0,
        updated_count: 0,
        skipped_count: 0,
        duration_ms: Math.round(performance.now() - startTime),
        status: "success",
      });

      return new Response(JSON.stringify({ success: true, contacts: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Clientes únicos extraídos: ${clientCodes.length}`);

    // Load existing contacts map
    const { data: existingContacts } = await supabaseAdmin
      .from("crm_contacts")
      .select("id, crm_client_code")
      .in("crm_client_code", clientCodes);

    const existingMap = new Map<number, string>();
    existingContacts?.forEach((contact) => {
      existingMap.set(contact.crm_client_code, contact.id);
    });

    const payloads: any[] = [];
    let skippedCount = 0;

    for (const codigoCliente of clientCodes) {
      try {
        const cliente = await fetchCliente({
          baseUrl: redsisBaseUrl,
          headers: redsisHeaders,
          servidor: redsisServidor,
          porta: redsisPorta,
          codigo: codigoCliente,
        });

        if (!cliente) {
          skippedCount++;
          continue;
        }

        const atividade = atividades.find((a) => a.codigo_cliente === codigoCliente);

        payloads.push({
          crm_client_code: codigoCliente,
          name: cliente.nome || cliente.razao_social || cliente.nome_fantasia || `Cliente ${codigoCliente}`,
          trade_name: cliente.nome_fantasia,
          document: cliente.cnpj || cliente.cpf,
          is_active: true,
          kanban_funil_code: atividade?.codigo_funil,
          kanban_funil_name: atividade?.funil,
          kanban_stage_code: atividade?.codigo_subfunil,
          kanban_stage_name: atividade?.subfunil,
          kanban_status: atividade?.situacao,
          owner_identifier: atividade?.codigo_responsavel?.toString(),
          owner_name: atividade?.responsavel_nome,
          phone: cliente.telefone || cliente.celular,
          whatsapp: cliente.whatsapp || cliente.celular,
          email: cliente.email,
          city: cliente.cidade,
          state: cliente.estado,
          country: cliente.pais || "Brasil",
          timezone: cliente.timezone || "America/Sao_Paulo",
          temperature: cliente.temperatura,
          last_activity_at: atividade?.data_atualizacao ? new Date(atividade.data_atualizacao).toISOString() : null,
          status_updated_at: atividade?.data_atualizacao ? new Date(atividade.data_atualizacao).toISOString() : null,
          raw_payload: { cliente, atividade },
          synced_at: new Date().toISOString(),
        });
      } catch (clientError) {
        console.error(`Erro ao sincronizar cliente ${codigoCliente}:`, clientError);
        skippedCount++;
      }
    }

    if (payloads.length === 0) {
      throw new Error("Falha ao montar payloads dos clientes");
    }

    const insertedCount = payloads.filter((p) => !existingMap.has(p.crm_client_code)).length;
    const updatedCount = payloads.length - insertedCount;

    const { error: upsertError } = await supabaseAdmin
      .from("crm_contacts")
      .upsert(payloads, { onConflict: "crm_client_code" });

    if (upsertError) {
      throw upsertError;
    }

    // Mark contacts not returned in this sync as inactive
    const missingCodes = existingMapKeysNotIn(clientCodes, existingMap);
    if (missingCodes.length > 0) {
      await supabaseAdmin
        .from("crm_contacts")
        .update({ is_active: false })
        .in("crm_client_code", missingCodes);
    }

    await logSyncResult(supabaseAdmin, {
      run_type: runType,
      total_contacts: payloads.length,
      inserted_count: insertedCount,
      updated_count: updatedCount,
      skipped_count: skippedCount,
      duration_ms: Math.round(performance.now() - startTime),
      status: "success",
    });

    return new Response(
      JSON.stringify({
        success: true,
        contacts: payloads.length,
        inserted: insertedCount,
        updated: updatedCount,
        skipped: skippedCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("❌ CRM SYNC ERROR", error);

    await logSyncResult(supabaseAdmin, {
      run_type: req.headers.has("x-cron-trigger") ? "scheduled" : "manual",
      total_contacts: 0,
      inserted_count: 0,
      updated_count: 0,
      skipped_count: 0,
      duration_ms: Math.round(performance.now() - startTime),
      status: "error",
      error_message: error?.message || "Unknown error",
    });

    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

async function fetchCliente(params: {
  baseUrl: string;
  headers: Record<string, string>;
  servidor: string;
  porta: string;
  codigo: number;
}): Promise<RedsisClientPayload | null> {
  const { baseUrl, headers, servidor, porta, codigo } = params;
  const url = new URL(`${baseUrl}/web/clientes/${codigo}`);
  url.searchParams.set("servidor", servidor);
  url.searchParams.set("porta", porta);

  const response = await fetch(url, { headers });
  if (!response.ok) {
    console.warn(`Cliente ${codigo} não encontrado (${response.status})`);
    return null;
  }

  const json = await response.json();
  if (Array.isArray(json)) {
    return json[0] as RedsisClientPayload;
  }

  return (json.result?.[0] || json) as RedsisClientPayload;
}

function existingMapKeysNotIn(currentCodes: number[], map: Map<number, string>) {
  const currentSet = new Set(currentCodes);
  const missing: number[] = [];
  for (const code of map.keys()) {
    if (!currentSet.has(code)) {
      missing.push(code);
    }
  }
  return missing;
}

async function logSyncResult(supabaseAdmin: any, payload: {
  run_type: "manual" | "scheduled";
  total_contacts: number;
  inserted_count: number;
  updated_count: number;
  skipped_count: number;
  duration_ms: number;
  status: "success" | "error";
  error_message?: string;
}) {
  await supabaseAdmin.from("crm_sync_logs").insert({
    run_type: payload.run_type,
    total_contacts: payload.total_contacts,
    inserted_count: payload.inserted_count,
    updated_count: payload.updated_count,
    skipped_count: payload.skipped_count,
    duration_ms: payload.duration_ms,
    status: payload.status,
    error_message: payload.error_message,
    finished_at: new Date().toISOString(),
  });
}
