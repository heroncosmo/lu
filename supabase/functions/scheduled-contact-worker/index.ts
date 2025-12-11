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
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("=== EXECUTANDO SCHEDULED-CONTACT-WORKER ===");
    
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Buscar agendamentos pendentes que já venceram
    const { data: dueContacts, error: fetchError } = await supabaseAdmin
      .rpc('get_due_scheduled_contacts');

    if (fetchError) {
      console.error("Erro ao buscar agendamentos pendentes:", fetchError);
      throw fetchError;
    }

    console.log(`📋 Encontrados ${dueContacts?.length || 0} agendamentos pendentes`);

    if (!dueContacts || dueContacts.length === 0) {
      return new Response(
        JSON.stringify({ 
          message: "Nenhum agendamento pendente para executar",
          processed: 0 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results = [];

    for (const contact of dueContacts) {
      console.log(`\n📞 Processando agendamento: ${contact.id}`);
      console.log(`Cliente: ${contact.client_name} (${contact.client_whatsapp_number})`);
      console.log(`Agendado para: ${contact.scheduled_for}`);
      console.log(`Motivo: ${contact.reason}`);

      try {
        // Buscar dados completos da sessão
        const { data: sessionData, error: sessionError } = await supabaseAdmin
          .from('prospecting_sessions')
          .select(`
            id,
            client_name,
            client_whatsapp_number,
            status,
            agent_id,
            whatsapp_instance_id,
            agents (
              id,
              name,
              instructions,
              gpt_api_key,
              gpt_model
            )
          `)
          .eq('id', contact.session_id)
          .single();

        if (sessionError || !sessionData) {
          throw new Error(`Sessão não encontrada: ${sessionError?.message}`);
        }

        const agent = sessionData.agents as any;

        // Criar mensagem de retomada de contato usando o contexto salvo
        const resumePrompt = `Você é um agente de vendas retomando uma conversa com o cliente ${contact.client_name}.

INSTRUÇÕES DO AGENTE:
${agent.instructions}

CONTEXTO DO AGENDAMENTO:
- Motivo: ${contact.reason}
- Contexto da conversa anterior:
${contact.context}

Crie uma mensagem NATURAL e AMIGÁVEL para retomar o contato, considerando:
1. O cliente PEDIU para você entrar em contato neste momento
2. Faça referência ao que foi combinado anteriormente
3. Seja breve e direto (máximo 2-3 frases)
4. Use linguagem coloquial de WhatsApp
5. NÃO se apresente novamente (vocês já conversaram)
6. Retome a conversa de onde parou

FORMATO: Escreva tudo em UM ÚNICO PARÁGRAFO, sem quebras de linha.

Exemplo: "E aí ${contact.client_name}, tudo certo? Como combinamos, tô voltando aqui pra gente continuar nossa conversa. Conseguiu dar uma pensada no que conversamos?"`;

        // Chamar OpenAI para gerar a mensagem de retomada
        const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${agent.gpt_api_key}`,
          },
          body: JSON.stringify({
            model: agent.gpt_model || "gpt-4o",
            messages: [
              { role: "system", content: "Você é um agente de vendas profissional e amigável." },
              { role: "user", content: resumePrompt }
            ],
            max_tokens: 200,
            temperature: 0.7,
          }),
        });

        if (!openaiResponse.ok) {
          throw new Error(`Erro ao gerar mensagem: ${openaiResponse.status}`);
        }

        const openaiData = await openaiResponse.json();
        let resumeMessage = openaiData.choices[0].message.content.trim();
        
        // Remover aspas duplas se existirem
        if (resumeMessage.startsWith('"') && resumeMessage.endsWith('"')) {
          resumeMessage = resumeMessage.slice(1, -1);
        }
        
        // Garantir que seja um único parágrafo
        resumeMessage = resumeMessage
          .replace(/\n+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        console.log(`📨 Mensagem de retomada: "${resumeMessage}"`);

        // Inserir mensagem do agente no histórico
        const { error: insertError } = await supabaseAdmin
          .from('whatsapp_messages')
          .insert({
            session_id: contact.session_id,
            sender: 'agent',
            message_content: resumeMessage,
            timestamp: new Date().toISOString(),
          });

        if (insertError) {
          throw new Error(`Erro ao inserir mensagem: ${insertError.message}`);
        }

        // Enviar mensagem via WhatsApp
        const { error: sendError } = await supabaseAdmin.functions.invoke('send-whatsapp-message', {
          body: {
            instance_id: sessionData.whatsapp_instance_id,
            phone: contact.client_whatsapp_number,
            message: resumeMessage,
          }
        });

        if (sendError) {
          throw new Error(`Erro ao enviar WhatsApp: ${sendError.message}`);
        }

        // Marcar agendamento como executado
        await supabaseAdmin.rpc('mark_scheduled_contact_executed', {
          contact_id: contact.id,
          error_msg: null
        });

        console.log(`✅ Agendamento ${contact.id} executado com sucesso`);
        
        results.push({
          contact_id: contact.id,
          client_name: contact.client_name,
          status: 'success',
          message: resumeMessage
        });

      } catch (error: any) {
        console.error(`❌ Erro ao processar agendamento ${contact.id}:`, error);
        
        // Marcar agendamento como falho
        await supabaseAdmin.rpc('mark_scheduled_contact_executed', {
          contact_id: contact.id,
          error_msg: error.message
        });
        
        results.push({
          contact_id: contact.id,
          client_name: contact.client_name,
          status: 'error',
          error: error.message
        });
      }
    }

    console.log("\n=== RESUMO DA EXECUÇÃO ===");
    console.log(`Total processado: ${results.length}`);
    console.log(`Sucesso: ${results.filter(r => r.status === 'success').length}`);
    console.log(`Falhas: ${results.filter(r => r.status === 'error').length}`);

    return new Response(
      JSON.stringify({ 
        message: `Processados ${results.length} agendamentos`,
        results 
      }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200 
      }
    );

  } catch (error: any) {
    console.error("=== ERRO NÃO TRATADO ===:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500 
      }
    );
  }
});
