/**
 * SLA Engine - Motor de urgência e repriorização de cadências
 * Baseado em data_prazo das atividades Redsis
 */

import { supabase } from '@/integrations/supabase/client';
import { RedsisClient } from '@/integrations/redsis/client';

export interface SLAAlert {
  participant_id: string;
  atividade_codigo: number;
  cliente_nome: string;
  data_prazo: string;
  hours_until_deadline: number;
  urgency_score: number;
  current_stage: string;
  recommended_action: string;
}

export class SLAEngine {
  private supabaseClient = supabase;
  private redsisClient: RedsisClient;

  constructor(redsisClient: RedsisClient) {
    this.redsisClient = redsisClient;
  }

  /**
   * Calcular score de urgência (0-100)
   */
  private calculateUrgencyScore(hoursUntilDeadline: number): number {
    if (hoursUntilDeadline < 0) return 100; // Já vencido
    if (hoursUntilDeadline < 12) return 95; // < 12h
    if (hoursUntilDeadline < 24) return 85; // < 1 dia
    if (hoursUntilDeadline < 48) return 70; // < 2 dias
    if (hoursUntilDeadline < 72) return 50; // < 3 dias
    if (hoursUntilDeadline < 168) return 30; // < 1 semana
    return 10; // > 1 semana
  }

  /**
   * Recomendar ação baseada na urgência
   */
  private recommendAction(urgencyScore: number, _currentStage: string): string {
    if (urgencyScore >= 95) {
      return 'URGENTE: Contato imediato + Notificar gerente';
    }
    if (urgencyScore >= 85) {
      return 'ALTA: Priorizar contato nas próximas 6h';
    }
    if (urgencyScore >= 70) {
      return 'MÉDIA: Agendar contato para hoje';
    }
    if (urgencyScore >= 50) {
      return 'NORMAL: Manter cadência regular';
    }
    return 'BAIXA: Sem urgência adicional';
  }

  /**
   * Analisar atividades com prazo próximo
   */
  async analyzeActivitiesWithDeadlines(): Promise<SLAAlert[]> {
    try {
      // Buscar todas as atividades abertas do Redsis
      const atividades = await this.redsisClient.getAtividades({});

      const alerts: SLAAlert[] = [];
      const now = new Date();

      for (const atividade of atividades) {
        if (!atividade.data_prazo) continue;

        const prazo = new Date(atividade.data_prazo);
        const hoursUntil = (prazo.getTime() - now.getTime()) / (1000 * 60 * 60);

        // Só alertar se falta menos de 7 dias
        if (hoursUntil > 168) continue;

        const urgencyScore = this.calculateUrgencyScore(hoursUntil);

        // Buscar participante correspondente
        const { data: participant } = await this.supabaseClient
          .from('campaign_participants')
          .select('id')
          .eq('redsis_atividade_codigo', atividade.codigo)
          .single();

        if (!participant) continue;

        alerts.push({
          participant_id: participant.id,
          atividade_codigo: atividade.codigo,
          cliente_nome: atividade.cliente_nome || 'Cliente',
          data_prazo: atividade.data_prazo,
          hours_until_deadline: Math.round(hoursUntil * 10) / 10,
          urgency_score: urgencyScore,
          current_stage: 'UNKNOWN', // Tabela lead_states não existe
          recommended_action: this.recommendAction(urgencyScore, ''),
        });
      }

      // Ordenar por urgência
      return alerts.sort((a, b) => b.urgency_score - a.urgency_score);
    } catch (error) {
      console.error('Erro ao analisar atividades:', error);
      return [];
    }
  }

  /**
   * Repriorizar fila de cadência baseado em SLA
   */
  async reprioritizeCadenceQueue(): Promise<number> {
    const alerts = await this.analyzeActivitiesWithDeadlines();
    let reprioritizedCount = 0;

    for (const alert of alerts) {
      if (alert.urgency_score < 70) continue; // Só repriorizar alta urgência

      // Buscar mensagens pendentes para este participante
      const { data: queueItems } = await this.supabaseClient
        .from('cadence_queue')
        .select('id, priority, scheduled_for')
        .eq('participant_id', alert.participant_id)
        .eq('status', 'pending');

      if (!queueItems || queueItems.length === 0) continue;

      for (const item of queueItems) {
        // Aumentar prioridade baseado na urgência
        const newPriority = Math.max(item.priority, alert.urgency_score);

        // Se urgência muito alta, antecipar agendamento
        let newScheduledFor = item.scheduled_for;
        if (alert.urgency_score >= 95) {
          // Agendar para próxima hora
          newScheduledFor = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        } else if (alert.urgency_score >= 85) {
          // Agendar para próximas 6 horas
          newScheduledFor = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
        }

        await this.supabaseClient
          .from('cadence_queue')
          .update({
            priority: newPriority,
            scheduled_for: newScheduledFor,
          })
          .eq('id', item.id);

        reprioritizedCount++;
      }
    }

    return reprioritizedCount;
  }

  /**
   * Gerar relatório de SLA
   */
  async generateSLAReport() {
    const alerts = await this.analyzeActivitiesWithDeadlines();

    const report = {
      generated_at: new Date().toISOString(),
      total_activities: alerts.length,
      critical: alerts.filter(a => a.urgency_score >= 95).length,
      high: alerts.filter(a => a.urgency_score >= 85 && a.urgency_score < 95).length,
      medium: alerts.filter(a => a.urgency_score >= 70 && a.urgency_score < 85).length,
      low: alerts.filter(a => a.urgency_score < 70).length,
      overdue: alerts.filter(a => a.hours_until_deadline < 0).length,
      alerts: alerts.slice(0, 20), // Top 20 mais urgentes
    };

    return report;
  }

  /**
   * Enviar alertas urgentes
   */
  async sendUrgentAlerts() {
    const alerts = await this.analyzeActivitiesWithDeadlines();
    const urgentAlerts = alerts.filter(a => a.urgency_score >= 85);

    if (urgentAlerts.length === 0) return { sent: 0 };

    // Broadcast via Supabase Realtime
    const channel = this.supabaseClient.channel('sla-alerts');
    
    for (const alert of urgentAlerts) {
      await channel.send({
        type: 'broadcast',
        event: 'sla-alert',
        payload: alert,
      });
    }

    return { sent: urgentAlerts.length, alerts: urgentAlerts };
  }

  /**
   * Atualizar prioridades automaticamente (cron job)
   */
  async autoUpdatePriorities(): Promise<{
    analyzed: number;
    reprioritized: number;
    alerts_sent: number;
  }> {
    const alerts = await this.analyzeActivitiesWithDeadlines();
    const reprioritized = await this.reprioritizeCadenceQueue();
    const { sent } = await this.sendUrgentAlerts();

    return {
      analyzed: alerts.length,
      reprioritized,
      alerts_sent: sent,
    };
  }
}

/**
 * Helper para criar instância do engine
 */
export function createSLAEngine(redsisClient: RedsisClient) {
  return new SLAEngine(redsisClient);
}
