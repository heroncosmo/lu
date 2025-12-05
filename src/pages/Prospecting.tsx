import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Loader2, AlertCircle, Wifi, WifiOff, X, RotateCcw, Brain } from 'lucide-react';

type Agent = { id: string; name: string; };
type WhatsAppInstance = { id: string; name: string; phone_number: string | null; status: string; };
type Session = { id: string; client_name: string; created_at: string; status: string; client_whatsapp_number: string; };
type Message = { id: string; session_id: string; sender: 'agent' | 'client'; message_content: string; timestamp: string; delays?: any };

const prospectingSchema = z.object({
  agent_id: z.string().min(1, "Por favor, selecione um agente."),
  whatsapp_instance_id: z.string().min(1, "Por favor, selecione uma instância WhatsApp."),
  client_name: z.string().min(1, "O nome do cliente é obrigatório."),
  client_whatsapp_number: z.string().min(10, "O número do WhatsApp é obrigatório e deve ser válido."),
});

const Prospecting = () => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [whatsappInstances, setWhatsappInstances] = useState<WhatsAppInstance[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [isProcessing, setIsProcessing] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<any>(null);

  const form = useForm<z.infer<typeof prospectingSchema>>({
    resolver: zodResolver(prospectingSchema),
    defaultValues: { 
      agent_id: "",
      whatsapp_instance_id: "",
      client_name: "", 
      client_whatsapp_number: ""
    },
  });

  const fetchAgents = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data, error } = await supabase
        .from('agents')
        .select('id, name')
        .eq('is_active', true);
      if (error) {
        toast.error("Erro ao carregar agentes: " + error.message);
      } else {
        setAgents(data || []);
      }
    } catch (err) {
      toast.error("Erro ao carregar agentes");
    }
  };

  const fetchWhatsAppInstances = async () => {
    try {
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('id, name, phone_number, status')
        .eq('is_active', true)
        .order('is_default', { ascending: false });
      
      if (error) {
        toast.error("Erro ao carregar instâncias WhatsApp: " + error.message);
      } else {
        setWhatsappInstances(data || []);
        // Selecionar instância padrão automaticamente
        const defaultInstance = data?.find((i: WhatsAppInstance) => i.status === 'connected');
        if (defaultInstance && !form.getValues('whatsapp_instance_id')) {
          form.setValue('whatsapp_instance_id', defaultInstance.id);
        }
      }
    } catch (err) {
      toast.error("Erro ao carregar instâncias WhatsApp");
    }
  };

  const fetchSessions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data, error } = await supabase
        .from('prospecting_sessions')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        toast.error("Erro ao carregar sessões: " + error.message);
      } else {
        setSessions(data || []);
      }
    } catch (err) {
      toast.error("Erro ao carregar sessões");
    }
  };

  useEffect(() => {
    fetchAgents();
    fetchWhatsAppInstances();
    fetchSessions();
  }, []);

  useEffect(() => {
    console.log("=== USEEFFECT: SESSÃO ALTERADA ===");
    console.log("Sessão selecionada:", selectedSession?.id);
    
    if (!selectedSession) {
      setMessages([]);
      setError(null);
      setRealtimeStatus('disconnected');
      setIsProcessing(false);
      if (channelRef.current) {
        console.log("Removendo canal Realtime...");
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      return;
    }
    
    // Referência para armazenar o último timestamp conhecido
    let lastMessageTimestamp: string | null = null;
    
    const fetchMessages = async (isPolling = false) => {
      try {
        if (!isPolling) {
          console.log("Buscando mensagens para a sessão:", selectedSession.id);
        }
        const { data, error } = await supabase.from('whatsapp_messages').select('*').eq('session_id', selectedSession.id).order('timestamp', { ascending: true });
        if (error) {
          if (!isPolling) setError("Erro ao carregar mensagens: " + error.message);
        } else {
          const newData = data || [];
          
          // Verificar se há novas mensagens (para polling)
          if (isPolling && newData.length > 0) {
            const newestTimestamp = newData[newData.length - 1].timestamp;
            if (lastMessageTimestamp && newestTimestamp !== lastMessageTimestamp) {
              console.log("🔄 POLLING: Novas mensagens detectadas!");
              const newMessages = newData.filter(msg => 
                new Date(msg.timestamp) > new Date(lastMessageTimestamp!)
              );
              newMessages.forEach(msg => {
                console.log(`📩 Nova mensagem via polling: ${msg.sender} - ${msg.content?.substring(0, 50)}`);
                if (msg.sender === 'client') {
                  toast.success(`Nova mensagem de ${selectedSession.client_name}`);
                  setIsProcessing(true);
                } else if (msg.sender === 'agent') {
                  setIsProcessing(false);
                }
              });
            }
            lastMessageTimestamp = newestTimestamp;
          }
          
          // Atualizar mensagens se houver diferença
          setMessages(currentMessages => {
            if (currentMessages.length !== newData.length) {
              console.log(`Mensagens atualizadas: ${currentMessages.length} -> ${newData.length}`);
              return newData;
            }
            // Verificar se a última mensagem é diferente
            if (currentMessages.length > 0 && newData.length > 0) {
              if (currentMessages[currentMessages.length - 1].id !== newData[newData.length - 1].id) {
                return newData;
              }
            }
            return currentMessages;
          });
          
          if (!isPolling) {
            console.log("Mensagens carregadas:", newData.length);
            if (newData.length > 0) {
              lastMessageTimestamp = newData[newData.length - 1].timestamp;
            }
          }
          setError(null);
        }
      } catch (err) {
        if (!isPolling) setError("Erro ao carregar mensagens");
      }
    };
    
    fetchMessages();
    
    // FALLBACK: Polling a cada 2 segundos como backup do Realtime
    const pollingInterval = setInterval(() => {
      fetchMessages(true);
    }, 2000);
    
    console.log("⏰ Polling iniciado (fallback do Realtime)");

    // Configurar Realtime usando postgres_changes (compatível com edge functions)
    setRealtimeStatus('connecting');
    
    console.log(`=== CONFIGURANDO REALTIME PARA SESSÃO: ${selectedSession.id} ===`);
    
    // Remover canal anterior se existir
    if (channelRef.current) {
      console.log("Removendo canal anterior...");
      supabase.removeChannel(channelRef.current);
    }
    
    // Criar novo canal com postgres_changes - escuta INSERTs na tabela
    channelRef.current = supabase
      .channel(`messages-changes-${selectedSession.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'whatsapp_messages',
          filter: `session_id=eq.${selectedSession.id}`
        },
        (payload) => {
          console.log("=== POSTGRES CHANGE RECEBIDO NO FRONTEND ===");
          console.log("Payload completo:", payload);
          
          const newMessage = payload.new as Message;
          
          console.log("✅ NOVA MENSAGEM INSERIDA ===");
          console.log("Nova mensagem recebida:", newMessage);
          
          setMessages((currentMessages) => {
            const messageExists = currentMessages.some(msg => msg.id === newMessage.id);
            if (!messageExists) {
              console.log("Adicionando nova mensagem ao chat");
              return [...currentMessages, newMessage];
            }
            console.log("Mensagem já existe, ignorando");
            return currentMessages;
          });
          
          setError(null);
          
          // Se for mensagem do cliente, mostrar indicador de processamento
          if (newMessage.sender === 'client') {
            console.log("📝 MENSAGEM DO CLIENTE - INICIANDO PROCESSAMENTO ===");
            setIsProcessing(true);
            toast.success(`Nova mensagem de ${selectedSession.client_name}`);
          }
          
          // Se for mensagem do agente, esconder indicador de processamento
          if (newMessage.sender === 'agent') {
            console.log("🤖 MENSAGEM DO AGENTE RECEBIDA ===");
            console.log("Mensagem completa:", newMessage);
            
            setIsProcessing(false);
            
            // Se a mensagem veio com informações de delay, logar para debug
            if (newMessage.delays) {
              console.log("=== 🕒 DELAYS RECEBIDOS NO FRONTEND ===");
              console.log("Delays completos:", JSON.stringify(newMessage.delays, null, 2));
              console.log("Tempo total:", newMessage.delays.totalDelay);
              console.log("Palavras:", newMessage.delays.wordCount);
              console.log("Delay de resposta:", newMessage.delays.responseDelay);
              console.log("Delay por palavra:", newMessage.delays.wordDelay);
            } else {
              console.log("⚠️ MENSAGEM DO AGENTE SEM DELAYS ===");
            }
          }
      })
      .subscribe((status) => {
        console.log("📡 Status da subscription Realtime:", status);
        
        if (status === 'SUBSCRIBED') {
          setRealtimeStatus('connected');
          console.log('✅ Realtime conectado com sucesso!');
        } else if (status === 'CHANNEL_ERROR') {
          setRealtimeStatus('disconnected');
          console.error('❌ Erro na conexão Realtime');
        } else if (status === 'TIMED_OUT') {
          setRealtimeStatus('disconnected');
          console.error('⏰ Timeout na conexão Realtime');
        }
      });

    return () => { 
      console.log('🧹 REMOVENDO SUBSCRIPTION REALTIME E POLLING ===');
      clearInterval(pollingInterval);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      setRealtimeStatus('disconnected');
      setIsProcessing(false);
    };
  }, [selectedSession]);

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({ 
        top: scrollAreaRef.current.scrollHeight, 
        behavior: 'smooth' 
      });
    }
  }, [messages, isProcessing]);

  const onSubmit = async (values: z.infer<typeof prospectingSchema>) => {
    console.log("=== INICIANDO SUBMIT ===");
    console.log("Valores do formulário:", values);
    
    setIsSubmitting(true);
    setError(null);
    const loadingToast = toast.loading("Iniciando prospecção...");
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("Usuário não autenticado");
      }

      const { data: existingSessions } = await supabase
        .from('prospecting_sessions')
        .select('id, status')
        .eq('client_whatsapp_number', values.client_whatsapp_number);

      const activeSessions = existingSessions?.filter(session => 
        session.status === 'started' || session.status === 'active'
      );

      if (activeSessions && activeSessions.length > 0) {
        toast.error(`Já existe uma sessão ativa para este número. Selecione-a na lista de sessões.`, { 
          id: loadingToast 
        });
        setIsSubmitting(false);
        return;
      }
      
      console.log("Enviando dados para a função send-whatsapp-message...");
      
      const { data, error } = await supabase.functions.invoke('send-whatsapp-message', { 
        body: {
          ...values,
          user_id: user.id,
        }
      });
      
      console.log("Resposta da função send-whatsapp-message:", data, error);
      
      if (error) {
        throw new Error(error.message);
      }
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      toast.success(`Prospecção iniciada com sucesso! ID: ${data.sessionId}`, { 
        id: loadingToast 
      });
      
      form.reset({
        agent_id: "",
        client_name: "",
        client_whatsapp_number: ""
      });
      
      await fetchSessions();
      
      const newSession = sessions.find(session => session.id === data.sessionId);
      if (newSession) {
        setSelectedSession(newSession);
      } else {
        const { data: updatedSessions } = await supabase
          .from('prospecting_sessions')
          .select('*')
          .order('created_at', { ascending: false });
        
        if (updatedSessions) {
          setSessions(updatedSessions);
          const justCreatedSession = updatedSessions.find(session => session.id === data.sessionId);
          if (justCreatedSession) {
            setSelectedSession(justCreatedSession);
          }
        }
      }
      
    } catch (error: any) {
      console.error("Erro ao iniciar prospecção:", error);
      setError(error.message);
      toast.error(`Erro: ${error.message}`, { 
        id: loadingToast,
        duration: 5000 
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeSession = async () => {
    if (!selectedSession) return;
    
    try {
      const { error } = await supabase
        .from('prospecting_sessions')
        .update({ status: 'closed' })
        .eq('id', selectedSession.id);
      
      if (error) {
        toast.error("Erro ao fechar sessão: " + error.message);
      } else {
        toast.success("Sessão fechada com sucesso!");
        setSelectedSession(null);
        await fetchSessions();
      }
    } catch (err) {
      toast.error("Erro ao fechar sessão");
    }
  };

  const testRealtime = () => {
    if (selectedSession) {
      console.log('🧪 TESTANDO REALTIME ===');
      console.log('Inserindo mensagem de teste manualmente...');
      supabase
        .from('whatsapp_messages')
        .insert({
          session_id: selectedSession.id,
          sender: 'client',
          message_content: `Mensagem de teste Realtime ${new Date().toLocaleTimeString()}`
        })
        .then(({ error }) => {
          if (error) {
            console.error('Erro ao inserir mensagem de teste:', error);
            toast.error('Erro ao testar Realtime');
          } else {
            console.log('✅ Mensagem de teste inserida com sucesso');
            toast.success('Mensagem de teste enviada!');
          }
        });
    }
  };

  const forceRefresh = async () => {
    if (selectedSession) {
      console.log('🔄 FORÇANDO REFRESH DAS MENSAGENS ===');
      try {
        const { data, error } = await supabase.from('whatsapp_messages').select('*').eq('session_id', selectedSession.id).order('timestamp', { ascending: true });
        if (error) {
          toast.error("Erro ao atualizar mensagens: " + error.message);
        } else {
          setMessages(data || []);
          toast.success("Mensagens atualizadas!");
        }
      } catch (err) {
        toast.error("Erro ao atualizar mensagens");
      }
    }
  };

  return (
    <div className="container mx-auto p-4">
      <Card className="max-w-2xl mx-auto mb-8">
        <CardHeader>
          <CardTitle>Iniciar Nova Prospecção</CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField 
                control={form.control} 
                name="agent_id" 
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Selecione o Agente</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Escolha um agente" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {agents.length === 0 ? (
                          <SelectItem value="no-agents-available" disabled>
                            Nenhum agente disponível
                          </SelectItem>
                        ) : (
                          agents.map((agent) => (
                            <SelectItem key={agent.id} value={agent.id}>
                              {agent.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} 
              />

              <FormField 
                control={form.control} 
                name="whatsapp_instance_id" 
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Instância WhatsApp</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione uma instância WhatsApp" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {whatsappInstances.length === 0 ? (
                          <SelectItem value="none" disabled>
                            Nenhuma instância ativa encontrada
                          </SelectItem>
                        ) : (
                          whatsappInstances.map((instance) => (
                            <SelectItem key={instance.id} value={instance.id}>
                              {instance.name} {instance.phone_number ? `(${instance.phone_number})` : ''} 
                              {instance.status === 'connected' ? ' ✓' : ' ✗'}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} 
              />
              
              <FormField 
                control={form.control} 
                name="client_name" 
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome do Cliente</FormLabel>
                    <FormControl>
                      <Input placeholder="João Silva" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} 
              />
              
              <FormField 
                control={form.control} 
                name="client_whatsapp_number" 
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>WhatsApp do Cliente</FormLabel>
                    <FormControl>
                      <Input placeholder="5511999998888" {...field} />
                    </FormControl>
                    <p className="text-sm text-muted-foreground">
                      Inclua o código do país e o DDD. Ex: 5511999998888
                    </p>
                    <FormMessage />
                  </FormItem>
                )} 
              />
              
              <Button 
                type="submit" 
                disabled={isSubmitting || agents.length === 0} 
                className="w-full"
              >
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 
                )}
                Começar Prospecção
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Sessões Ativas
                {selectedSession && (
                  <div className="flex items-center gap-1 text-xs">
                    {realtimeStatus === 'connected' ? (
                      <>
                        <Wifi className="h-3 w-3 text-green-500" />
                        <span className="text-green-500">Online</span>
                      </>
                    ) : realtimeStatus === 'connecting' ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin text-yellow-500" />
                        <span className="text-yellow-500">Conectando...</span>
                      </>
                    ) : (
                      <>
                        <WifiOff className="h-3 w-3 text-red-500" />
                        <span className="text-red-500">Offline</span>
                      </>
                    )}
                  </div>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sessions.length === 0 ? (
                <p className="text-center text-muted-foreground">
                  Nenhuma sessão iniciada.
                </p>
              ) : (
                <ScrollArea className="h-[400px]">
                  <ul className="space-y-2 pr-4">
                    {sessions.map(session => (
                      <li key={session.id}>
                        <Button 
                          variant={selectedSession?.id === session.id ? 'secondary' : 'ghost'} 
                          className="w-full justify-start h-auto" 
                          onClick={() => setSelectedSession(session)}
                        >
                          <div className="text-left py-2">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold">{session.client_name}</p>
                              <span className={`text-xs px-2 py-1 rounded-full ${
                                session.status === 'active' ? 'bg-green-100 text-green-800' :
                                session.status === 'failed' ? 'bg-red-100 text-red-800' :
                                session.status === 'closed' ? 'bg-gray-100 text-gray-800' :
                                'bg-yellow-100 text-yellow-800'
                              }`}>
                                {session.status}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {session.client_whatsapp_number}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(session.created_at).toLocaleString()}
                            </p>
                          </div>
                        </Button>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              )}
              
              {selectedSession && (
                <div className="space-y-2 mt-4">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={testRealtime}
                    className="w-full"
                  >
                    Testar Realtime
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={forceRefresh}
                    className="w-full"
                  >
                    Forçar Atualização
                  </Button>
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    onClick={closeSession}
                    className="w-full"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Fechar Sessão
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        
        <div className="md:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Conversa
                {selectedSession && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={closeSession}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Fechar
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] flex flex-col border rounded-md">
                <ScrollArea className="flex-grow p-4" ref={scrollAreaRef}>
                  {selectedSession ? (
                    <div className="space-y-4">
                      {messages.length === 0 && !isProcessing ? (
                        <div className="text-center text-muted-foreground py-8">
                          <p>Nenhuma mensagem nesta conversa ainda.</p>
                          <p className="text-sm mt-2">Envie uma mensagem para {selectedSession.client_whatsapp_number} para começar.</p>
                          <p className="text-xs mt-2 text-blue-500">
                            Status Realtime: {realtimeStatus}
                          </p>
                        </div>
                      ) : (
                        <>
                          {messages.map(msg => (
                            <div 
                              key={msg.id} 
                              className={`flex items-end gap-2 ${
                                msg.sender === 'agent' ? 'justify-end' : 'justify-start'
                              }`}
                            >
                              <div className={`p-3 rounded-lg max-w-xs lg:max-w-md ${
                                msg.sender === 'agent' 
                                  ? 'bg-primary text-primary-foreground' 
                                  : 'bg-muted'
                              }`}>
                                <p className="text-sm">{msg.message_content}</p>
                                <p className="text-xs opacity-70 mt-1">
                                  {new Date(msg.timestamp).toLocaleTimeString()}
                                </p>
                              </div>
                            </div>
                          ))}
                          
                          {isProcessing && (
                            <div className="flex items-start gap-2">
                              <div className="bg-muted p-3 rounded-lg max-w-xs">
                                <div className="flex items-center gap-2 mb-2">
                                  <Brain className="h-4 w-4 animate-pulse" />
                                  <span className="text-sm text-muted-foreground">Processando mensagem...</span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                  <div className="bg-blue-600 h-2 rounded-full animate-pulse" style={{ width: '100%' }} />
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                  A IA está analisando e gerando resposta
                                </p>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground">
                      <p>Selecione uma sessão para ver a conversa.</p>
                    </div>
                  )}
                </ScrollArea>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Prospecting;