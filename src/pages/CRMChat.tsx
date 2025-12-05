import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { RedsisClient } from '@/integrations/redsis/client';
import type { SubFunil, Funil } from '@/integrations/redsis/types';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  MessageSquare,
  Bot,
  User,
  RefreshCw,
  Clock,
  Flame,
  Sun,
  Snowflake,
  Search,
  Send,
  ArrowLeft,
  Settings,
  AlertCircle,
  CheckCircle,
  XCircle,
  Play,
  Pause,
  ChevronDown,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ActiveSession {
  id: string;
  client_name: string;
  client_whatsapp_number: string;
  last_message_at: string;
  last_message_content: string;
  last_message_sender: 'client' | 'agent';
  ai_enabled: boolean;
  unread_count: number;
  campaign_name?: string;
  campaign_active?: boolean;
  lead_temperature?: 'hot' | 'warm' | 'cold';
  channel?: 'whatsapp' | 'sms' | 'email';
  crm_contact_id?: string;
  kanban_status?: string;
  kanban_stage_name?: string;
}

interface Message {
  id: string;
  sender: 'client' | 'agent';
  message_content: string;
  timestamp: string;
  pending_send: boolean;
  whatsapp_sent: boolean;
}

export default function CRMChat() {
  const [searchParams] = useSearchParams();
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'hot' | 'warm' | 'cold' | 'ai' | 'manual'>('all');
  const [selectedSession, setSelectedSession] = useState<ActiveSession | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [showClientPanel, setShowClientPanel] = useState(false);
  const [updatingKanban, setUpdatingKanban] = useState(false);
  const [kanbanSubfunis, setKanbanSubfunis] = useState<SubFunil[]>([]);
  const [kanbanFunis, setKanbanFunis] = useState<Funil[]>([]);
  const [selectedFunil, setSelectedFunil] = useState<number>(1); // Comercial MI por padrão
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Instância do cliente Redsis
  const redsisClient = new RedsisClient({
    baseURL: import.meta.env.VITE_REDSIS_API_URL || 'https://api.redsis.com.br',
    usuario: import.meta.env.VITE_REDSIS_USUARIO || 'REDSIS',
    senha: import.meta.env.VITE_REDSIS_SENHA || '1010',
    servidor: import.meta.env.VITE_REDSIS_SERVIDOR || '10.1.1.200',
    porta: import.meta.env.VITE_REDSIS_PORTA || '8084',
  });

  // Carregar funis e subfunis do Redsis
  useEffect(() => {
    async function loadKanbanOptions() {
      try {
        const funis = await redsisClient.getFunis();
        setKanbanFunis(funis);
        console.log('📊 CRMChat: Funis carregados do Redsis:', funis);

        // Carregar subfunis do primeiro funil (ou selecionado)
        if (funis.length > 0) {
          const funilId = selectedFunil || funis[0].codigo;
          const subfunis = await redsisClient.getSubFunis(funilId);
          setKanbanSubfunis(subfunis);
          console.log('📊 CRMChat: SubFunis carregados do Redsis:', subfunis);
        }
      } catch (error) {
        console.error('❌ CRMChat: Erro ao carregar opções de Kanban:', error);
        // Fallback para status hardcoded se Redsis falhar
        setKanbanSubfunis([
          { codigo: 1, descricao: 'A TRABALHAR', order: 0, cor: '#22c55e' },
          { codigo: 2, descricao: 'NEGOCIAÇÃO', order: 1, cor: '#3b82f6' },
          { codigo: 3, descricao: 'COTAÇÃO', order: 2, cor: '#eab308' },
          { codigo: 4, descricao: 'OFERTA', order: 3, cor: '#f97316' },
          { codigo: 5, descricao: 'FECHAMENTO', order: 4, cor: '#10b981' },
          { codigo: 6, descricao: 'PERDIDO', order: 5, cor: '#ef4444' },
        ]);
      }
    }
    loadKanbanOptions();
  }, [selectedFunil]);

  // Verificar parâmetros de URL ao carregar
  useEffect(() => {
    const sessionId = searchParams.get('session');
    const phone = searchParams.get('phone');
    const name = searchParams.get('name');
    
    if (sessionId) {
      // Abrir sessão existente
      loadActiveSessions().then(() => {
        // A sessão será selecionada após carregar
      });
    } else if (phone && name) {
      // Buscar ou criar sessão para este número
      findOrCreateSessionByPhone(phone, decodeURIComponent(name));
    } else {
      loadActiveSessions();
    }
  }, []);

  // Selecionar sessão da URL após carregar
  useEffect(() => {
    const sessionId = searchParams.get('session');
    if (sessionId && sessions.length > 0) {
      const session = sessions.find(s => s.id === sessionId);
      if (session) {
        setSelectedSession(session);
        loadMessages(session.id);
      }
    }
  }, [sessions, searchParams]);

  async function findOrCreateSessionByPhone(phone: string, name: string) {
    try {
      setLoading(true);
      
      // Buscar sessão existente
      const { data: existingSession } = await supabase
        .from('prospecting_sessions')
        .select('*')
        .eq('client_whatsapp_number', phone)
        .in('status', ['started', 'active'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingSession) {
        // Carregar todas as sessões e selecionar esta
        await loadActiveSessions();
        const session = {
          id: existingSession.id,
          client_name: existingSession.client_name,
          client_whatsapp_number: existingSession.client_whatsapp_number,
          last_message_at: existingSession.last_message_at || existingSession.updated_at,
          last_message_content: '',
          last_message_sender: 'client' as const,
          ai_enabled: existingSession.ai_enabled ?? true,
          unread_count: 0,
          lead_temperature: existingSession.lead_temperature || 'cold',
          channel: existingSession.channel || 'whatsapp',
        };
        setSelectedSession(session);
        loadMessages(session.id);
      } else {
        // Mostrar mensagem que não há sessão ativa
        toast({
          title: 'Sem conversa ativa',
          description: `Não há conversa ativa com ${name}. Inicie uma prospecção primeiro.`,
        });
        loadActiveSessions();
      }
    } catch (error: any) {
      console.error('Erro ao buscar sessão:', error);
      loadActiveSessions();
    } finally {
      setLoading(false);
    }
  }

  async function loadActiveSessions() {
    try {
      setLoading(true);
      
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      const { data: sessionsData, error } = await supabase
        .from('prospecting_sessions')
        .select(`
          id,
          client_name,
          client_whatsapp_number,
          ai_enabled,
          updated_at,
          last_message_at,
          lead_temperature,
          channel,
          campaign_id,
          crm_contact_id
        `)
        .not('last_message_at', 'is', null)
        .gte('last_message_at', threeDaysAgo.toISOString())
        .order('last_message_at', { ascending: false });

      if (error) throw error;

      const sessionsWithMessages = await Promise.all(
        (sessionsData || []).map(async (session: any) => {
          const { data: messages } = await supabase
            .from('whatsapp_messages')
            .select('message_content, sender, timestamp')
            .eq('session_id', session.id)
            .order('timestamp', { ascending: false })
            .limit(1)
            .maybeSingle();

          let campaignName = undefined;
          let campaignActive = true; // Default: ativa se não há campanha associada
          if (session.campaign_id) {
            const { data: campaign } = await supabase
              .from('campaigns')
              .select('name, is_active')
              .eq('id', session.campaign_id)
              .single();
            campaignName = campaign?.name;
            campaignActive = campaign?.is_active ?? true;
          }

          // Buscar dados do CRM para status do Kanban
          let kanbanStatus = undefined;
          let kanbanStageName = undefined;
          let crmContactId = session.crm_contact_id;
          
          if (!crmContactId && session.client_whatsapp_number) {
            // Tentar encontrar pelo número de WhatsApp
            const { data: crmContact } = await supabase
              .from('crm_contacts')
              .select('id, kanban_status, kanban_stage_name')
              .or(`whatsapp.eq.${session.client_whatsapp_number},phone.eq.${session.client_whatsapp_number}`)
              .limit(1)
              .maybeSingle();
            
            if (crmContact) {
              crmContactId = crmContact.id;
              kanbanStatus = crmContact.kanban_status;
              kanbanStageName = crmContact.kanban_stage_name;
            }
          } else if (crmContactId) {
            const { data: crmContact } = await supabase
              .from('crm_contacts')
              .select('kanban_status, kanban_stage_name')
              .eq('id', crmContactId)
              .single();
            
            if (crmContact) {
              kanbanStatus = crmContact.kanban_status;
              kanbanStageName = crmContact.kanban_stage_name;
            }
          }

          const { count } = await supabase
            .from('whatsapp_messages')
            .select('*', { count: 'exact', head: true })
            .eq('session_id', session.id)
            .eq('sender', 'client')
            .eq('pending_send', false);

          return {
            id: session.id,
            client_name: session.client_name,
            client_whatsapp_number: session.client_whatsapp_number,
            last_message_at: messages?.timestamp || session.updated_at,
            last_message_content: messages?.message_content || '',
            last_message_sender: messages?.sender || 'client',
            ai_enabled: session.ai_enabled ?? true,
            unread_count: count || 0,
            campaign_name: campaignName,
            campaign_active: campaignActive,
            lead_temperature: session.lead_temperature || 'cold',
            channel: session.channel || 'whatsapp',
            crm_contact_id: crmContactId,
            kanban_status: kanbanStatus,
            kanban_stage_name: kanbanStageName,
          };
        })
      );

      setSessions(sessionsWithMessages.filter(Boolean) as ActiveSession[]);
    } catch (error: any) {
      console.error('Erro ao carregar sessões:', error);
      toast({
        title: 'Erro ao carregar conversas',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages(sessionId: string) {
    try {
      setLoadingMessages(true);
      const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('timestamp', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
      
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (error: any) {
      console.error('Erro ao carregar mensagens:', error);
      toast({
        title: 'Erro ao carregar mensagens',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoadingMessages(false);
    }
  }

  async function sendMessage() {
    if (!newMessage.trim() || !selectedSession || sending) return;

    try {
      setSending(true);
      
      const { error } = await supabase
        .from('whatsapp_messages')
        .insert({
          session_id: selectedSession.id,
          sender: 'agent',
          message_content: newMessage.trim(),
          timestamp: new Date().toISOString(),
          pending_send: true,
          whatsapp_sent: false,
        });

      if (error) throw error;

      setNewMessage('');
      toast({
        title: 'Mensagem enviada',
        description: 'A mensagem será enviada para o WhatsApp',
      });
    } catch (error: any) {
      toast({
        title: 'Erro ao enviar mensagem',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  }

  async function toggleAI(sessionId: string, currentValue: boolean) {
    try {
      const newValue = !currentValue;
      
      const { error } = await supabase
        .from('prospecting_sessions')
        .update({ ai_enabled: newValue })
        .eq('id', sessionId);

      if (error) throw error;

      // Se ativando IA manualmente, colocar cliente em A_TRABALHAR
      if (newValue && selectedSession?.crm_contact_id) {
        const { error: kanbanError } = await supabase
          .from('crm_contacts')
          .update({ 
            kanban_status: 'A_TRABALHAR',
            kanban_stage_name: 'A Trabalhar',
            kanban_stage_code: 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', selectedSession.crm_contact_id);

        if (!kanbanError) {
          console.log('✅ Cliente movido para A_TRABALHAR ao ativar IA manual');
        }
      }

      toast({
        title: newValue ? 'IA Ativada' : 'IA Desativada',
        description: newValue
          ? 'A IA responderá este contato (modo independente de campanha)'
          : 'Agora você pode responder manualmente',
      });

      setSessions(
        sessions.map((s) =>
          s.id === sessionId ? { ...s, ai_enabled: newValue } : s
        )
      );

      if (selectedSession?.id === sessionId) {
        setSelectedSession({ ...selectedSession, ai_enabled: newValue });
      }
    } catch (error: any) {
      toast({
        title: 'Erro ao alterar modo',
        description: error.message,
        variant: 'destructive',
      });
    }
  }

  // Função para atualizar status do Kanban manualmente
  async function updateKanbanStatus(newStatus: string | null) {
    if (!selectedSession?.crm_contact_id) {
      toast({
        title: 'Cliente não vinculado',
        description: 'Este cliente não está vinculado ao CRM. Sincronize os contatos primeiro.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setUpdatingKanban(true);

      // Buscar dados do contato incluindo atividade_codigo para sincronizar com Redsis
      const { data: contact, error: contactError } = await supabase
        .from('crm_contacts')
        .select('crm_client_code, kanban_status, kanban_stage_code')
        .eq('id', selectedSession.crm_contact_id)
        .single();

      if (contactError) throw contactError;

      // Mapear status para código do subfunil do Redsis
      const statusToCode: Record<string, number> = {
        'A_TRABALHAR': 1,
        'NEGOCIAÇÃO': 2,
        'COTAÇÃO': 3,
        'OFERTA': 4,
        'FECHAMENTO': 5,
        'PERDIDO': 6,
      };

      const currentCode = contact?.kanban_stage_code || statusToCode[contact?.kanban_status || ''] || 0;
      const targetCode = newStatus ? (statusToCode[newStatus] || 0) : 0;

      // Se tem código de cliente Redsis, tentar sincronizar com Redsis
      if (contact?.crm_client_code && targetCode > 0 && currentCode !== targetCode) {
        try {
          // Buscar atividade ativa do cliente no Redsis
          const { data: redsisData, error: redsisError } = await supabase.functions.invoke('inventory-api', {
            body: {
              action: 'getAtividades',
              cliente: contact.crm_client_code,
              situacao: 'A',
            },
          });

          if (!redsisError && redsisData?.data?.length > 0) {
            const atividade = redsisData.data[0];
            const atividadeCode = atividade.codigo_subfunil || 0;

            // Avançar ou retornar até chegar no status desejado
            const steps = targetCode - atividadeCode;
            const action = steps > 0 ? 'avancarAtividade' : 'retornarAtividade';
            const iterations = Math.abs(steps);

            for (let i = 0; i < iterations; i++) {
              await supabase.functions.invoke('inventory-api', {
                body: { action, codigoAtividade: atividade.codigo },
              });
            }
            console.log(`✅ Redsis sincronizado: ${iterations} ${action}(s)`);
          }
        } catch (redsisErr) {
          console.warn('⚠️ Não foi possível sincronizar com Redsis:', redsisErr);
          // Continua mesmo se falhar no Redsis
        }
      }

      // Atualizar no banco de dados local
      const { error } = await supabase
        .from('crm_contacts')
        .update({ 
          kanban_status: newStatus,
          kanban_stage_name: newStatus === 'A_TRABALHAR' ? 'A Trabalhar' : newStatus,
          kanban_stage_code: targetCode || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedSession.crm_contact_id);

      if (error) throw error;

      // Atualizar estado local
      const updatedSession = { 
        ...selectedSession, 
        kanban_status: newStatus || undefined,
        kanban_stage_name: newStatus === 'A_TRABALHAR' ? 'A Trabalhar' : (newStatus || undefined),
      };
      
      setSelectedSession(updatedSession);
      setSessions(sessions.map(s => 
        s.id === selectedSession.id ? updatedSession : s
      ));

      // Gerenciar participantes de campanha baseado no status do Kanban
      if (contact?.crm_client_code) {
        if (newStatus === 'A_TRABALHAR') {
          // Reativar participantes de campanha quando volta para A_TRABALHAR
          await supabase
            .from('campaign_participants')
            .update({ 
              status: 'active',
              message_status: 'pending',
              last_error: null,
            })
            .eq('crm_client_code', contact.crm_client_code)
            .eq('status', 'paused_kanban');
          
          console.log('✅ Participantes reativados ao voltar para A_TRABALHAR');
        } else if (newStatus) {
          // Pausar participantes quando sai de A_TRABALHAR
          await supabase
            .from('campaign_participants')
            .update({ 
              status: 'paused_kanban',
              message_status: 'skipped',
              last_error: `Movido para ${newStatus} manualmente`,
            })
            .eq('crm_client_code', contact.crm_client_code)
            .eq('status', 'active');
          
          console.log(`⏸️ Participantes pausados ao mover para ${newStatus}`);
        }
      }

      toast({
        title: newStatus ? `Status alterado para ${newStatus}` : 'Status removido',
        description: newStatus === 'A_TRABALHAR' 
          ? 'Cliente pode receber prospecção'
          : 'Cliente não receberá prospecção automática',
      });

    } catch (error: any) {
      console.error('Erro ao atualizar Kanban:', error);
      toast({
        title: 'Erro ao atualizar status',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setUpdatingKanban(false);
    }
  }

  // Função helper para cor do badge de Kanban
  function getKanbanBadgeVariant(status?: string): "default" | "destructive" | "secondary" | "outline" {
    switch (status) {
      case 'A_TRABALHAR': return 'default';
      case 'NEGOCIACAO': return 'destructive';
      case 'COTACAO': return 'secondary';
      default: return 'outline';
    }
  }

  function selectSession(session: ActiveSession) {
    setSelectedSession(session);
    loadMessages(session.id);
  }

  const filteredSessions = sessions.filter((session) => {
    const matchesSearch = searchTerm === '' || 
      session.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      session.client_whatsapp_number.includes(searchTerm);
    
    const matchesFilter = 
      filterType === 'all' ? true :
      filterType === 'hot' ? session.lead_temperature === 'hot' :
      filterType === 'warm' ? session.lead_temperature === 'warm' :
      filterType === 'cold' ? session.lead_temperature === 'cold' :
      filterType === 'ai' ? session.ai_enabled === true :
      filterType === 'manual' ? session.ai_enabled === false :
      true;
    
    return matchesSearch && matchesFilter;
  });

  const getTemperatureIcon = (temp?: string) => {
    switch (temp) {
      case 'hot': return <Flame className="h-4 w-4 text-red-500" />;
      case 'warm': return <Sun className="h-4 w-4 text-yellow-500" />;
      default: return <Snowflake className="h-4 w-4 text-blue-500" />;
    }
  };

  const getTemperatureLabel = (temp?: string) => {
    switch (temp) {
      case 'hot': return 'Quente';
      case 'warm': return 'Morno';
      default: return 'Frio';
    }
  };

  const getTemperatureBadgeVariant = (temp?: string): "default" | "destructive" | "secondary" | "outline" | null | undefined => {
    switch (temp) {
      case 'hot': return 'destructive';
      case 'warm': return 'default';
      default: return 'secondary';
    }
  };

  // Realtime subscription com polling fallback
  useEffect(() => {
    if (!selectedSession) return;

    // Polling como fallback do Realtime (a cada 2 segundos)
    let lastMessageCount = messages.length;
    const pollingInterval = setInterval(async () => {
      try {
        const { data, error } = await supabase
          .from('whatsapp_messages')
          .select('*')
          .eq('session_id', selectedSession.id)
          .order('timestamp', { ascending: true });
        
        if (!error && data) {
          // Verificar se há novas mensagens
          if (data.length > lastMessageCount) {
            console.log('🔄 POLLING CRM: Novas mensagens detectadas!');
            setMessages(data);
            lastMessageCount = data.length;
            setTimeout(() => {
              messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, 100);
          }
        }
      } catch (err) {
        console.error('Erro no polling:', err);
      }
    }, 2000);

    console.log('⏰ Polling CRM iniciado (fallback do Realtime)');

    const channel = supabase
      .channel(`messages-${selectedSession.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_messages',
          filter: `session_id=eq.${selectedSession.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setMessages((prev) => [...prev, payload.new as Message]);
            setTimeout(() => {
              messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, 100);
          } else if (payload.eventType === 'UPDATE') {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === payload.new.id ? (payload.new as Message) : msg
              )
            );
          }
        }
      )
      .subscribe();

    return () => {
      clearInterval(pollingInterval);
      supabase.removeChannel(channel);
    };
  }, [selectedSession]);

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              💬 Conversas do CRM
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Gerencie conversas em tempo real
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{filteredSessions.length} conversas</Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadActiveSessions}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </div>

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Lista de Conversas - Esquerda */}
        <div className="w-96 bg-white dark:bg-gray-800 border-r flex flex-col">
          {/* Busca */}
          <div className="p-4 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar conversas..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Filtros Minimalistas */}
          <div className="p-3 border-b bg-gray-50 dark:bg-gray-900">
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              <Button
                variant={filterType === 'all' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setFilterType('all')}
                className="whitespace-nowrap text-xs"
              >
                Todas ({sessions.length})
              </Button>
              <Button
                variant={filterType === 'hot' ? 'destructive' : 'ghost'}
                size="sm"
                onClick={() => setFilterType('hot')}
                className="whitespace-nowrap text-xs"
              >
                <Flame className="h-3 w-3 mr-1" />
                Quentes ({sessions.filter(s => s.lead_temperature === 'hot').length})
              </Button>
              <Button
                variant={filterType === 'warm' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setFilterType('warm')}
                className="whitespace-nowrap text-xs"
              >
                <Sun className="h-3 w-3 mr-1" />
                Mornos ({sessions.filter(s => s.lead_temperature === 'warm').length})
              </Button>
              <Button
                variant={filterType === 'cold' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setFilterType('cold')}
                className="whitespace-nowrap text-xs"
              >
                <Snowflake className="h-3 w-3 mr-1" />
                Frios ({sessions.filter(s => s.lead_temperature === 'cold').length})
              </Button>
              <Button
                variant={filterType === 'ai' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setFilterType('ai')}
                className="whitespace-nowrap text-xs bg-green-500 hover:bg-green-600 text-white"
                style={filterType === 'ai' ? {} : { background: 'transparent', color: 'inherit' }}
              >
                <Bot className="h-3 w-3 mr-1" />
                IA ({sessions.filter(s => s.ai_enabled).length})
              </Button>
              <Button
                variant={filterType === 'manual' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setFilterType('manual')}
                className="whitespace-nowrap text-xs"
              >
                <User className="h-3 w-3 mr-1" />
                Manual ({sessions.filter(s => !s.ai_enabled).length})
              </Button>
            </div>
          </div>

          {/* Lista */}
          <ScrollArea className="flex-1">
            {loading ? (
              <div className="p-8 text-center">
                <RefreshCw className="h-6 w-6 animate-spin mx-auto text-gray-400" />
                <p className="text-sm text-gray-500 mt-2">Carregando...</p>
              </div>
            ) : filteredSessions.length === 0 ? (
              <div className="p-8 text-center">
                <MessageSquare className="h-12 w-12 mx-auto text-gray-300 mb-2" />
                <p className="text-gray-500">Nenhuma conversa</p>
              </div>
            ) : (
              filteredSessions.map((session) => (
                <div
                  key={session.id}
                  onClick={() => selectSession(session)}
                  className={`p-4 border-b cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                    selectedSession?.id === session.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Avatar>
                      <AvatarFallback className="bg-blue-500 text-white">
                        {session.client_name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-semibold text-sm truncate">
                          {session.client_name}
                        </h3>
                        <span className="text-xs text-gray-500">
                          {new Date(session.last_message_at).toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge variant={getTemperatureBadgeVariant(session.lead_temperature)} className="text-xs">
                          {getTemperatureIcon(session.lead_temperature)}
                          <span className="ml-1">{getTemperatureLabel(session.lead_temperature)}</span>
                        </Badge>
                        {session.campaign_active === false ? (
                          <Badge variant="outline" className="text-xs text-gray-500">
                            <Pause className="h-3 w-3 mr-1" />
                            Pausada
                          </Badge>
                        ) : session.ai_enabled ? (
                          <Badge variant="default" className="bg-green-500 text-xs">
                            <Bot className="h-3 w-3 mr-1" />
                            IA
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            <User className="h-3 w-3 mr-1" />
                            Manual
                          </Badge>
                        )}
                        {/* Badge de status Kanban */}
                        {session.kanban_status === 'A_TRABALHAR' ? (
                          <Badge variant="default" className="bg-blue-500 text-xs">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            A_TRABALHAR
                          </Badge>
                        ) : session.kanban_status ? (
                          <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-300">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            {session.kanban_status}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-gray-400">
                            <XCircle className="h-3 w-3 mr-1" />
                            Sem Kanban
                          </Badge>
                        )}
                        {session.campaign_name && (
                          <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                            📣 {session.campaign_name}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                        {session.last_message_content}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </ScrollArea>
        </div>

        {/* Área de Chat - Direita */}
        <div className="flex-1 flex flex-col bg-white dark:bg-gray-800">
          {selectedSession ? (
            <>
              {/* Header do Chat */}
              <div className="p-4 border-b flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedSession(null)}
                    className="lg:hidden"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <Avatar>
                    <AvatarFallback className="bg-blue-500 text-white">
                      {selectedSession.client_name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h2 className="font-semibold">{selectedSession.client_name}</h2>
                    <p className="text-xs text-gray-500">{selectedSession.client_whatsapp_number}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {selectedSession.campaign_name && (
                        <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                          📣 {selectedSession.campaign_name}
                        </Badge>
                      )}
                      {/* Status do Kanban com controles */}
                      {selectedSession.kanban_status === 'A_TRABALHAR' ? (
                        <Badge variant="default" className="bg-blue-500 text-xs">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          A_TRABALHAR
                        </Badge>
                      ) : selectedSession.kanban_status ? (
                        <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-300">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          {selectedSession.kanban_status}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-gray-400">
                          <XCircle className="h-3 w-3 mr-1" />
                          Sem Kanban
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Seletor de Status Kanban - Dropdown dinâmico do Redsis */}
                  <div className="flex items-center gap-1 border-r pr-2 mr-2">
                    <Select
                      value={selectedSession.kanban_status || 'none'}
                      onValueChange={(value) => updateKanbanStatus(value === 'none' ? null : value)}
                      disabled={updatingKanban}
                    >
                      <SelectTrigger className="w-[180px] h-8 text-xs">
                        <SelectValue placeholder="Status Kanban">
                          {selectedSession.kanban_status || 'Sem Kanban'}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          <div className="flex items-center gap-2">
                            <XCircle className="h-3 w-3 text-gray-400" />
                            Sem Kanban
                          </div>
                        </SelectItem>
                        {/* Opção especial A_TRABALHAR para prospecção */}
                        <SelectItem value="A_TRABALHAR">
                          <div className="flex items-center gap-2">
                            <Play className="h-3 w-3 text-green-500" />
                            A_TRABALHAR (Prospecção)
                          </div>
                        </SelectItem>
                        {/* Subfunis dinâmicos do Redsis */}
                        {kanbanSubfunis
                          .filter(sf => sf.descricao.toUpperCase() !== 'A TRABALHAR')
                          .map((subfunil) => (
                            <SelectItem key={subfunil.codigo} value={subfunil.descricao.toUpperCase().replace(/\s+/g, '_')}>
                              <div className="flex items-center gap-2">
                                <div 
                                  className="h-3 w-3 rounded-full" 
                                  style={{ backgroundColor: subfunil.cor || '#6b7280' }}
                                />
                                {subfunil.descricao}
                              </div>
                            </SelectItem>
                          ))
                        }
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Badge de status da IA considerando campanha ativa */}
                  {selectedSession.campaign_active === false ? (
                    <Badge variant="outline" className="text-gray-500">
                      <Pause className="h-3 w-3 mr-1" />
                      Campanha Pausada
                    </Badge>
                  ) : (
                    <Badge variant={selectedSession.ai_enabled ? 'default' : 'secondary'}>
                      {selectedSession.ai_enabled ? (
                        <>
                          <Bot className="h-3 w-3 mr-1" />
                          IA Ativa
                        </>
                      ) : (
                        <>
                          <User className="h-3 w-3 mr-1" />
                          Manual
                        </>
                      )}
                    </Badge>
                  )}
                  <Switch
                    checked={selectedSession.ai_enabled}
                    onCheckedChange={() => toggleAI(selectedSession.id, selectedSession.ai_enabled)}
                    title={selectedSession.ai_enabled ? 'Desativar IA' : 'Ativar IA'}
                    disabled={selectedSession.campaign_active === false}
                  />
                </div>
              </div>

              {/* Mensagens */}
              <ScrollArea className="flex-1 p-4 bg-gray-50 dark:bg-gray-900">
                {loadingMessages ? (
                  <div className="flex items-center justify-center h-full">
                    <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${message.sender === 'agent' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-xs lg:max-w-md xl:max-w-lg rounded-lg p-3 ${
                            message.sender === 'agent'
                              ? 'bg-teal-600 text-white'
                              : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white'
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap">{message.message_content}</p>
                          <div className="flex items-center gap-1 mt-1">
                            <Clock className="h-3 w-3 opacity-70" />
                            <span className="text-xs opacity-70">
                              {new Date(message.timestamp).toLocaleTimeString('pt-BR', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                            {message.sender === 'agent' && message.whatsapp_sent && (
                              <span className="text-xs opacity-70">✓✓</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </ScrollArea>

              {/* Input de Mensagem */}
              <div className="p-4 border-t bg-white dark:bg-gray-800">
                <div className="flex gap-2">
                  <Input
                    placeholder="Digite uma mensagem..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    disabled={sending}
                    className="flex-1"
                  />
                  <Button onClick={sendMessage} disabled={sending || !newMessage.trim()}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="h-16 w-16 mx-auto text-gray-300 mb-4" />
                <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Selecione uma conversa
                </h3>
                <p className="text-sm text-gray-500">
                  Escolha uma conversa da lista para começar a visualizar as mensagens
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
