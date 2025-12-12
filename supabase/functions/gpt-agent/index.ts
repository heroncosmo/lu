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
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// Função para simular delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function getLastClientMessageId(messages: any[]): string | null {
  const lastClient = [...messages].reverse().find((m) => m.sender === "client");
  return lastClient?.id ?? null;
}

function buildFormattedHistory(messages: any[], image_url?: string): any[] {
  const out: any[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const isLastMessage = i === messages.length - 1;
    const isUserMessage = msg.sender !== "agent";

    // Se é a última mensagem do usuário e temos uma imagem, usar formato Vision
    if (isLastMessage && isUserMessage && image_url) {
      console.log("📸 Adicionando imagem à última mensagem do usuário (Vision mode)");
      out.push({
        role: "user",
        content: [
          {
            type: "text",
            text: msg.message_content,
          },
          {
            type: "image_url",
            image_url: { url: image_url },
          },
        ],
      });
      continue;
    }

    // Mensagem normal (texto)
    out.push({
      role: isUserMessage ? "user" : "assistant",
      content: msg.message_content,
    });
  }

  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("=== INICIANDO FUNÇÃO GPT-AGENT ===");
    
    const requestBody = await req.json();
    const { session_id, image_url } = requestBody;
    console.log("Session ID recebido:", session_id);
    console.log("Imagem recebida:", image_url ? "Sim (Vision mode)" : "Não");
    
    if (!session_id) {
      throw new Error("session_id is required");
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Buscar dados completos da sessão com informações do cliente e configurações de delay
    console.log("Buscando dados da sessão...");
    const { data: sessionData, error: sessionError } = await supabaseAdmin
      .from("prospecting_sessions")
      .select(`
        id,
        client_name,
        client_whatsapp_number,
        client_notes,
        status,
        agents (
          instructions,
          gpt_api_key,
          gpt_model,
          response_delay_seconds,
          word_delay_seconds
        )
      `)
      .eq("id", session_id)
      .single();

    if (sessionError || !sessionData) {
      console.error("Erro ao buscar sessão:", sessionError);
      throw new Error(`Sessão não encontrada: ${sessionError?.message}`);
    }

    console.log("Dados da sessão:", JSON.stringify(sessionData, null, 2));

    const agent = sessionData.agents as any;
    if (!agent || !agent.instructions || !agent.gpt_api_key) {
      console.error("Configuração do agente incompleta:", agent);
      throw new Error("A configuração do agente está incompleta.");
    }

    // Usar o modelo configurado; fallback apenas se ausente
    const gptModel = agent.gpt_model ?? (() => {
      console.warn("Agente sem gpt_model definido, usando fallback gpt-4o");
      return "gpt-4o";
    })();
    const responseDelay = agent.response_delay_seconds || 30;
    const wordDelay = agent.word_delay_seconds || 1.6;
    
    console.log("=== CONFIGURAÇÃO DO AGENTE ===");
    console.log("Modelo GPT:", gptModel);
    console.log("Instruções:", agent.instructions);
    console.log("Delay de resposta (leitura):", responseDelay, "segundos");
    console.log("Delay por palavra (digitação):", wordDelay, "segundos");

    // Buscar histórico completo da conversa
    console.log("Buscando histórico de mensagens...");
    const { data: initialMessages, error: messagesError } = await supabaseAdmin
      .from("whatsapp_messages")
      .select("id, sender, message_content, timestamp")
      .eq("session_id", session_id)
      .order("timestamp", { ascending: true });

    if (messagesError) {
      console.error("Erro ao buscar mensagens:", messagesError);
      throw new Error(`Falha ao buscar mensagens: ${messagesError.message}`);
    }

    let messages = initialMessages || [];

    console.log("=== HISTÓRICO DE MENSAGENS ===");
    console.log("Número de mensagens:", messages.length);
    console.log("Mensagens:", JSON.stringify(messages, null, 2));

    // === BUSCAR ANOTAÇÕES DO CLIENTE PARA CONTEXTO DA IA ===
    // Primeiro verificar anotações salvas diretamente na sessão (do formulário)
    let clientAnnotationsContext = "";
    
    if (sessionData.client_notes && sessionData.client_notes.trim()) {
      console.log("=== ANOTAÇÕES DO FORMULÁRIO ENCONTRADAS ===");
      console.log("Anotações:", sessionData.client_notes);
      clientAnnotationsContext = `

📝 ANOTAÇÕES DO CLIENTE (informações do vendedor):
${sessionData.client_notes}

USE ESTAS INFORMAÇÕES PARA PERSONALIZAR TODAS AS RESPOSTAS!`;
    }
    
    // Depois buscar o crm_contact para obter o crm_client_code
    const { data: crmContact } = await supabaseAdmin
      .from("crm_contacts")
      .select("id, crm_client_code, notes, segment, kanban_status")
      .eq("name", sessionData.client_name)
      .single();

    if (crmContact?.crm_client_code) {
      // Buscar anotações da IA sobre este cliente
      const { data: annotations } = await supabaseAdmin
        .from("client_annotations")
        .select("annotation_type, content, importance, created_at")
        .eq("crm_client_code", crmContact.crm_client_code)
        .eq("is_active", true)
        .order("importance", { ascending: false })
        .limit(10);

      if (annotations && annotations.length > 0) {
        console.log("=== ANOTAÇÕES DO CLIENTE ENCONTRADAS ===");
        console.log("Número de anotações:", annotations.length);
        
        clientAnnotationsContext = `

ANOTAÇÕES IMPORTANTES SOBRE O CLIENTE:
${annotations.map(a => `- [${a.annotation_type.toUpperCase()}] ${a.content}`).join('\n')}

USE ESTAS INFORMAÇÕES PARA PERSONALIZAR A CONVERSA. Por exemplo:
- Se o cliente é "calmo", use tom mais sereno
- Se há preferências de horário, respeite
- Se há contexto sobre saúde/família, demonstre empatia
- Se há histórico de negociação, lembre-se das condições`;
      }

      // Incluir notas gerais do CRM se existirem
      if (crmContact.notes) {
        clientAnnotationsContext += `

NOTAS DO CRM SOBRE O CLIENTE:
${crmContact.notes}`;
      }
    }

    // Construir o contexto da conversa com as instruções do agente
    const systemPrompt = `Você é um agente de prospecção de vendas com as seguintes características e instruções:

${agent.instructions}

CONTEXTO ATUAL:
- Cliente: ${sessionData.client_name}
- WhatsApp: ${sessionData.client_whatsapp_number}
- Status da conversa: ${sessionData.status}
${clientAnnotationsContext}

CAPACIDADES ESPECIAIS (MUITO IMPORTANTE - LEIA COM ATENÇÃO):
- Você PODE ver e analisar imagens que o cliente enviar. Se receber uma imagem, descreva o que você vê e responda de forma relevante.
- Você PODE receber áudios! Os áudios do cliente são AUTOMATICAMENTE TRANSCRITOS para texto antes de chegar a você. Quando o cliente envia um áudio, você recebe o texto da transcrição. NUNCA diga que não consegue ouvir áudios - você já está recebendo o conteúdo transcrito!
- Se a mensagem do cliente parece uma fala natural (como "Beleza, mas você tá me ouvindo?"), é porque foi um áudio transcrito. Responda normalmente ao conteúdo.

REGRAS IMPORTANTES PARA RESPOSTAS:
1. Seja sempre amigável, profissional e persuasivo
2. Personalize todas as mensagens para o cliente ${sessionData.client_name}
3. Seja breve e direto ao ponto
4. Mantenha o tom de conversa, não de discurso
5. Responda diretamente ao que o cliente disse
6. Não repita informações já mencionadas
7. Use linguagem coloquial e natural
8. SIGA EXATAMENTE AS INSTRUÇÕES DO AGENTE ACIMA
9. Se o cliente enviar uma imagem, analise-a e responda de forma relevante ao conteúdo da imagem
10. NUNCA diga "não consigo ouvir áudios" ou "me manda por escrito" - você JÁ recebe os áudios transcritos!

CONTINUIDADE DA CONVERSA (CRÍTICO):
- Você está no MEIO de uma conversa, NÃO no início. O histórico acima mostra tudo que já foi dito.
- NUNCA reinicie a prospecção ou cumprimente como se fosse a primeira mensagem.
- Se o cliente diz "blz", "ok", "beleza", "tá bom", "pode ser", continue a conversa naturalmente, não recomece.
- Respostas curtas do cliente (1-2 palavras) são confirmações, não pedidos para recomeçar.
- Mantenha o fluxo da conversa - leia o histórico para entender onde vocês pararam.
- Se já houve troca de mensagens, você já se apresentou. NÃO se apresente novamente.

FORMATO DAS RESPOSTAS:
- Escreva TUDO EM UM ÚNICO PARÁGRAFO
- NÃO USE QUEBRAS DE LINHA
- Use apenas espaços simples entre as frases
- Pareça uma mensagem de WhatsApp real e natural
- Máximo 2-3 frases por resposta para não ficar muito longo

IMPORTANTE: Sua personalidade e forma de falar devem seguir EXATAMENTE as instruções do agente fornecidas acima.

=== DETECÇÃO AUTOMÁTICA DE AGENDAMENTOS (MUITO IMPORTANTE) ===
ANALISE TODO O HISTÓRICO DA CONVERSA para detectar se o cliente PEDIU para ser contatado em um momento futuro.
Exemplos de pedidos:
- "fala comigo daqui 2 horas" → agendar 2 horas
- "me chama amanhã" → agendar 1 dia
- "pode ligar daqui 30 minutos" → agendar 30 minutos
- "volta a falar comigo em 5 minutos" → agendar 5 minutos
- "chama eu daqui 4 minutos" → agendar 4 minutos
- "agora não dá, me liga depois" → agendar 1 hora (default)
- "tô ocupado, volta depois" → agendar 1 hora (default)

QUANDO DETECTAR UM PEDIDO DE AGENDAMENTO, FAÇA AS DUAS COISAS:
1. NA SUA RESPOSTA: Mencione que você vai retornar conforme o cliente pediu! Exemplo: "Beleza, te chamo daqui a 4 minutos então!" ou "Tá certo, volto a falar contigo em 5 minutinhos!"
2. NO FINAL: Adicione a tag [AGENDAR:X:UNIDADE:MOTIVO]

Onde:
- X = número (ex: 2, 30, 5)
- UNIDADE = minutes, hours ou days
- MOTIVO = breve descrição

Exemplos de formato:
[AGENDAR:5:minutes:Cliente pediu para falar daqui 5 minutos]
[AGENDAR:2:hours:Cliente está ocupado]
[AGENDAR:1:days:Retomar conversa amanhã]

Se NÃO houver pedido de agendamento, NÃO inclua nada extra.
O sistema vai remover essa tag antes de enviar ao cliente.

Exemplo de formato correto:
Que bom ouvir isso, Rodrigo! Tudo tranquilo por aqui também, graças a Deus. Como estão as coisas por aí? Muita porreria ou tá de boa?`;

    // === CONFIGURAÇÃO DE MODELOS OPENAI (Junho 2025) ===
    // Baseado na documentação oficial: https://platform.openai.com/docs/guides/latest-model
    // 
    // GPT-5 Series (gpt-5.1, gpt-5, gpt-5-mini, gpt-5-nano, gpt-5-pro):
    //   - Usa role "developer" (não "system")
    //   - Usa max_completion_tokens (não max_tokens)
    //   - TODOS requerem reasoning_effort obrigatório
    //   - gpt-5.1: suporta "none", "low", "medium", "high" (default: none)
    //   - gpt-5, gpt-5-mini, gpt-5-nano: suporta "low", "medium", "high" (NÃO suporta "none"!)
    //   - gpt-5-pro: suporta "medium", "high" (default: high, mais inteligente)
    //   - NÃO suporta temperature (exceto gpt-5.1 com reasoning=none)
    //
    // GPT-4.1 Series (gpt-4.1, gpt-4.1-mini, gpt-4.1-nano):
    //   - Usa role "developer" 
    //   - Usa max_completion_tokens
    //   - NÃO usa reasoning_effort (não é modelo de raciocínio)
    //   - Suporta temperature
    //
    // O-series (o3, o3-mini, o4-mini):
    //   - Usa role "developer"
    //   - Usa max_completion_tokens + reasoning_effort
    //
    // Modelos legados (gpt-4o, gpt-4-turbo, etc):
    //   - Usa role "system"
    //   - Usa max_tokens + temperature
    
    const isGpt5Series = gptModel.startsWith('gpt-5');
    const isGpt51 = gptModel.startsWith('gpt-5.1');
    const isGpt5Pro = gptModel === 'gpt-5-pro';
    const isGpt41Series = gptModel.startsWith('gpt-4.1');
    const isOSeries = gptModel.startsWith('o3') || gptModel.startsWith('o4');
    const isNewModel = isGpt5Series || isGpt41Series || isOSeries;
    
    // Role: developer para modelos novos, system para legados
    const systemRole = isNewModel ? "developer" : "system";

    let lastClientMessageId = getLastClientMessageId(messages);

    // Construir o histórico da conversa para o GPT
    let formattedMessages: any[] = [
      { role: systemRole, content: systemPrompt },
      ...buildFormattedHistory(messages, image_url),
    ];

    console.log("=== MENSAGENS FORMATADAS PARA O GPT ===");
    console.log("Número de mensagens formatadas:", formattedMessages.length);
    console.log("Modo Vision:", image_url ? "Ativado" : "Desativado");
    console.log("Última mensagem do usuário:", typeof formattedMessages[formattedMessages.length - 1]?.content === 'string' 
      ? formattedMessages[formattedMessages.length - 1]?.content 
      : "[Mensagem com imagem]");

    // === SIMULAÇÃO DE TEMPO DE LEITURA ===
    // NOTA: NÃO verificamos mais novas mensagens aqui porque:
    // 1. O batching em receive-whatsapp-message já aguarda TODAS as mensagens estabilizarem
    // 2. Quando gpt-agent é chamado, já temos todas as mensagens do lote
    // 3. Se nova mensagem chegar depois, será um NOVO lote processado separadamente
    // 4. Verificar aqui causava loop infinito de cancelamentos sem resposta
    console.log(`=== SIMULANDO TEMPO DE LEITURA (${responseDelay}s) ===`);
    await delay(responseDelay * 1000);
    console.log(`✅ Delay de leitura concluído`);

    // Rebuscar histórico após o delay para evitar responder sem as últimas mensagens
    // que podem chegar durante o "tempo de leitura".
    console.log("=== REBUSCANDO HISTÓRICO APÓS DELAY ===");
    const { data: messagesAfterDelay, error: messagesAfterDelayError } = await supabaseAdmin
      .from("whatsapp_messages")
      .select("id, sender, message_content, timestamp")
      .eq("session_id", session_id)
      .order("timestamp", { ascending: true });

    if (messagesAfterDelayError) {
      console.warn("⚠️ Falha ao rebuscar mensagens após delay (seguindo com histórico inicial):", messagesAfterDelayError);
    } else if (messagesAfterDelay) {
      const lastClientAfterDelay = getLastClientMessageId(messagesAfterDelay);
      const changed = messagesAfterDelay.length !== messages.length || lastClientAfterDelay !== lastClientMessageId;

      if (changed) {
        console.log("🔄 Histórico atualizado após delay. Reformatando mensagens...");
        console.log("Mensagens antes:", messages.length, "| depois:", messagesAfterDelay.length);
        console.log("Última msg client antes:", lastClientMessageId, "| depois:", lastClientAfterDelay);

        messages = messagesAfterDelay;
        lastClientMessageId = lastClientAfterDelay;
        formattedMessages = [
          { role: systemRole, content: systemPrompt },
          ...buildFormattedHistory(messages, image_url),
        ];
      } else {
        console.log("✅ Nenhuma mudança no histórico após delay");
      }
    }

    console.log("=== CHAMANDO API DA OPENAI ===");
    
    // Parâmetros de tokens
    const tokenParam = isNewModel ? { max_completion_tokens: 1000 } : { max_tokens: 1000 };
    
    // Parâmetros extras (reasoning_effort / temperature)
    let extraParams: Record<string, any> = {};
    
    if (isGpt5Series) {
      // Todos os modelos GPT-5 requerem reasoning_effort
      if (isGpt5Pro) {
        // gpt-5-pro: default é high, é o mais inteligente
        extraParams = { reasoning_effort: "medium" };
      } else if (isGpt51) {
        // gpt-5.1: suporta "none" para resposta rápida
        extraParams = { reasoning_effort: "none" };
      } else {
        // gpt-5, gpt-5-mini, gpt-5-nano: mínimo é "low", NÃO suporta "none"
        extraParams = { reasoning_effort: "low" };
      }
    } else if (isOSeries) {
      // O-series também precisa de reasoning_effort
      extraParams = { reasoning_effort: "low" };
    } else if (isGpt41Series) {
      // GPT-4.1 não é modelo de raciocínio, suporta temperature
      extraParams = { temperature: 0.8 };
    } else if (!isNewModel) {
      // Modelos legados (gpt-4o, gpt-4-turbo, etc)
      extraParams = { temperature: 0.8 };
    }
    
    console.log(`🧠 Modelo: ${gptModel} | isNewModel: ${isNewModel} | systemRole: ${systemRole} | extraParams:`, JSON.stringify(extraParams));
    
    // Chamada primária
    let openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${agent.gpt_api_key}`,
      },
      body: JSON.stringify({
        model: gptModel,
        messages: formattedMessages,
        ...tokenParam,
        ...extraParams,
      }),
    });

    // SEM FALLBACK - vamos mostrar o erro real da API
    if (!openaiResponse.ok) {
      let errorBody: any = null;
      try { errorBody = await openaiResponse.json(); } catch { errorBody = await openaiResponse.text(); }
      console.error("❌ Erro na API da OpenAI:", typeof errorBody === 'string' ? errorBody : JSON.stringify(errorBody, null, 2));
      console.error("❌ Status:", openaiResponse.status);
      console.error("❌ Modelo usado:", gptModel);
      console.error("❌ isNewModel:", isNewModel);
      const errorMessage = (errorBody as any)?.error?.message || JSON.stringify(errorBody);
      throw new Error(`Erro na API da OpenAI (${openaiResponse.status}): ${errorMessage}`);
    }

    const responseJson = await openaiResponse.json();
    let gptMessage = responseJson.choices[0].message.content.trim();
    
    console.log("=== RESPOSTA BRUTA DO GPT ===");
    console.log("Resposta completa:", JSON.stringify(gptMessage));
    
    // REMOVER ASPAS DUPLAS DO INÍCIO E FIM SE EXISTIREM
    // Verificar se a mensagem começa e termina com aspas duplas
    if (gptMessage.startsWith('"') && gptMessage.endsWith('"')) {
      console.log("Removendo aspas duplas do início e fim da mensagem");
      gptMessage = gptMessage.slice(1, -1);
    }
    
    console.log("=== MENSAGEM APÓS REMOÇÃO DE ASPAS ===");
    console.log(gptMessage);

    // === FORMATAÇÃO HUMANA DA MENSAGEM (CORRIGIDA PARA UM ÚNICO PARÁGRAFO) ===
    // Remover todas as quebras de linha e substituir por espaços simples
    gptMessage = gptMessage
      .replace(/\n+/g, ' ') // Substituir todas as quebras de linha por espaços
      .replace(/\s+/g, ' ') // Substituir múltiplos espaços por um único espaço
      .replace(/^\s+|\s+$/g, '') // Trim
      .replace(/\.\s+/g, '. ') // Garantir espaço após pontos
      .replace(/\?\s+/g, '? ') // Garantir espaço após pontos de interrogação
      .replace(/\!\s+/g, '! '); // Garantir espaço após pontos de exclamação

    // === DETECTAR E PROCESSAR AGENDAMENTO NA RESPOSTA ===
    // Formato: [AGENDAR:X:UNIDADE:MOTIVO]
    const scheduleRegex = /\[AGENDAR:(\d+):(\w+):([^\]]+)\]/i;
    const scheduleMatch = gptMessage.match(scheduleRegex);
    
    if (scheduleMatch) {
      console.log("=== AGENDAMENTO DETECTADO NA RESPOSTA DA IA ===");
      const timeValue = parseInt(scheduleMatch[1]);
      const timeUnit = scheduleMatch[2].toLowerCase();
      const reason = scheduleMatch[3];
      
      console.log(`Tempo: ${timeValue} ${timeUnit}`);
      console.log(`Motivo: ${reason}`);
      
      // Remover a tag da mensagem antes de enviar ao cliente
      gptMessage = gptMessage.replace(scheduleRegex, '').trim();
      
      // Calcular a data/hora do agendamento
      const now = new Date();
      let scheduledFor = new Date(now);
      
      switch (timeUnit) {
        case 'minutes':
          scheduledFor.setMinutes(scheduledFor.getMinutes() + timeValue);
          break;
        case 'hours':
          scheduledFor.setHours(scheduledFor.getHours() + timeValue);
          break;
        case 'days':
          scheduledFor.setDate(scheduledFor.getDate() + timeValue);
          break;
        default:
          scheduledFor.setHours(scheduledFor.getHours() + 1); // Default 1 hora
      }
      
      console.log(`📅 Agendando contato para: ${scheduledFor.toISOString()}`);
      
      // Criar resumo do contexto da conversa (últimas 5 mensagens)
      const conversationContext = messages.slice(-5).map((m: any) => 
        `${m.sender === 'agent' ? 'Você' : sessionData.client_name}: ${m.message_content}`
      ).join('\n');
      
      // Salvar o agendamento no banco
      try {
        const { error: scheduleError } = await supabaseAdmin
          .from('scheduled_contacts')
          .insert({
            session_id: session_id,
            client_name: sessionData.client_name,
            client_whatsapp_number: sessionData.client_whatsapp_number,
            scheduled_for: scheduledFor.toISOString(),
            reason: reason,
            context: `${reason}

CONTEXTO DA CONVERSA ANTERIOR:
${conversationContext}`,
          });
        
        if (scheduleError) {
          console.error("❌ Erro ao salvar agendamento:", scheduleError);
        } else {
          console.log("✅ Agendamento salvo com sucesso!");
        }
      } catch (err) {
        console.error("❌ Exceção ao salvar agendamento:", err);
      }
    }

    console.log("=== MENSAGEM FORMATADA (ÚNICO PARÁGRAFO) ===");
    console.log("Mensagem final:", gptMessage);

    // === CÁLCULO DETALHADO DO TEMPO ===
    const wordCount = gptMessage.split(/\s+/).length;
    const typingDelay = wordCount * wordDelay * 1000;
    const totalDelay = responseDelay + (wordCount * wordDelay);
    
    console.log("=== CÁLCULO DE TEMPO DETALHADO ===");
    console.log("Mensagem final:", `"${gptMessage}"`);
    console.log("Número de palavras:", wordCount);
    console.log("Delay de resposta (leitura):", responseDelay, "segundos");
    console.log("Delay por palavra (digitação):", wordDelay, "segundos");
    console.log("Tempo de digitação:", wordCount * wordDelay, "segundos");
    console.log("Tempo total:", totalDelay, "segundos");
    console.log("Tempo total em ms:", totalDelay * 1000, "ms");

    // Simular tempo de digitação (delay por palavra)
    console.log(`=== SIMULANDO TEMPO DE DIGITAÇÃO ===`);
    console.log(`Simulando digitação de ${wordCount} palavras (${typingDelay}ms)...`);
    await delay(typingDelay);

    // === EXTRAÇÃO AUTOMÁTICA DE ANOTAÇÕES ===
    // Analisar a conversa para extrair insights sobre o cliente
    if (crmContact?.crm_client_code && messages && messages.length > 0) {
      try {
        console.log("=== ANALISANDO CONVERSA PARA EXTRAIR INSIGHTS ===");
        
        // Montar histórico para análise
        const conversationHistory = messages.map((m: any) => 
          `${m.sender === 'agent' ? 'Agente' : 'Cliente'}: ${m.message_content}`
        ).join('\n');
        
        const analysisPrompt = `Analise esta conversa de vendas e extraia APENAS insights RELEVANTES e NOVOS sobre o cliente.
Retorne um JSON com array "insights" contendo objetos com:
- "type": um de ["mood", "availability", "preference", "relationship", "context", "health", "business"]
- "content": texto descritivo breve (máximo 100 caracteres)
- "importance": número de 1 a 10 (10 = muito importante)

REGRAS:
1. Extraia APENAS informações que o CLIENTE revelou (não o agente)
2. Ignore saudações comuns e respostas genéricas
3. Foque em: humor, disponibilidade, preferências, problemas de saúde, situação familiar, interesse de negócio
4. Se não houver insights relevantes, retorne {"insights": []}
5. Máximo 3 insights por análise

CONVERSA:
${conversationHistory}

ÚLTIMA MENSAGEM DO CLIENTE: ${messages[messages.length - 1]?.message_content || 'N/A'}

Retorne APENAS o JSON, sem explicações.`;

        const analysisResponse = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${agent.gpt_api_key}`,
          },
          body: JSON.stringify({
            model: "gpt-3.5-turbo", // Usar modelo mais barato para análise
            messages: [{ role: "user", content: analysisPrompt }],
            max_tokens: 300,
            temperature: 0.3,
          }),
        });

        if (analysisResponse.ok) {
          const analysisJson = await analysisResponse.json();
          let analysisText = analysisJson.choices[0].message.content.trim();
          
          // Limpar markdown se existir
          analysisText = analysisText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
          
          try {
            const insights = JSON.parse(analysisText);
            console.log("Insights extraídos:", JSON.stringify(insights, null, 2));
            
            if (insights.insights && insights.insights.length > 0) {
              for (const insight of insights.insights) {
                // Salvar cada insight como anotação
                const { error: annotationError } = await supabaseAdmin.rpc('add_ai_annotation', {
                  p_crm_client_code: crmContact.crm_client_code,
                  p_annotation_type: insight.type,
                  p_title: insight.type.toUpperCase(),
                  p_content: insight.content,
                  p_relevance: insight.importance,
                  p_is_temporary: false,
                  p_expires_at: null,
                  p_source_message_id: null
                });
                
                if (annotationError) {
                  console.error("Erro ao salvar anotação:", annotationError);
                } else {
                  console.log(`✅ Anotação salva: [${insight.type}] ${insight.content}`);
                }
              }
            }
          } catch (parseError) {
            console.log("Não foi possível parsear insights (OK se não houver):", analysisText);
          }
        }
      } catch (analysisError) {
        // Não falhar a resposta principal por causa da análise
        console.log("Erro na análise de insights (não crítico):", analysisError);
      }
    }

    console.log("=== RETORNANDO RESPOSTA FINAL ===");
    const responseData = {
      reply: gptMessage, 
      gptModel,
      context: {
        messageCount: messages.length,
        lastClientMessageId,
      },
      delays: {
        responseDelay,
        wordDelay,
        wordCount,
        totalDelay: totalDelay
      }
    };
    
    console.log("Dados de retorno:", JSON.stringify(responseData, null, 2));

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("=== ERRO NÃO TRATADO ===:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});