/**
 * Negotiation Module - Gerenciamento de orçamentos e owner lock
 */

import { supabase } from '@/integrations/supabase/client';
import { RedsisClient } from '@/integrations/redsis/client';

export interface Quotation {
  id: string;
  campaign_id: string;
  participant_id: string;
  atividade_codigo?: number;
  item_type: 'chapa' | 'cavalete' | 'personalizado';
  item_codigo?: number;
  item_descricao: string;
  quantidade: number;
  preco_unitario?: number;
  preco_total?: number;
  desconto_percentual: number;
  status: 'draft' | 'sent' | 'negotiating' | 'accepted' | 'rejected' | 'expired';
  owner_id?: string;
  owner_locked_at?: string;
  playbook_template?: string;
  negotiation_guidelines?: string;
  max_discount_allowed: number;
  valid_until?: string;
  expires_at?: string;
  created_at: string;
  updated_at: string;
}

export class NegotiationService {
  private supabaseClient = supabase;
  private redsisClient?: RedsisClient;

  constructor(redsisClient?: RedsisClient) {
    this.redsisClient = redsisClient;
  }

  /**
   * Criar novo orçamento
   */
  async createQuotation(params: {
    participantId: string;
    campaignId: string;
    itemType: 'chapa' | 'cavalete' | 'personalizado';
    itemCodigo?: number;
    itemDescricao: string;
    quantidade?: number;
    precoUnitario?: number;
    descontoPercentual?: number;
    playbook?: string;
    validUntil?: Date;
  }): Promise<Quotation> {
    const precoTotal = params.precoUnitario && params.quantidade
      ? params.precoUnitario * params.quantidade * (1 - (params.descontoPercentual || 0) / 100)
      : undefined;

    const { data, error } = await this.supabaseClient
      .from('quotations')
      .insert({
        participant_id: params.participantId,
        campaign_id: params.campaignId,
        item_type: params.itemType,
        item_codigo: params.itemCodigo,
        item_descricao: params.itemDescricao,
        quantidade: params.quantidade || 1,
        preco_unitario: params.precoUnitario,
        preco_total: precoTotal,
        desconto_percentual: params.descontoPercentual || 0,
        playbook_template: params.playbook,
        valid_until: params.validUntil?.toISOString(),
        status: 'draft',
      })
      .select()
      .single();

    if (error) throw new Error(`Erro ao criar orçamento: ${error.message}`);
    return data;
  }

  /**
   * Enviar orçamento ao cliente
   */
  async sendQuotation(quotationId: string, atividadeCodigo?: number) {
    const { data: quotation, error: fetchError } = await this.supabaseClient
      .from('quotations')
      .select('*, campaign_participants(*)')
      .eq('id', quotationId)
      .single();

    if (fetchError) throw new Error(`Erro ao buscar orçamento: ${fetchError.message}`);

    // Atualizar status
    const { error: updateError } = await this.supabaseClient
      .from('quotations')
      .update({
        status: 'sent',
        atividade_codigo: atividadeCodigo,
        updated_at: new Date().toISOString(),
      })
      .eq('id', quotationId);

    if (updateError) throw new Error(`Erro ao enviar orçamento: ${updateError.message}`);

    // Se tiver Redsis configurado, criar anotação
    if (this.redsisClient && atividadeCodigo) {
      const descricao = `💰 Orçamento enviado: ${quotation.item_descricao}\n` +
        `Quantidade: ${quotation.quantidade}\n` +
        `Valor: R$ ${quotation.preco_total?.toFixed(2) || 'A consultar'}\n` +
        `Desconto: ${quotation.desconto_percentual}%`;

      await this.redsisClient.createAnotacao(
        quotation.campaign_participants.redsis_cliente_codigo,
        {
          data: new Date().toISOString(),
          tipo: 'Orçamento',
          conteudo: descricao,
        }
      );
    }

    return quotation;
  }

  /**
   * Assumir responsabilidade de um lead (owner lock)
   */
  async assumeLead(leadStateId: string, userId: string, reason = 'Negociação manual') {
    const { data, error } = await this.supabaseClient.rpc('assume_lead', {
      p_lead_state_id: leadStateId,
      p_user_id: userId,
      p_reason: reason,
    });

    if (error) throw new Error(`Erro ao assumir lead: ${error.message}`);
    return data;
  }

  /**
   * Devolver lead para IA (remover owner lock)
   */
  async releaseLead(leadStateId: string, userId: string, reason = 'Devolvendo para IA') {
    const { data, error } = await this.supabaseClient.rpc('release_lead', {
      p_lead_state_id: leadStateId,
      p_user_id: userId,
      p_reason: reason,
    });

    if (error) throw new Error(`Erro ao devolver lead: ${error.message}`);
    return data;
  }

  /**
   * Listar orçamentos de um participante
   */
  async getQuotationsByParticipant(participantId: string) {
    const { data, error } = await this.supabaseClient
      .from('quotations')
      .select('*')
      .eq('participant_id', participantId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Erro ao buscar orçamentos: ${error.message}`);
    return data;
  }

  /**
   * Atualizar status do orçamento
   */
  async updateQuotationStatus(
    quotationId: string,
    status: 'negotiating' | 'accepted' | 'rejected' | 'expired',
    reason?: string
  ) {
    const updates: any = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === 'accepted') {
      updates.accepted_at = new Date().toISOString();
    } else if (status === 'rejected') {
      updates.rejected_at = new Date().toISOString();
      updates.rejection_reason = reason;
    }

    const { error } = await this.supabaseClient
      .from('quotations')
      .update(updates)
      .eq('id', quotationId);

    if (error) throw new Error(`Erro ao atualizar orçamento: ${error.message}`);

    // Se aceito, criar tarefa "Faturar" no Redsis
    if (status === 'accepted' && this.redsisClient) {
      const { data: quotation } = await this.supabaseClient
        .from('quotations')
        .select('*, campaign_participants(*)')
        .eq('id', quotationId)
        .single();

      if (quotation?.atividade_codigo) {
        await this.redsisClient.createTarefa(
          quotation.atividade_codigo,
          {
            tipo: 'Faturamento',
            observacao: `Faturar: ${quotation.item_descricao}`,
            codigo_responsavel: 1,
            data_prazo: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
          }
        );
      }
    }
  }

  /**
   * Aplicar desconto ao orçamento
   */
  async applyDiscount(quotationId: string, newDiscountPercentual: number) {
    const { data: quotation, error: fetchError } = await this.supabaseClient
      .from('quotations')
      .select('*')
      .eq('id', quotationId)
      .single();

    if (fetchError) throw new Error(`Erro ao buscar orçamento: ${fetchError.message}`);

    if (newDiscountPercentual > quotation.max_discount_allowed) {
      throw new Error(
        `Desconto máximo permitido: ${quotation.max_discount_allowed}%`
      );
    }

    const newPrecoTotal = quotation.preco_unitario
      ? quotation.preco_unitario * quotation.quantidade * (1 - newDiscountPercentual / 100)
      : quotation.preco_total;

    const { error: updateError } = await this.supabaseClient
      .from('quotations')
      .update({
        desconto_percentual: newDiscountPercentual,
        preco_total: newPrecoTotal,
        updated_at: new Date().toISOString(),
      })
      .eq('id', quotationId);

    if (updateError) throw new Error(`Erro ao aplicar desconto: ${updateError.message}`);

    return { newDiscountPercentual, newPrecoTotal };
  }

  /**
   * Buscar leads com owner lock - DESABILITADO: tabela lead_states não existe
   */
  async getLockedLeads(_ownerId?: string) {
    // Tabela lead_states não existe no banco de dados
    return [];
  }
}

/**
 * Helper para criar instância do serviço
 */
export function createNegotiationService(redsisClient?: RedsisClient) {
  return new NegotiationService(redsisClient);
}
