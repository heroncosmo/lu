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

/**
 * Verifica se está em horário de silêncio
 */
function isQuietHours(timezone: string, quietStart: string, quietEnd: string): boolean {
  const now = new Date().toLocaleString('en-US', { timeZone: timezone });
  const currentTime = new Date(now);
  const hours = currentTime.getHours();
  const minutes = currentTime.getMinutes();
  const currentMinutes = hours * 60 + minutes;

  const [startH, startM] = quietStart.split(':').map(Number);
  const [endH, endM] = quietEnd.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  // Se quiet hours cruza meia-noite (ex: 22:00 - 08:00)
  if (startMinutes > endMinutes) {
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }

  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

/**
 * Calcula próximo horário permitido após quiet hours
 */
function getNextAllowedTime(timezone: string, quietEnd: string): Date {
  const now = new Date();
  const [endH, endM] = quietEnd.split(':').map(Number);
  
  const nextAllowed = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  nextAllowed.setHours(endH, endM, 0, 0);

  // Se o horário já passou hoje, agendar para amanhã
  if (nextAllowed <= new Date()) {
    nextAllowed.setDate(nextAllowed.getDate() + 1);
  }

  return nextAllowed;
}

/**
 * Verifica se participante excedeu limites de mensagens
 */
async function checkMessageLimits(
  participantId: string,
  maxPerWeek: number,
  minIntervalHours: number
): Promise<{ allowed: boolean; reason?: string }> {
  const { data: participant } = await supabase
    .from('campaign_participants')
    .select('messages_sent_count, last_message_at')
    .eq('id', participantId)
    .single();

  if (!participant) {
    return { allowed: false, reason: 'Participante não encontrado' };
  }

  // Verificar intervalo mínimo
  if (participant.last_message_at) {
    const lastMessage = new Date(participant.last_message_at);
    const hoursSince = (Date.now() - lastMessage.getTime()) / (1000 * 60 * 60);
    
    if (hoursSince < minIntervalHours) {
      return {
        allowed: false,
        reason: `Intervalo mínimo não atingido (${minIntervalHours}h)`,
      };
    }
  }

  // Verificar limite semanal
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const { count } = await supabase
    .from('whatsapp_messages')
    .select('*', { count: 'exact', head: true })
    .eq('participant_id', participantId)
    .gte('created_at', oneWeekAgo.toISOString());

  if (count && count >= maxPerWeek) {
    return {
      allowed: false,
      reason: `Limite semanal atingido (${maxPerWeek} msgs/semana)`,
    };
  }

  return { allowed: true };
}

/**
 * Tenta enviar mensagem com fallback de canal
 */
async function sendMessageWithFallback(
  queueItem: CadenceQueueItem,
  participant: CampaignParticipant,
  campaignConfig: CampaignConfig
): Promise<{ success: boolean; channel: string; error?: string }> {
  const channelOrder = campaignConfig.channel_fallback_enabled
    ? campaignConfig.channel_fallback_order
    : [queueItem.channel];

  for (const channel of channelOrder) {
    try {
      if (channel === 'whatsapp' && participant.phone) {
        // Enviar via WhatsApp (chamada direta para evitar problema de auth)
        const wapiToken = Deno.env.get('WAPI_TOKEN');
        const wapiInstance = Deno.env.get('WAPI_INSTANCE_ID');
        
        if (!wapiToken || !wapiInstance) {
          console.error('W-API credentials not configured');
          continue;
        }

        const wapiResponse = await fetch(
          `https://api.w-api.app/v1/message/send-text?instanceId=${wapiInstance}`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${wapiToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              phone: participant.phone,
              message: queueItem.message_content || queueItem.message_template,
            }),
          }
        );

        if (wapiResponse.ok) {
          return { success: true, channel: 'whatsapp' };
        } else {
          const errorText = await wapiResponse.text();
          console.error('W-API error:', errorText);
        }
      } else if (channel === 'email' && participant.email) {
        // TODO: Implementar envio de email
        console.log('Email sending not implemented yet');
      }
    } catch (error) {
      console.error(`Erro ao enviar por ${channel}:`, error);
    }
  }

  return { success: false, channel: queueItem.channel, error: 'Todos os canais falharam' };
}

/**
 * Processa um item da fila
 */
async function processQueueItem(item: CadenceQueueItem): Promise<void> {
  // Buscar participante e configuração da campanha
  const { data: participant } = await supabase
    .from('campaign_participants')
    .select(`
      *,
      campaign:campaigns(
        quiet_hours_start,
        quiet_hours_end,
        max_messages_per_week,
        min_interval_hours,
        channel_fallback_enabled,
        channel_fallback_order
      )
    `)
    .eq('id', item.participant_id)
    .single();

  if (!participant) {
    console.error('Participante não encontrado:', item.participant_id);
    return;
  }

  const campaign = participant.campaign as unknown as CampaignConfig;

  // Verificar quiet hours
  if (isQuietHours(participant.timezone, campaign.quiet_hours_start, campaign.quiet_hours_end)) {
    const nextAllowed = getNextAllowedTime(participant.timezone, campaign.quiet_hours_end);
    
    await supabase
      .from('cadence_queue')
      .update({
        scheduled_for: nextAllowed.toISOString(),
        status: 'rescheduled',
      })
      .eq('id', item.id);

    console.log(`Reagendado para ${nextAllowed} (quiet hours)`);
    return;
  }

  // Verificar limites de mensagens
  const limitsCheck = await checkMessageLimits(
    item.participant_id,
    campaign.max_messages_per_week,
    campaign.min_interval_hours
  );

  if (!limitsCheck.allowed) {
    await supabase
      .from('cadence_queue')
      .update({
        status: 'blocked',
        error_message: limitsCheck.reason,
      })
      .eq('id', item.id);

    console.log(`Bloqueado: ${limitsCheck.reason}`);
    return;
  }

  // Tentar enviar com fallback
  const result = await sendMessageWithFallback(item, participant, campaign);

  if (result.success) {
    // Atualizar fila e participante
    await Promise.all([
      supabase
        .from('cadence_queue')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          channel_used: result.channel,
        })
        .eq('id', item.id),
      
      supabase
        .from('campaign_participants')
        .update({
          messages_sent_count: participant.messages_sent_count + 1,
          last_message_at: new Date().toISOString(),
          preferred_channel: result.channel, // Stickiness
        })
        .eq('id', participant.id),
    ]);

    console.log(`Mensagem enviada com sucesso via ${result.channel}`);
  } else {
    // Incrementar retry ou marcar como failed
    const newRetryCount = item.retry_count + 1;
    const maxRetries = 3;

    if (newRetryCount >= maxRetries) {
      await supabase
        .from('cadence_queue')
        .update({
          status: 'failed',
          error_message: result.error,
        })
        .eq('id', item.id);
      
      console.error(`Falha definitiva após ${maxRetries} tentativas`);
    } else {
      // Reagendar com backoff exponencial
      const backoffMinutes = Math.pow(2, newRetryCount) * 5;
      const nextAttempt = new Date(Date.now() + backoffMinutes * 60 * 1000);

      await supabase
        .from('cadence_queue')
        .update({
          retry_count: newRetryCount,
          scheduled_for: nextAttempt.toISOString(),
          error_message: result.error,
        })
        .eq('id', item.id);

      console.log(`Reagendado para ${nextAttempt} (tentativa ${newRetryCount})`);
    }
  }
}

/**
 * Função principal do scheduler
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders, status: 200 });
  }

  try {
    console.log("=== CADENCE SCHEDULER INICIADO ===");
    
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Buscar participantes que precisam de follow-up
    const now = new Date().toISOString();
    
    const { data: pendingParticipants, error: fetchError } = await supabase
      .from('campaign_participants')
      .select(`
        *,
        campaigns (
          id,
          name,
          agent_id,
          whatsapp_instance_id,
          messages_per_week,
          min_interval_hours,
          cold_days,
          warm_days,
          quiet_hours
        )
      `)
      .eq('status', 'active')
      .lte('next_scheduled', now)
      .limit(50); // Processar até 50 por execução

    if (fetchError) {
      throw new Error("Erro ao buscar participantes: " + fetchError.message);
    }

    console.log(`Encontrados ${pendingParticipants?.length || 0} participantes para processar`);

    const results = [];

    for (const participant of pendingParticipants || []) {
      try {
        console.log(`Processando participante: ${participant.client_name} (Campaign: ${participant.campaigns.name})`);

        // === VALIDAÇÃO A_TRABALHAR ===
        const { data: canSendCheck, error: canSendError } = await supabase.rpc(
          'can_send_message_to_client',
          { p_crm_client_code: participant.crm_client_code }
        );

        if (canSendError) {
          console.error('Erro ao validar status A_TRABALHAR:', canSendError.message);
        } else if (canSendCheck && !canSendCheck[0]?.can_send) {
          console.log(
            `⛔ Cliente ${participant.client_name} não está em A_TRABALHAR: ${canSendCheck[0]?.reason}`
          );

          await supabase
            .from('campaign_participants')
            .update({
              status: 'paused_kanban',
              next_scheduled: null,
              metadata: {
                ...participant.metadata,
                paused_reason: canSendCheck[0]?.reason,
                paused_at: new Date().toISOString(),
              },
            })
            .eq('id', participant.id);

          results.push({
            participant: participant.client_name,
            status: 'paused_not_a_trabalhar',
            reason: canSendCheck[0]?.reason,
          });
          continue;
        }

        // Verificar quiet hours
        const quietHours = participant.campaigns.quiet_hours || { start: "20:00", end: "08:00" };
        if (isQuietHours(participant.timezone, quietHours.start, quietHours.end)) {
          const nextAllowed = getNextAllowedTime(participant.timezone, quietHours.end);
          await supabase
            .from('campaign_participants')
            .update({ next_scheduled: nextAllowed.toISOString() })
            .eq('id', participant.id);
          
          results.push({ participant: participant.client_name, status: 'rescheduled_quiet_hours' });
          continue;
        }

        // Calcular próximo delay baseado em contact_count (D1, D2, D3)
        const contactCount = participant.contact_count || 0;
        let delayHours = 24; // Padrão

        if (contactCount === 0) {
          // D1: 1-3h
          delayHours = 1 + Math.random() * 2;
        } else if (contactCount === 1) {
          // D2: 12-36h
          delayHours = 12 + Math.random() * 24;
        } else if (contactCount === 2) {
          // D3: 2-5 dias
          delayHours = (2 + Math.random() * 3) * 24;
        } else {
          // Check-in semanal/mensal
          if (participant.temperature === 'warm') {
            delayHours = participant.campaigns.warm_days * 24;
          } else {
            delayHours = participant.campaigns.cold_days * 24;
          }
        }

        // Buscar perfil triplo (permite personalização avançada)
        let tripleProfile = null;
        const { data: tripleProfileData, error: tripleProfileError } = await supabase.rpc(
          'get_triple_profile',
          {
            p_campaign_id: participant.campaign_id,
            p_crm_client_code: participant.crm_client_code,
          }
        );

        if (tripleProfileError) {
          console.warn('Não foi possível carregar perfil triplo:', tripleProfileError.message);
        } else if (Array.isArray(tripleProfileData) && tripleProfileData.length > 0) {
          tripleProfile = tripleProfileData[0];
        }

        console.log('Perfil triplo:', tripleProfile);

        // Gerar mensagem baseada no estágio da cadência
        let messageType = 'follow_up';
        if (contactCount === 0) messageType = 'reinforcement';
        else if (contactCount === 1) messageType = 'value_content';
        else if (contactCount === 2) messageType = 'clarification';
        else messageType = 'check_in';

        // Chamar send-whatsapp-message (interno)
        const { data: sendResult, error: sendError } = await supabase.functions.invoke(
          'send-whatsapp-message',
          {
            body: {
              agent_id: participant.campaigns.agent_id,
              whatsapp_instance_id: participant.campaigns.whatsapp_instance_id,
              client_name: participant.client_name,
              client_whatsapp_number: participant.client_whatsapp,
              campaign_id: participant.campaign_id,
              message_type: messageType,
              triple_profile: tripleProfile,
              contact_count: contactCount,
              internal_system_call: true  // Flag para bypass de auth
            }
          }
        );

        if (sendError) {
          console.error("Erro ao enviar mensagem:", sendError);
          results.push({ participant: participant.client_name, status: 'failed', error: sendError.message });
          continue;
        }

        // Atualizar participante
        const nextScheduled = new Date(Date.now() + delayHours * 60 * 60 * 1000).toISOString();
        
        await supabase
          .from('campaign_participants')
          .update({
            last_contact: now,
            next_scheduled: nextScheduled,
            contact_count: contactCount + 1
          })
          .eq('id', participant.id);

        results.push({
          participant: participant.client_name,
          status: 'sent',
          next_scheduled: nextScheduled,
          message_type: messageType
        });

      } catch (participantError: any) {
        console.error(`Erro ao processar ${participant.client_name}:`, participantError);
        results.push({
          participant: participant.client_name,
          status: 'error',
          error: participantError.message
        });
      }
    }

    console.log("=== CADENCE SCHEDULER FINALIZADO ===");
    console.log("Resultados:", results);

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        results
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Erro no cadence-scheduler:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
