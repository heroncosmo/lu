import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { getRedsisClient } from '@/integrations/redsis/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { HelpCircle } from 'lucide-react';
import BackToHomeButton from '@/components/BackToHomeButton';

type ManualContact = {
  id: string;
  name?: string;
  phone: string;
};

type CRMContact = {
  id: string;
  crm_client_code?: number;
  name: string;
  trade_name?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  city?: string;
  state?: string;
  temperature?: string;
  kanban_status?: string;
  owner_name?: string;
};

type CRMContactList = {
  id: string;
  name: string;
  description?: string;
  type: string;
  total_contacts?: number;
};

export default function CampaignBuilder() {
  const [searchParams] = useSearchParams();
  const campaignId = searchParams.get('id');
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    product: '',
    tone: 'consultivo',
    priority_channel: 'whatsapp',
    fallback_channels: ['email'],
    messages_per_week: 3,
    min_interval_hours: 24,
    cold_days: 5,
    warm_days: 3,
    quiet_hours: { start: '20:00', end: '08:00' },
    agent_id: '',
    whatsapp_instance_id: '',
    is_active: true,
    contact_selection_mode: 'manual' as 'manual' | 'list' | 'mixed',
    default_contact_list_id: '',
    contact_filters: {},
  });

  const [agents, setAgents] = useState<any[]>([]);
  const [instances, setInstances] = useState<any[]>([]);
  const [contactLists, setContactLists] = useState<CRMContactList[]>([]);
  const [contacts, setContacts] = useState<CRMContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsSearch, setContactsSearch] = useState('');
  const contactsSearchInitialized = useRef(false);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [manualContacts, setManualContacts] = useState<ManualContact[]>([]);
  const [manualDraft, setManualDraft] = useState({ name: '', phone: '' });

  const navigate = useNavigate();
  const { toast } = useToast();

  const normalizeFilters = (filters: any) =>
    filters && typeof filters === 'object' ? filters : {};

  async function loadContactLists() {
    try {
      const { data, error } = await supabase
        .from('crm_contact_lists')
        .select('id, name, description, type, total_contacts')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      if (data) setContactLists(data as CRMContactList[]);
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar listas',
        description: error.message,
        variant: 'destructive',
      });
    }
  }

  async function loadContacts(searchTerm = '') {
    try {
      setContactsLoading(true);
      
      // Buscar contatos do banco de dados Supabase
      let query = supabase
        .from('crm_contacts')
        .select('*')
        .order('name', { ascending: true });
      
      // Aplicar filtro de busca se fornecido
      if (searchTerm.trim()) {
        query = query.ilike('name', `%${searchTerm}%`);
      }
      
      const { data, error } = await query.limit(100);
      
      if (error) {
        console.error('Erro ao carregar contatos:', error);
        throw error;
      }
      
      // Mapear para o formato CRMContact
      const mappedContacts: CRMContact[] = (data || []).map((contact) => ({
        id: contact.id,
        crm_client_code: contact.crm_client_code,
        name: contact.name || '',
        trade_name: contact.trade_name,
        phone: contact.phone,
        whatsapp: contact.whatsapp,
        email: contact.email,
        city: contact.city,
        state: contact.state,
        temperature: contact.temperature,
        kanban_status: contact.kanban_status,
        owner_name: contact.owner_name,
      }));

      setContacts(mappedContacts);
      
      // Se não houver contatos no banco, buscar da API Redsis e salvar
      if (mappedContacts.length === 0 && !searchTerm) {
        console.log('📥 Nenhum contato no banco. Buscando da API Redsis...');
        await syncContactsFromRedsis();
      }
    } catch (error: any) {
      console.error('Erro ao carregar contatos:', error);
      toast({
        title: 'Erro ao carregar contatos',
        description: error.message || 'Não foi possível buscar os contatos',
        variant: 'destructive',
      });
    } finally {
      setContactsLoading(false);
    }
  }
  
  // Nova função para sincronizar contatos da API Redsis
  async function syncContactsFromRedsis() {
    try {
      const redsisClient = getRedsisClient();
      
      // Buscar clientes da API Redsis
      const clientes = await redsisClient.getClientes({
        situacao: 'Ativo',
        limit: 500,
      });

      console.log(`📦 ${clientes.length} clientes recebidos da API Redsis`);

      // Salvar no banco de dados
      const contactsToInsert = clientes.map((cliente) => ({
        crm_client_code: cliente.codigo,
        name: cliente.nome || '',
        trade_name: cliente.fantasia,
        phone: cliente.telefone,
        whatsapp: cliente.celular || cliente.whatsapp,
        email: cliente.email,
        owner_name: cliente.vendedor,
      }));

      const { error } = await supabase
        .from('crm_contacts')
        .upsert(contactsToInsert, { onConflict: 'crm_client_code', ignoreDuplicates: false });

      if (error) throw error;
      
      console.log('✅ Contatos sincronizados com sucesso!');
      toast({
        title: 'Contatos sincronizados',
        description: `${clientes.length} contatos importados da API Redsis`,
      });
      
      // Recarregar a lista
      await loadContacts();
    } catch (error: any) {
      console.error('Erro ao sincronizar contatos:', error);
      toast({
        title: 'Erro na sincronização',
        description: error.message || 'Não foi possível sincronizar contatos da API Redsis',
        variant: 'destructive',
      });
    }
  }

  useEffect(() => {
    loadAgentsAndInstances();
    loadContactLists();
    loadContacts();
    if (campaignId) {
      loadCampaign();
    }
  }, [campaignId]);

  useEffect(() => {
    if (!contactsSearchInitialized.current) {
      contactsSearchInitialized.current = true;
      return;
    }

    const handle = setTimeout(() => {
      loadContacts(contactsSearch);
    }, 400);

    return () => clearTimeout(handle);
  }, [contactsSearch]);

  async function loadAgentsAndInstances() {
    try {
      const { data: agentsData } = await supabase
        .from('agents')
        .select('id, name')
        .eq('is_active', true);
      
      const { data: instancesData } = await supabase
        .from('whatsapp_instances')
        .select('id, name, phone_number')
        .eq('is_active', true);

      if (agentsData) setAgents(agentsData);
      if (instancesData) setInstances(instancesData);
    } catch (error) {
      console.error('Erro ao carregar agents/instances:', error);
    }
  }

  async function loadCampaign() {
    try {
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .eq('id', campaignId)
        .single();

      if (error) throw error;
      if (data) {
        const filters = normalizeFilters(data.contact_filters);
        setFormData((prev) => ({
          ...prev,
          name: data.name || '',
          product: data.product || '',
          tone: data.tone || 'consultivo',
          priority_channel: data.priority_channel || 'whatsapp',
          fallback_channels: data.fallback_channels || ['email'],
          messages_per_week: data.messages_per_week || 3,
          min_interval_hours: data.min_interval_hours || 24,
          cold_days: data.cold_days || 5,
          warm_days: data.warm_days || 3,
          quiet_hours: data.quiet_hours || { start: '20:00', end: '08:00' },
          agent_id: data.agent_id || '',
          whatsapp_instance_id: data.whatsapp_instance_id || '',
          is_active: data.is_active ?? true,
          contact_selection_mode: data.contact_selection_mode || 'manual',
          default_contact_list_id: data.default_contact_list_id || '',
          contact_filters: filters,
        }));
        setSelectedContactIds(filters.selected_contact_ids || []);
        setManualContacts(
          (filters.manual_contacts as ManualContact[] | undefined)?.map(
            (contact, index) => ({
              id: contact.id || `${contact.phone}-${index}`,
              name: contact.name,
              phone: contact.phone,
            })
          ) || []
        );
      }
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar campanha',
        description: error.message,
        variant: 'destructive',
      });
    }
  }

  // Função para criar participantes a partir de uma lista de contatos
  async function createParticipantsFromList(
    campaignId: string,
    listId: string
  ) {
    try {
      console.log('🎯 createParticipantsFromList iniciado:', { campaignId, listId });
      
      // Primeiro buscar os contact_ids da lista
      const { data: listItems, error: listError } = await supabase
        .from('crm_contact_list_items')
        .select('contact_id')
        .eq('list_id', listId);

      console.log('📋 listItems result:', { listItems, listError });

      if (listError) throw listError;

      if (!listItems || listItems.length === 0) {
        toast({
          title: 'Lista vazia',
          description:
            'A lista selecionada não possui contatos. Adicione participantes manualmente.',
          variant: 'destructive',
        });
        return;
      }

      // Agora buscar os contatos completos
      const contactIds = listItems.map(item => item.contact_id);
      console.log('📞 contactIds:', contactIds);
      
      const { data: contacts, error: contactsError } = await supabase
        .from('crm_contacts')
        .select('id, name, phone, whatsapp, email, crm_client_code, kanban_status, temperature')
        .in('id', contactIds);

      console.log('👥 contacts result:', { contacts, contactsError });

      if (contactsError) throw contactsError;

      if (!contacts || contacts.length === 0) {
        toast({
          title: 'Erro',
          description:
            'Não foi possível carregar os contatos da lista.',
          variant: 'destructive',
        });
        return;
      }

      // Filtrar apenas contatos em A_TRABALHAR (regra: só pode entrar na campanha se estiver A_TRABALHAR)
      const validContacts = contacts.filter((c: any) => 
        c.kanban_status === 'A_TRABALHAR' || !c.kanban_status
      );
      const skippedCount = contacts.length - validContacts.length;

      if (validContacts.length === 0) {
        toast({
          title: 'Nenhum contato válido',
          description: `Todos os ${contacts.length} contato(s) precisam estar em "A_TRABALHAR" no Kanban para entrar na campanha.`,
          variant: 'destructive',
        });
        return;
      }

      // Criar participantes para cada contato válido
      const participants = validContacts.map((contact: any) => ({
        campaign_id: campaignId,
        client_whatsapp: contact.whatsapp || contact.phone || '',
        client_email: contact.email || null,
        client_name: contact.name || null,
        crm_client_code: contact.crm_client_code || null,
        crm_contact_id: contact.id,
        timezone: 'America/Sao_Paulo',
        language: 'pt',
        temperature: contact.temperature || 'cold',
        status: 'active',
        next_scheduled: new Date().toISOString(), // Agendar para envio imediato
      }));

      console.log('🎯 participants to insert:', participants);

      if (participants.length > 0) {
        const { error: insertError } = await supabase
          .from('campaign_participants')
          .insert(participants);

        console.log('✅ insert result:', { insertError });

        if (insertError) throw insertError;

        // Mudar status dos contatos para PROSPECAO (regra: ao entrar na campanha vai para prospectando)
        const contactIdsToUpdate = validContacts.map((c: any) => c.id);
        await supabase
          .from('crm_contacts')
          .update({ 
            kanban_status: 'PROSPECAO',
            kanban_stage_name: 'Prospecção',
            kanban_stage_code: 2, // Código do subfunil de prospecção
            updated_at: new Date().toISOString(),
          })
          .in('id', contactIdsToUpdate);

        const message = skippedCount > 0 
          ? `${participants.length} contato(s) adicionados. ${skippedCount} ignorado(s) por não estarem em A_TRABALHAR.`
          : `${participants.length} contato(s) da lista foram adicionados à campanha.`;

        toast({
          title: 'Participantes adicionados',
          description: message,
        });
      }
    } catch (error: any) {
      console.error('❌ Erro ao criar participantes da lista:', error);
      toast({
        title: 'Erro ao adicionar participantes',
        description: error.message,
        variant: 'destructive',
      });
    }
  }

  // Função para criar participantes a partir de contatos manuais ou selecionados
  async function createParticipantsFromManual(
    campaignId: string,
    manualList: ManualContact[],
    selectedIds: string[]
  ) {
    try {
      const participantsToInsert: any[] = [];
      const contactIdsToUpdateKanban: string[] = [];

      // Adicionar contatos manuais (sem vínculo CRM - estes não têm validação de Kanban)
      for (const manual of manualList) {
        participantsToInsert.push({
          campaign_id: campaignId,
          client_whatsapp: manual.phone,
          client_name: manual.name || null,
          timezone: 'America/Sao_Paulo',
          language: 'pt',
          temperature: 'cold',
          status: 'active',
          kanban_status: 'A_TRABALHAR',
          next_scheduled: new Date().toISOString(),
        });
      }

      // Adicionar contatos selecionados do CRM
      if (selectedIds.length > 0) {
        const { data: crmContacts, error: crmError } = await supabase
          .from('crm_contacts')
          .select('id, name, phone, whatsapp, email, crm_client_code, kanban_status, temperature')
          .in('id', selectedIds);

        if (crmError) throw crmError;

        // Filtrar apenas contatos em A_TRABALHAR (regra: só pode entrar na campanha se estiver A_TRABALHAR)
        const validContacts = (crmContacts || []).filter((c: any) => 
          c.kanban_status === 'A_TRABALHAR' || !c.kanban_status
        );
        const skippedCount = (crmContacts?.length || 0) - validContacts.length;

        if (skippedCount > 0) {
          toast({
            title: 'Alguns contatos ignorados',
            description: `${skippedCount} contato(s) não estão em "A_TRABALHAR" e foram ignorados.`,
            variant: 'default',
          });
        }

        for (const contact of validContacts) {
          // Nota: Cliente já existe em A_TRABALHAR no Redsis. 
          // A atividade/atividade_codigo será sincronizada quando a campanha iniciar
          // e mover para PROSPECAO via process-campaign-queue

          participantsToInsert.push({
            campaign_id: campaignId,
            client_whatsapp: contact.whatsapp || contact.phone || '',
            client_email: contact.email || null,
            client_name: contact.name || null,
            crm_client_code: contact.crm_client_code || null,
            crm_contact_id: contact.id,
            atividade_codigo: null, // Será preenchido quando mover para PROSPECAO
            kanban_status: 'A_TRABALHAR',
            timezone: 'America/Sao_Paulo',
            language: 'pt',
            temperature: contact.temperature || 'cold',
            status: 'active',
            next_scheduled: new Date().toISOString(),
          });
          contactIdsToUpdateKanban.push(contact.id);
        }
      }

      if (participantsToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from('campaign_participants')
          .insert(participantsToInsert);

        if (insertError) throw insertError;

        // Mudar status dos contatos CRM para PROSPECAO (regra: ao entrar na campanha vai para prospectando)
        if (contactIdsToUpdateKanban.length > 0) {
          await supabase
            .from('crm_contacts')
            .update({ 
              kanban_status: 'PROSPECAO',
              kanban_stage_name: 'Prospecção',
              kanban_stage_code: 2,
              updated_at: new Date().toISOString(),
            })
            .in('id', contactIdsToUpdateKanban);
        }

        toast({
          title: 'Participantes adicionados',
          description: `${participantsToInsert.length} participante(s) foram adicionados à campanha.`,
        });
      }
    } catch (error: any) {
      console.error('Erro ao criar participantes manuais:', error);
      toast({
        title: 'Erro ao adicionar participantes',
        description: error.message,
        variant: 'destructive',
      });
    }
  }

  // Função para disparar o processamento assíncrono da campanha
  // O processamento real é feito em background pela Edge Function process-campaign-queue
  async function triggerCampaignProcessing(campaignId: string) {
    try {
      console.log('🚀 Disparando processamento assíncrono da campanha:', campaignId);
      
      // Chamar a Edge Function que processa em background
      // Isso retorna imediatamente enquanto o processamento continua
      const { data, error } = await supabase.functions.invoke('process-campaign-queue', {
        body: { campaign_id: campaignId, max_batch_size: 50 },
      });

      if (error) {
        console.error('❌ Erro ao disparar processamento:', error);
        // Não lançamos erro aqui - a campanha já foi criada
        // O processamento pode ser retriggered depois
        return { success: false, error: error.message };
      }

      console.log('✅ Processamento iniciado:', data);
      return { success: true, data };

    } catch (error: any) {
      console.error('❌ Erro ao disparar processamento:', error);
      return { success: false, error: error.message };
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        navigate('/login');
        return;
      }

      if (
        formData.contact_selection_mode === 'list' &&
        !formData.default_contact_list_id
      ) {
        toast({
          title: 'Selecione uma lista',
          description: 'Escolha a lista de contatos padrão para a campanha.',
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }

      const contactFiltersPayload = {
        ...formData.contact_filters,
        selected_contact_ids: selectedContactIds,
        manual_contacts: manualContacts,
      };

      const payloadBase = {
        ...formData,
        default_contact_list_id:
          formData.contact_selection_mode === 'manual'
            ? null
            : formData.default_contact_list_id || null,
        contact_filters: contactFiltersPayload,
      };

      if (campaignId) {
        // Update existing campaign
        const { error } = await supabase
          .from('campaigns')
          .update({
            ...payloadBase,
            updated_at: new Date().toISOString(),
          })
          .eq('id', campaignId);

        if (error) throw error;

        toast({
          title: 'Campanha atualizada',
          description: 'Suas alterações foram salvas',
        });
      } else {
        // Create new campaign
        const { data: newCampaign, error } = await supabase
          .from('campaigns')
          .insert({
            ...payloadBase,
            user_id: session.session.user.id,
          })
          .select('id')
          .single();

        if (error) throw error;

        // Criar participantes automaticamente se uma lista foi selecionada
        if (
          formData.contact_selection_mode === 'list' &&
          formData.default_contact_list_id &&
          newCampaign?.id
        ) {
          await createParticipantsFromList(
            newCampaign.id,
            formData.default_contact_list_id
          );
        }

        // Criar participantes para modo manual/mixed
        if (
          (formData.contact_selection_mode === 'manual' ||
            formData.contact_selection_mode === 'mixed') &&
          newCampaign?.id
        ) {
          await createParticipantsFromManual(
            newCampaign.id,
            manualContacts,
            selectedContactIds
          );
        }

        // Se a campanha está ativa, disparar processamento assíncrono
        // A campanha é salva imediatamente e o processamento roda em background
        if (formData.is_active && newCampaign?.id) {
          // Dispara o processamento e navega imediatamente (não bloqueia)
          triggerCampaignProcessing(newCampaign.id);
          
          toast({
            title: '🚀 Campanha criada!',
            description: 'As mensagens estão sendo enviadas em segundo plano. Você pode acompanhar na página da campanha.',
          });
        } else {
          toast({
            title: 'Campanha criada',
            description: 'Campanha salva. Ative-a para iniciar o envio de mensagens.',
          });
        }
      }

      navigate('/campaigns');
    } catch (error: any) {
      toast({
        title: 'Erro ao salvar campanha',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  const resolveManualId = () =>
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `manual-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const toggleContactSelection = (contactId: string, isChecked: boolean) => {
    setSelectedContactIds((prev) =>
      isChecked ? [...prev, contactId] : prev.filter((id) => id !== contactId)
    );
  };

  const handleAddManualContact = () => {
    if (!manualDraft.phone.trim()) {
      toast({
        title: 'Informe o telefone',
        description: 'Adicione pelo menos o número de WhatsApp.',
        variant: 'destructive',
      });
      return;
    }

    setManualContacts((prev) => [
      ...prev,
      {
        id: resolveManualId(),
        name: manualDraft.name.trim() || undefined,
        phone: manualDraft.phone.trim(),
      },
    ]);
    setManualDraft({ name: '', phone: '' });
  };

  const handleRemoveManualContact = (id: string) => {
    setManualContacts((prev) => prev.filter((contact) => contact.id !== id));
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <BackToHomeButton />

        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          {campaignId ? 'Editar Campanha' : 'Nova Campanha'}
        </h1>
        <p className="text-gray-600 mb-8">
          Configure os parâmetros da sua campanha de prospecção
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle>Informações Básicas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="name">Nome da Campanha *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  required
                  placeholder="Ex: Lançamento Patagonia Granite Q4"
                />
              </div>

              <div>
                <Label htmlFor="agent_id">Agente IA *</Label>
                <Select
                  value={formData.agent_id}
                  onValueChange={(value) =>
                    setFormData({ ...formData, agent_id: value })
                  }
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um agente" />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="whatsapp_instance_id">Instância WhatsApp *</Label>
                <Select
                  value={formData.whatsapp_instance_id}
                  onValueChange={(value) =>
                    setFormData({ ...formData, whatsapp_instance_id: value })
                  }
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma instância" />
                  </SelectTrigger>
                  <SelectContent>
                    {instances.map((instance) => (
                      <SelectItem key={instance.id} value={instance.id}>
                        {instance.name} ({instance.phone_number})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Audience & Contacts */}
          <Card>
            <CardHeader>
              <CardTitle>Contatos & Audiência</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <Label htmlFor="contact_selection_mode">Modo de seleção</Label>
                <Select
                  value={formData.contact_selection_mode}
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      contact_selection_mode: value as 'manual' | 'list' | 'mixed',
                      default_contact_list_id:
                        value === 'manual' ? '' : formData.default_contact_list_id,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a origem dos contatos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">
                      Selecionar contatos e números manualmente
                    </SelectItem>
                    <SelectItem value="list">Usar uma lista do CRM</SelectItem>
                    <SelectItem value="mixed">Lista + complementos</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Defina se a campanha usará uma lista sincronizada do CRM ou se você
                  escolherá contatos específicos/números avulsos.
                </p>
              </div>

              {formData.contact_selection_mode !== 'manual' && (
                <div className="space-y-2">
                  <Label>Lista padrão do CRM</Label>
                  <Select
                    value={formData.default_contact_list_id || ''}
                    onValueChange={(value) =>
                      setFormData({
                        ...formData,
                        default_contact_list_id: value,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma lista sincronizada" />
                    </SelectTrigger>
                    <SelectContent>
                      {contactLists.map((list) => (
                        <SelectItem key={list.id} value={list.id}>
                          {list.name} ({list.total_contacts || 0} contatos)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!contactLists.length && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Nenhuma lista sincronizada disponível no momento.
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    As listas são atualizadas automaticamente pelo sincronizador.
                  </p>
                </div>
              )}

              {(formData.contact_selection_mode === 'manual' ||
                formData.contact_selection_mode === 'mixed') && (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label>Selecionar contatos do CRM</Label>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => loadContacts(contactsSearch)}
                          disabled={contactsLoading}
                        >
                          {contactsLoading ? 'Carregando...' : 'Atualizar lista'}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={syncContactsFromRedsis}
                          disabled={contactsLoading}
                        >
                          {contactsLoading ? 'Sincronizando...' : 'Sincronizar da API'}
                        </Button>
                      </div>
                    </div>
                    <Input
                      placeholder="Buscar por nome, empresa ou telefone"
                      value={contactsSearch}
                      onChange={(e) => setContactsSearch(e.target.value)}
                    />
                    <ScrollArea className="h-56 border rounded-md mt-3">
                      <div className="divide-y">
                        {contacts.map((contact) => {
                          const checked = selectedContactIds.includes(contact.id);
                          return (
                            <label
                              key={contact.id}
                              className="flex items-start gap-3 p-3 cursor-pointer"
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(value) =>
                                  toggleContactSelection(contact.id, value === true)
                                }
                              />
                              <div className="text-sm">
                                <p className="font-medium">
                                  {contact.name}{' '}
                                  {contact.trade_name && (
                                    <span className="text-muted-foreground">
                                      · {contact.trade_name}
                                    </span>
                                  )}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {contact.whatsapp || contact.phone || 'Sem telefone'}
                                  {contact.email ? ` · ${contact.email}` : ''}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {contact.kanban_status || 'Sem status'} ·{' '}
                                  {contact.owner_name || 'Sem responsável'} ·{' '}
                                  {contact.city ? `${contact.city}/${contact.state || ''}` : 'Local não informado'}
                                </p>
                              </div>
                            </label>
                          );
                        })}
                        {!contacts.length && (
                          <p className="text-xs text-muted-foreground p-4">
                            Nenhum contato encontrado para os filtros atuais.
                          </p>
                        )}
                      </div>
                    </ScrollArea>
                    <p className="text-xs text-muted-foreground mt-2">
                      {selectedContactIds.length} contato(s) selecionado(s) do CRM.
                    </p>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label>Adicionar números avulsos</Label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Input
                        placeholder="Nome opcional"
                        value={manualDraft.name}
                        onChange={(e) =>
                          setManualDraft({ ...manualDraft, name: e.target.value })
                        }
                      />
                      <div className="flex gap-2">
                        <Input
                          placeholder="WhatsApp ex: +55 11 98888-7777"
                          value={manualDraft.phone}
                          onChange={(e) =>
                            setManualDraft({ ...manualDraft, phone: e.target.value })
                          }
                        />
                        <Button type="button" onClick={handleAddManualContact}>
                          Adicionar
                        </Button>
                      </div>
                    </div>
                    {!!manualContacts.length && (
                      <div className="border rounded-md divide-y mt-2">
                        {manualContacts.map((contact) => (
                          <div
                            key={contact.id}
                            className="flex items-center justify-between p-3 text-sm"
                          >
                            <div>
                              <p className="font-medium">{contact.name || 'Sem nome'}</p>
                              <p className="text-xs text-muted-foreground">{contact.phone}</p>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveManualContact(contact.id)}
                            >
                              Remover
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {manualContacts.length} número(s) avulso(s) adicionados.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Cadence Rules */}
          <Card>
            <CardHeader>
              <CardTitle>Regras de Cadência</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Label htmlFor="messages_per_week">Mensagens/Semana</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-4 w-4 text-gray-400 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>Número máximo de mensagens que o sistema enviará por semana para cada contato. Evita sobrecarga e mantém a comunicação equilibrada.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input
                    id="messages_per_week"
                    type="number"
                    min="1"
                    max="10"
                    value={formData.messages_per_week}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        messages_per_week: parseInt(e.target.value),
                      })
                    }
                  />
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Label htmlFor="min_interval_hours">Intervalo Mínimo (h)</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-4 w-4 text-gray-400 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>Tempo mínimo em horas entre mensagens consecutivas. Garante um intervalo respeitoso entre contatos.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input
                    id="min_interval_hours"
                    type="number"
                    min="1"
                    max="72"
                    value={formData.min_interval_hours}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        min_interval_hours: parseInt(e.target.value),
                      })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Label htmlFor="cold_days">Intervalo Lead Frio (dias)</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-4 w-4 text-gray-400 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>Dias de espera entre mensagens para leads frios (baixo engajamento). Geralmente mais espaçado para dar tempo ao contato refletir.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input
                    id="cold_days"
                    type="number"
                    min="1"
                    max="30"
                    value={formData.cold_days}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        cold_days: parseInt(e.target.value),
                      })
                    }
                  />
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Label htmlFor="warm_days">Intervalo Lead Quente (dias)</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-4 w-4 text-gray-400 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>Dias de espera entre mensagens para leads quentes (alto engajamento). Interval menores mantém o interesse ativo.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input
                    id="warm_days"
                    type="number"
                    min="1"
                    max="7"
                    value={formData.warm_days}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        warm_days: parseInt(e.target.value),
                      })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Label htmlFor="quiet_hours_start">Horário Silencioso Início</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-4 w-4 text-gray-400 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>Hora em que o sistema para de enviar mensagens. Ex: 20:00 evita incomodar contatos à noite.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input
                    id="quiet_hours_start"
                    type="time"
                    value={formData.quiet_hours.start}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        quiet_hours: { ...formData.quiet_hours, start: e.target.value },
                      })
                    }
                  />
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Label htmlFor="quiet_hours_end">Horário Silencioso Fim</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-4 w-4 text-gray-400 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>Hora em que o sistema volta a enviar mensagens. Ex: 08:00 garante que mensagens sejam enviadas apenas em horário comercial.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input
                    id="quiet_hours_end"
                    type="time"
                    value={formData.quiet_hours.end}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        quiet_hours: { ...formData.quiet_hours, end: e.target.value },
                      })
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Channel Config */}
          <Card>
            <CardHeader>
              <CardTitle>Configuração de Canais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="priority_channel">Canal Prioritário</Label>
                <Select
                  value={formData.priority_channel}
                  onValueChange={(value) =>
                    setFormData({ ...formData, priority_channel: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Canais de Fallback</Label>
                <div className="space-y-2 mt-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="fallback_email"
                      checked={formData.fallback_channels.includes('email')}
                      onCheckedChange={(checked) => {
                        const channels = checked
                          ? [...formData.fallback_channels, 'email']
                          : formData.fallback_channels.filter((c) => c !== 'email');
                        setFormData({ ...formData, fallback_channels: channels });
                      }}
                    />
                    <Label htmlFor="fallback_email" className="cursor-pointer">
                      Email
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="fallback_sms"
                      checked={formData.fallback_channels.includes('sms')}
                      onCheckedChange={(checked) => {
                        const channels = checked
                          ? [...formData.fallback_channels, 'sms']
                          : formData.fallback_channels.filter((c) => c !== 'sms');
                        setFormData({ ...formData, fallback_channels: channels });
                      }}
                    />
                    <Label htmlFor="fallback_sms" className="cursor-pointer">
                      SMS
                    </Label>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex gap-4">
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? 'Salvando...' : campaignId ? 'Atualizar' : 'Criar Campanha'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/campaigns')}
            >
              Cancelar
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
