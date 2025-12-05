import ky, { KyInstance } from 'ky';
import type {
  RedsisAuthPayload,
  RedsisAuthResponse,
  Cliente,
  Contato,
  Anotacao,
  Funil,
  SubFunil,
  Atividade,
  Tarefa,
  Chapa,
  Cavalete,
} from './types';

interface RedsisConfig {
  usuario: string;
  senha: string;
  servidor: string;
  porta: string;
  baseURL?: string;
  empresa?: number;
}

interface TokenCache {
  token: string;
  expiresAt: number;
}

export class RedsisClient {
  private config: RedsisConfig;
  private client: KyInstance;
  private tokenCache: TokenCache | null = null;
  private authPromise: Promise<string> | null = null;

  constructor(config: RedsisConfig) {
    this.config = {
      ...config,
      baseURL: config.baseURL || 'https://api.redsis.com.br',
    };

    this.client = ky.create({
      prefixUrl: this.config.baseURL,
      timeout: 30000,
      retry: {
        limit: 3,
        methods: ['get', 'post', 'put', 'patch'],
        statusCodes: [408, 429, 500, 502, 503, 504],
      },
      hooks: {
        beforeRequest: [
          async (request) => {
            if (!request.url.includes('/token')) {
              const token = await this.getToken();
              request.headers.set('Authorization', `Bearer ${token}`);
            }
          },
        ],
        afterResponse: [
          async (request, _options, response) => {
            // If 401, clear token and retry once
            if (response.status === 401) {
              this.tokenCache = null;
              const token = await this.authenticate();
              request.headers.set('Authorization', `Bearer ${token}`);
              return ky(request);
            }
          },
        ],
      },
    });
  }

  private async authenticate(): Promise<string> {
    // Prevent concurrent auth requests
    if (this.authPromise) {
      return this.authPromise;
    }

    this.authPromise = (async () => {
      try {
        const payload: RedsisAuthPayload = {
          usuario: this.config.usuario,
          senha: this.config.senha,
          app: 'web',
          servidor: this.config.servidor,
          porta: this.config.porta,
        };

        const response = await ky
          .post('token', {
            prefixUrl: this.config.baseURL,
            json: payload,
            timeout: 10000,
          })
          .json<RedsisAuthResponse>();

        // Cache token for 50 minutes (assuming 1h expiration)
        this.tokenCache = {
          token: response.token,
          expiresAt: Date.now() + 50 * 60 * 1000,
        };

        return response.token;
      } finally {
        this.authPromise = null;
      }
    })();

    return this.authPromise;
  }

  private async getToken(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now()) {
      return this.tokenCache.token;
    }
    return this.authenticate();
  }

  private buildSearchParams(
    params?: Record<string, string | number | boolean | undefined>
  ): URLSearchParams {
    const searchParams = new URLSearchParams();
    if (!params) {
      return searchParams;
    }

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    });

    return searchParams;
  }

  // === CLIENTES ===
  async getClientes(params?: {
    nome?: string;
    documento?: string;
    situacao?: string;
    limit?: number;
  }): Promise<Cliente[]> {
    // A API Redsis não tem endpoint para listar TODOS os clientes
    // Apenas retorna contagem com POST /web/clientes
    // Use getClientesByVendedor() para buscar clientes de um vendedor específico
    console.warn('⚠️ getClientes() não está disponível na API Redsis');
    console.warn('📖 Use getClientesByVendedor(codigo) para buscar clientes de um vendedor');
    throw new Error('Endpoint /web/clientes POST apenas retorna contagem. Use getClientesByVendedor(codigo) ou busque via atividades do Kanban');
  }

  async getCliente(codigo: number): Promise<Cliente> {
    return this.client.get(`web/clientes/${codigo}`).json();
  }

  async getClientesByVendedor(codigoVendedor: number): Promise<Cliente[]> {
    const response = await this.client
      .get(`web/clientes/vendedor/${codigoVendedor}`)
      .json<{ result: Cliente[] }>();
    return response.result;
  }

  async createCliente(data: Partial<Cliente>): Promise<void> {
    await this.client.post('web/clientes', { json: data }).json();
  }

  async updateCliente(codigo: number, data: Partial<Cliente>): Promise<void> {
    await this.client.patch(`web/clientes/${codigo}`, { json: data }).json();
  }

  // === CONTATOS ===
  async getContatos(codigoCliente: number): Promise<Contato[]> {
    const response = await this.client
      .post(`web/clientes/${codigoCliente}/contatos`)
      .json<{ result: Contato[] }>();
    return response.result;
  }

  async createContato(codigoCliente: number, data: Partial<Contato>): Promise<void> {
    await this.client.post(`web/clientes/${codigoCliente}/contatos`, { json: data }).json();
  }

  // === ANOTAÇÕES ===
  async getAnotacoes(codigoCliente: number): Promise<Anotacao[]> {
    const response = await this.client
      .post(`web/clientes/${codigoCliente}/anotacoes`)
      .json<{ result: Anotacao[] }>();
    return response.result;
  }

  async createAnotacao(
    codigoCliente: number,
    data: { data: string; tipo: string; conteudo: string }
  ): Promise<void> {
    await this.client.post(`web/clientes/${codigoCliente}/anotacoes`, { json: data }).json();
  }

  async updateAnotacao(
    codigoCliente: number,
    codigo: number,
    data: { data: string; tipo: string; conteudo: string }
  ): Promise<void> {
    await this.client
      .patch(`web/clientes/${codigoCliente}/anotacoes/${codigo}`, { json: data })
      .json();
  }

  // === KANBAN ===
  async getFunis(): Promise<Funil[]> {
    const response = await this.client.get('web/kanban/funis').json<{ result: Funil[] }>();
    return response.result;
  }

  async getSubFunis(codigoFunil: number): Promise<SubFunil[]> {
    const response = await this.client
      .get(`web/kanban/funis/${codigoFunil}/subfunis`)
      .json<{ result: SubFunil[] }>();
    return response.result;
  }

  // === ATIVIDADES ===
  async getAtividades(params?: {
    funil?: number;
    subfunil?: number;
    cliente?: number;
    situacao?: string;
    data_inicial?: string;
    data_final?: string;
  }): Promise<Atividade[]> {
    const response = await this.client
      .get('web/atividades', { searchParams: this.buildSearchParams(params) })
      .json<{ result: Atividade[] }>();
    return response.result;
  }

  async getAtividade(codigo: number): Promise<Atividade[]> {
    const response = await this.client
      .get(`web/atividades/${codigo}`)
      .json<{ result: Atividade[] }>();
    return response.result;
  }

  async createAtividade(
    codigoFunil: number,
    data: { codigo_cliente: number; codigo_moeda?: number; observacao?: string }
  ): Promise<{ codigo: number }> {
    const response = await this.client
      .post(`web/atividades/${codigoFunil}`, { json: data })
      .json<{ result?: { codigo: number }; codigo?: number }>();
    
    // A API pode retornar { result: { codigo: X } } ou { codigo: X }
    const codigo = response.result?.codigo || response.codigo;
    if (!codigo) {
      throw new Error('Falha ao criar atividade: código não retornado pela API');
    }
    return { codigo };
  }

  async avancarAtividade(codigo: number): Promise<void> {
    await this.client.put(`web/atividades/${codigo}/avancar`).json();
  }

  async retornarAtividade(codigo: number): Promise<void> {
    await this.client.put(`web/atividades/${codigo}/retornar`).json();
  }

  async cancelarAtividade(codigo: number, motivo: string): Promise<void> {
    await this.client.put(`web/atividades/${codigo}/cancelar`, { json: { motivo } }).json();
  }

  // === TAREFAS ===
  async getTarefas(
    codigoAtividade: number,
    params?: {
      responsavel?: string;
      tipo?: string;
      situacao?: string;
      data_inicial?: string;
      data_final?: string;
    }
  ): Promise<Tarefa[]> {
    const response = await this.client
      .post(`web/atividades/${codigoAtividade}/tarefas`, { json: params || {} })
      .json<{ result: Tarefa[] }>();
    return response.result;
  }

  async createTarefa(
    codigoAtividade: number,
    data: { tipo: string; observacao: string; codigo_responsavel: number; data_prazo: string }
  ): Promise<void> {
    await this.client.post(`web/atividades/${codigoAtividade}/tarefas`, { json: data }).json();
  }

  async finalizarTarefa(codigoAtividade: number, codigo: number): Promise<void> {
    await this.client.put(`web/atividades/${codigoAtividade}/tarefas/${codigo}/finalizar`).json();
  }

  // === ESTOQUE ===
  async getChapas(params?: {
    industrializacao?: string;
    lote?: string;
    blocotc?: string;
    empresa?: number;
    bloco?: number;
    material?: number;
    altesp?: number;
  }): Promise<Chapa[]> {
    const response = await this.client
      .get('web/estoque/chapas', {
        searchParams: this.buildSearchParams({
          ...params,
          empresa: params?.empresa ?? this.config.empresa,
        }),
      })
      .json<{ result: Chapa[] }>();
    return response.result;
  }

  async getCavaletes(params?: {
    industrializacao?: string;
    lote?: string;
    blocotc?: string;
    empresa?: number;
    bloco?: number;
    material?: number;
    altesp?: number;
    cavalete?: number;
    quantidade?: number;
  }): Promise<Cavalete[]> {
    const response = await this.client
      .get('web/estoque/cavaletes', {
        searchParams: this.buildSearchParams({
          ...params,
          empresa: params?.empresa ?? this.config.empresa,
        }),
      })
      .json<{ result: Cavalete[] }>();
    return response.result;
  }
}

// Singleton instance
let redsisClientInstance: RedsisClient | null = null;

function getRequiredEnvVar(key: keyof ImportMetaEnv): string {
  const value = import.meta.env[key];
  if (!value) {
    throw new Error(`Variável ${String(key)} ausente. Configure as credenciais do Redsis nas variáveis de ambiente ou use a tela Redsis Config.`);
  }
  return value;
}

export function getRedsisClient(): RedsisClient {
  if (!redsisClientInstance) {
    const config = {
      usuario: getRequiredEnvVar('VITE_REDSIS_USUARIO'),
      senha: getRequiredEnvVar('VITE_REDSIS_SENHA'),
      servidor: getRequiredEnvVar('VITE_REDSIS_SERVIDOR'),
      porta: getRequiredEnvVar('VITE_REDSIS_PORTA'),
      empresa: import.meta.env.VITE_REDSIS_EMPRESA
        ? Number(import.meta.env.VITE_REDSIS_EMPRESA)
        : undefined,
    };
    redsisClientInstance = new RedsisClient(config);
  }
  return redsisClientInstance;
}



