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
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
};

// Kanban defaults (Redsis)
const DEFAULT_FUNIL = parseInt(Deno.env.get("REDSIS_FUNIL_ID") || "1");
const PROSPECAO_SUBFUNIL = parseInt(Deno.env.get("REDSIS_SUBFUNIL_PROSPECCAO") || "2");

// Normaliza��o de status Kanban para evitar problemas com acentos/varia��es
function normalizeKanbanStatus(status?: string | null): string | null {
  if (!status) return null;
  return status.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

function mapSubfunilToStatus(subFunilCode?: number | null): string | null {
  switch (subFunilCode) {
    case 1:
      return "A_TRABALHAR";
    case 2:
      return "PROSPECAO";
    case 3:
      return "OFERTA";
    case 4:
      return "PEDIDO";
    case 5:
      return "FATURADO";
    default:
      return subFunilCode ? `SUBFUNIL_${subFunilCode}` : null;
  }
}

function toLeadStage(status?: string | null): string | null {
  const normalized = normalizeKanbanStatus(status);
  if (!normalized) return null;
  if (normalized === "PROSPECAO") return "PROSPECCAO";
  return normalized;
}

/**
 * Esta Edge Function processa participantes de campanhas de forma assíncrona.
 * Ela é chamada após a criação de uma campanha e processa cada participante
 * individualmente, sem travar a UI.
 * 
 * Funciona assim:
 * 1. Recebe o campaign_id
 * 2. Busca todos os participantes com message_status = 'pending'
 * 3. Para cada participante:
 *    - Marca como 'processing'
 *    - Chama send-whatsapp-message
 *    - Atualiza para 'sent' ou 'failed'
 * 
 * Esta função pode ser chamada múltiplas vezes (é idempotente).
 */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders, status: 200 });
  }

  const startTime = Date.now();
  console.log("=== INICIANDO PROCESS-CAMPAIGN-QUEUE ===");

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Variáveis de ambiente não configuradas");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json();
    const { campaign_id, max_batch_size = 10 } = body;

    if (!campaign_id) {
      return new Response(
        JSON.stringify({ error: "campaign_id é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`📋 Processando campanha: ${campaign_id}`);

    // Buscar dados da campanha
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("id, name, agent_id, whatsapp_instance_id, is_active, user_id")
      .eq("id", campaign_id)
      .single();

    if (campaignError || !campaign) {
      throw new Error("Campanha não encontrada: " + (campaignError?.message || ""));
    }

    if (!campaign.is_active) {
      console.log("⚠️ Campanha inativa, ignorando processamento");
      return new Response(
        JSON.stringify({ success: true, message: "Campanha inativa", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!campaign.agent_id || !campaign.whatsapp_instance_id) {
      throw new Error("Campanha sem agente ou instância WhatsApp configurados");
    }

    // Buscar participantes pendentes (apenas os que ainda não foram processados)
    // Inclui: pending, null, e failed (com retry_count < 3)
    // Exclui participantes com next_retry_at no futuro
    const { data: pendingParticipants, error: participantsError } = await supabase
      .from("campaign_participants")
      .select("id, client_name, client_whatsapp, crm_contact_id, crm_client_code, temperature, contact_count, message_status, retry_count, next_retry_at, atividade_codigo, kanban_status")
      .eq("campaign_id", campaign_id)
      .eq("status", "active")
      .or("message_status.is.null,message_status.eq.pending")
      .order("created_at", { ascending: true })
      .limit(max_batch_size);

    if (participantsError) {
      throw new Error("Erro ao buscar participantes: " + participantsError.message);
    }

    // Filtrar participantes com retry agendado para o futuro
    const now = new Date();
    const eligibleParticipants = (pendingParticipants || []).filter(p => {
      // Se não tem next_retry_at, está elegível
      if (!p.next_retry_at) return true;
      // Se next_retry_at já passou, está elegível para retry
      return new Date(p.next_retry_at) <= now;
    });

    if (eligibleParticipants.length === 0) {
      console.log("✅ Nenhum participante pendente elegível para processar");
      return new Response(
        JSON.stringify({ success: true, message: "Nenhum participante pendente", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`📤 Processando ${eligibleParticipants.length} participantes...`);

    let processedCount = 0;
    let successCount = 0;
    let errorCount = 0;
    const results: any[] = [];

    for (const participant of eligibleParticipants) {
      const participantStart = Date.now();
      
      try {
        console.log(`\n--- Processando: ${participant.client_name} (${participant.client_whatsapp}) ---`);
        
        // Log se é retry
        if (participant.retry_count && participant.retry_count > 0) {
          console.log(`🔄 Este é retry #${participant.retry_count}`);
        }

        // === VALIDAÇÃO A_TRABALHAR ===
        // Verificar se cliente pode receber mensagens (precisa estar em A_TRABALHAR no Kanban)
        if (participant.crm_client_code) {
          const { data: canSendCheck, error: canSendError } = await supabase.rpc(
            "can_send_message_to_client",
            { p_crm_client_code: participant.crm_client_code }
          );

          if (canSendError) {
            console.error("Erro ao validar status A_TRABALHAR:", canSendError.message);
          } else if (canSendCheck && canSendCheck.length > 0 && !canSendCheck[0]?.can_send) {
            console.log(`⛔ Cliente ${participant.client_name} não está em A_TRABALHAR: ${canSendCheck[0]?.reason}`);
            
            // Marcar como paused_kanban e pular
            await supabase
              .from("campaign_participants")
              .update({
                status: "paused_kanban",
                message_status: "skipped",
                last_error: canSendCheck[0]?.reason || "Não está em A_TRABALHAR",
              })
              .eq("id", participant.id);

            results.push({
              participant_id: participant.id,
              client_name: participant.client_name,
              status: "skipped",
              reason: canSendCheck[0]?.reason,
              duration_ms: Date.now() - participantStart,
            });

            processedCount++;
            continue; // Pular para o próximo participante
          }
          console.log(`✅ Cliente ${participant.client_name} validado - pode receber mensagens`);
        }

        // === BUSCAR/CRIAR ATIVIDADE DO REDSIS ===
        let atividadeCodigo = participant.atividade_codigo;
        let kanbanStatus = participant.kanban_status;
        let normalizedKanbanStatus = normalizeKanbanStatus(kanbanStatus);

        const persistLinks = async () => {
          const leadStage = toLeadStage(kanbanStatus) || 'A_TRABALHAR';
          await supabase
            .from("campaign_participants")
            .update({ 
              atividade_codigo: atividadeCodigo,
              kanban_status: kanbanStatus || null 
            })
            .eq("id", participant.id);

          if (participant.crm_client_code) {
            await supabase
              .from("crm_contacts")
              .update({
                kanban_status: kanbanStatus || null,
                kanban_stage_name: kanbanStatus === 'PROSPECAO' ? 'Prospecao' : kanbanStatus || null,
                kanban_stage_code: kanbanStatus === 'PROSPECAO' ? PROSPECAO_SUBFUNIL : null,
                updated_at: new Date().toISOString(),
              })
              .eq("crm_client_code", participant.crm_client_code);
          }

          const { error: leadStateError } = await supabase
            .from("lead_states")
            .upsert({
              participant_id: participant.id,
              atividade_codigo: atividadeCodigo,
              temperature: participant.temperature || 'cold',
              owner_lock: false,
              current_stage: leadStage,
              updated_at: new Date().toISOString(),
            }, {
              onConflict: 'participant_id'
            });

          if (leadStateError) {
            console.warn(`⚠️ Erro ao criar/atualizar lead_state:`, leadStateError.message);
          } else {
            console.log(`✅ lead_state criado/atualizado para participante ${participant.id}`);
          }
        };

        if (!atividadeCodigo && participant.crm_client_code) {
          console.log(`🔍 Buscando atividade do Redsis para cliente ${participant.crm_client_code}...`);
          try {
            const redsisAtivResponse = await fetch(`${SUPABASE_URL}/functions/v1/redsis-proxy`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              },
              body: JSON.stringify({
                action: "getAtividadeByCliente",
                params: { codigoCliente: participant.crm_client_code, funil: DEFAULT_FUNIL },
              }),
            });

            const atividadeResult = await redsisAtivResponse.json();
            if (redsisAtivResponse.ok && atividadeResult.success && atividadeResult.data) {
              atividadeCodigo = atividadeResult.data.codigo;
              kanbanStatus = mapSubfunilToStatus(atividadeResult.data.codigo_subfunil) || kanbanStatus;
              normalizedKanbanStatus = normalizeKanbanStatus(kanbanStatus);
              console.log(`✅ Atividade encontrada: codigo=${atividadeCodigo}, status=${kanbanStatus}`);
              await persistLinks();
            } else {
              console.log(`⚠️ Nenhuma atividade encontrada no Redsis para cliente ${participant.crm_client_code}`);
            }
          } catch (atividadeError: any) {
            console.error(`⚠️ Erro ao buscar atividade do Redsis:`, atividadeError.message);
          }
        }

        if (!atividadeCodigo && participant.crm_client_code) {
          console.log(`🆕 Criando atividade no Redsis para cliente ${participant.crm_client_code} no funil ${DEFAULT_FUNIL}...`);
          try {
            const createResponse = await fetch(`${SUPABASE_URL}/functions/v1/redsis-proxy`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              },
              body: JSON.stringify({
                action: "createAtividade",
                params: { 
                  codigoFunil: DEFAULT_FUNIL, 
                  codigoCliente: participant.crm_client_code,
                  observacao: `Campanha ${campaign.name || campaign_id} - criada automaticamente pela IA`,
                },
              }),
            });

            const createResult = await createResponse.json();
            if (createResponse.ok && createResult.success && createResult.data?.codigo) {
              atividadeCodigo = createResult.data.codigo;
              kanbanStatus = 'A_TRABALHAR';
              normalizedKanbanStatus = 'A_TRABALHAR';
              console.log(`✅ Atividade criada no Redsis: ${atividadeCodigo}`);
              await persistLinks();
            } else {
              console.warn(`⚠️ Falha ao criar atividade no Redsis: ${createResult.error || 'Erro desconhecido'}`);
            }
          } catch (createError: any) {
            console.error(`⚠️ Erro ao criar atividade no Redsis:`, createError.message);
          }
        }

        // === MOVER PARA PROSPECAO NA PRIMEIRA MENSAGEM ===
        const contactCount = participant.contact_count || 0;
        const isInProspeccao = normalizedKanbanStatus === 'PROSPECAO';
        if (contactCount === 0 && atividadeCodigo && !isInProspeccao) {
          console.log(`🔄 Movendo ${participant.client_name} para PROSPECAO no Redsis...`);
          try {
            const redsisResponse = await fetch(`${SUPABASE_URL}/functions/v1/redsis-proxy`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              },
              body: JSON.stringify({
                action: "moverAtividade",
                params: { codigo: atividadeCodigo, codigoSubfunil: PROSPECAO_SUBFUNIL },
              }),
            });

            const redsisResult = await redsisResponse.json();
            if (redsisResponse.ok && redsisResult.success) {
              kanbanStatus = 'PROSPECAO';
              normalizedKanbanStatus = 'PROSPECAO';
              console.log(`✅ Cliente ${participant.client_name} movido para PROSPECAO no Redsis`);
              await persistLinks();
            } else {
              console.warn(`⚠️ Falha ao mover para PROSPECAO: ${redsisResult.error || 'Erro desconhecido'}`);
            }
          } catch (redsisError: any) {
            console.error(`⚠️ Erro ao chamar redsis-proxy:`, redsisError.message);
          }
        }

        // Marcar como processando
        await supabase
          .from("campaign_participants")
          .update({ 
            message_status: "processing",
            last_processing_attempt: new Date().toISOString()
          })
          .eq("id", participant.id);

        // Determinar tipo de mensagem (contactCount já foi calculado acima)
        let messageType = "reinforcement";
        if (contactCount === 0) messageType = "reinforcement";
        else if (contactCount === 1) messageType = "value_content";
        else if (contactCount === 2) messageType = "clarification";
        else messageType = "check_in";

        // Buscar perfil triplo se disponível
        let tripleProfile = null;
        if (participant.crm_client_code) {
          const { data: profileData } = await supabase.rpc("get_triple_profile", {
            p_campaign_id: campaign_id,
            p_crm_client_code: participant.crm_client_code,
          });
          if (profileData && Array.isArray(profileData) && profileData.length > 0) {
            tripleProfile = profileData[0];
          }
        }

        // Chamar a edge function send-whatsapp-message
        const sendPayload = {
          agent_id: campaign.agent_id,
          whatsapp_instance_id: campaign.whatsapp_instance_id,
          client_name: participant.client_name,
          client_whatsapp_number: participant.client_whatsapp,
          campaign_id: campaign_id,
          message_type: messageType,
          triple_profile: tripleProfile,
          contact_count: contactCount,
          user_id: campaign.user_id,
          internal_system_call: true,
        };

        console.log(`📤 Enviando payload:`, JSON.stringify(sendPayload, null, 2));

        const sendResponse = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp-message`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify(sendPayload),
        });

        const sendResult = await sendResponse.json();
        
        if (!sendResponse.ok) {
          throw new Error(sendResult.error || `HTTP ${sendResponse.status}`);
        }

        console.log(`✅ Mensagem enviada para ${participant.client_name}`);

        // Calcular próximo agendamento
        const nextScheduled = new Date();
        if (contactCount === 0) {
          nextScheduled.setHours(nextScheduled.getHours() + 1 + Math.random() * 2);
        } else if (contactCount === 1) {
          nextScheduled.setHours(nextScheduled.getHours() + 12 + Math.random() * 24);
        } else {
          const daysToAdd = participant.temperature === "warm" ? 3 : 5;
          nextScheduled.setDate(nextScheduled.getDate() + daysToAdd);
        }

        // Atualizar participante como enviado
        await supabase
          .from("campaign_participants")
          .update({
            message_status: "sent",
            contact_count: contactCount + 1,
            last_contact: new Date().toISOString(),
            next_scheduled: nextScheduled.toISOString(),
            last_error: null,
            retry_count: 0, // Reset retry count após sucesso
            next_retry_at: null, // Limpar retry agendado
          })
          .eq("id", participant.id);

        successCount++;
        results.push({
          participant_id: participant.id,
          client_name: participant.client_name,
          status: "sent",
          duration_ms: Date.now() - participantStart,
        });

      } catch (error: any) {
        console.error(`❌ Erro ao enviar para ${participant.client_name}:`, error.message);
        
        const currentRetryCount = participant.retry_count || 0;
        const maxRetries = 3;
        const newRetryCount = currentRetryCount + 1;
        
        // Calcular próximo retry com backoff exponencial
        // 1ª tentativa: 5 minutos, 2ª: 15 minutos, 3ª: 45 minutos
        const retryDelayMinutes = 5 * Math.pow(3, currentRetryCount);
        const nextRetryAt = new Date();
        nextRetryAt.setMinutes(nextRetryAt.getMinutes() + retryDelayMinutes);
        
        // Determinar se deve continuar tentando ou marcar como failed definitivamente
        const shouldRetry = newRetryCount < maxRetries;
        const newStatus = shouldRetry ? "pending" : "failed"; // Volta para pending se ainda tem retries
        
        console.log(`🔄 Retry ${newRetryCount}/${maxRetries} - Próxima tentativa: ${shouldRetry ? nextRetryAt.toISOString() : 'DESISTIU'}`);
        
        // Marcar status apropriado
        await supabase
          .from("campaign_participants")
          .update({
            message_status: newStatus,
            last_error: error.message,
            retry_count: newRetryCount,
            next_retry_at: shouldRetry ? nextRetryAt.toISOString() : null,
          })
          .eq("id", participant.id);

        errorCount++;
        results.push({
          participant_id: participant.id,
          client_name: participant.client_name,
          status: shouldRetry ? "retry_scheduled" : "failed",
          error: error.message,
          retry_count: newRetryCount,
          next_retry_at: shouldRetry ? nextRetryAt.toISOString() : null,
          duration_ms: Date.now() - participantStart,
        });
      }

      processedCount++;

      // Pequeno delay entre envios para evitar rate limiting
      if (processedCount < eligibleParticipants.length) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }

    // Verificar se há mais participantes pendentes
    const { count: remainingCount } = await supabase
      .from("campaign_participants")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign_id)
      .eq("status", "active")
      .or("message_status.is.null,message_status.eq.pending");

    const totalDuration = Date.now() - startTime;
    console.log(`\n=== PROCESSAMENTO CONCLUÍDO ===`);
    console.log(`📊 Processados: ${processedCount}, Sucesso: ${successCount}, Erros: ${errorCount}`);
    console.log(`⏱️ Tempo total: ${totalDuration}ms`);
    console.log(`📋 Pendentes restantes: ${remainingCount || 0}`);

    return new Response(
      JSON.stringify({
        success: true,
        campaign_id,
        processed: processedCount,
        success_count: successCount,
        error_count: errorCount,
        remaining: remainingCount || 0,
        duration_ms: totalDuration,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("❌ ERRO FATAL:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
