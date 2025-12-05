// Redsis API Types
export interface RedsisAuthPayload {
  usuario: string;
  senha: string;
  app: 'web';
  servidor: string;
  porta: string;
}

export interface RedsisAuthResponse {
  token: string;
}

export interface Cliente {
  codigo: number;
  nome: string;
  fantasia?: string;
  cnpjcpf?: string;
  telefone?: string;
  celular?: string;
  email?: string;
  whatsapp?: string;
  tags?: string;
  codigo_vendedor?: number;
  vendedor?: string;
  situacao?: string;
  data_cadastro?: string;
  segmento?: string;
  observacoes?: string;
}

export interface Contato {
  codigo: number;
  cnpjcpf?: string;
  nome: string;
  telefone?: string;
  email?: string;
  cargo?: string;
}

export interface Anotacao {
  codigo: number;
  codigo_cliente: number;
  data: string;
  tipo: string;
  conteudo: string;
  usuario: string;
  descricao?: string;
}

export interface Funil {
  codigo: number;
  descricao: string;
  sigla: string;
  nome?: string;
}

export interface SubFunil {
  codigo: number;
  descricao: string;
  order: number;
  cor: string;
}

export interface Atividade {
  codigo: number;
  codigo_funil: number;
  codigo_subfunil: number;
  codigo_cliente: number;
  cliente: string;
  situacao_cliente: string;
  codigo_vendedor: number;
  vendedor: string;
  situacao: string;
  data_criacao: string;
  data_prazo?: string;
  observacao?: string;
  cobranca?: string;
  parcelamento?: string;
  moeda?: string;
  total?: number;
  funil?: string;
  sub_funil?: string;
  nome?: string;
  cliente_nome?: string;
}

export interface Tarefa {
  codigo: number;
  tipo: string;
  observacao: string;
  situacao: string;
  codigo_usuario: number;
  usuario: string;
  codigo_responsavel: number;
  responsavel: string;
  data_criacao: string;
  data_prazo?: string;
  data_finalizacao?: string;
}

export interface Chapa {
  codigo: number;
  situacao: string;
  lote: string;
  bloco: number;
  chapa: number;
  codigo_material: number;
  material: string;
  industrializacao: string;
  pecas: number;
  estoque_m2: number;
  estoque_sqft: number;
  preco_m2: number;
  preco_sqft: number;
  foto: boolean;
  descricao?: string;
  preco?: number;
  disponivel?: boolean;
  imagem_url?: string;
}

export interface Cavalete {
  codigo: number;
  pecas: number;
  estoque_m2: number;
  estoque_sqft: number;
  peso_bruto: number;
  peso_liquido: number;
  industrializacao: string;
  espessura: number;
  codigo_material: number;
  material: string;
  bloco: number;
  blocotc: string;
  preco_m2: number;
  preco_sqft: number;
  situacao: string;
  descricao?: string;
  preco?: number;
  disponivel?: boolean;
  imagem_url?: string;
}
