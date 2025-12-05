export type LeadStage =
  | 'A_TRABALHAR'
  | 'PROSPECCAO'
  | 'OFERTA'
  | 'ORCAMENTO'
  | 'NEGOCIACAO'
  | 'AGUARDANDO_LIBERACAO'
  | 'AG_INSPECAO'
  | 'AG_BOOKING'
  | 'AG_CARREGAMENTO'
  | 'AGUARDANDO_BL'
  | 'CONSIGNACAO'
  | 'INVOICE';

export type LeadTemperature = 'cold' | 'warm' | 'hot' | 'unknown';

export type MessageIntent =
  | 'pedido_orcamento'
  | 'pedido_midia'
  | 'pedido_disponibilidade'
  | 'interesse_reserva'
  | 'envio_medidas'
  | 'confirmacao_acabamento'
  | 'pedido_timeline'
  | 'negociacao'
  | 'confirmacao_pedido'
  | 'marcou_reuniao'
  | 'resposta_vaga'
  | 'sem_resposta'
  | 'unknown';

export interface IntentClassification {
  intent: MessageIntent;
  confidence: number;
  entities: Record<string, any>;
  temperature: LeadTemperature;
  nextStage?: LeadStage;
}

export interface StateMachineAction {
  type:
    | 'advance_stage'
    | 'retreat_stage'
    | 'create_note'
    | 'create_task'
    | 'notify_owner'
    | 'pause_ai'
    | 'resume_ai'
    | 'schedule_followup';
  payload: Record<string, any>;
}

export interface StateMachineContext {
  participantId: string;
  currentStage: LeadStage;
  temperature: LeadTemperature;
  messageHistory: Array<{
    sender: 'agent' | 'client';
    content: string;
    timestamp: string;
  }>;
  clientProfile: Record<string, any>;
  campaignProfile: Record<string, any>;
  agentProfile: Record<string, any>;
}

export interface StateMachineEvent {
  type: 'MESSAGE_RECEIVED' | 'NO_RESPONSE' | 'HUMAN_OVERRIDE' | 'PRODUCT_EVENT' | 'SCHEDULED_FOLLOWUP';
  payload: {
    messageContent?: string;
    sender?: 'agent' | 'client';
    timestamp?: string;
    [key: string]: any;
  };
}
