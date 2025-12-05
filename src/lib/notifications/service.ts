/**
 * Notification Service - Sistema de alertas via Supabase Realtime
 * Notifica hot leads, SLA breaches e eventos críticos
 */

import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';

export interface NotificationPayload {
  type: 'hot_lead' | 'sla_alert' | 'owner_transfer' | 'system';
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  participant_id?: string;
  campaign_id?: string;
  metadata?: Record<string, any>;
  timestamp: string;
}

export class NotificationService {
  private supabaseClient = supabase;
  private channels: Map<string, RealtimeChannel> = new Map();
  private listeners: Map<string, Set<(payload: NotificationPayload) => void>> = new Map();

  /**
   * Inscrever em canal de notificações
   */
  subscribe(
    channelName: string,
    callback: (payload: NotificationPayload) => void
  ): () => void {
    // Criar canal se não existir
    if (!this.channels.has(channelName)) {
      const channel = this.supabaseClient.channel(channelName);
      
      channel
        .on('broadcast', { event: 'notification' }, ({ payload }) => {
          // Notificar todos os listeners
          const listeners = this.listeners.get(channelName) || new Set();
          listeners.forEach((listener) => listener(payload));
        })
        .subscribe();

      this.channels.set(channelName, channel);
      this.listeners.set(channelName, new Set());
    }

    // Adicionar callback à lista
    const listeners = this.listeners.get(channelName)!;
    listeners.add(callback);

    // Retornar função de cleanup
    return () => {
      listeners.delete(callback);
      
      // Se não há mais listeners, remover canal
      if (listeners.size === 0) {
        const channel = this.channels.get(channelName);
        channel?.unsubscribe();
        this.channels.delete(channelName);
        this.listeners.delete(channelName);
      }
    };
  }

  /**
   * Enviar notificação
   */
  async send(channelName: string, payload: NotificationPayload) {
    const channel = this.channels.get(channelName) || this.supabaseClient.channel(channelName);
    
    await channel.send({
      type: 'broadcast',
      event: 'notification',
      payload: {
        ...payload,
        timestamp: payload.timestamp || new Date().toISOString(),
      },
    });

    // Persistir notificações críticas
    if (payload.severity === 'critical') {
      await this.persistNotification(payload);
    }
  }

  /**
   * Notificar hot lead detectado
   */
  async notifyHotLead(params: {
    participantId: string;
    campaignId: string;
    clientName: string;
    intent: string;
    temperature: string;
  }) {
    const payload: NotificationPayload = {
      type: 'hot_lead',
      title: `🔥 Lead Quente: ${params.clientName}`,
      message: `Intent: ${params.intent} • Temperatura: ${params.temperature}`,
      severity: 'critical',
      participant_id: params.participantId,
      campaign_id: params.campaignId,
      metadata: params,
      timestamp: new Date().toISOString(),
    };

    await Promise.all([
      this.send('global-alerts', payload),
      this.send(`campaign-${params.campaignId}`, payload),
    ]);
  }

  /**
   * Notificar alerta de SLA
   */
  async notifySLAAlert(params: {
    participantId: string;
    atividadeCodigo: number;
    clientName: string;
    hoursUntilDeadline: number;
    urgencyScore: number;
  }) {
    const severity = params.urgencyScore >= 95 ? 'critical' : 'warning';
    
    const payload: NotificationPayload = {
      type: 'sla_alert',
      title: `⏰ SLA Alert: ${params.clientName}`,
      message: `Prazo em ${params.hoursUntilDeadline.toFixed(1)}h • Urgência: ${params.urgencyScore}`,
      severity,
      participant_id: params.participantId,
      metadata: params,
      timestamp: new Date().toISOString(),
    };

    await this.send('global-alerts', payload);
  }

  /**
   * Notificar transferência de responsável
   */
  async notifyOwnerTransfer(params: {
    participantId: string;
    fromAI: boolean;
    toUserName?: string;
    reason: string;
  }) {
    const payload: NotificationPayload = {
      type: 'owner_transfer',
      title: params.fromAI ? '🤝 Lead Assumido' : '🤖 Lead Devolvido',
      message: params.fromAI
        ? `${params.toUserName} assumiu o lead`
        : 'Lead devolvido para IA',
      severity: 'info',
      participant_id: params.participantId,
      metadata: params,
      timestamp: new Date().toISOString(),
    };

    await this.send('global-alerts', payload);
  }

  /**
   * Notificar erro do sistema
   */
  async notifySystemError(params: {
    title: string;
    message: string;
    error?: Error;
    context?: Record<string, any>;
  }) {
    const payload: NotificationPayload = {
      type: 'system',
      title: `❌ ${params.title}`,
      message: params.message,
      severity: 'critical',
      metadata: {
        error: params.error?.message,
        stack: params.error?.stack,
        ...params.context,
      },
      timestamp: new Date().toISOString(),
    };

    await this.send('system-alerts', payload);
  }

  /**
   * Persistir notificação no banco
   */
  private async persistNotification(payload: NotificationPayload) {
    try {
      await this.supabaseClient.from('notifications').insert({
        type: payload.type,
        title: payload.title,
        message: payload.message,
        severity: payload.severity,
        participant_id: payload.participant_id,
        campaign_id: payload.campaign_id,
        metadata: payload.metadata,
        read: false,
      });
    } catch (error) {
      console.error('Erro ao persistir notificação:', error);
    }
  }

  /**
   * Buscar notificações não lidas
   */
  async getUnreadNotifications(userId?: string) {
    let query = this.supabaseClient
      .from('notifications')
      .select('*')
      .eq('read', false)
      .order('created_at', { ascending: false });

    if (userId) {
      query = query.or(`campaign_id.in.(SELECT id FROM campaigns WHERE owner_id = ${userId})`);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data;
  }

  /**
   * Marcar notificação como lida
   */
  async markAsRead(notificationId: string) {
    const { error } = await this.supabaseClient
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId);

    if (error) throw error;
  }

  /**
   * Cleanup: desinscrever de todos os canais
   */
  cleanup() {
    this.channels.forEach((channel) => channel.unsubscribe());
    this.channels.clear();
    this.listeners.clear();
  }
}

/**
 * Hook React para usar notificações
 */
export function useNotifications(channelName: string) {
  const [notifications, setNotifications] = React.useState<NotificationPayload[]>([]);
  const serviceRef = React.useRef(new NotificationService());

  React.useEffect(() => {
    const service = serviceRef.current;
    
    const unsubscribe = service.subscribe(channelName, (payload) => {
      setNotifications((prev) => [payload, ...prev].slice(0, 50)); // Manter últimas 50
    });

    return () => {
      unsubscribe();
    };
  }, [channelName]);

  return {
    notifications,
    clearNotifications: () => setNotifications([]),
    sendNotification: (payload: NotificationPayload) =>
      serviceRef.current.send(channelName, payload),
  };
}

/**
 * Helper para criar instância singleton
 */
let notificationServiceInstance: NotificationService | null = null;

export function getNotificationService(): NotificationService {
  if (!notificationServiceInstance) {
    notificationServiceInstance = new NotificationService();
  }
  return notificationServiceInstance;
}

// Exportar React
import * as React from 'react';
