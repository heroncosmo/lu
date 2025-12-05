import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { RedsisClient } from '@/integrations/redsis/client';
import type { SubFunil, Funil } from '@/integrations/redsis/types';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { 
  ArrowLeft, 
  Play, 
  Pause, 
  Users, 
  MessageSquare, 
  Search,
  Flame,
  Sun,
  Snowflake,
  Clock,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  RefreshCw,
  Loader2,
  XCircle,
  Send,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import BackToHomeButton from '@/components/BackToHomeButton';

// Instância do cliente Redsis
const redsisClient = new RedsisClient({
  baseURL: import.meta.env.VITE_REDSIS_API_URL || 'https://api.redsis.com.br',
  usuario: import.meta.env.VITE_REDSIS_USUARIO || 'REDSIS',
  senha: import.meta.env.VITE_REDSIS_SENHA || '1010',
  servidor: import.meta.env.VITE_REDSIS_SERVIDOR || '10.1.1.200',
  porta: import.meta.env.VITE_REDSIS_PORTA || '8084',
});

interface Campaign {
  id: string;
  name: string;
  product: string;
  tone: string;
  is_active: boolean;
  created_at: string;
  agent_id: string;
  whatsapp_instance_id: string;
  messages_per_week: number;
  agent_name?: string;
  instance_name?: string;
}

interface Participant {
  id: string;
  client_name: string;
  client_whatsapp: string;
  client_email: string | null;
  status: string;
  temperature: string;
  contact_count: number;
  response_count: number;
  last_contact: string | null;
  next_scheduled: string | null;
  crm_client_code: number | null;
  has_active_session: boolean;
  session_id?: string;
  message_status?: string;
  last_error?: string;
  kanban_status?: string;
}

export default function CampaignDetails() {
  const [searchParams] = useSearchParams();
  const campaignId = searchParams.get('id');
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [updatingKanban, setUpdatingKanban] = useState<string | null>(null);
  const [processingQueue, setProcessingQueue] = useState(false);
  const [kanbanSubfunis, setKanbanSubfunis] = useState<SubFunil[]>([]);
  const [kanbanFunis, setKanbanFunis] = useState<Funil[]>([]);
  const [selectedFunil, setSelectedFunil] = useState<number>(1); // Default: Comercial MI
  
  // Estado de confirmação de ações
  const [statusConfirmOpen, setStatusConfirmOpen] = useState(false);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);

  // Buscar funis e subfunis do Redsis
  useEffect(() => {
    async function loadKanbanOptions() {
      try {
        const funis = await redsisClient.getFunis();
        setKanbanFunis(funis);
        console.log('📊 Funis carregados do Redsis:', funis);

        // Carregar subfunis do primeiro funil (ou selecionado)
        if (funis.length > 0) {
          const funilId = selectedFunil || funis[0].codigo;
          const subfunis = await redsisClient.getSubFunis(funilId);
          setKanbanSubfunis(subfunis);
          console.log('📊 SubFunis carregados do Redsis:', subfunis);
        }
      } catch (error) {
        console.error('❌ Erro ao carregar opções de Kanban:', error);
      }
    }
    loadKanbanOptions();
  }, [selectedFunil]);

  useEffect(() => {
    if (campaignId) {
      loadCampaignDetails();
    } else {
      navigate('/campaigns');
    }
  }, [campaignId]);

  async function loadCampaignDetails() {
    try {
      setLoading(true);

      // Buscar campanha com agente e instância
      const { data: campaignData, error: campaignError } = await supabase
        .from('campaigns')
        .select(`
          id,
          name,
          product,
          tone,
          is_active,
          created_at,
          agent_id,
          whatsapp_instance_id,
          messages_per_week
        `)
        .eq('id', campaignId)
        .single();

      if (campaignError) throw campaignError;

      // Buscar nome do agente
      let agentName = 'N/A';
      if (campaignData.agent_id) {
        const { data: agent } = await supabase
          .from('agents')
          .select('name')
          .eq('id', campaignData.agent_id)
          .single();
        agentName = agent?.name || 'N/A';
      }

      // Buscar nome da instância
      let instanceName = 'N/A';
      if (campaignData.whatsapp_instance_id) {
        const { data: instance } = await supabase
          .from('whatsapp_instances')
          .select('name')
          .eq('id', campaignData.whatsapp_instance_id)
          .single();
        instanceName = instance?.name || 'N/A';
      }

      setCampaign({
        ...campaignData,
        agent_name: agentName,
        instance_name: instanceName
      });

      // Buscar participantes
      const { data: participantsData, error: participantsError } = await supabase
        .from('campaign_participants')
        .select(`
          id,
          client_name,
          client_whatsapp,
          client_email,
          status,
          temperature,
          contact_count,
          response_count,
          last_contact,
          next_scheduled,
          crm_client_code,
          message_status,
          last_error,
          retry_count,
          next_retry_at
        `)
        .eq('campaign_id', campaignId)
        .order('last_contact', { ascending: false, nullsFirst: false });

      if (participantsError) throw participantsError;

      // Verificar sessões ativas e status kanban para cada participante
      const participantsWithSessions = await Promise.all(
        (participantsData || []).map(async (p) => {
          // Buscar sessão ativa
          const { data: session } = await supabase
            .from('prospecting_sessions')
            .select('id')
            .eq('client_whatsapp_number', p.client_whatsapp)
            .in('status', ['started', 'active'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          // Buscar status Kanban do crm_contacts
          let kanbanStatus = undefined;
          if (p.crm_client_code) {
            const { data: crmContact } = await supabase
              .from('crm_contacts')
              .select('kanban_status')
              .eq('crm_client_code', p.crm_client_code)
              .single();
            kanbanStatus = crmContact?.kanban_status;
          }

          return {
            ...p,
            has_active_session: !!session,
            session_id: session?.id,
            kanban_status: kanbanStatus
          };
        })
      );

      setParticipants(participantsWithSessions);

    } catch (error: any) {
      toast({
        title: 'Erro ao carregar campanha',
        description: error.message,
        variant: 'destructive',
      });
      navigate('/campaigns');
    } finally {
      setLoading(false);
    }
  }

  async function toggleCampaignStatus() {
    if (!campaign) return;
    
    setIsTogglingStatus(true);
    try {
      const newStatus = !campaign.is_active;
      const { error } = await supabase
        .from('campaigns')
        .update({ is_active: newStatus })
        .eq('id', campaign.id);

      if (error) throw error;

      // Se está pausando a campanha, pausar todos os participantes ativos
      if (!newStatus) {
        const { error: participantsError } = await supabase
          .from('campaign_participants')
          .update({ 
            status: 'paused',
            metadata: {
              paused_reason: 'campaign_paused',
              paused_at: new Date().toISOString(),
            }
          })
          .eq('campaign_id', campaign.id)
          .eq('status', 'active');

        if (participantsError) {
          console.error('Erro ao pausar participantes:', participantsError);
        }

        // Atualizar lista local
        setParticipants(participants.map(p => 
          p.status === 'active' ? { ...p, status: 'paused' } : p
        ));
      } else {
        // Se está reativando, reativar os participantes que foram pausados pela campanha
        const { error: participantsError } = await supabase
          .from('campaign_participants')
          .update({ 
            status: 'active',
            next_scheduled: new Date().toISOString() // Reagendar para agora
          })
          .eq('campaign_id', campaign.id)
          .eq('status', 'paused');

        if (participantsError) {
          console.error('Erro ao reativar participantes:', participantsError);
        }

        // Atualizar lista local
        setParticipants(participants.map(p => 
          p.status === 'paused' ? { ...p, status: 'active' } : p
        ));
      }

      setCampaign({ ...campaign, is_active: newStatus });
      setStatusConfirmOpen(false);
      toast({
        title: newStatus ? 'Campanha ativada' : 'Campanha pausada',
        description: newStatus 
          ? 'Os participantes foram reativados e receberão mensagens'
          : 'Todos os participantes foram pausados',
      });
    } catch (error: any) {
      toast({
        title: 'Erro ao atualizar status',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsTogglingStatus(false);
    }
  }

  function openChat(participant: Participant) {
    // Navegar para CRM-Chat com o número do cliente
    // Se já tem sessão ativa, usa ela, senão passa o número para criar
    if (participant.session_id) {
      navigate(`/crm-chat?session=${participant.session_id}`);
    } else {
      // Navegar com parâmetros para iniciar nova conversa
      navigate(`/crm-chat?phone=${participant.client_whatsapp}&name=${encodeURIComponent(participant.client_name)}&campaign=${campaign?.id}`);
    }
  }

  async function toggleParticipantStatus(participant: Participant, e: React.MouseEvent) {
    e.stopPropagation(); // Evita abrir o chat ao clicar no botão

    try {
      const isActive = participant.status === 'active';
      const newStatus = isActive ? 'paused' : 'active';

      const updateData: any = {
        status: newStatus,
      };

      if (!isActive) {
        // Reativando - agendar para agora
        updateData.next_scheduled = new Date().toISOString();
      } else {
        // Pausando - registrar metadados
        updateData.metadata = {
          paused_reason: 'manual_pause',
          paused_at: new Date().toISOString(),
        };
      }

      const { error } = await supabase
        .from('campaign_participants')
        .update(updateData)
        .eq('id', participant.id);

      if (error) throw error;

      // Atualizar lista local
      setParticipants(participants.map(p => 
        p.id === participant.id ? { ...p, status: newStatus } : p
      ));

      toast({
        title: isActive ? 'Participante pausado' : 'Participante reativado',
        description: isActive 
          ? `${participant.client_name} não receberá mais mensagens desta campanha`
          : `${participant.client_name} voltará a receber mensagens`,
      });
    } catch (error: any) {
      toast({
        title: 'Erro ao atualizar participante',
        description: error.message,
        variant: 'destructive',
      });
    }
  }

  // Função para atualizar status do Kanban de um participante
  async function updateParticipantKanban(participant: Participant, newStatus: string | null, e: React.MouseEvent) {
    e.stopPropagation();
    
    if (!participant.crm_client_code) {
      toast({
        title: 'Contato não vinculado',
        description: 'Este participante não tem código CRM. Adicione-o primeiro ao CRM Redsis.',
        variant: 'destructive',
      });
      return;
    }

    setUpdatingKanban(participant.id);

    try {
      console.log('Atualizando Kanban:', { 
        crm_client_code: participant.crm_client_code, 
        newStatus,
        participant_id: participant.id 
      });

      // Atualizar no crm_contacts
      const { data: updateData, error, count } = await supabase
        .from('crm_contacts')
        .update({ 
          kanban_status: newStatus,
          kanban_stage_name: newStatus === 'A_TRABALHAR' ? 'A Trabalhar' : newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('crm_client_code', participant.crm_client_code)
        .select();

      console.log('Resultado do update:', { data: updateData, error, count });

      if (error) throw error;
      
      if (!updateData || updateData.length === 0) {
        throw new Error('Nenhum registro foi atualizado. Verifique se o contato existe no CRM.');
      }

      // Se removeu do A_TRABALHAR, pausar participante de campanha
      if (newStatus !== 'A_TRABALHAR') {
        await supabase
          .from('campaign_participants')
          .update({ 
            status: 'paused_kanban',
            message_status: 'skipped',
            last_error: `Movido para ${newStatus || 'Sem Kanban'} manualmente`,
          })
          .eq('crm_client_code', participant.crm_client_code)
          .eq('status', 'active');
      } else {
        // Se voltou para A_TRABALHAR, reativar participante
        await supabase
          .from('campaign_participants')
          .update({ 
            status: 'active',
            message_status: 'pending',
            last_error: null,
            next_scheduled: new Date().toISOString(),
          })
          .eq('crm_client_code', participant.crm_client_code)
          .eq('status', 'paused_kanban');
      }

      // Atualizar lista local
      setParticipants(participants.map(p => 
        p.id === participant.id 
          ? { 
              ...p, 
              kanban_status: newStatus || undefined,
              status: newStatus === 'A_TRABALHAR' ? 'active' : (p.status === 'active' ? 'paused_kanban' : p.status)
            } 
          : p
      ));

      toast({
        title: newStatus ? `Kanban: ${newStatus}` : 'Removido do Kanban',
        description: newStatus === 'A_TRABALHAR' 
          ? `${participant.client_name} pode receber prospecção`
          : `${participant.client_name} não receberá prospecção`,
      });

    } catch (error: any) {
      console.error('Erro ao atualizar Kanban:', error);
      toast({
        title: 'Erro ao atualizar Kanban',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setUpdatingKanban(null);
    }
  }

  // Função para reprocessar mensagens pendentes/falhadas
  async function processQueue() {
    if (!campaign) return;
    
    setProcessingQueue(true);
    
    try {
      toast({
        title: '🔄 Processando fila...',
        description: 'Enviando mensagens para participantes pendentes...',
      });

      const { data, error } = await supabase.functions.invoke('process-campaign-queue', {
        body: { campaign_id: campaign.id, max_batch_size: 50 },
      });

      if (error) throw error;

      console.log('Resultado do processamento:', data);

      toast({
        title: '✅ Processamento concluído!',
        description: `${data.success_count || 0} mensagens enviadas, ${data.error_count || 0} erros, ${data.remaining || 0} pendentes`,
      });

      // Recarregar dados
      await loadCampaignDetails();

    } catch (error: any) {
      console.error('Erro ao processar fila:', error);
      toast({
        title: 'Erro ao processar fila',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setProcessingQueue(false);
    }
  }

  // Badge para status de mensagem
  const getMessageStatusBadge = (status?: string, error?: string, retryCount?: number, nextRetryAt?: string) => {
    switch (status) {
      case 'sent':
        return <Badge className="bg-green-100 text-green-800"><Send className="w-3 h-3 mr-1" />Enviado</Badge>;
      case 'processing':
        return <Badge className="bg-blue-100 text-blue-800"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Enviando...</Badge>;
      case 'failed':
        return (
          <Badge className="bg-red-100 text-red-800" title={error || 'Erro desconhecido'}>
            <XCircle className="w-3 h-3 mr-1" />Falhou{retryCount && retryCount >= 3 ? ' (max)' : ''}
          </Badge>
        );
      case 'pending':
        // Se tem retry agendado, mostrar info
        if (retryCount && retryCount > 0 && nextRetryAt) {
          const retryTime = new Date(nextRetryAt);
          const now = new Date();
          const isReady = retryTime <= now;
          return (
            <Badge className={isReady ? "bg-orange-100 text-orange-800" : "bg-yellow-100 text-yellow-800"} 
                   title={`Retry ${retryCount}/3 - ${isReady ? 'Pronto' : retryTime.toLocaleTimeString()}`}>
              <Clock className="w-3 h-3 mr-1" />
              {isReady ? `Retry ${retryCount}` : `Retry ${retryCount} às ${retryTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}
            </Badge>
          );
        }
        return <Badge className="bg-gray-100 text-gray-800"><Clock className="w-3 h-3 mr-1" />Pendente</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800"><Clock className="w-3 h-3 mr-1" />Pendente</Badge>;
    }
  };

  const getTemperatureIcon = (temp: string) => {
    switch (temp) {
      case 'hot': return <Flame className="w-4 h-4 text-red-500" />;
      case 'warm': return <Sun className="w-4 h-4 text-orange-500" />;
      case 'cold': return <Snowflake className="w-4 h-4 text-blue-500" />;
      default: return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800">Ativo</Badge>;
      case 'paused':
        return <Badge className="bg-yellow-100 text-yellow-800">Pausado</Badge>;
      case 'paused_kanban':
        return <Badge className="bg-purple-100 text-purple-800">Fora de A_TRABALHAR</Badge>;
      case 'completed':
        return <Badge className="bg-blue-100 text-blue-800">Concluído</Badge>;
      case 'converted':
        return <Badge className="bg-emerald-100 text-emerald-800">Convertido</Badge>;
      case 'blocked':
        return <Badge className="bg-red-100 text-red-800">Bloqueado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const filteredParticipants = participants.filter(p => {
    const matchesSearch = p.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         p.client_whatsapp.includes(searchTerm);
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: participants.length,
    active: participants.filter(p => p.status === 'active').length,
    paused: participants.filter(p => p.status === 'paused' || p.status === 'paused_kanban').length,
    converted: participants.filter(p => p.status === 'converted').length,
    totalContacts: participants.reduce((sum, p) => sum + (p.contact_count || 0), 0),
    totalResponses: participants.reduce((sum, p) => sum + (p.response_count || 0), 0),
    pending: participants.filter(p => !p.message_status || p.message_status === 'pending').length,
    sent: participants.filter(p => p.message_status === 'sent').length,
    failed: participants.filter(p => p.message_status === 'failed').length,
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-6xl mx-auto">
          <p>Carregando campanha...</p>
        </div>
      </div>
    );
  }

  if (!campaign) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <BackToHomeButton />
        
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" onClick={() => navigate('/campaigns')}>
            <ArrowLeft className="w-5 h-5 mr-2" />
            Voltar
          </Button>
        </div>

        {/* Campaign Info Card */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-2xl">{campaign.name}</CardTitle>
                <CardDescription className="mt-2">
                  {campaign.product?.substring(0, 200) || 'Sem descrição'}
                </CardDescription>
              </div>
              <div className="flex items-center gap-4">
                <Badge className={campaign.is_active ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}>
                  {campaign.is_active ? 'Ativa' : 'Pausada'}
                </Badge>
                {/* Botão de reprocessar - só aparece se tem pendentes ou falhas */}
                {(stats.pending > 0 || stats.failed > 0) && (
                  <Button
                    variant="default"
                    onClick={processQueue}
                    disabled={processingQueue}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {processingQueue ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processando...</>
                    ) : (
                      <><RefreshCw className="w-4 h-4 mr-2" /> Processar Fila ({stats.pending + stats.failed})</>
                    )}
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => setStatusConfirmOpen(true)}
                >
                  {campaign.is_active ? (
                    <><Pause className="w-4 h-4 mr-2" /> Pausar</>
                  ) : (
                    <><Play className="w-4 h-4 mr-2" /> Ativar</>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate(`/campaign-builder?id=${campaign.id}`)}
                >
                  Editar
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Agente:</span>
                <p className="font-medium">{campaign.agent_name}</p>
              </div>
              <div>
                <span className="text-gray-500">Instância WhatsApp:</span>
                <p className="font-medium">{campaign.instance_name}</p>
              </div>
              <div>
                <span className="text-gray-500">Tom:</span>
                <p className="font-medium">{campaign.tone || 'N/A'}</p>
              </div>
              <div>
                <span className="text-gray-500">Mensagens/Semana:</span>
                <p className="font-medium">{campaign.messages_per_week || 'N/A'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
          <Card>
            <CardContent className="pt-4 text-center">
              <Users className="w-6 h-6 mx-auto mb-2 text-gray-500" />
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-gray-500">Total</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <CheckCircle className="w-6 h-6 mx-auto mb-2 text-green-500" />
              <p className="text-2xl font-bold">{stats.active}</p>
              <p className="text-xs text-gray-500">Ativos</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <AlertCircle className="w-6 h-6 mx-auto mb-2 text-yellow-500" />
              <p className="text-2xl font-bold">{stats.paused}</p>
              <p className="text-xs text-gray-500">Pausados</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <Flame className="w-6 h-6 mx-auto mb-2 text-emerald-500" />
              <p className="text-2xl font-bold">{stats.converted}</p>
              <p className="text-xs text-gray-500">Convertidos</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <MessageSquare className="w-6 h-6 mx-auto mb-2 text-blue-500" />
              <p className="text-2xl font-bold">{stats.totalContacts}</p>
              <p className="text-xs text-gray-500">Contatos</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <MessageSquare className="w-6 h-6 mx-auto mb-2 text-purple-500" />
              <p className="text-2xl font-bold">{stats.totalResponses}</p>
              <p className="text-xs text-gray-500">Respostas</p>
            </CardContent>
          </Card>
        </div>

        {/* Participants List */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Participantes</CardTitle>
              <div className="flex gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="Buscar por nome ou telefone..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 w-64"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="border rounded px-3 py-2 text-sm"
                >
                  <option value="all">Todos</option>
                  <option value="active">Ativos</option>
                  <option value="paused">Pausados</option>
                  <option value="paused_kanban">Fora Kanban</option>
                  <option value="converted">Convertidos</option>
                  <option value="blocked">Bloqueados</option>
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredParticipants.length === 0 ? (
              <p className="text-center text-gray-500 py-8">
                {participants.length === 0 
                  ? 'Nenhum participante nesta campanha' 
                  : 'Nenhum participante encontrado com os filtros aplicados'}
              </p>
            ) : (
              <div className="space-y-2">
                {filteredParticipants.map((participant) => (
                  <div
                    key={participant.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => openChat(participant)}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                        {participant.client_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{participant.client_name}</p>
                          {getTemperatureIcon(participant.temperature)}
                          {participant.has_active_session && (
                            <Badge variant="outline" className="text-xs">
                              <MessageSquare className="w-3 h-3 mr-1" />
                              Chat Ativo
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">{participant.client_whatsapp}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      {/* Seletor de Status Kanban - Subfunis do Redsis */}
                      <div onClick={(e) => e.stopPropagation()}>
                        <Select
                          value={participant.kanban_status || 'none'}
                          onValueChange={(value) => updateParticipantKanban(participant, value === 'none' ? null : value, { stopPropagation: () => {} } as React.MouseEvent)}
                          disabled={updatingKanban === participant.id || !participant.crm_client_code}
                        >
                          <SelectTrigger className="w-[160px] h-8 text-xs">
                            <SelectValue>
                              {participant.kanban_status || 'Kanban'}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">
                              <span className="text-gray-400">Sem Kanban</span>
                            </SelectItem>
                            {kanbanSubfunis.map((subfunil) => (
                              <SelectItem key={subfunil.codigo} value={subfunil.descricao}>
                                <span style={{ color: subfunil.cor || '#6b7280' }}>
                                  {subfunil.descricao}
                                </span>
                              </SelectItem>
                            ))}
                            {kanbanSubfunis.length === 0 && (
                              <SelectItem value="loading" disabled>
                                <span className="text-gray-400">Carregando...</span>
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      {/* Status de envio da mensagem */}
                      {getMessageStatusBadge(
                        participant.message_status, 
                        participant.last_error, 
                        (participant as any).retry_count, 
                        (participant as any).next_retry_at
                      )}
                      <div className="text-center">
                        <p className="text-sm font-medium">{participant.contact_count || 0}</p>
                        <p className="text-xs text-gray-500">Contatos</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-medium">{participant.response_count || 0}</p>
                        <p className="text-xs text-gray-500">Respostas</p>
                      </div>
                      {participant.last_contact && (
                        <div className="text-center">
                          <p className="text-sm font-medium flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(participant.last_contact).toLocaleDateString('pt-BR')}
                          </p>
                          <p className="text-xs text-gray-500">Último contato</p>
                        </div>
                      )}
                      {getStatusBadge(participant.status)}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => toggleParticipantStatus(participant, e)}
                        className="ml-2"
                        title={participant.status === 'active' ? 'Pausar participante' : 'Reativar participante'}
                      >
                        {participant.status === 'active' ? (
                          <Pause className="w-4 h-4 text-yellow-600" />
                        ) : (
                          <Play className="w-4 h-4 text-green-600" />
                        )}
                      </Button>
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog de Confirmação de Status da Campanha */}
      <ConfirmDialog
        open={statusConfirmOpen}
        onOpenChange={setStatusConfirmOpen}
        title={campaign?.is_active ? '⏸️ Pausar Campanha?' : '▶️ Ativar Campanha?'}
        description={campaign?.is_active 
          ? `Tem certeza que deseja PAUSAR a campanha "${campaign?.name}"?\n\n• Todos os ${stats.active} participantes ativos serão pausados\n• Nenhuma nova mensagem será enviada\n• A fila de processamento será interrompida\n• Você pode reativar a qualquer momento`
          : `Tem certeza que deseja ATIVAR a campanha "${campaign?.name}"?\n\n• Todos os participantes pausados serão reativados\n• O agente de IA começará a enviar mensagens\n• A fila de processamento será iniciada\n• As mensagens serão enviadas imediatamente`
        }
        confirmText={campaign?.is_active ? 'Sim, Pausar Campanha' : 'Sim, Ativar Campanha'}
        cancelText="Cancelar"
        variant={campaign?.is_active ? 'warning' : 'default'}
        onConfirm={toggleCampaignStatus}
        isLoading={isTogglingStatus}
      />
    </div>
  );
}
