import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { RedsisClient } from '@/integrations/redsis/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Upload, Users, Trash2, Download, UserPlus } from 'lucide-react';
import BackToHomeButton from '@/components/BackToHomeButton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Participant {
  id: string;
  client_whatsapp: string;
  client_email?: string;
  client_name?: string;
  crm_client_code?: number;
  timezone: string;
  language: string;
  contact_count: number;
  response_count: number;
  last_contact?: string;
  temperature: string;
  status: string;
  created_at: string;
  name?: string;
  phone?: string;
  email?: string;
  messages_sent_count?: number;
  last_message_at?: string;
  redsis_cliente_codigo?: number;
}

export default function ParticipantManagement() {
  const { campaignId } = useParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState<{ open: boolean; participant: Participant | null }>({
    open: false, participant: null
  });

  const redsisClient = new RedsisClient({
    baseURL: import.meta.env.VITE_REDSIS_API_URL || 'https://api.redsis.com.br',
    usuario: import.meta.env.VITE_REDSIS_USUARIO || 'REDSIS',
    senha: import.meta.env.VITE_REDSIS_SENHA || '1010',
    servidor: import.meta.env.VITE_REDSIS_SERVIDOR || '10.1.1.200',
    porta: import.meta.env.VITE_REDSIS_PORTA || '8084',
    empresa: import.meta.env.VITE_REDSIS_EMPRESA
      ? Number(import.meta.env.VITE_REDSIS_EMPRESA)
      : undefined,
  });

  // Form state
  const [newParticipant, setNewParticipant] = useState({
    phone: '',
    email: '',
    name: '',
    redsis_codigo: '',
    timezone: 'America/Sao_Paulo',
  });

  // Buscar campanha
  const { data: campaign } = useQuery({
    queryKey: ['campaign', campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .eq('id', campaignId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!campaignId,
  });

  // Buscar participantes
  const { data: participants, isLoading } = useQuery({
    queryKey: ['participants', campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('campaign_participants')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Participant[];
    },
    enabled: !!campaignId,
  });

  // Adicionar participante
  const addMutation = useMutation({
    mutationFn: async (participant: typeof newParticipant) => {
      let atividade_codigo: number | null = null;
      
      // Se tem código do cliente Redsis e campanha tem funil, criar atividade no Redsis
      if (participant.redsis_codigo && campaign?.funil_codigo) {
        try {
          const atividadeResult = await redsisClient.createAtividade(
            campaign.funil_codigo,
            {
              codigo_cliente: parseInt(participant.redsis_codigo),
              observacao: `Campanha: ${campaign.name || 'Prospecção IA'}`,
            }
          );
          atividade_codigo = atividadeResult.codigo;
          console.log('✅ Atividade criada no Redsis:', atividade_codigo);
        } catch (error) {
          console.error('❌ Erro ao criar atividade no Redsis:', error);
          // Continua sem atividade - será criada depois manualmente
        }
      }

      const { error } = await supabase.from('campaign_participants').insert({
        campaign_id: campaignId,
        client_whatsapp: participant.phone,
        client_email: participant.email || null,
        client_name: participant.name || null,
        crm_client_code: participant.redsis_codigo
          ? parseInt(participant.redsis_codigo)
          : null,
        atividade_codigo: atividade_codigo,
        kanban_status: 'A_TRABALHAR',
        timezone: participant.timezone,
        language: 'pt',
        temperature: 'cold',
        status: 'active',
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: 'Participante adicionado',
        description: 'O lead foi adicionado à campanha.',
      });
      setShowAddDialog(false);
      setNewParticipant({
        phone: '',
        email: '',
        name: '',
        redsis_codigo: '',
        timezone: 'America/Sao_Paulo',
      });
      queryClient.invalidateQueries({ queryKey: ['participants'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Remover participante
  const removeMutation = useMutation({
    mutationFn: async (participantId: string) => {
      const { error } = await supabase
        .from('campaign_participants')
        .delete()
        .eq('id', participantId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: 'Participante removido',
        description: 'O lead foi removido da campanha.',
      });
      queryClient.invalidateQueries({ queryKey: ['participants'] });
    },
  });

  // Importar do CRM Redsis
  const importFromCRMMutation = useMutation({
    mutationFn: async (filters: { funil?: number; subfunil?: number }) => {
      const atividades = await redsisClient.getAtividades(filters);
      
      const participants = await Promise.all(
        atividades.map(async (atv) => {
          const cliente = await redsisClient.getCliente(atv.codigo_cliente);
          const contatos = await redsisClient.getContatos(atv.codigo_cliente);
          
          return {
            campaign_id: campaignId,
            client_whatsapp: contatos[0]?.telefone || '',
            client_email: contatos[0]?.email || null,
            client_name: cliente.nome,
            crm_client_code: cliente.codigo,
            timezone: 'America/Sao_Paulo',
            language: 'pt',
            temperature: 'cold',
            status: 'active',
          };
        })
      );

      const { error } = await supabase
        .from('campaign_participants')
        .upsert(participants, { onConflict: 'phone,campaign_id' });

      if (error) throw error;
      return participants.length;
    },
    onSuccess: (count) => {
      toast({
        title: 'Importação concluída',
        description: `${count} participantes importados do CRM.`,
      });
      setShowImportDialog(false);
      queryClient.invalidateQueries({ queryKey: ['participants'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro na importação',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Importar CSV
  const handleCSVImport = async () => {
    if (!importFile) return;

    const text = await importFile.text();
    const lines = text.split('\n').slice(1); // Pular header
    const participants = lines
      .filter((line) => line.trim())
      .map((line) => {
        const [phone, email, name, redsis_codigo] = line.split(',');
        return {
          campaign_id: campaignId,
          client_whatsapp: phone.trim(),
          client_email: email?.trim() || null,
          client_name: name?.trim() || null,
          crm_client_code: redsis_codigo ? parseInt(redsis_codigo.trim()) : null,
          timezone: 'America/Sao_Paulo',
          language: 'pt',
          temperature: 'cold',
          status: 'active',
        };
      });

    const { error } = await supabase
      .from('campaign_participants')
      .upsert(participants, { onConflict: 'phone,campaign_id' });

    if (error) {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Importação concluída',
      description: `${participants.length} participantes importados.`,
    });
    setShowImportDialog(false);
    setImportFile(null);
    queryClient.invalidateQueries({ queryKey: ['participants'] });
  };

  // Exportar para CSV
  const handleCSVExport = () => {
    if (!participants || participants.length === 0) return;

    const csv = [
      ['Telefone', 'Email', 'Nome', 'Código CRM', 'Mensagens Enviadas', 'Última Mensagem', 'Status'].join(','),
      ...participants.map((p) =>
        [
          p.client_whatsapp,
          p.client_email || '',
          p.client_name || '',
          p.crm_client_code || '',
          p.contact_count,
          p.last_contact ? new Date(p.last_contact).toLocaleDateString('pt-BR') : '',
          p.temperature,
          p.status,
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `participantes-${campaign?.name || 'campanha'}.csv`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Gestão de Participantes</h1>
            <p className="text-muted-foreground">
              {campaign?.name || 'Campanha'}
            </p>
          </div>
          <BackToHomeButton />
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Participantes ({participants?.length || 0})
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleCSVExport}>
                  <Download className="h-4 w-4 mr-2" />
                  Exportar CSV
                </Button>
                <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <Upload className="h-4 w-4 mr-2" />
                      Importar
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Importar Participantes</DialogTitle>
                      <DialogDescription>
                        Escolha uma fonte para importar leads
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label>Do CRM Redsis</Label>
                        <Button
                          className="w-full mt-2"
                          onClick={() => importFromCRMMutation.mutate({})}
                          disabled={importFromCRMMutation.isPending}
                        >
                          Importar do Funil Ativo
                        </Button>
                      </div>
                      <div>
                        <Label>Arquivo CSV</Label>
                        <Input
                          type="file"
                          accept=".csv"
                          onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                          className="mt-2"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Formato: telefone,email,nome,codigo_crm
                        </p>
                        <Button
                          className="w-full mt-2"
                          onClick={handleCSVImport}
                          disabled={!importFile}
                        >
                          Importar CSV
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
                <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                  <DialogTrigger asChild>
                    <Button>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Adicionar
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Adicionar Participante</DialogTitle>
                      <DialogDescription>
                        Adicione um novo lead à campanha manualmente
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="phone">Telefone *</Label>
                        <Input
                          id="phone"
                          value={newParticipant.phone}
                          onChange={(e) =>
                            setNewParticipant({ ...newParticipant, phone: e.target.value })
                          }
                          placeholder="+55 11 99999-9999"
                        />
                      </div>
                      <div>
                        <Label htmlFor="name">Nome</Label>
                        <Input
                          id="name"
                          value={newParticipant.name}
                          onChange={(e) =>
                            setNewParticipant({ ...newParticipant, name: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          value={newParticipant.email}
                          onChange={(e) =>
                            setNewParticipant({ ...newParticipant, email: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor="redsis">Código CRM</Label>
                        <Input
                          id="redsis"
                          value={newParticipant.redsis_codigo}
                          onChange={(e) =>
                            setNewParticipant({ ...newParticipant, redsis_codigo: e.target.value })
                          }
                          placeholder="Código do cliente no Redsis"
                        />
                      </div>
                      <div>
                        <Label htmlFor="timezone">Fuso Horário</Label>
                        <Select
                          value={newParticipant.timezone}
                          onValueChange={(value) =>
                            setNewParticipant({ ...newParticipant, timezone: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="America/Sao_Paulo">São Paulo (GMT-3)</SelectItem>
                            <SelectItem value="America/Manaus">Manaus (GMT-4)</SelectItem>
                            <SelectItem value="America/Rio_Branco">Rio Branco (GMT-5)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                        Cancelar
                      </Button>
                      <Button
                        onClick={() => addMutation.mutate(newParticipant)}
                        disabled={!newParticipant.phone || addMutation.isPending}
                      >
                        Adicionar
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px]">
              <div className="space-y-2">
                {isLoading ? (
                  <p className="text-sm text-muted-foreground">Carregando...</p>
                ) : participants && participants.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum participante ainda. Importe ou adicione manualmente.
                  </p>
                ) : (
                  participants?.map((participant) => (
                    <Card key={participant.id} className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{participant.name || participant.phone}</p>
                            <Badge variant={participant.status === 'active' ? 'default' : 'secondary'}>
                              {participant.status}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            📱 {participant.phone}
                            {participant.email && ` • ✉️ ${participant.email}`}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {participant.messages_sent_count} mensagens enviadas
                            {participant.last_message_at &&
                              ` • Última: ${new Date(participant.last_message_at).toLocaleDateString('pt-BR')}`}
                          </p>
                          {participant.redsis_cliente_codigo && (
                            <p className="text-xs text-muted-foreground">
                              CRM: #{participant.redsis_cliente_codigo}
                            </p>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setRemoveConfirm({ open: true, participant })}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Dialog de Confirmação de Remoção */}
      <ConfirmDialog
        open={removeConfirm.open}
        onOpenChange={(open) => setRemoveConfirm({ ...removeConfirm, open })}
        title="Remover Participante?"
        description={`Tem certeza que deseja remover "${removeConfirm.participant?.name || removeConfirm.participant?.phone}" da campanha?\n\nEsta ação é IRREVERSÍVEL e você:\n• Perderá o histórico de mensagens deste participante\n• O lead não receberá mais mensagens desta campanha\n• Terá que adicioná-lo novamente se quiser incluí-lo`}
        confirmText="Sim, Remover"
        cancelText="Cancelar"
        variant="danger"
        onConfirm={() => {
          if (removeConfirm.participant) {
            removeMutation.mutate(removeConfirm.participant.id);
            setRemoveConfirm({ open: false, participant: null });
          }
        }}
        isLoading={removeMutation.isPending}
      />
    </div>
  );
}
