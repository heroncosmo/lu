import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Lock, Unlock, AlertCircle, Clock, TrendingUp, User, RefreshCw } from 'lucide-react';
import BackToHomeButton from '@/components/BackToHomeButton';

// Helper para chamar a Edge Function redsis-proxy
async function callRedsisProxy(action: string, params: any = {}) {
  const { data, error } = await supabase.functions.invoke('redsis-proxy', {
    body: { action, params },
  });
  if (error) throw new Error(error.message);
  if (!data.success) throw new Error(data.error || 'Erro desconhecido');
  return data.data;
}

interface KanbanColumn {
  id: string;
  codigo: number; // Código numérico do subfunil
  nome: string;
  ordem: number;
  cor: string;
}

interface KanbanCard {
  codigo: number;
  nome: string;
  cliente_nome: string;
  codigo_subfunil: number; // Código numérico para matching
  sub_funil: string;
  data_criacao: string;
  data_prazo?: string;
  temperature?: 'cold' | 'warm' | 'hot';
  owner_locked?: boolean;
  owner_name?: string;
  urgency_score?: number;
  vendor_name?: string;
  owner_locked_by?: string;
}

interface IAParticipant {
  id: string;
  atividade_codigo: number | null;
  participant_id: string;
  client_name?: string | null;
}

interface LeadStateLock {
  atividade_codigo: number | null;
  owner_lock: boolean;
  owner_id: string | null;
  temperature?: 'cold' | 'warm' | 'hot';
}

export default function KanbanBoard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedFunil, setSelectedFunil] = useState<number>(1);

  // Buscar funis disponíveis via proxy
  const { data: funis, isLoading: funisLoading, error: funisError } = useQuery({
    queryKey: ['funis'],
    queryFn: () => callRedsisProxy('getFunis'),
  });

  const {
    data: iaParticipants,
    isLoading: iaParticipantsLoading,
    error: iaParticipantsError,
  } = useQuery({
    queryKey: ['ia-kanban-participants'],
    queryFn: async () => {
      // Query lead_states to get IA-managed activities (those with atividade_codigo)
      // and join with campaign_participants to get client names
      const { data, error } = await supabase
        .from('lead_states')
        .select(`
          id,
          atividade_codigo,
          participant_id,
          campaign_participants!inner (
            client_name
          )
        `)
        .not('atividade_codigo', 'is', null)
        .limit(2000);

      if (error) {
        throw error;
      }

      // Transform to IAParticipant shape
      return (data || []).map((item: any) => ({
        id: item.id,
        atividade_codigo: item.atividade_codigo,
        participant_id: item.participant_id,
        client_name: item.campaign_participants?.client_name,
      })) as IAParticipant[];
    },
  });

  const { data: leadLocks } = useQuery({
    queryKey: ['lead-state-locks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_states')
        .select('atividade_codigo, owner_lock, owner_id, temperature')
        .not('atividade_codigo', 'is', null)
        .limit(2000);

      if (error) {
        throw error;
      }

      return data as LeadStateLock[];
    },
  });

  const iaParticipantMap = useMemo(() => {
    const map = new Map<number, IAParticipant>();
    (iaParticipants || []).forEach((participant) => {
      if (participant.atividade_codigo) {
        map.set(participant.atividade_codigo, participant);
      }
    });
    return map;
  }, [iaParticipants]);

  const iaActivityKey = useMemo(() => {
    return Array.from(iaParticipantMap.keys()).sort((a, b) => a - b).join('-');
  }, [iaParticipantMap]);

  const leadLockMap = useMemo(() => {
    const map = new Map<number, LeadStateLock>();
    (leadLocks || []).forEach((lock) => {
      if (lock.atividade_codigo) {
        map.set(lock.atividade_codigo, lock);
      }
    });
    return map;
  }, [leadLocks]);

  // Buscar colunas do funil selecionado via proxy
  const { data: columns, isLoading: columnsLoading } = useQuery({
    queryKey: ['subfunis', selectedFunil],
    queryFn: async () => {
      const subfunis = await callRedsisProxy('getSubFunis', { codigoFunil: selectedFunil });
      return subfunis.map((sf: any, index: number) => ({
        id: sf.codigo.toString(), // Usar código como ID
        codigo: sf.codigo, // Manter código numérico para matching
        nome: sf.descricao,
        ordem: index,
        cor: sf.cor || '#gray',
      }));
    },
    enabled: !!selectedFunil,
  });

  // Calcular urgência - DEFINIDO ANTES PARA PODER USAR NO QUERYFUNCTION
  const calculateUrgency = (dataPrazo: string): number => {
    const prazo = new Date(dataPrazo);
    const hoursUntil = (prazo.getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursUntil < 0) return 100;
    if (hoursUntil < 12) return 95;
    if (hoursUntil < 24) return 85;
    if (hoursUntil < 48) return 70;
    return 30;
  };

  // Buscar atividades (cards) via proxy
  const { data: activities, isLoading: activitiesLoading } = useQuery({
    queryKey: ['atividades', selectedFunil, iaActivityKey],
    queryFn: async () => {
      if (iaParticipantMap.size === 0) {
        return [];
      }

      const atividades = await callRedsisProxy('getAtividades', {
        funil: selectedFunil,
      });

      const filtered = atividades.filter((atv) =>
        iaParticipantMap.has(atv.codigo)
      );

      const enriched = filtered.map((atv) => {
        const participant = iaParticipantMap.get(atv.codigo);
        const lockInfo = leadLockMap.get(atv.codigo);
        const temperature = lockInfo?.temperature && ['cold', 'warm', 'hot'].includes(lockInfo.temperature)
          ? lockInfo.temperature
          : 'cold';

        return {
          codigo: atv.codigo,
          nome: atv.nome || atv.observacao || 'Atividade',
          cliente_nome:
            participant?.cliente_nome ||
            participant?.name ||
            atv.cliente_nome ||
            atv.cliente ||
            'Cliente',
          codigo_subfunil: atv.codigo_subfunil,
          sub_funil: atv.sub_funil || atv.codigo_subfunil?.toString(),
          data_criacao: atv.data_criacao,
          data_prazo: atv.data_prazo,
          temperature,
          owner_locked: lockInfo?.owner_lock ?? false,
          owner_locked_by: lockInfo?.owner_id ? 'Operação manual' : undefined,
          owner_name: lockInfo?.owner_id ? 'Operação manual' : undefined,
          vendor_name: atv.vendedor,
          urgency_score: atv.data_prazo
            ? calculateUrgency(atv.data_prazo)
            : 0,
        };
      });

      return enriched;
    },
    enabled: !!selectedFunil && !iaParticipantsLoading,
    refetchInterval: 30000, // Atualizar a cada 30s
  });

  useEffect(() => {
    if (iaParticipantsError) {
      toast({
        title: 'Erro ao carregar leads IA',
        description: iaParticipantsError.message,
        variant: 'destructive',
      });
    }
  }, [iaParticipantsError, toast]);

  useEffect(() => {
    if (funisError) {
      toast({
        title: 'Erro ao carregar funis',
        description: funisError instanceof Error ? funisError.message : 'Falha na conexão com Redsis',
        variant: 'destructive',
      });
    }
  }, [funisError, toast]);

  // Assumir/Devolver lead
  const lockMutation = useMutation({
    mutationFn: async ({
      atividadeCodigo,
      clienteNome,
      action,
    }: {
      atividadeCodigo: number;
      clienteNome: string;
      action: 'assume' | 'release';
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autenticado');

      // Buscar ou criar lead_state para esta atividade do Redsis
      let leadState;
      const { data: existingLeadState, error: fetchError } = await supabase
        .from('lead_states')
        .select('id')
        .eq('atividade_codigo', atividadeCodigo)
        .single();
      leadState = existingLeadState;

      // Se não existe, criar o lead_state
      if (fetchError || !leadState) {
        const { data: newLeadState, error: createError } = await supabase
          .from('lead_states')
          .insert({
            atividade_codigo: atividadeCodigo,
            client_name: clienteNome,
            current_state: 'new',
            temperature: 'cold',
          })
          .select('id')
          .single();

        if (createError) {
          console.error('Erro ao criar lead_state:', createError);
          throw new Error('Erro ao criar registro de lead');
        }
        leadState = newLeadState;
      }

      if (!leadState?.id) {
        throw new Error('N?o foi poss?vel obter o ID do lead');
      }

      const leadStateId = leadState.id;

      if (action === 'assume') {
        const result = await supabase.rpc('assume_lead', {
          p_lead_state_id: leadStateId,
          p_user_id: user.id,
          p_reason: 'Assumido pelo Kanban',
        });
        return { leadStateId, result };
      } else {
        const result = await supabase.rpc('release_lead', {
          p_lead_state_id: leadStateId,
          p_user_id: user.id,
          p_reason: 'Devolvido pelo Kanban',
        });
        return { leadStateId, result };
      }
    },
    onSuccess: async (data, vars) => {
      const leadStateId = (data as any)?.leadStateId;
      toast({
        title: vars.action === 'assume' ? 'Lead assumido' : 'Lead devolvido',
        description: vars.action === 'assume'
          ? 'IA pausada. Voce e o responsavel.'
          : 'Lead devolvido para IA.',
      });
      queryClient.invalidateQueries({ queryKey: ['atividades'] });

      // Sync owner lock to Redsis CRM
      try {
        await supabase.functions.invoke('sync-owner-lock', {
          body: {
            direction: 'from_supabase_to_redsis',
            lead_state_id: leadStateId,
            atividade_codigo: vars.atividadeCodigo,
          },
        });
        console.log('Owner lock synced to Redsis');
      } catch (syncError) {
        console.error('Owner lock sync failed (non-blocking):', syncError);
      }
    },
    onError: (error) => {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Agrupar cards por coluna usando código numérico
  const cardsByColumn = columns?.reduce((acc, col) => {
    acc[col.id] =
      activities
        ?.filter((a) => a.codigo_subfunil === col.codigo)
        .map((a) => ({
          ...a,
          temperature:
            a.temperature === 'hot' || a.temperature === 'warm' || a.temperature === 'cold'
              ? a.temperature
              : ('cold' as const),
        })) || [];
    return acc;
  }, {} as Record<string, KanbanCard[]>);

  const getTemperatureColor = (temp: string) => {
    switch (temp) {
      case 'hot': return 'bg-red-500';
      case 'warm': return 'bg-yellow-500';
      default: return 'bg-blue-500';
    }
  };

  const getTemperatureLabel = (temp: string) => {
    switch (temp) {
      case 'hot': return '🔥 Quente';
      case 'warm': return '☀️ Morno';
      default: return '❄️ Frio';
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Kanban de Prospecção</h1>
            <p className="text-muted-foreground">Pipeline visual de leads</p>
          </div>
          <BackToHomeButton />
        </div>

        {/* Seletor de Funil */}
        <Card>
          <CardHeader>
            <CardTitle>Funil Ativo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              {funis?.map((funil) => (
                <Button
                  key={funil.codigo}
                  variant={selectedFunil === funil.codigo ? 'default' : 'outline'}
                  onClick={() => setSelectedFunil(funil.codigo)}
                >
                  {funil.nome || funil.descricao}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Board Kanban */}
        {columnsLoading || activitiesLoading || iaParticipantsLoading ? (
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-96" />
            ))}
          </div>
        ) : activities && activities.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Nenhum lead IA sincronizado para o funil selecionado. Cadastre participantes ou vincule atividades no Redsis para vê-los aqui.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-4 gap-4">
            {columns?.map((column) => (
              <Card key={column.id} className="flex flex-col h-[calc(100vh-320px)]">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center justify-between">
                    <span>{column.nome}</span>
                    <Badge variant="secondary">
                      {cardsByColumn?.[column.id]?.length || 0}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 p-3">
                  <ScrollArea className="h-full">
                    <div className="space-y-2">
                      {cardsByColumn?.[column.id]?.map((card) => (
                        <Card
                          key={card.codigo}
                          className="p-3 cursor-pointer hover:shadow-md transition-shadow"
                        >
                          <div className="space-y-2">
                            <div className="flex items-start justify-between">
                              <h4 className="font-medium text-sm">{card.cliente_nome}</h4>
                              <Badge
                                variant="secondary"
                                className={getTemperatureColor(card.temperature || 'cold')}
                              >
                                {getTemperatureLabel(card.temperature || 'cold')}
                              </Badge>
                            </div>

                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {card.nome}
                            </p>

                            {card.data_prazo && (
                              <div className="flex items-center gap-1 text-xs">
                                <Clock className="h-3 w-3" />
                                <span>
                                  {new Date(card.data_prazo).toLocaleDateString('pt-BR')}
                                </span>
                                {card.urgency_score! >= 85 && (
                                  <AlertCircle className="h-3 w-3 text-red-500 ml-1" />
                                )}
                              </div>
                            )}

                            {card.vendor_name && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <User className="h-3 w-3" />
                                {card.vendor_name}
                              </div>
                            )}

                            {card.owner_locked && (
                              <Badge variant="outline" className="text-xs">
                                <Lock className="h-3 w-3 mr-1" />
                                {card.owner_locked_by || 'Bloqueado'}
                              </Badge>
                            )}

                            <div className="flex gap-1 pt-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 h-7 text-xs"
                                onClick={() =>
                                  lockMutation.mutate({
                                    atividadeCodigo: card.codigo,
                                    clienteNome: card.cliente_nome,
                                    action: card.owner_locked ? 'release' : 'assume',
                                  })
                                }
                              >
                                {card.owner_locked ? (
                                  <>
                                    <Unlock className="h-3 w-3 mr-1" />
                                    Devolver
                                  </>
                                ) : (
                                  <>
                                    <Lock className="h-3 w-3 mr-1" />
                                    Assumir
                                  </>
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2"
                                onClick={() => window.open(`/prospecting?session=${card.codigo}`, '_blank')}
                              >
                                <TrendingUp className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
