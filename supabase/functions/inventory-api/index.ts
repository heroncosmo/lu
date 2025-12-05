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

interface RedsisTokenPayload {
  usuario: string;
  senha: string;
  app: "web";
  servidor: string;
  porta: string;
}

// Cache de token para evitar requisições repetidas
let tokenCache: { token: string; expiresAt: number } | null = null;

async function getRedsisToken(config: {
  baseUrl: string;
  usuario: string;
  senha: string;
  servidor: string;
  porta: string;
}): Promise<string> {
  // Retorna token em cache se ainda válido (50 minutos de margem)
  if (tokenCache && tokenCache.expiresAt > Date.now()) {
    console.log("🔑 Usando token em cache");
    return tokenCache.token;
  }

  console.log("🔐 Obtendo novo token do Redsis...");

  const payload: RedsisTokenPayload = {
    usuario: config.usuario,
    senha: config.senha,
    app: "web",
    servidor: config.servidor,
    porta: config.porta,
  };

  const response = await fetch(`${config.baseUrl}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Falha ao obter token Redsis: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  if (!data.token) {
    throw new Error("Token não retornado pela API Redsis");
  }

  // Cache por 50 minutos (assumindo expiração de 1h)
  tokenCache = {
    token: data.token,
    expiresAt: Date.now() + 50 * 60 * 1000,
  };

  console.log("✅ Token obtido com sucesso");
  return data.token;
}

async function fetchRedsisData(
  endpoint: string,
  config: {
    baseUrl: string;
    usuario: string;
    senha: string;
    servidor: string;
    porta: string;
  },
  params?: Record<string, string | number | undefined>
): Promise<any> {
  const token = await getRedsisToken(config);

  const url = new URL(`${config.baseUrl}${endpoint}`);
  
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });
  }

  console.log(`📡 Requisição Redsis: ${url.toString()}`);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    
    // Se 401, limpa cache e tenta novamente
    if (response.status === 401) {
      console.log("🔄 Token expirado, renovando...");
      tokenCache = null;
      const newToken = await getRedsisToken(config);
      
      const retryResponse = await fetch(url.toString(), {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${newToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!retryResponse.ok) {
        const retryErrorText = await retryResponse.text();
        throw new Error(`Erro Redsis após renovar token: ${retryResponse.status} - ${retryErrorText}`);
      }

      return retryResponse.json();
    }

    throw new Error(`Erro Redsis: ${response.status} - ${errorText}`);
  }

  return response.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Carregar configuração do Redsis do banco de dados
    const { data: redsisConfigRow } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "redsis_config")
      .single();

    const redsisConfig = redsisConfigRow?.value || {};

    const empresaValue = redsisConfig.empresa ?? Deno.env.get("REDSIS_EMPRESA");
    const parsedEmpresa = empresaValue !== undefined && empresaValue !== null && empresaValue !== ''
      ? Number(empresaValue)
      : undefined;

    const config = {
      baseUrl: redsisConfig.baseURL || Deno.env.get("REDSIS_BASE_URL") || "https://api.redsis.com.br",
      usuario: redsisConfig.usuario || Deno.env.get("REDSIS_USUARIO") || "",
      senha: redsisConfig.senha || Deno.env.get("REDSIS_SENHA") || "",
      servidor: redsisConfig.servidor || Deno.env.get("REDSIS_SERVIDOR") || "",
      porta: redsisConfig.porta || Deno.env.get("REDSIS_PORTA") || "",
    };

    if (!config.usuario || !config.senha || !config.servidor || !config.porta) {
      throw new Error("Configuração do Redsis incompleta. Configure as credenciais em /redsis-config");
    }

    const body = await req.json().catch(() => ({}));
    const { action, ...params } = body;
    const ensureEmpresa = (inputParams?: Record<string, string | number | undefined>) => {
      if (parsedEmpresa === undefined || parsedEmpresa === null) {
        return inputParams;
      }
      const finalParams = { ...(inputParams || {}) };
      if (finalParams.empresa === undefined) {
        finalParams.empresa = parsedEmpresa;
      }
      return finalParams;
    };

    console.log(`🎯 Action: ${action}`, params);

    let result: any;

    switch (action) {
      case "getChapas": {
        const data = await fetchRedsisData("/web/estoque/chapas", config, ensureEmpresa(params));
        // A API retorna { result: [...] }
        result = Array.isArray(data) ? data : (data.result || []);
        console.log(`📦 Chapas encontradas: ${result.length}`);
        break;
      }

      case "getCavaletes": {
        const data = await fetchRedsisData("/web/estoque/cavaletes", config, ensureEmpresa(params));
        // A API retorna { result: [...] }
        result = Array.isArray(data) ? data : (data.result || []);
        console.log(`📦 Cavaletes encontrados: ${result.length}`);
        break;
      }

      case "getClientesByVendedor": {
        const { codigoVendedor } = params;
        if (!codigoVendedor) {
          throw new Error("codigoVendedor é obrigatório");
        }
        const data = await fetchRedsisData(`/web/clientes/vendedor/${codigoVendedor}`, config);
        result = Array.isArray(data) ? data : (data.result || []);
        console.log(`👥 Clientes encontrados: ${result.length}`);
        break;
      }

      case "getCliente": {
        const { codigo } = params;
        if (!codigo) {
          throw new Error("codigo é obrigatório");
        }
        result = await fetchRedsisData(`/web/clientes/${codigo}`, config);
        break;
      }

      case "getAnotacoes": {
        const { codigoCliente } = params;
        if (!codigoCliente) {
          throw new Error("codigoCliente é obrigatório");
        }
        // API Redsis usa POST para buscar anotações
        const token = await getRedsisToken(config);
        const response = await fetch(`${config.baseUrl}/web/clientes/${codigoCliente}/anotacoes`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        });
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Erro ao buscar anotações: ${response.status} - ${errorText}`);
        }
        const data = await response.json();
        result = Array.isArray(data) ? data : (data.result || []);
        console.log(`📝 Anotações encontradas: ${result.length}`);
        break;
      }

      case "getTarefas": {
        const { codigoAtividade } = params;
        if (!codigoAtividade) {
          throw new Error("codigoAtividade é obrigatório");
        }
        // API Redsis usa POST para buscar tarefas
        const token2 = await getRedsisToken(config);
        const response2 = await fetch(`${config.baseUrl}/web/atividades/${codigoAtividade}/tarefas`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token2}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        });
        if (!response2.ok) {
          const errorText2 = await response2.text();
          throw new Error(`Erro ao buscar tarefas: ${response2.status} - ${errorText2}`);
        }
        const data2 = await response2.json();
        result = Array.isArray(data2) ? data2 : (data2.result || []);
        console.log(`✅ Tarefas encontradas: ${result.length}`);
        break;
      }

      case "avancarAtividade": {
        const { codigoAtividade } = params;
        if (!codigoAtividade) {
          throw new Error("codigoAtividade é obrigatório");
        }
        const tokenAvancar = await getRedsisToken(config);
        const responseAvancar = await fetch(`${config.baseUrl}/web/atividades/${codigoAtividade}/avancar`, {
          method: "PUT",
          headers: {
            "Authorization": `Bearer ${tokenAvancar}`,
            "Content-Type": "application/json",
          },
        });
        if (!responseAvancar.ok) {
          const errorText = await responseAvancar.text();
          throw new Error(`Erro ao avançar atividade: ${responseAvancar.status} - ${errorText}`);
        }
        result = { success: true, message: "Atividade avançada com sucesso" };
        console.log(`✅ Atividade ${codigoAtividade} avançada`);
        break;
      }

      case "retornarAtividade": {
        const { codigoAtividade } = params;
        if (!codigoAtividade) {
          throw new Error("codigoAtividade é obrigatório");
        }
        const tokenRetornar = await getRedsisToken(config);
        const responseRetornar = await fetch(`${config.baseUrl}/web/atividades/${codigoAtividade}/retornar`, {
          method: "PUT",
          headers: {
            "Authorization": `Bearer ${tokenRetornar}`,
            "Content-Type": "application/json",
          },
        });
        if (!responseRetornar.ok) {
          const errorText = await responseRetornar.text();
          throw new Error(`Erro ao retornar atividade: ${responseRetornar.status} - ${errorText}`);
        }
        result = { success: true, message: "Atividade retornada com sucesso" };
        console.log(`✅ Atividade ${codigoAtividade} retornada`);
        break;
      }

      case "getAtividades": {
        const data = await fetchRedsisData("/web/atividades", config, params);
        result = Array.isArray(data) ? data : (data.result || []);
        console.log(`📋 Atividades encontradas: ${result.length}`);
        break;
      }

      default:
        throw new Error(`Action não suportada: ${action}`);
    }

    return new Response(
      JSON.stringify({ success: true, data: result }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("❌ Erro:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Erro desconhecido",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
