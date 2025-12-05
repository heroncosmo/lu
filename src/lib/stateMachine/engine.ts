import { getRedsisClient } from '@/integrations/redsis';
import { classifyIntent } from './intentClassifier';
import type {
  StateMachineContext,
  StateMachineEvent,
  StateMachineAction,
  LeadStage,
} from './types';

// Stage progression rules
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const STAGE_PROGRESSION: Record<LeadStage, LeadStage | null> = {
  A_TRABALHAR: 'PROSPECCAO',
  PROSPECCAO: 'OFERTA',
  OFERTA: 'ORCAMENTO',
  ORCAMENTO: 'NEGOCIACAO',
  NEGOCIACAO: 'AGUARDANDO_LIBERACAO',
  AGUARDANDO_LIBERACAO: 'AG_INSPECAO',
  AG_INSPECAO: 'AG_BOOKING',
  AG_BOOKING: 'AG_CARREGAMENTO',
  AG_CARREGAMENTO: 'AGUARDANDO_BL',
  AGUARDANDO_BL: 'CONSIGNACAO',
  CONSIGNACAO: 'INVOICE',
  INVOICE: null,
};

// Stages where AI should pause
const AI_PAUSE_STAGES: LeadStage[] = [
  'AGUARDANDO_LIBERACAO',
  'AG_INSPECAO',
  'AG_BOOKING',
  'AG_CARREGAMENTO',
  'AGUARDANDO_BL',
  'CONSIGNACAO',
  'INVOICE',
];

export class StateMachineEngine {
  constructor(private gptApiKey: string) {}

  async processEvent(
    context: StateMachineContext,
    event: StateMachineEvent
  ): Promise<StateMachineAction[]> {
    const actions: StateMachineAction[] = [];

    switch (event.type) {
      case 'MESSAGE_RECEIVED':
        if (event.payload.sender === 'client') {
          const clientMessage = event.payload.messageContent || '';
          const classification = await classifyIntent(
            clientMessage,
            this.gptApiKey
          );

          // Update temperature
          if (classification.temperature !== 'unknown') {
            actions.push({
              type: 'create_note',
              payload: {
                tipo: 'Sistema',
                conteudo: `Temperatura atualizada: ${classification.temperature}. Intenção: ${classification.intent}`,
              },
            });
          }

          // Handle intent-based transitions
          if (classification.nextStage && classification.confidence > 0.6) {
            actions.push({
              type: 'advance_stage',
              payload: {
                targetStage: classification.nextStage,
                reason: `Detectado: ${classification.intent}`,
              },
            });
          }

          // Hot lead notification
          if (classification.temperature === 'hot') {
            actions.push({
              type: 'notify_owner',
              payload: {
                level: 'urgent',
                message: `Lead quente detectado! Intenção: ${classification.intent}`,
                classification,
              },
            });

            // Auto-advance to negotiation if very hot
            if (
              ['negociacao', 'confirmacao_pedido'].includes(
                classification.intent
              )
            ) {
              actions.push({
                type: 'advance_stage',
                payload: {
                  targetStage: 'NEGOCIACAO',
                  reason: 'Lead quente - movido automaticamente',
                },
              });
            }
          }

          // Schedule followup based on temperature
          if (classification.temperature === 'cold') {
            actions.push({
              type: 'schedule_followup',
              payload: {
                delayDays: 5,
                messageType: 'cold_followup',
              },
            });
          } else if (classification.temperature === 'warm') {
            actions.push({
              type: 'schedule_followup',
              payload: {
                delayDays: 3,
                messageType: 'warm_followup',
              },
            });
          }

          // Handle vague responses
          if (
            classification.intent === 'resposta_vaga' &&
            classification.confidence > 0.5
          ) {
            actions.push({
              type: 'schedule_followup',
              payload: {
                delayMinutes: this.randomBetween(20, 40),
                messageType: 'clarification',
              },
            });
          }

          // Handle meeting scheduling
          if (classification.intent === 'marcou_reuniao') {
            actions.push({
              type: 'create_task',
              payload: {
                tipo: 'Reunião',
                observacao: `Cliente marcou reunião: ${clientMessage}`,
                data_prazo: this.extractDateTime(
                  clientMessage,
                  classification.entities
                ),
              },
            });
          }
        }
        break;

      case 'NO_RESPONSE':
        // Apply cadence rules (handled by cadenceScheduler separately)
        break;

      case 'HUMAN_OVERRIDE':
        actions.push({
          type: 'pause_ai',
          payload: {
            reason: 'Intervenção humana detectada',
            triggeredBy: event.payload.userId,
          },
        });
        break;

      case 'PRODUCT_EVENT':
        // Auto-send product news (handled by campaignEngine)
        break;

      case 'SCHEDULED_FOLLOWUP':
        // Execute scheduled message (handled by cadenceScheduler)
        break;
    }

    // Check if AI should be paused in current stage
    if (AI_PAUSE_STAGES.includes(context.currentStage)) {
      actions.push({
        type: 'pause_ai',
        payload: {
          reason: `Estágio operacional: ${context.currentStage}`,
        },
      });
    }

    return actions;
  }

  async executeActions(
    actions: StateMachineAction[],
    context: StateMachineContext
  ): Promise<void> {
    const redsis = getRedsisClient();

    for (const action of actions) {
      try {
        switch (action.type) {
          case 'advance_stage':
            if (context.currentStage && action.payload.targetStage) {
              // Move to target stage via Redsis
              const atividades = await redsis.getAtividades({
                cliente: parseInt(context.participantId),
              });

              if (atividades.length > 0) {
                const atividade = atividades[0];
                // Advance until we reach target stage
                await redsis.avancarAtividade(atividade.codigo);

                // Log the transition
                await redsis.createAnotacao(
                  parseInt(context.participantId),
                  {
                    data: new Date().toISOString(),
                    tipo: 'Sistema',
                    conteudo: `Movido para ${action.payload.targetStage}. Razão: ${action.payload.reason}`,
                  }
                );
              }
            }
            break;

          case 'create_note':
            await redsis.createAnotacao(parseInt(context.participantId), {
              data: new Date().toISOString(),
              tipo: action.payload.tipo || 'IA',
              conteudo: action.payload.conteudo,
            });
            break;

          case 'create_task':
            const atividades = await redsis.getAtividades({
              cliente: parseInt(context.participantId),
            });
            if (atividades.length > 0) {
              await redsis.createTarefa(atividades[0].codigo, {
                tipo: action.payload.tipo,
                observacao: action.payload.observacao,
                codigo_responsavel: action.payload.codigo_responsavel || 1, // Default to system
                data_prazo:
                  action.payload.data_prazo || this.getFutureDate(3),
              });
            }
            break;

          case 'notify_owner':
            // Implement notification via Supabase Realtime or external webhook
            console.log('[NOTIFICATION]', action.payload.message);
            // TODO: Send to internal WhatsApp/Slack
            break;

          case 'pause_ai':
            // Update lead_states in Supabase to set owner_lock = true
            console.log('[AI PAUSED]', action.payload.reason);
            // TODO: Update database
            break;

          case 'resume_ai':
            // Update lead_states to set owner_lock = false
            console.log('[AI RESUMED]');
            // TODO: Update database
            break;

          case 'schedule_followup':
            // Insert into cadence_queue
            console.log('[FOLLOWUP SCHEDULED]', action.payload);
            // TODO: Insert into database
            break;
        }
      } catch (error) {
        console.error(
          `Failed to execute action ${action.type}:`,
          error
        );
      }
    }
  }

  private randomBetween(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private extractDateTime(
    message: string,
    entities: Record<string, any>
  ): string {
    // Simple date extraction - enhance with more sophisticated parsing
    if (entities.datetime) return entities.datetime;

    const now = new Date();
    const timeMatch = message.match(/(\d{1,2})[h:](\d{2})?/);
    if (timeMatch) {
      now.setHours(parseInt(timeMatch[1]), parseInt(timeMatch[2] || '0'));
    }

    return now.toISOString();
  }

  private getFutureDate(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString();
  }
}
