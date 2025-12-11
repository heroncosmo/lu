import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Calendar, Clock, User, Phone, FileText, CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import { format, formatDistanceToNow, isPast } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ScheduledContact {
  id: string;
  session_id: string;
  client_name: string;
  client_whatsapp_number: string;
  scheduled_for: string;
  requested_at: string;
  status: 'pending' | 'executed' | 'cancelled' | 'failed';
  reason: string | null;
  context: string | null;
  executed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  error_message: string | null;
  created_at: string;
}

interface ScheduledContactsCalendarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ScheduledContactsCalendar: React.FC<ScheduledContactsCalendarProps> = ({ open, onOpenChange }) => {
  const [contacts, setContacts] = useState<ScheduledContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'executed' | 'failed'>('all');

  useEffect(() => {
    if (open) {
      fetchScheduledContacts();
      
      // Configurar realtime para atualizações
      const channel = supabase
        .channel('scheduled-contacts-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'scheduled_contacts'
          },
          () => {
            console.log('Agendamento atualizado, recarregando...');
            fetchScheduledContacts();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [open]);

  const fetchScheduledContacts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('scheduled_contacts')
        .select('*')
        .order('scheduled_for', { ascending: false })
        .limit(100);

      if (error) {
        toast.error('Erro ao carregar agendamentos: ' + error.message);
      } else {
        setContacts(data || []);
      }
    } catch (err) {
      toast.error('Erro ao carregar agendamentos');
    } finally {
      setLoading(false);
    }
  };

  const cancelScheduledContact = async (contactId: string) => {
    try {
      const { error } = await supabase
        .from('scheduled_contacts')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancellation_reason: 'Cancelado manualmente pelo usuário'
        })
        .eq('id', contactId);

      if (error) {
        toast.error('Erro ao cancelar agendamento: ' + error.message);
      } else {
        toast.success('Agendamento cancelado com sucesso');
        fetchScheduledContacts();
      }
    } catch (err) {
      toast.error('Erro ao cancelar agendamento');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200"><Clock className="w-3 h-3 mr-1" />Pendente</Badge>;
      case 'executed':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200"><CheckCircle className="w-3 h-3 mr-1" />Executado</Badge>;
      case 'cancelled':
        return <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200"><XCircle className="w-3 h-3 mr-1" />Cancelado</Badge>;
      case 'failed':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200"><AlertCircle className="w-3 h-3 mr-1" />Falhou</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTimingStatus = (scheduledFor: string, status: string) => {
    const scheduledDate = new Date(scheduledFor);
    
    if (status !== 'pending') {
      return null;
    }

    if (isPast(scheduledDate)) {
      return (
        <span className="text-red-600 font-semibold text-sm">
          ⚠️ Atrasado - {formatDistanceToNow(scheduledDate, { locale: ptBR, addSuffix: true })}
        </span>
      );
    }

    return (
      <span className="text-blue-600 text-sm">
        📅 Agendado para {formatDistanceToNow(scheduledDate, { locale: ptBR, addSuffix: true })}
      </span>
    );
  };

  const filteredContacts = contacts.filter(contact => {
    if (filter === 'all') return true;
    return contact.status === filter;
  });

  const pendingCount = contacts.filter(c => c.status === 'pending').length;
  const executedCount = contacts.filter(c => c.status === 'executed').length;
  const failedCount = contacts.filter(c => c.status === 'failed').length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Calendário de Contatos Agendados
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Estatísticas */}
          <div className="grid grid-cols-4 gap-3">
            <Card className="cursor-pointer hover:bg-gray-50" onClick={() => setFilter('all')}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600">Total</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{contacts.length}</div>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:bg-yellow-50" onClick={() => setFilter('pending')}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-yellow-700">Pendentes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">{pendingCount}</div>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:bg-green-50" onClick={() => setFilter('executed')}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-green-700">Executados</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{executedCount}</div>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:bg-red-50" onClick={() => setFilter('failed')}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-red-700">Falhas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{failedCount}</div>
              </CardContent>
            </Card>
          </div>

          {/* Filtro ativo */}
          {filter !== 'all' && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Filtro ativo:</span>
              <Badge variant="outline">{filter === 'pending' ? 'Pendentes' : filter === 'executed' ? 'Executados' : 'Falhas'}</Badge>
              <Button variant="ghost" size="sm" onClick={() => setFilter('all')}>Limpar filtro</Button>
            </div>
          )}

          {/* Lista de agendamentos */}
          <ScrollArea className="h-[500px]">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                <span className="ml-2 text-gray-600">Carregando agendamentos...</span>
              </div>
            ) : filteredContacts.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>Nenhum agendamento {filter !== 'all' ? `com status "${filter}"` : 'encontrado'}</p>
              </div>
            ) : (
              <div className="space-y-3 pr-4">
                {filteredContacts.map((contact) => (
                  <Card key={contact.id} className={`${contact.status === 'pending' && isPast(new Date(contact.scheduled_for)) ? 'border-red-300 bg-red-50' : ''}`}>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 space-y-2">
                          {/* Cabeçalho */}
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-gray-500" />
                            <span className="font-semibold text-lg">{contact.client_name}</span>
                            {getStatusBadge(contact.status)}
                          </div>

                          {/* Telefone */}
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Phone className="w-3 h-3" />
                            {contact.client_whatsapp_number}
                          </div>

                          {/* Data/hora agendada */}
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-sm font-medium">
                              <Clock className="w-4 h-4" />
                              {format(new Date(contact.scheduled_for), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </div>
                            {getTimingStatus(contact.scheduled_for, contact.status)}
                          </div>

                          {/* Motivo */}
                          {contact.reason && (
                            <div className="flex items-start gap-2 text-sm">
                              <FileText className="w-3 h-3 mt-1 text-gray-400" />
                              <span className="text-gray-700">{contact.reason}</span>
                            </div>
                          )}

                          {/* Contexto */}
                          {contact.context && (
                            <details className="text-sm">
                              <summary className="cursor-pointer text-blue-600 hover:text-blue-800">
                                Ver contexto da conversa
                              </summary>
                              <div className="mt-2 p-3 bg-gray-50 rounded text-xs whitespace-pre-wrap">
                                {contact.context}
                              </div>
                            </details>
                          )}

                          {/* Info de execução */}
                          {contact.executed_at && (
                            <div className="text-xs text-gray-500">
                              Executado em: {format(new Date(contact.executed_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </div>
                          )}

                          {/* Erro */}
                          {contact.error_message && (
                            <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
                              ❌ Erro: {contact.error_message}
                            </div>
                          )}

                          {/* Cancelamento */}
                          {contact.cancelled_at && (
                            <div className="text-xs text-gray-500">
                              Cancelado em: {format(new Date(contact.cancelled_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                              {contact.cancellation_reason && ` - ${contact.cancellation_reason}`}
                            </div>
                          )}
                        </div>

                        {/* Ações */}
                        {contact.status === 'pending' && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => cancelScheduledContact(contact.id)}
                          >
                            <XCircle className="w-4 h-4 mr-1" />
                            Cancelar
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Rodapé */}
          <div className="flex justify-between items-center pt-3 border-t">
            <p className="text-sm text-gray-500">
              Mostrando {filteredContacts.length} de {contacts.length} agendamentos
            </p>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
