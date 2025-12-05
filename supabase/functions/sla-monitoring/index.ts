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
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders, status: 200 });
  }

  try {
    console.log("=== INICIANDO SLA MONITORING ===");
    
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const REDSIS_BASE_URL = Deno.env.get("REDSIS_BASE_URL") || "http://10.1.1.200:8084";
    const REDSIS_AUTH = Deno.env.get("REDSIS_AUTH"); // Basic auth base64

    if (!REDSIS_AUTH) {
      throw new Error("REDSIS_AUTH não configurado");
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    const body = await req.json();
    const { action = 'analyze' } = body;
    // action: 'analyze', 'reprioritize', 'report', 'auto_update'

    console.log(`Ação SLA: ${action}`);

    // === BUSCAR ATIVIDADES REDSIS COM PRAZO ===
    const redsisResponse = await fetch(`${REDSIS_BASE_URL}/atividades`, {
      headers: {
        "Authorization": `Basic ${REDSIS_AUTH}`,
      },
    });

    if (!redsisResponse.ok) {
      throw new Error(`Redsis API error: ${redsisResponse.status}`);
    }

    const atividades = await redsisResponse.json();
    console.log(`Atividades encontradas: ${atividades.length}`);

    // === ANALISAR URGÊNCIA ===
    const now = new Date();
    const alerts: any[] = [];

    for (const atividade of atividades) {
      if (!atividade.data_prazo || atividade.codigo_situacao === 3) {
        continue; // Ignora sem prazo ou concluídas
      }

      const prazo = new Date(atividade.data_prazo);
      const hoursUntil = (prazo.getTime() - now.getTime()) / (1000 * 60 * 60);

      // Só alertar se falta menos de 7 dias
      if (hoursUntil > 168) continue;

      // Calcular urgência (0-100)
      let urgencyScore = 10;
      if (hoursUntil < 0) urgencyScore = 100; // Vencido
      else if (hoursUntil < 12) urgencyScore = 95; // < 12h
      else if (hoursUntil < 24) urgencyScore = 85; // < 1 dia
      else if (hoursUntil < 48) urgencyScore = 70; // < 2 dias
      else if (hoursUntil < 72) urgencyScore = 50; // < 3 dias
      else if (hoursUntil < 168) urgencyScore = 30; // < 1 semana

      // Buscar participant correspondente
      const { data: participant } = await supabase
        .from('campaign_participants')
        .select('id, lead_states!inner(id, current_stage, temperature)')
        .eq('redsis_atividade_codigo', atividade.codigo)
        .single();

      if (!participant) {
        console.log(`⚠️ Atividade ${atividade.codigo} sem participant mapeado`);
        continue;
      }

      const leadState = participant.lead_states?.[0];

      alerts.push({
        participant_id: participant.id,
        lead_state_id: leadState?.id,
        atividade_codigo: atividade.codigo,
        cliente_nome: atividade.cliente_nome || 'Cliente',
        data_prazo: atividade.data_prazo,
        hours_until_deadline: Math.round(hoursUntil * 10) / 10,
        urgency_score: urgencyScore,
        current_stage: leadState?.current_stage || 'UNKNOWN',
        temperature: leadState?.temperature || 'unknown',
        recommended_action: urgencyScore >= 95
          ? 'URGENTE: Contato imediato + Notificar gerente'
          : urgencyScore >= 85
          ? 'ALTA: Priorizar contato nas próximas 6h'
          : urgencyScore >= 70
          ? 'MÉDIA: Agendar contato para hoje'
          : 'NORMAL: Manter cadência regular',
      });
    }

    // Ordenar por urgência
    alerts.sort((a, b) => b.urgency_score - a.urgency_score);

    console.log(`Alertas SLA gerados: ${alerts.length}`);

    // === AÇÕES BASEADAS NO ACTION ===
    if (action === 'analyze') {
      // Apenas retornar alertas
      return new Response(
        JSON.stringify({
          success: true,
          alerts,
          summary: {
            total: alerts.length,
            critical: alerts.filter(a => a.urgency_score >= 95).length,
            high: alerts.filter(a => a.urgency_score >= 85 && a.urgency_score < 95).length,
            medium: alerts.filter(a => a.urgency_score >= 70 && a.urgency_score < 85).length,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    if (action === 'reprioritize') {
      // Repriorizar cadence_queue
      let reprioritizedCount = 0;

      for (const alert of alerts) {
        if (alert.urgency_score < 70) continue; // Só alta urgência

        const { data: queueItems } = await supabase
          .from('cadence_queue')
          .select('id, priority, scheduled_for')
          .eq('participant_id', alert.participant_id)
          .eq('status', 'pending');

        if (!queueItems || queueItems.length === 0) continue;

        for (const item of queueItems) {
          const newPriority = Math.max(item.priority || 50, alert.urgency_score);

          let newScheduledFor = item.scheduled_for;
          if (alert.urgency_score >= 95) {
            // Agendar para próxima hora
            newScheduledFor = new Date(Date.now() + 60 * 60 * 1000).toISOString();
          } else if (alert.urgency_score >= 85) {
            // Agendar para próximas 6 horas
            newScheduledFor = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
          }

          await supabase
            .from('cadence_queue')
            .update({ priority: newPriority, scheduled_for: newScheduledFor })
            .eq('id', item.id);

          reprioritizedCount++;
        }
      }

      console.log(`✅ Reprioriz ados: ${reprioritizedCount} itens`);

      return new Response(
        JSON.stringify({
          success: true,
          reprioritized: reprioritizedCount,
          alerts: alerts.filter(a => a.urgency_score >= 70),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    if (action === 'report') {
      // Gerar relatório completo
      const report = {
        generated_at: now.toISOString(),
        summary: {
          total_activities: alerts.length,
          critical: alerts.filter(a => a.urgency_score >= 95).length,
          high: alerts.filter(a => a.urgency_score >= 85 && a.urgency_score < 95).length,
          medium: alerts.filter(a => a.urgency_score >= 70 && a.urgency_score < 85).length,
          low: alerts.filter(a => a.urgency_score < 70).length,
          overdue: alerts.filter(a => a.hours_until_deadline < 0).length,
        },
        top_alerts: alerts.slice(0, 20),
      };

      return new Response(
        JSON.stringify({ success: true, report }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    if (action === 'auto_update') {
      // Repriorizar + Notificar urgentes
      let reprioritizedCount = 0;
      const urgentAlerts = alerts.filter(a => a.urgency_score >= 85);

      // Repriorizar
      for (const alert of alerts) {
        if (alert.urgency_score < 70) continue;

        const { data: queueItems } = await supabase
          .from('cadence_queue')
          .select('id, priority, scheduled_for')
          .eq('participant_id', alert.participant_id)
          .eq('status', 'pending');

        if (!queueItems || queueItems.length === 0) continue;

        for (const item of queueItems) {
          const newPriority = Math.max(item.priority || 50, alert.urgency_score);
          let newScheduledFor = item.scheduled_for;

          if (alert.urgency_score >= 95) {
            newScheduledFor = new Date(Date.now() + 60 * 60 * 1000).toISOString();
          } else if (alert.urgency_score >= 85) {
            newScheduledFor = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
          }

          await supabase
            .from('cadence_queue')
            .update({ priority: newPriority, scheduled_for: newScheduledFor })
            .eq('id', item.id);

          reprioritizedCount++;
        }
      }

      // Criar notificações para alertas urgentes
      const notificationsCreated = [];
      for (const alert of urgentAlerts) {
        const { data: notification } = await supabase
          .from('notifications')
          .insert({
            type: 'sla_alert',
            title: `⏰ SLA Alert: ${alert.cliente_nome}`,
            message: `${alert.recommended_action} - Prazo: ${alert.hours_until_deadline}h`,
            metadata: {
              urgency_score: alert.urgency_score,
              atividade_codigo: alert.atividade_codigo,
              data_prazo: alert.data_prazo,
            },
            is_read: false,
          })
          .select()
          .single();

        if (notification) notificationsCreated.push(notification);
      }

      console.log(`✅ Auto-update: ${reprioritizedCount} reprioriz., ${notificationsCreated.length} notif.`);

      return new Response(
        JSON.stringify({
          success: true,
          analyzed: alerts.length,
          reprioritized: reprioritizedCount,
          notifications_sent: notificationsCreated.length,
          urgent_alerts: urgentAlerts.slice(0, 10),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Action inválido
    return new Response(
      JSON.stringify({ error: "Action inválido. Use: analyze, reprioritize, report, auto_update" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );

  } catch (error) {
    console.error("❌ Erro SLA monitoring:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
