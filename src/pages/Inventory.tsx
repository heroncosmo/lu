/**
 * Inventory Management - Gerenciamento de Estoque via API Redsis
 * Features:
 * - Busca chapas e cavaletes do Redsis (via Edge Function)
 * - Exibe estoque disponível com fotos
 * - Permite filtrar e buscar produtos
 * - Envia promoções/novidades para clientes
 * - GPT gera mensagens personalizadas por produto (via Edge Function)
 * 
 * SECURITY: Todas as chamadas a APIs externas (Redsis, GPT) são feitas
 * através de Edge Functions para proteger credenciais.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import type { Chapa, Cavalete } from '@/integrations/redsis/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  Loader2, 
  Package, 
  Search, 
  Send, 
  Sparkles,
  ImageOff,
  CheckCircle2,
  Box
} from 'lucide-react';
import BackToHomeButton from '@/components/BackToHomeButton';

type InventoryItem = (Chapa | Cavalete) & {
  type: 'chapa' | 'cavalete';
  selected?: boolean;
};

interface ClientWithMessage {
  codigo: number;
  nome: string;
  whatsapp?: string;
  email?: string;
  selected: boolean;
  generatedMessage?: string;
}

export default function Inventory() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [chapas, setChapas] = useState<Chapa[]>([]);
  const [cavaletes, setCavaletes] = useState<Cavalete[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [clients, setClients] = useState<ClientWithMessage[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [generatingMessages, setGeneratingMessages] = useState(false);
  const [sendingMessages, setSendingMessages] = useState(false);

  useEffect(() => {
    checkAuthAndFetch();
  }, []);

  // Verificar autenticação antes de carregar dados
  const checkAuthAndFetch = async () => {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      toast({
        title: 'Não autorizado',
        description: 'Faça login para acessar o inventário',
        variant: 'destructive',
      });
      navigate('/login');
      return;
    }
    fetchInventory();
  };

  const fetchInventory = async () => {
    console.log('📦 Carregando estoque via Edge Function');
    try {
      setLoading(true);

      // Buscar estoque via Edge Function (protege credenciais Redsis)
      const [chapasResult, cavaletesResult] = await Promise.all([
        supabase.functions.invoke('inventory-api', { body: { action: 'getChapas' } }),
        supabase.functions.invoke('inventory-api', { body: { action: 'getCavaletes' } }),
      ]);

      if (chapasResult.error) throw new Error(chapasResult.error.message);
      if (cavaletesResult.error) throw new Error(cavaletesResult.error.message);

      const chapasData = chapasResult.data?.data || [];
      const cavaletesData = cavaletesResult.data?.data || [];

      setChapas(chapasData);
      setCavaletes(cavaletesData);

      toast({
        title: 'Estoque carregado',
        description: `${chapasData.length} chapas e ${cavaletesData.length} cavaletes encontrados`,
      });

    } catch (error) {
      console.error('Erro ao buscar estoque:', error);
      toast({
        title: 'Erro ao carregar estoque',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchClientsForBroadcast = async () => {
    try {
      setLoadingClients(true);

      // Buscar clientes via Edge Function (protege credenciais Redsis)
      const { data: userData } = await supabase.auth.getUser();
      const codigoVendedor = 1; // TODO: mapear user -> vendedor Redsis

      const result = await supabase.functions.invoke('inventory-api', {
        body: { action: 'getClientesByVendedor', codigoVendedor },
      });

      if (result.error) throw new Error(result.error.message);

      const clientesData = result.data?.data || [];

      const clientList: ClientWithMessage[] = clientesData.map((c: { codigo: number; nome: string; whatsapp?: string; celular?: string; email?: string }) => ({
        codigo: c.codigo,
        nome: c.nome,
        whatsapp: c.whatsapp || c.celular,
        email: c.email,
        selected: false,
      }));

      setClients(clientList);

      toast({
        title: `${clientList.length} clientes encontrados`,
        description: 'Selecione os clientes para enviar a novidade',
      });

    } catch (error) {
      console.error('Erro ao buscar clientes:', error);
      toast({
        title: 'Erro ao carregar clientes',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setLoadingClients(false);
    }
  };

  const selectItemForBroadcast = (item: InventoryItem) => {
    setSelectedItem(item);
    if (clients.length === 0) {
      fetchClientsForBroadcast();
    }
  };

  const generatePersonalizedMessages = async () => {
    if (!selectedItem) {
      toast({
        title: 'Nenhum produto selecionado',
        description: 'Selecione um produto do estoque primeiro',
        variant: 'destructive',
      });
      return;
    }

    const selectedClients = clients.filter(c => c.selected);
    if (selectedClients.length === 0) {
      toast({
        title: 'Nenhum cliente selecionado',
        description: 'Selecione ao menos um cliente',
        variant: 'destructive',
      });
      return;
    }

    try {
      setGeneratingMessages(true);

      // Informações do produto para enviar à Edge Function
      const productInfo = selectedItem.type === 'chapa' 
        ? {
            type: 'chapa',
            nome: (selectedItem as Chapa).material,
            lote: (selectedItem as Chapa).lote,
            estoque: (selectedItem as Chapa).estoque_m2,
            preco: (selectedItem as Chapa).preco_m2,
            pecas: (selectedItem as Chapa).pecas,
          }
        : {
            type: 'cavalete',
            nome: (selectedItem as Cavalete).material,
            bloco: (selectedItem as Cavalete).blocotc,
            estoque: (selectedItem as Cavalete).estoque_m2,
            preco: (selectedItem as Cavalete).preco_m2,
            pecas: (selectedItem as Cavalete).pecas,
          };

      // Chamar Edge Function que acessa GPT de forma segura
      const result = await supabase.functions.invoke('inventory-broadcast', {
        body: {
          clients: selectedClients.map(c => ({ codigo: c.codigo, nome: c.nome })),
          productInfo,
        },
      });

      if (result.error) throw new Error(result.error.message);

      const { results: gptResults } = result.data;

      // Atualizar mensagens geradas
      const updatedClients = [...clients];
      for (const gptResult of gptResults) {
        const clientIndex = updatedClients.findIndex(c => c.codigo === gptResult.codigo);
        if (clientIndex >= 0) {
          if (gptResult.success) {
            updatedClients[clientIndex].generatedMessage = gptResult.message;
          } else {
            updatedClients[clientIndex].generatedMessage = `Erro: ${gptResult.error}`;
          }
        }
      }

      setClients(updatedClients);

      const successCount = gptResults.filter((r: { success: boolean }) => r.success).length;
      toast({
        title: '✨ Mensagens geradas',
        description: `${successCount}/${selectedClients.length} mensagens personalizadas criadas`,
      });

    } catch (error) {
      console.error('Erro ao gerar mensagens:', error);
      toast({
        title: 'Erro ao gerar mensagens',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setGeneratingMessages(false);
    }
  };

  const sendBroadcast = async () => {
    const clientsToSend = clients.filter(c => c.selected && c.generatedMessage);

    if (clientsToSend.length === 0) {
      toast({
        title: 'Nenhuma mensagem pronta',
        description: 'Gere as mensagens personalizadas primeiro',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSendingMessages(true);
      let successCount = 0;
      let errorCount = 0;

      for (const client of clientsToSend) {
        try {
          if (client.whatsapp) {
            // Enviar via WhatsApp
            const { error } = await supabase.functions.invoke('send-whatsapp-message', {
              body: {
                client_name: client.nome,
                client_whatsapp_number: client.whatsapp,
                message_content: client.generatedMessage,
              },
            });

            if (error) throw error;
            successCount++;
          } else {
            console.warn(`Cliente ${client.nome} sem WhatsApp configurado`);
            errorCount++;
          }
        } catch (error) {
          console.error(`Erro ao enviar para ${client.nome}:`, error);
          errorCount++;
        }
      }

      toast({
        title: `Envio concluído`,
        description: `✅ ${successCount} enviadas | ❌ ${errorCount} falhas`,
      });

      // Limpar seleção
      setClients(prev => prev.map(c => ({ ...c, selected: false, generatedMessage: undefined })));

    } catch (error) {
      console.error('Erro ao enviar mensagens:', error);
      toast({
        title: 'Erro ao enviar mensagens',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setSendingMessages(false);
    }
  };

  const filteredChapas = chapas.filter(chapa =>
    chapa.material.toLowerCase().includes(searchTerm.toLowerCase()) ||
    chapa.lote.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredCavaletes = cavaletes.filter(cav =>
    cav.material.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cav.blocotc.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedClientCount = clients.filter(c => c.selected).length;

  if (loading) {
    return (
      <div className="container mx-auto p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando estoque da API Redsis...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Package className="w-8 h-8" />
            Inventário
          </h1>
          <p className="text-muted-foreground mt-1">
            Estoque em tempo real da API Redsis
          </p>
        </div>
        <BackToHomeButton />
      </div>

      {/* Busca e Estatísticas */}
      <div className="mb-6 flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="Buscar por material, lote ou bloco..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Badge variant="secondary" className="text-sm">
          {chapas.length + cavaletes.length} itens em estoque
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna 1 e 2: Lista de Produtos */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="chapas">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="chapas">
                Chapas ({filteredChapas.length})
              </TabsTrigger>
              <TabsTrigger value="cavaletes">
                Cavaletes ({filteredCavaletes.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="chapas" className="space-y-4 mt-4">
              {filteredChapas.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <Box className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground">Nenhuma chapa encontrada</p>
                  </CardContent>
                </Card>
              ) : (
                filteredChapas.map(chapa => (
                  <Card 
                    key={chapa.codigo}
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      selectedItem?.codigo === chapa.codigo && selectedItem?.type === 'chapa'
                        ? 'ring-2 ring-primary'
                        : ''
                    }`}
                    onClick={() => selectItemForBroadcast({ ...chapa, type: 'chapa' })}
                  >
                    <CardContent className="p-4">
                      <div className="flex gap-4">
                        <div className="w-24 h-24 bg-gray-100 rounded-lg flex items-center justify-center">
                          {chapa.foto ? (
                            <img
                              src={`https://seu-servidor.com/fotos/chapas/${chapa.codigo}.jpg`}
                              alt={chapa.material}
                              className="w-full h-full object-cover rounded-lg"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                e.currentTarget.nextElementSibling?.classList.remove('hidden');
                              }}
                            />
                          ) : null}
                          <ImageOff className="w-8 h-8 text-muted-foreground" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className="font-bold text-lg">{chapa.material}</h3>
                              <p className="text-sm text-muted-foreground">
                                Lote: {chapa.lote} | Chapa: {chapa.chapa}
                              </p>
                            </div>
                            {selectedItem?.codigo === chapa.codigo && selectedItem?.type === 'chapa' && (
                              <CheckCircle2 className="w-5 h-5 text-primary" />
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
                            <div>
                              <p className="text-muted-foreground">Estoque</p>
                              <p className="font-semibold">{chapa.estoque_m2} m²</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Peças</p>
                              <p className="font-semibold">{chapa.pecas}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Preço/m²</p>
                              <p className="font-semibold text-green-600">R$ {chapa.preco_m2}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Situação</p>
                              <Badge variant={chapa.situacao === 'D' ? 'default' : 'secondary'}>
                                {chapa.situacao === 'D' ? 'Disponível' : chapa.situacao}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="cavaletes" className="space-y-4 mt-4">
              {filteredCavaletes.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <Box className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground">Nenhum cavalete encontrado</p>
                  </CardContent>
                </Card>
              ) : (
                filteredCavaletes.map(cavalete => (
                  <Card 
                    key={cavalete.codigo}
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      selectedItem?.codigo === cavalete.codigo && selectedItem?.type === 'cavalete'
                        ? 'ring-2 ring-primary'
                        : ''
                    }`}
                    onClick={() => selectItemForBroadcast({ ...cavalete, type: 'cavalete' })}
                  >
                    <CardContent className="p-4">
                      <div className="flex gap-4">
                        <div className="w-24 h-24 bg-gray-100 rounded-lg flex items-center justify-center">
                          <ImageOff className="w-8 h-8 text-muted-foreground" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className="font-bold text-lg">{cavalete.material}</h3>
                              <p className="text-sm text-muted-foreground">
                                Bloco: {cavalete.blocotc} | Esp: {cavalete.espessura}mm
                              </p>
                            </div>
                            {selectedItem?.codigo === cavalete.codigo && selectedItem?.type === 'cavalete' && (
                              <CheckCircle2 className="w-5 h-5 text-primary" />
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
                            <div>
                              <p className="text-muted-foreground">Estoque</p>
                              <p className="font-semibold">{cavalete.estoque_m2} m²</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Peças</p>
                              <p className="font-semibold">{cavalete.pecas}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Preço/m²</p>
                              <p className="font-semibold text-green-600">R$ {cavalete.preco_m2}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Situação</p>
                              <Badge variant={cavalete.situacao === 'D' ? 'default' : 'secondary'}>
                                {cavalete.situacao === 'D' ? 'Disponível' : cavalete.situacao}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Coluna 3: Painel de Broadcast */}
        <div>
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle>📣 Enviar Promoção</CardTitle>
              <CardDescription>
                {selectedItem 
                  ? `Produto selecionado: ${selectedItem.type === 'chapa' ? (selectedItem as Chapa).material : (selectedItem as Cavalete).material}`
                  : 'Selecione um produto ao lado'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!selectedItem ? (
                <div className="text-center p-6 text-muted-foreground">
                  <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">
                    Clique em um produto para começar
                  </p>
                </div>
              ) : (
                <>
                  {clients.length === 0 && !loadingClients && (
                    <Button
                      onClick={fetchClientsForBroadcast}
                      className="w-full"
                      variant="outline"
                    >
                      Carregar Clientes
                    </Button>
                  )}

                  {loadingClients && (
                    <div className="text-center p-4">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Carregando clientes...</p>
                    </div>
                  )}

                  {clients.length > 0 && (
                    <>
                      <div>
                        <p className="text-sm font-medium mb-2">
                          Clientes ({selectedClientCount} selecionados)
                        </p>
                        <div className="max-h-[300px] overflow-y-auto space-y-2">
                          {clients.map(client => (
                            <label
                              key={client.codigo}
                              className="flex items-start gap-2 p-2 rounded hover:bg-muted cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={client.selected}
                                onChange={(e) => {
                                  setClients(prev =>
                                    prev.map(c =>
                                      c.codigo === client.codigo
                                        ? { ...c, selected: e.target.checked }
                                        : c
                                    )
                                  );
                                }}
                                className="mt-1"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{client.nome}</p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {client.whatsapp || 'Sem WhatsApp'}
                                </p>
                                {client.generatedMessage && (
                                  <p className="text-xs mt-1 p-1 bg-blue-50 rounded border">
                                    {client.generatedMessage}
                                  </p>
                                )}
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Button
                          onClick={generatePersonalizedMessages}
                          disabled={generatingMessages || selectedClientCount === 0}
                          className="w-full"
                          variant="outline"
                        >
                          {generatingMessages ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Gerando...
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4 mr-2" />
                              Gerar Mensagens GPT
                            </>
                          )}
                        </Button>

                        <Button
                          onClick={sendBroadcast}
                          disabled={sendingMessages || selectedClientCount === 0}
                          className="w-full"
                        >
                          {sendingMessages ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Enviando...
                            </>
                          ) : (
                            <>
                              <Send className="w-4 h-4 mr-2" />
                              Enviar ({selectedClientCount})
                            </>
                          )}
                        </Button>
                      </div>
                    </>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}





