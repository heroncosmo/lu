/**
 * Perfil Triplo Builder
 * Mescla 3 contextos para criar prompt completo do GPT:
 * 1. Persona do Agente (agents table)
 * 2. Perfil do Cliente (Redsis CRM)
 * 3. Configuração da Campanha (campaigns table)
 */

import { RedsisClient } from '@/integrations/redsis/client';
import { supabase } from '@/integrations/supabase/client';

export interface PerfilTriploContext {
  persona: {
    name: string;
    role: string;
    tone: string;
    instructions: string;
    language: string;
  };
  cliente: {
    codigo: number;
    nome: string;
    segmento?: string;
    historico?: string;
    preferencias?: string;
    atividades_recentes?: string;
  };
  campanha: {
    id: string;
    name: string;
    objective: string;
    product_focus?: string;
    value_proposition?: string;
    constraints?: string;
  };
}

export interface PerfilTriploPrompt {
  systemPrompt: string;
  context: PerfilTriploContext;
  userMessage: string;
}

export class PerfilTriploBuilder {
  private redsisClient: RedsisClient;
  private supabaseClient = supabase;

  constructor(redsisConfig: {
    baseURL: string;
    usuario: string;
    senha: string;
    servidor: string;
    porta: string;
    empresa?: number;
  }) {
    this.redsisClient = new RedsisClient(redsisConfig);
  }

  /**
   * Carrega a persona do agente
   */
  private async loadPersona(agentId: string) {
    const { data: agent, error } = await this.supabaseClient
      .from('agents')
      .select('name, role, tone, system_prompt, language')
      .eq('id', agentId)
      .single();

    if (error) throw new Error(`Erro ao carregar persona: ${error.message}`);

    return {
      name: agent.name || 'Leandro',
      role: agent.role || 'Consultor de Vendas',
      tone: agent.tone || 'profissional e consultivo',
      instructions: agent.system_prompt || '',
      language: agent.language || 'pt-BR',
    };
  }

  /**
   * Carrega perfil do cliente do CRM Redsis
   */
  private async loadClienteProfile(clienteCodigo: number) {
    try {
      // Buscar dados básicos do cliente
      const cliente = await this.redsisClient.getCliente(clienteCodigo);

      // Buscar anotações recentes
      const anotacoes = await this.redsisClient.getAnotacoes(clienteCodigo);
      const historicoRecente = anotacoes
        .slice(0, 5)
        .map(a => `${a.data}: ${a.descricao}`)
        .join('\n');

      // Buscar atividades abertas
      const atividades = await this.redsisClient.getAtividades({
        cliente: clienteCodigo,
      });

      const atividadesRecentes = atividades
        .slice(0, 3)
        .map(a => `${a.funil}/${a.sub_funil}: ${a.nome}`)
        .join(', ');

      return {
        codigo: cliente.codigo,
        nome: cliente.nome,
        segmento: cliente.segmento || 'Não especificado',
        historico: historicoRecente || 'Sem histórico disponível',
        preferencias: cliente.observacoes || 'Não registradas',
        atividades_recentes: atividadesRecentes || 'Nenhuma atividade aberta',
      };
    } catch (error) {
      console.error('Erro ao carregar perfil do cliente:', error);
      return {
        codigo: clienteCodigo,
        nome: 'Cliente',
        segmento: 'Desconhecido',
        historico: 'Não disponível',
        preferencias: 'Não disponível',
        atividades_recentes: 'Não disponível',
      };
    }
  }

  /**
   * Carrega configuração da campanha
   */
  private async loadCampanhaProfile(campanhaId: string) {
    const { data: campanha, error } = await this.supabaseClient
      .from('campaigns')
      .select('name, objective, product_focus, value_proposition, constraints')
      .eq('id', campanhaId)
      .single();

    if (error) throw new Error(`Erro ao carregar campanha: ${error.message}`);

    return {
      id: campanhaId,
      name: campanha.name,
      objective: campanha.objective || 'Prospecção B2B',
      product_focus: campanha.product_focus || 'Pedras naturais',
      value_proposition: campanha.value_proposition || 'Qualidade e variedade',
      constraints: campanha.constraints || 'Sem restrições específicas',
    };
  }

  /**
   * Constrói o prompt completo com Perfil Triplo
   */
  async buildPrompt(params: {
    agentId: string;
    clienteCodigo: number;
    campanhaId: string;
    userMessage: string;
  }): Promise<PerfilTriploPrompt> {
    const [persona, cliente, campanha] = await Promise.all([
      this.loadPersona(params.agentId),
      this.loadClienteProfile(params.clienteCodigo),
      this.loadCampanhaProfile(params.campanhaId),
    ]);

    const context: PerfilTriploContext = {
      persona,
      cliente,
      campanha,
    };

    const systemPrompt = this.constructSystemPrompt(context);

    return {
      systemPrompt,
      context,
      userMessage: params.userMessage,
    };
  }

  /**
   * Constrói o system prompt mesclando os 3 perfis
   */
  private constructSystemPrompt(context: PerfilTriploContext): string {
    return `# IDENTIDADE DO AGENTE
Você é ${context.persona.name}, ${context.persona.role}.
Tom de voz: ${context.persona.tone}
Idioma: ${context.persona.language}

${context.persona.instructions}

# PERFIL DO CLIENTE
Nome: ${context.cliente.nome}
Código CRM: ${context.cliente.codigo}
Segmento: ${context.cliente.segmento}

Histórico de Interações:
${context.cliente.historico}

Preferências Registradas:
${context.cliente.preferencias}

Atividades em Andamento:
${context.cliente.atividades_recentes}

# CONTEXTO DA CAMPANHA
Campanha: ${context.campanha.name}
Objetivo: ${context.campanha.objective}
Foco de Produto: ${context.campanha.product_focus}
Proposta de Valor: ${context.campanha.value_proposition}

Restrições:
${context.campanha.constraints}

# INSTRUÇÕES OPERACIONAIS
- SEMPRE use as informações do perfil do cliente para personalizar sua abordagem
- Considere o histórico de interações ao responder
- Respeite as preferências registradas do cliente
- Alinhe suas mensagens com o objetivo da campanha
- Mantenha o tom de voz consistente com a persona
- Se houver informações contraditórias, priorize: 1) Preferências do cliente, 2) Objetivo da campanha, 3) Instruções da persona
- Registre informações importantes descobertas durante a conversa`;
  }

  /**
   * Salva snapshot do contexto na fila de cadência
   */
  async saveContextSnapshot(params: {
    cadenceQueueId: string;
    context: PerfilTriploContext;
  }) {
    const { error } = await this.supabaseClient
      .from('cadence_queue')
      .update({
        context_snapshot: params.context,
      })
      .eq('id', params.cadenceQueueId);

    if (error) {
      console.error('Erro ao salvar snapshot de contexto:', error);
    }
  }
}

/**
 * Helper para criar instância do builder
 */
export function createPerfilTriploBuilder() {
  const config = {
    baseURL: import.meta.env.VITE_REDSIS_API_URL || 'https://api.redsis.com.br',
    usuario: import.meta.env.VITE_REDSIS_USUARIO || 'REDSIS',
    senha: import.meta.env.VITE_REDSIS_SENHA || '1010',
    servidor: import.meta.env.VITE_REDSIS_SERVIDOR || '10.1.1.200',
    porta: import.meta.env.VITE_REDSIS_PORTA || '8084',
    empresa: import.meta.env.VITE_REDSIS_EMPRESA
      ? Number(import.meta.env.VITE_REDSIS_EMPRESA)
      : undefined,
  };

  return new PerfilTriploBuilder(config);
}
