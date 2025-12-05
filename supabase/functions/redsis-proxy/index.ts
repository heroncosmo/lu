// @ts-ignore
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

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

interface TokenCache {
  token: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

async function getRedsisToken(): Promise<string> {
  // Check cache
  if (tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.token;
  }

  const baseURL = Deno.env.get("REDSIS_API_URL") || "https://api.redsis.com.br";
  const usuario = Deno.env.get("REDSIS_USUARIO") || "REDSIS";
  const senha = Deno.env.get("REDSIS_SENHA") || "1010";
  const servidor = Deno.env.get("REDSIS_SERVIDOR") || "10.1.1.200";
  const porta = Deno.env.get("REDSIS_PORTA") || "8084";

  console.log("🔐 Autenticando no Redsis...");

  const response = await fetch(`${baseURL}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      usuario,
      senha,
      app: "web",
      servidor,
      porta,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Falha na autenticação Redsis: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  // Cache for 50 minutes
  tokenCache = {
    token: data.token,
    expiresAt: Date.now() + 50 * 60 * 1000,
  };

  console.log("✅ Token Redsis obtido com sucesso");
  return data.token;
}

async function callRedsisAPI(method: string, endpoint: string, body?: any): Promise<any> {
  const baseURL = Deno.env.get("REDSIS_API_URL") || "https://api.redsis.com.br";
  const token = await getRedsisToken();

  const url = `${baseURL}/${endpoint}`;
  console.log(`📡 Chamando Redsis: ${method} ${url}`);

  const options: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
  };

  if (body && method !== "GET") {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    // If 401, clear cache and retry once
    if (response.status === 401) {
      console.log("🔄 Token expirado, renovando...");
      tokenCache = null;
      const newToken = await getRedsisToken();
      options.headers = {
        ...options.headers,
        "Authorization": `Bearer ${newToken}`,
      };
      const retryResponse = await fetch(url, options);
      if (!retryResponse.ok) {
        throw new Error(`Erro Redsis: ${retryResponse.status}`);
      }
      return retryResponse.json();
    }
    throw new Error(`Erro Redsis: ${response.status}`);
  }

  return response.json();
}

async function fetchAtividadeByCodigo(codigo: number) {
  const data = await callRedsisAPI("GET", `web/atividades/${codigo}`);
  const atividades = data?.result ?? data;

  if (Array.isArray(atividades) && atividades.length > 0) {
    return atividades[0];
  }

  throw new Error(`Atividade ${codigo} não encontrada no Redsis`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { action, params } = await req.json();

    console.log(`=== REDSIS PROXY: ${action} ===`);
    console.log("Params:", JSON.stringify(params, null, 2));

    let result: any;

    switch (action) {
      // === FUNIS ===
      case "getFunis": {
        const data = await callRedsisAPI("GET", "web/kanban/funis");
        result = data.result || data;
        break;
      }

      case "getSubFunis": {
        const { codigoFunil } = params;
        const data = await callRedsisAPI("GET", `web/kanban/funis/${codigoFunil}/subfunis`);
        result = data.result || data;
        break;
      }

      // === ATIVIDADES ===
      case "getAtividades": {
        const { funil, subfunil, vendedor, situacao, cliente } = params || {};
        const queryParams = new URLSearchParams();
        if (funil) queryParams.append("funil", funil.toString());
        if (subfunil) queryParams.append("subfunil", subfunil.toString());
        if (vendedor) queryParams.append("vendedor", vendedor);
        if (situacao) queryParams.append("situacao", situacao);
        if (cliente) queryParams.append("cliente", cliente.toString());
        
        // Endpoint correto: /web/atividades (não /web/kanban/atividades)
        const endpoint = `web/atividades${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;
        const data = await callRedsisAPI("GET", endpoint);
        result = data.result || data;
        break;
      }

      case "createAtividade": {
        const { codigoFunil, codigoCliente, observacao } = params;
        // Endpoint correto: /web/atividades/{funil} (não /web/kanban/atividades)
        const data = await callRedsisAPI("POST", `web/atividades/${codigoFunil}`, {
          codigo_cliente: codigoCliente,
          observacao: observacao || "",
        });
        result = data.result || data;
        break;
      }

      case "avancarAtividade": {
        const { codigo } = params;
        // Endpoint correto: /web/atividades/{codigo}/avancar
        await callRedsisAPI("PUT", `web/atividades/${codigo}/avancar`);
        result = { success: true };
        break;
      }

      case "retornarAtividade": {
        const { codigo } = params;
        // Endpoint correto: /web/atividades/{codigo}/retornar
        await callRedsisAPI("PUT", `web/atividades/${codigo}/retornar`);
        result = { success: true };
        break;
      }

      case "moverAtividade": {
        const { codigo: codigoRaw, codigoSubfunil } = params || {};
        const atividadeCodigo = typeof codigoRaw === "number" ? codigoRaw : parseInt(codigoRaw, 10);
        if (Number.isNaN(atividadeCodigo)) {
          throw new Error("codigo é obrigatório para mover atividades");
        }

        const targetSubfunil = typeof codigoSubfunil === "number" ? codigoSubfunil : parseInt(codigoSubfunil, 10);
        if (Number.isNaN(targetSubfunil)) {
          throw new Error("codigoSubfunil inválido");
        }

        let atividade = await fetchAtividadeByCodigo(atividadeCodigo);
        let currentSubfunil = atividade?.codigo_subfunil;

        if (typeof currentSubfunil !== "number") {
          throw new Error("Atividade sem código de subfunil");
        }

        if (currentSubfunil === targetSubfunil) {
          result = { success: true, codigo: atividadeCodigo, codigo_subfunil: currentSubfunil };
          break;
        }

        const maxSteps = 10;

        for (let step = 0; step < maxSteps; step++) {
          if (currentSubfunil === targetSubfunil) break;

          const endpoint = currentSubfunil < targetSubfunil
            ? `web/atividades/${atividadeCodigo}/avancar`
            : `web/atividades/${atividadeCodigo}/retornar`;

          await callRedsisAPI("PUT", endpoint);

          atividade = await fetchAtividadeByCodigo(atividadeCodigo);
          const newSubfunil = atividade?.codigo_subfunil;

          if (typeof newSubfunil !== "number") {
            throw new Error("Redsis não retornou o subfunil atualizado");
          }

          if (newSubfunil === currentSubfunil) {
            throw new Error("Redsis não movimentou a atividade");
          }

          currentSubfunil = newSubfunil;
        }

        if (currentSubfunil !== targetSubfunil) {
          throw new Error(`Não foi possível mover a atividade ${atividadeCodigo} para o subfunil ${targetSubfunil}`);
        }

        result = { success: true, codigo: atividadeCodigo, codigo_subfunil: currentSubfunil };
        break;
      }

      // === CLIENTES ===
      case "getClientes": {
        const { vendedor, limite } = params || {};
        const data = await callRedsisAPI("POST", "web/clientes", {
          vendedor: vendedor || "",
          limite: limite || 100,
        });
        result = data.result || data;
        break;
      }

      case "getClienteByCode": {
        const { codigo } = params;
        const data = await callRedsisAPI("GET", `web/clientes/${codigo}`);
        result = data.result || data;
        break;
      }

      // === BUSCAR ATIVIDADE POR CÓDIGO DE CLIENTE ===
      case "getAtividadeByCliente": {
        const { codigoCliente, funil } = params;
        if (!codigoCliente) {
          throw new Error("codigoCliente é obrigatório");
        }
        // Buscar todas as atividades do funil e filtrar pelo cliente
        const queryParams = new URLSearchParams();
        if (funil) queryParams.append("funil", funil.toString());
        queryParams.append("cliente", codigoCliente.toString());
        
        const endpoint = `web/atividades?${queryParams.toString()}`;
        const data = await callRedsisAPI("GET", endpoint);
        const atividades = data.result || data;
        
        // Retornar a primeira atividade encontrada para o cliente
        if (Array.isArray(atividades) && atividades.length > 0) {
          result = atividades[0];
        } else {
          result = null;
        }
        break;
      }

      default:
        throw new Error(`Ação desconhecida: ${action}`);
    }

    console.log(`✅ Resultado: ${JSON.stringify(result).substring(0, 200)}...`);

    return new Response(JSON.stringify({ success: true, data: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("❌ Erro no proxy Redsis:", error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
