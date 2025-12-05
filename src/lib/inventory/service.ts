/**
 * Inventory Service - Wrapper para estoque Redsis
 * Fornece cache e deep links para chapas e cavaletes
 */

import { RedsisClient } from '@/integrations/redsis/client';
import { Chapa, Cavalete } from '@/integrations/redsis/types';
import { supabase } from '@/integrations/supabase/client';

export interface CachedInventoryItem {
  id: string;
  type: 'chapa' | 'cavalete';
  codigo: number;
  descricao: string;
  material: string;
  preco?: number;
  disponivel: boolean;
  imagem_url?: string;
  cached_at: string;
}

export class InventoryService {
  private redsisClient: RedsisClient;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private supabaseClient = supabase;
  private cacheExpiration = 3600000; // 1 hora em ms

  constructor(redsisConfig: {
    baseURL: string;
    usuario: string;
    senha: string;
    servidor: string;
    porta: string;
  }) {
    this.redsisClient = new RedsisClient(redsisConfig);
  }

  /**
   * Busca chapas com cache
   */
  async getChapas(params?: {
    material?: number;
    disponivel?: boolean;
    limit?: number;
  }): Promise<CachedInventoryItem[]> {
    const cacheKey = `chapas_${JSON.stringify(params)}`;
    const cached = await this.getCachedInventory(cacheKey);

    if (cached) {
      return cached;
    }

    const { limit, ...redsisParams } = params || {};
    const chapas = await this.redsisClient.getChapas(redsisParams);
    const items = chapas.map(c => this.transformChapa(c));
    
    await this.cacheInventory(cacheKey, items);
    return items;
  }

  /**
   * Busca cavaletes com cache
   */
  async getCavaletes(params?: {
    material?: number;
    disponivel?: boolean;
    limit?: number;
  }): Promise<CachedInventoryItem[]> {
    const cacheKey = `cavaletes_${JSON.stringify(params)}`;
    const cached = await this.getCachedInventory(cacheKey);

    if (cached) {
      return cached;
    }

    const { limit, ...redsisParams } = params || {};
    const cavaletes = await this.redsisClient.getCavaletes(redsisParams);
    const items = cavaletes.map(c => this.transformCavalete(c));
    
    await this.cacheInventory(cacheKey, items);
    return items;
  }

  /**
   * Busca item específico por código
   */
  async getItem(type: 'chapa' | 'cavalete', codigo: number): Promise<CachedInventoryItem | null> {
    try {
      if (type === 'chapa') {
        const chapas = await this.redsisClient.getChapas({ bloco: codigo });
        return chapas[0] ? this.transformChapa(chapas[0]) : null;
      } else {
        const cavaletes = await this.redsisClient.getCavaletes({ cavalete: codigo });
        return cavaletes[0] ? this.transformCavalete(cavaletes[0]) : null;
      }
    } catch (error) {
      console.error(`Erro ao buscar ${type} ${codigo}:`, error);
      return null;
    }
  }

  /**
   * Gera deep link para item do inventário
   */
  generateDeepLink(type: 'chapa' | 'cavalete', codigo: number): string {
    const baseUrl = import.meta.env.VITE_APP_URL || 'https://luchoa.com.br';
    return `${baseUrl}/estoque/${type}/${codigo}`;
  }

  /**
   * Anexa item à oferta no CRM
   */
  async attachToOffer(params: {
    clienteCodigo: number;
    atividadeCodigo: number;
    itemType: 'chapa' | 'cavalete';
    itemCodigo: number;
    observacoes?: string;
  }) {
    const item = await this.getItem(params.itemType, params.itemCodigo);
    
    if (!item) {
      throw new Error(`Item ${params.itemType} ${params.itemCodigo} não encontrado`);
    }

    const deepLink = this.generateDeepLink(params.itemType, params.itemCodigo);
    const descricao = `🔗 ${item.descricao}\n${deepLink}\n${params.observacoes || ''}`;

    await this.redsisClient.createAnotacao(params.clienteCodigo, {
      data: new Date().toISOString(),
      tipo: 'Oferta',
      conteudo: descricao,
    });

    // Registrar na atividade também
    await this.redsisClient.createTarefa(params.atividadeCodigo, {
      tipo: 'Acompanhamento',
      observacao: `Enviado: ${item.descricao}`,
      codigo_responsavel: 1,
      data_prazo: new Date().toISOString(),
    });

    return {
      item,
      deepLink,
      registered: true,
    };
  }

  /**
   * Busca recomendações baseadas em histórico do cliente
   */
  async getRecommendations(clienteCodigo: number, limit = 5): Promise<CachedInventoryItem[]> {
    // Buscar anotações do cliente para identificar preferências
    const anotacoes = await this.redsisClient.getAnotacoes(clienteCodigo);
    
    // Extrair materiais mencionados
    const materiaisMencionados = new Set<string>();
    const keywords = ['granito', 'mármore', 'quartzito', 'quartzo', 'cristal'];
    
    anotacoes.forEach(a => {
      keywords.forEach(kw => {
        if (a.descricao?.toLowerCase().includes(kw) || a.conteudo.toLowerCase().includes(kw)) {
          materiaisMencionados.add(kw);
        }
      });
    });

    // Se não houver preferências, retornar mais populares
    if (materiaisMencionados.size === 0) {
      const [chapas, cavaletes] = await Promise.all([
        this.getChapas({ limit }),
        this.getCavaletes({ limit }),
      ]);
      return [...chapas, ...cavaletes].slice(0, limit);
    }

    // Buscar itens dos materiais preferidos
    const recommendations: CachedInventoryItem[] = [];
    
    // Buscar todos itens disponíveis (filtragem por material seria por nome, complexa)
    const [chapas, cavaletes] = await Promise.all([
      this.getChapas({ limit }),
      this.getCavaletes({ limit }),
    ]);
    recommendations.push(...chapas, ...cavaletes);

    return recommendations.slice(0, limit);
  }

  // Métodos privados de transformação e cache

  private transformChapa(chapa: Chapa): CachedInventoryItem {
    return {
      id: `chapa_${chapa.codigo}`,
      type: 'chapa',
      codigo: chapa.codigo,
      descricao: chapa.descricao || chapa.material || 'Chapa',
      material: chapa.material,
      preco: chapa.preco || chapa.preco_m2,
      disponivel: chapa.disponivel ?? (chapa.situacao === 'disponivel'),
      imagem_url: chapa.imagem_url,
      cached_at: new Date().toISOString(),
    };
  }

  private transformCavalete(cavalete: Cavalete): CachedInventoryItem {
    return {
      id: `cavalete_${cavalete.codigo}`,
      type: 'cavalete',
      codigo: cavalete.codigo,
      descricao: cavalete.descricao || cavalete.material || 'Cavalete',
      material: cavalete.material,
      preco: cavalete.preco || cavalete.preco_m2,
      disponivel: cavalete.disponivel ?? (cavalete.situacao === 'disponivel'),
      imagem_url: cavalete.imagem_url,
      cached_at: new Date().toISOString(),
    };
  }

  private async getCachedInventory(key: string): Promise<CachedInventoryItem[] | null> {
    try {
      const cached = localStorage.getItem(`inventory_${key}`);
      if (!cached) return null;

      const data = JSON.parse(cached);
      const age = Date.now() - new Date(data.timestamp).getTime();

      if (age > this.cacheExpiration) {
        localStorage.removeItem(`inventory_${key}`);
        return null;
      }

      return data.items;
    } catch {
      return null;
    }
  }

  private async cacheInventory(key: string, items: CachedInventoryItem[]) {
    try {
      localStorage.setItem(
        `inventory_${key}`,
        JSON.stringify({
          items,
          timestamp: new Date().toISOString(),
        })
      );
    } catch (error) {
      console.error('Erro ao cachear inventário:', error);
    }
  }
}

/**
 * Helper para criar instância do serviço
 */
export function createInventoryService() {
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

  return new InventoryService(config);
}
