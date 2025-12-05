import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getRedsisClient } from '@/integrations/redsis/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Search,
  RefreshCw,
  UserPlus,
  Mail,
  Phone,
  Building2,
  User,
  Users,
  Loader2,
  MapPin,
  Tag,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ClienteRedsis {
  codigo: number;
  nome: string;
  fantasia?: string;
  cnpjcpf?: string;
  situacao?: string;
  vendedor?: string;
  telefone?: string;
  celular?: string;
  email?: string;
}

interface RedsisResponse {
  result: ClienteRedsis[];
}

interface RedsisAnotacao {
  codigo: number;
  codigo_cliente: number;
  data: string;
  tipo: string;
  conteudo: string;
  usuario: string;
  descricao?: string;
}

export default function CRMContacts() {
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<any | null>(null);
  const [redsisDetails, setRedsisDetails] = useState<ClienteRedsis | null>(null);
  const [redsisLoading, setRedsisLoading] = useState(false);
  const [redsisError, setRedsisError] = useState<string | null>(null);
  const [anotacoes, setAnotacoes] = useState<RedsisAnotacao[]>([]);
  const [anotacoesLoading, setAnotacoesLoading] = useState(false);
  const [anotacoesError, setAnotacoesError] = useState<string | null>(null);
  const { toast } = useToast();

  async function loadContacts(search = '', forceSync = false) {
    try {
      setLoading(true);
      
      // Se forceSync = true, sincronizar com Redsis primeiro
      if (forceSync) {
        toast({
          title: 'Sincronizando...',
          description: 'Buscando dados da API Redsis',
        });

        try {
          console.log('🔄 Iniciando sincronização com Redsis...');
          const redsisClient = getRedsisClient();
          console.log('✅ Cliente Redsis criado');
          
          // Buscar atividades do Kanban (todas situações para pegar mais clientes)
          const situacoes = ['A_TRABALHAR', 'NEGOCIACAO', 'COTACAO', 'AGUARDANDO'];
          let todasAtividades: any[] = [];
          
          for (const situacao of situacoes) {
            try {
              const atividades = await redsisClient.getAtividades({ situacao });
              if (Array.isArray(atividades)) {
                todasAtividades = todasAtividades.concat(atividades);
              }
            } catch (err) {
              console.warn(`⚠️ Erro ao buscar situação ${situacao}:`, err);
            }
          }
          
          console.log('📦 Total de atividades recebidas:', todasAtividades.length);
          
          if (todasAtividades.length === 0) {
            toast({
              title: 'Aviso',
              description: 'Nenhuma atividade encontrada no Kanban',
            });
            return;
          }
          
          // Extrair códigos únicos de clientes
          const codigosUnicos = new Set<number>();
          for (const atividade of todasAtividades) {
            if (atividade.codigo_cliente) {
              codigosUnicos.add(atividade.codigo_cliente);
            }
          }
          
          console.log(`🔍 ${codigosUnicos.size} clientes únicos encontrados`);
          console.log(`📥 Buscando dados completos de cada cliente...`);
          
          let savedCount = 0;
          let processedCount = 0;
          
          for (const codigoCliente of codigosUnicos) {
            try {
              processedCount++;
              if (processedCount % 10 === 0) {
                console.log(`⏳ Processando ${processedCount}/${codigosUnicos.size}...`);
              }
              
              // Buscar dados completos do cliente
              const response = await redsisClient.getCliente(codigoCliente) as unknown as RedsisResponse;
              
              // A API Redsis retorna { result: [cliente] }
              // Precisamos pegar o primeiro elemento do array
              if (!response.result || !Array.isArray(response.result) || response.result.length === 0) {
                console.warn(`⚠️ Cliente ${codigoCliente} não retornou dados válidos`);
                continue;
              }
              
              const clienteCompleto = response.result[0];
              
              // Validar campos obrigatórios
              if (!clienteCompleto.codigo || !clienteCompleto.nome) {
                console.warn(`⚠️ Cliente ${codigoCliente} sem codigo ou nome, pulando...`);
                continue;
              }
              
              const contactData = {
                crm_client_code: clienteCompleto.codigo,
                name: clienteCompleto.nome || `Cliente ${clienteCompleto.codigo}`,
                trade_name: clienteCompleto.fantasia || null,
                document: clienteCompleto.cnpjcpf || null,
                is_active: clienteCompleto.situacao === 'Ativo',
                owner_name: clienteCompleto.vendedor || null,
                phone: clienteCompleto.telefone || null,
                whatsapp: clienteCompleto.celular || null,
                email: clienteCompleto.email || null,
                synced_at: new Date().toISOString(),
              };
              
              const { error } = await supabase.from('crm_contacts').upsert(contactData, {
                onConflict: 'crm_client_code'
              });
              
              if (error) {
                console.error(`❌ Erro ao salvar cliente ${codigoCliente}:`, error);
                console.log('Dados que causaram erro:', contactData);
              } else {
                savedCount++;
              }
            } catch (err) {
              console.warn(`⚠️ Erro ao processar cliente ${codigoCliente}:`, err);
            }
          }
          
          console.log(`✅ ${savedCount}/${codigosUnicos.size} clientes salvos!`);
          toast({
            title: 'Sincronização concluída',
            description: `${savedCount} clientes sincronizados com dados completos`,
          });
        } catch (syncError: any) {
          console.error('❌ Erro na sincronização:', syncError);
          toast({
            title: 'Erro na sincronização',
            description: syncError.message || 'Não foi possível sincronizar com Redsis',
            variant: 'destructive',
          });
        }
      }

      // Buscar da tabela crm_contacts no Supabase (sincronizada com Redsis)
      let query = supabase
        .from('crm_contacts')
        .select('*')
        .order('name', { ascending: true });

      // Aplicar filtro de busca se fornecido
      if (search.trim()) {
        query = query.or(`name.ilike.%${search}%,trade_name.ilike.%${search}%,document.ilike.%${search}%,whatsapp.ilike.%${search}%,email.ilike.%${search}%`);
      }

      // Limitar a 500 registros
      query = query.limit(500);

      const { data, error } = await query;

      if (error) throw error;

      setContacts(data || []);
      
      if (forceSync) {
        toast({
          title: 'Sincronização concluída',
          description: `${data?.length || 0} contatos carregados`,
        });
      }
    } catch (error: any) {
      console.error('Erro ao carregar contatos:', error);
      setContacts([]);
      toast({
        title: 'Erro ao carregar contatos',
        description: error.message || 'Não foi possível buscar os contatos',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadContacts();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadContacts(searchTerm);
  };

  const handleViewDetails = (contact: any) => {
    setSelectedContact(contact);
    setDetailsOpen(true);
    setRedsisDetails(null);
    setRedsisError(null);
    setAnotacoes([]);
    setAnotacoesError(null);
    fetchRedsisDetails(contact);
    fetchAnotacoes(contact);
  };

  const fetchRedsisDetails = async (contact: any) => {
    if (!contact?.crm_client_code) {
      setRedsisError('Contato sem código CRM vinculado.');
      return;
    }
    try {
      setRedsisLoading(true);
      const response = await supabase.functions.invoke('inventory-api', {
        body: { action: 'getCliente', codigo: contact.crm_client_code },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const raw = response.data?.data;
      const parsed = Array.isArray(raw?.result) ? raw.result[0] : Array.isArray(raw) ? raw[0] : raw;

      if (!parsed) {
        setRedsisError('Cliente não encontrado na API Redsis.');
        return;
      }

      setRedsisDetails(parsed as ClienteRedsis);
    } catch (error) {
      console.error('Erro ao carregar detalhes Redsis:', error);
      setRedsisError(error instanceof Error ? error.message : 'Erro desconhecido ao buscar dados no Redsis');
    } finally {
      setRedsisLoading(false);
    }
  };

  const fetchAnotacoes = async (contact: any) => {
    if (!contact?.crm_client_code) {
      setAnotacoesError('Contato sem código CRM vinculado para buscar anotações.');
      return;
    }
    try {
      setAnotacoesLoading(true);
      setAnotacoesError(null);
      const response = await supabase.functions.invoke('inventory-api', {
        body: { action: 'getAnotacoes', codigoCliente: contact.crm_client_code },
      });

      // Se a API retornou erro mas com dados, tentar usar os dados
      if (response.data?.success === false) {
        // Verificar se o erro é de endpoint não encontrado (404)
        const errorMsg = response.data?.error || '';
        if (errorMsg.includes('404') || errorMsg.includes('Not Found')) {
          setAnotacoes([]);
          setAnotacoesError('Funcionalidade de anotações não disponível na API Redsis.');
        } else {
          setAnotacoes([]);
          setAnotacoesError('Este cliente não possui anotações registradas.');
        }
        return;
      }

      if (response.error) {
        throw new Error(response.error.message);
      }

      const data = response.data?.data || [];
      setAnotacoes(Array.isArray(data) ? data : []);
      if (Array.isArray(data) && data.length === 0) {
        setAnotacoesError('Nenhuma anotação encontrada para este cliente.');
      }
    } catch (error) {
      console.error('Erro ao carregar anotações:', error);
      // Tratar erros de forma mais amigável
      const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
      if (errorMsg.includes('500') || errorMsg.includes('non-2xx')) {
        setAnotacoesError('Este cliente não possui anotações ou a funcionalidade não está disponível.');
      } else {
        setAnotacoesError(errorMsg);
      }
      setAnotacoes([]);
    } finally {
      setAnotacoesLoading(false);
    }
  };

  // Função helper para obter ícone do tipo de anotação
  const getAnotacaoIcon = (tipo: string) => {
    const tipoLower = tipo?.toLowerCase() || '';
    if (tipoLower.includes('ligacao') || tipoLower.includes('ligação')) return '📞';
    if (tipoLower.includes('email') || tipoLower.includes('e-mail')) return '✉️';
    if (tipoLower.includes('visita')) return '🏠';
    if (tipoLower.includes('reuniao') || tipoLower.includes('reunião')) return '👥';
    if (tipoLower.includes('nota')) return '📝';
    return '📋';
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Contatos CRM
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Gerencie seus contatos sincronizados com o Redsis CRM
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total de Contatos</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {contacts.length}
                </p>
              </div>
              <Users className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Ativos</p>
                <p className="text-2xl font-bold text-green-600">
                  {contacts.filter((c) => c.is_active).length}
                </p>
              </div>
              <Building2 className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Com WhatsApp</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {contacts.filter((c) => c.whatsapp).length}
                </p>
              </div>
              <Phone className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Com Email</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {contacts.filter((c) => c.email).length}
                </p>
              </div>
              <Mail className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Actions */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <CardTitle>Lista de Contatos</CardTitle>
              <CardDescription>
                Busque e filtre seus contatos do CRM
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => loadContacts(searchTerm, true)}
                disabled={loading}
                variant="outline"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
              <Button>
                <UserPlus className="h-4 w-4 mr-2" />
                Novo Contato
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="flex gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar por nome, documento, telefone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button type="submit" disabled={loading}>
              Buscar
            </Button>
          </form>

          {/* Table */}
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Nome Fantasia</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <RefreshCw className="h-6 w-6 animate-spin mx-auto text-gray-400" />
                      <p className="text-sm text-gray-500 mt-2">Carregando contatos...</p>
                    </TableCell>
                  </TableRow>
                ) : contacts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <User className="h-12 w-12 mx-auto text-gray-300 mb-2" />
                      <p className="text-gray-500">Nenhum contato encontrado</p>
                      <p className="text-sm text-gray-400">
                        Tente ajustar os filtros de busca
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  contacts.map((contact) => (
                    <TableRow key={contact.crm_client_code || contact.id}>
                      <TableCell className="font-medium">
                        #{contact.crm_client_code}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{contact.name}</span>
                          {contact.document && (
                            <span className="text-xs text-gray-500">
                              {contact.document}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{contact.trade_name || '-'}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 text-sm">
                          {contact.phone && (
                            <div className="flex items-center gap-1 text-gray-600">
                              <Phone className="h-3 w-3" />
                              {contact.phone}
                            </div>
                          )}
                          {contact.whatsapp && (
                            <div className="flex items-center gap-1 text-green-600">
                              <Phone className="h-3 w-3" />
                              {contact.whatsapp}
                            </div>
                          )}
                          {contact.email && (
                            <div className="flex items-center gap-1 text-blue-600">
                              <Mail className="h-3 w-3" />
                              {contact.email}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {contact.owner_name && (
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3 text-gray-400" />
                            <span className="text-sm">{contact.owner_name}</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            contact.is_active ? 'default' : 'secondary'
                          }
                        >
                          {contact.is_active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => handleViewDetails(contact)}>
                          Ver Detalhes
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              {selectedContact?.name || 'Contato' }
              {selectedContact?.crm_client_code && (
                <Badge variant="secondary">#{selectedContact.crm_client_code}</Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              Visualize os dados sincronizados e compare com o que está salvo na API Redsis.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <section>
              <h3 className="text-sm font-semibold text-gray-500 mb-3">Dados armazenados (Supabase)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Contato</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-gray-700">
                      <Tag className="h-4 w-4 text-gray-400" />
                      {selectedContact?.document || 'Documento não informado'}
                    </div>
                    <div className="flex items-center gap-2 text-gray-700">
                      <Phone className="h-4 w-4 text-gray-400" />
                      {selectedContact?.phone || selectedContact?.whatsapp || 'Sem telefone' }
                    </div>
                    <div className="flex items-center gap-2 text-gray-700">
                      <Mail className="h-4 w-4 text-gray-400" />
                      {selectedContact?.email || 'Sem email' }
                    </div>
                    <div className="flex items-center gap-2 text-gray-700">
                      <MapPin className="h-4 w-4 text-gray-400" />
                      {selectedContact?.city ? `${selectedContact.city}${selectedContact?.state ? ` / ${selectedContact.state}` : ''}` : 'Cidade não informada'}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Kanban & Vendedor</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-gray-700">
                      <Badge variant="outline">{selectedContact?.kanban_status || 'Sem status'}</Badge>
                      {selectedContact?.kanban_stage_name && (
                        <span className="text-gray-500">• {selectedContact.kanban_stage_name}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-gray-700">
                      <User className="h-4 w-4 text-gray-400" />
                      {selectedContact?.owner_name || 'Sem vendedor atribuído'}
                    </div>
                    <div className="text-xs text-gray-500">
                      Sincronizado em {selectedContact?.synced_at ? new Date(selectedContact.synced_at).toLocaleString('pt-BR') : '—'}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </section>

            <Separator />

            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-500">Dados em tempo real (Redsis)</h3>
                {redsisLoading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
              </div>
              {redsisError && (
                <Card className="border-destructive/40 bg-destructive/5">
                  <CardContent className="py-4 text-sm text-destructive">
                    {redsisError}
                  </CardContent>
                </Card>
              )}
              {!redsisError && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Identificação</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div><strong>Razão Social:</strong> {redsisDetails?.nome || '—'}</div>
                      <div><strong>Fantasia:</strong> {redsisDetails?.fantasia || '—'}</div>
                      <div><strong>Documento:</strong> {redsisDetails?.cnpjcpf || '—'}</div>
                      <div><strong>Situação:</strong> {redsisDetails?.situacao || '—'}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Contato</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div><strong>Telefone:</strong> {redsisDetails?.telefone || '—'}</div>
                      <div><strong>WhatsApp:</strong> {redsisDetails?.celular || '—'}</div>
                      <div><strong>Email:</strong> {redsisDetails?.email || '—'}</div>
                      <div><strong>Vendedor:</strong> {redsisDetails?.vendedor || '—'}</div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </section>

            <Separator />

            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-500">Anotações do Cliente (Histórico de Atividades)</h3>
                {anotacoesLoading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
              </div>
              {anotacoesError && !anotacoesLoading && (
                <Card className="border-muted bg-muted/30">
                  <CardContent className="py-4 text-sm text-muted-foreground flex items-center gap-2">
                    <span className="text-lg">📋</span>
                    {anotacoesError}
                  </CardContent>
                </Card>
              )}
              {!anotacoesError && (
                <ScrollArea className="max-h-72">
                  <div className="space-y-3 pr-2">
                    {anotacoes.length === 0 && !anotacoesLoading ? (
                      <p className="text-sm text-muted-foreground">Nenhuma anotação encontrada para este cliente.</p>
                    ) : (
                      anotacoes.map((anotacao) => (
                        <Card key={anotacao.codigo} className="border-muted">
                          <CardContent className="py-4">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-500 mb-1">
                                  <span>{getAnotacaoIcon(anotacao.tipo)}</span>
                                  <span>{anotacao.tipo || 'Nota'}</span>
                                  <span className="text-gray-400">•</span>
                                  <span>{anotacao.usuario || 'Sistema'}</span>
                                </div>
                                <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap">
                                  {anotacao.conteudo || anotacao.descricao || 'Sem conteúdo'}
                                </p>
                              </div>
                              <div className="text-xs text-gray-500 ml-4 whitespace-nowrap">
                                {anotacao.data ? new Date(anotacao.data).toLocaleDateString('pt-BR', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                }) : '—'}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                </ScrollArea>
              )}
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
