/**
 * Inventory Broadcast - Envio de atualizações de estoque para clientes
 * Features:
 * - Seleção de clientes CRM
 * - Input de produto/preço/novidade
 * - GPT gera mensagens personalizadas por perfil
 * - Envio via WhatsApp ou Email
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

import { RedsisClient } from '@/integrations/redsis/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Send, Sparkles, MessageSquare, Mail } from 'lucide-react';
import BackToHomeButton from '@/components/BackToHomeButton';

interface ClientSelection {
  codigo: number;
  nome: string;
  whatsapp?: string;
  email?: string;
  profile?: any;
  selected: boolean;
  generatedMessage?: string;
}

export default function InventoryBroadcast() {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [clients, setClients] = useState<ClientSelection[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [productName, setProductName] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [priceInfo, setPriceInfo] = useState('');
  const [channel, setChannel] = useState<'whatsapp' | 'email'>('whatsapp');
  const [generatingMessages, setGeneratingMessages] = useState(false);
  const [sendingMessages, setSendingMessages] = useState(false);

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      setLoadingClients(true);
      
      // Buscar clientes ativos do Redsis
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/login');
        return;
      }

      // Buscar configuração Redsis
      const { data: redsisConfig, error: configError } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'redsis_config')
        .single();

      if (configError || !redsisConfig?.value) {
        toast({
          title: 'Redsis não configurado',
          description: 'Vá em Configurações > Redsis API para configurar as credenciais.',
          variant: 'destructive',
          action: (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => navigate('/redsis-config')}
            >
              Configurar
            </Button>
          ),
        });
        setClients([]);
        return;
      }

      const config = redsisConfig.value as any;
      const redsisClient = new RedsisClient({
        ...config,
        empresa: config?.empresa ? Number(config.empresa) : undefined,
      });

      // Buscar clientes ativos com atividades recentes
      // Fetch clients from Redsis API - using activities endpoint
      const atividades = await redsisClient.getAtividades({});

      // Enriquecer com perfis do Supabase (se existirem)
      const { data: profiles } = await supabase
        .from('client_profiles')
        .select('crm_client_code, profile_data');

      const profileMap = new Map(
        profiles?.map(p => [p.crm_client_code, p.profile_data]) || []
      );

      const clientList: ClientSelection[] = atividades
        .filter((atv: any) => atv.nome_cliente) // Só clientes com nome
        .map((atv: any) => ({
          codigo: atv.codigo_cliente,
          nome: atv.nome_cliente,
          whatsapp: undefined,
          email: undefined,
          profile: profileMap.get(atv.codigo_cliente),
          selected: false,
        }));

      setClients(clientList);
      toast({
        title: `${clientList.length} clientes encontrados`,
        description: 'Selecione os clientes para enviar a atualização',
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

  const toggleClientSelection = (codigo: number) => {
    setClients(prev =>
      prev.map(c =>
        c.codigo === codigo ? { ...c, selected: !c.selected } : c
      )
    );
  };

  const selectAll = () => {
    setClients(prev => prev.map(c => ({ ...c, selected: true })));
  };

  const deselectAll = () => {
    setClients(prev => prev.map(c => ({ ...c, selected: false })));
  };

  const generatePersonalizedMessages = async () => {
    if (!productName || !productDescription) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Preencha nome e descrição do produto',
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

      // Buscar agent GPT API key
      const { data: agent } = await supabase
        .from('agent_personas')
        .select('gpt_api_key, instructions')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!agent?.gpt_api_key) {
        throw new Error('Agent GPT não configurado');
      }

      // Gerar mensagem personalizada para cada cliente via GPT
      const updatedClients = [...clients];

      for (const client of selectedClients) {
        const clientIndex = updatedClients.findIndex(c => c.codigo === client.codigo);

        const systemPrompt = `Você é um especialista em vendas de materiais de construção e mármore/granito.

CONTEXTO DO CLIENTE:
- Nome: ${client.nome}
- Perfil: ${client.profile ? JSON.stringify(client.profile) : 'Cliente regular'}

PRODUTO:
- Nome: ${productName}
- Descrição: ${productDescription}
- Preço: ${priceInfo || 'Consultar'}

TAREFA:
Crie uma mensagem personalizada para este cliente específico anunciando o produto.

REGRAS:
1. Use o nome do cliente ${client.nome}
2. Seja amigável e profissional
3. Destaque benefícios relevantes ao perfil do cliente
4. Inclua call-to-action claro
5. ESCREVA EM UM ÚNICO PARÁGRAFO (sem quebras de linha)
6. Máximo 3-4 frases
7. Use emoji moderadamente (1-2 no máximo)

Exemplo de formato:
Oi ${client.nome}! Acabamos de receber ${productName} com ${productDescription}. Pelo seu perfil, achei que você ia adorar conhecer. Quer agendar uma visita para ver pessoalmente? 😊`;

        try {
          const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${agent.gpt_api_key}`,
            },
            body: JSON.stringify({
              model: 'gpt-4',
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Gere a mensagem personalizada para ${client.nome}` },
              ],
              max_tokens: 200,
              temperature: 0.7,
            }),
          });

          if (!gptResponse.ok) {
            throw new Error(`GPT error: ${gptResponse.status}`);
          }

          const gptData = await gptResponse.json();
          let message = gptData.choices[0].message.content.trim();

          // Remover aspas se GPT retornar com elas
          if (message.startsWith('"') && message.endsWith('"')) {
            message = message.slice(1, -1);
          }

          // Garantir um único parágrafo
          message = message.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();

          updatedClients[clientIndex].generatedMessage = message;

        } catch (error) {
          console.error(`Erro ao gerar mensagem para ${client.nome}:`, error);
          updatedClients[clientIndex].generatedMessage = `Erro: ${error instanceof Error ? error.message : 'Desconhecido'}`;
        }
      }

      setClients(updatedClients);

      toast({
        title: '✨ Mensagens geradas',
        description: `${selectedClients.length} mensagens personalizadas criadas`,
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

  const sendMessages = async () => {
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
          if (channel === 'whatsapp' && client.whatsapp) {
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

          } else if (channel === 'email' && client.email) {
            // Enviar via Email
            const { error } = await supabase.functions.invoke('send-email', {
              body: {
                to_email: client.email,
                to_name: client.nome,
                subject: `Novidade: ${productName}`,
                message_content: client.generatedMessage,
                trigger_reason: 'inventory_broadcast',
              },
            });

            if (error) throw error;
            successCount++;

          } else {
            console.warn(`Cliente ${client.nome} sem ${channel} configurado`);
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
      deselectAll();

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

  const selectedCount = clients.filter(c => c.selected).length;

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">📦 Broadcast de Estoque</h1>
        <BackToHomeButton />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Formulário do Produto */}
        <Card>
          <CardHeader>
            <CardTitle>Informações do Produto</CardTitle>
            <CardDescription>
              Digite as informações do produto para gerar mensagens personalizadas
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="productName">Nome do Produto *</Label>
              <Input
                id="productName"
                placeholder="Ex: Granito Patagônia"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="productDescription">Descrição *</Label>
              <Textarea
                id="productDescription"
                placeholder="Ex: Nova remessa de granito importado com veios dourados"
                rows={3}
                value={productDescription}
                onChange={(e) => setProductDescription(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="priceInfo">Preço/Promoção</Label>
              <Input
                id="priceInfo"
                placeholder="Ex: 20% OFF | R$ 350/m² | Consultar"
                value={priceInfo}
                onChange={(e) => setPriceInfo(e.target.value)}
              />
            </div>

            <div>
              <Label>Canal de Envio</Label>
              <div className="flex gap-4 mt-2">
                <Button
                  variant={channel === 'whatsapp' ? 'default' : 'outline'}
                  onClick={() => setChannel('whatsapp')}
                >
                  <MessageSquare className="w-4 h-4 mr-2" />
                  WhatsApp
                </Button>
                <Button
                  variant={channel === 'email' ? 'default' : 'outline'}
                  onClick={() => setChannel('email')}
                >
                  <Mail className="w-4 h-4 mr-2" />
                  Email
                </Button>
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                onClick={generatePersonalizedMessages}
                disabled={generatingMessages || !productName || !productDescription}
                className="flex-1"
              >
                {generatingMessages ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Gerando...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Gerar Mensagens (GPT)
                  </>
                )}
              </Button>

              <Button
                onClick={sendMessages}
                disabled={sendingMessages || selectedCount === 0}
                variant="default"
                className="flex-1"
              >
                {sendingMessages ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Enviar ({selectedCount})
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Lista de Clientes */}
        <Card>
          <CardHeader>
            <CardTitle>Clientes ({clients.length})</CardTitle>
            <CardDescription>
              Selecione os clientes para enviar a atualização
            </CardDescription>
            <div className="flex gap-2 mt-2">
              <Button variant="outline" size="sm" onClick={selectAll}>
                Selecionar Todos
              </Button>
              <Button variant="outline" size="sm" onClick={deselectAll}>
                Limpar Seleção
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loadingClients ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="ml-2">Carregando clientes...</span>
              </div>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {clients.map(client => (
                  <div
                    key={client.codigo}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                      client.selected ? 'border-primary bg-primary/5' : 'border-gray-200'
                    }`}
                    onClick={() => toggleClientSelection(client.codigo)}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={client.selected}
                        onCheckedChange={() => toggleClientSelection(client.codigo)}
                      />
                      <div className="flex-1">
                        <p className="font-medium">{client.nome}</p>
                        <p className="text-sm text-muted-foreground">
                          {channel === 'whatsapp' ? client.whatsapp : client.email}
                        </p>
                        {client.generatedMessage && (
                          <p className="text-sm mt-2 p-2 bg-blue-50 rounded border border-blue-200">
                            {client.generatedMessage}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
