import React, { useState, useEffect } from 'react';
import { format, formatDistanceToNow, isPast, isToday, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar, Clock, User, Phone, X, Check, AlertCircle, RefreshCw, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ScheduledContact {
  id: string;
  session_id: string;
  client_name: string;
  client_whatsapp_number: string;
  scheduled_for: string;
  status: 'pending' | 'executed' | 'cancelled' | 'failed';
  reason: string | null;
  context: string | null;
  executed_at: string | null;
  error_message: string | null;
  created_at: string;
}

export default function ScheduledContacts() {
  const [scheduledContacts, setScheduledContacts] = useState<ScheduledContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentDate, setCurrentDate] = useState(new Date());

  const fetchScheduledContacts = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('scheduled_contacts')
        .select('*')
        .order('scheduled_for', { ascending: true });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setScheduledContacts(data || []);
    } catch (error: any) {
      console.error('Erro ao buscar agendamentos:', error);
      toast.error('Erro ao carregar agendamentos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScheduledContacts();

    // Realtime subscription
    const channel = supabase
      .channel('scheduled_contacts_changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'scheduled_contacts' },
        () => {
          fetchScheduledContacts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [statusFilter]);

  const cancelScheduledContact = async (id: string) => {
    try {
      const { error } = await supabase
        .from('scheduled_contacts')
        .update({ 
          status: 'cancelled', 
          cancelled_at: new Date().toISOString(),
          cancellation_reason: 'Cancelado manualmente pelo usuário'
        })
        .eq('id', id);

      if (error) throw error;
      toast.success('Agendamento cancelado');
      fetchScheduledContacts();
    } catch (error: any) {
      toast.error('Erro ao cancelar: ' + error.message);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      executed: 'bg-green-100 text-green-800 border-green-300',
      cancelled: 'bg-gray-100 text-gray-800 border-gray-300',
      failed: 'bg-red-100 text-red-800 border-red-300',
    };
    const labels = {
      pending: '🟡 Pendente',
      executed: '🟢 Executado',
      cancelled: '⚫ Cancelado',
      failed: '🔴 Falhou',
    };
    return (
      <Badge className={styles[status as keyof typeof styles] || styles.pending}>
        {labels[status as keyof typeof labels] || status}
      </Badge>
    );
  };

  const stats = {
    total: scheduledContacts.length,
    pending: scheduledContacts.filter(c => c.status === 'pending').length,
    executed: scheduledContacts.filter(c => c.status === 'executed').length,
    failed: scheduledContacts.filter(c => c.status === 'failed').length,
  };

  // Agrupar por data
  const groupedByDate = scheduledContacts.reduce((acc, contact) => {
    const date = format(new Date(contact.scheduled_for), 'yyyy-MM-dd');
    if (!acc[date]) acc[date] = [];
    acc[date].push(contact);
    return acc;
  }, {} as Record<string, ScheduledContact[]>);

  const sortedDates = Object.keys(groupedByDate).sort();

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="w-6 h-6 text-primary" />
            Calendário de Agendamentos
          </h1>
          <p className="text-muted-foreground">
            Contatos agendados pela IA para retorno automático
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Filtrar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pending">Pendentes</SelectItem>
              <SelectItem value="executed">Executados</SelectItem>
              <SelectItem value="failed">Falhas</SelectItem>
              <SelectItem value="cancelled">Cancelados</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={fetchScheduledContacts}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-muted-foreground text-sm">Total</p>
          </CardContent>
        </Card>
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-yellow-700">{stats.pending}</div>
            <p className="text-yellow-600 text-sm">Pendentes</p>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-700">{stats.executed}</div>
            <p className="text-green-600 text-sm">Executados</p>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-700">{stats.failed}</div>
            <p className="text-red-600 text-sm">Falhas</p>
          </CardContent>
        </Card>
      </div>

      {/* Timeline/List View */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : scheduledContacts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Nenhum agendamento encontrado</h3>
            <p className="text-muted-foreground">
              Quando um cliente pedir para ser contatado depois, aparecerá aqui
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {sortedDates.map(dateStr => {
            const date = new Date(dateStr + 'T00:00:00');
            const contacts = groupedByDate[dateStr];
            const isDateToday = isToday(date);
            const isDatePast = isPast(date) && !isDateToday;

            return (
              <div key={dateStr}>
                <div className={`flex items-center gap-2 mb-3 ${isDateToday ? 'text-primary font-bold' : isDatePast ? 'text-muted-foreground' : ''}`}>
                  <Calendar className="w-4 h-4" />
                  <span>
                    {isDateToday ? 'Hoje - ' : ''}
                    {format(date, "EEEE, d 'de' MMMM", { locale: ptBR })}
                  </span>
                  <Badge variant="outline">{contacts.length} agendamento{contacts.length > 1 ? 's' : ''}</Badge>
                </div>

                <div className="grid gap-3 ml-6">
                  {contacts.map(contact => (
                    <Card key={contact.id} className={`
                      ${contact.status === 'pending' && isPast(new Date(contact.scheduled_for)) ? 'border-orange-300 bg-orange-50' : ''}
                      ${contact.status === 'executed' ? 'border-green-200' : ''}
                      ${contact.status === 'failed' ? 'border-red-200' : ''}
                    `}>
                      <CardContent className="py-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4 text-muted-foreground" />
                                <span className="font-medium">
                                  {format(new Date(contact.scheduled_for), 'HH:mm')}
                                </span>
                              </div>
                              {getStatusBadge(contact.status)}
                              {contact.status === 'pending' && isPast(new Date(contact.scheduled_for)) && (
                                <Badge variant="destructive" className="animate-pulse">
                                  <AlertCircle className="w-3 h-3 mr-1" />
                                  Atrasado
                                </Badge>
                              )}
                            </div>

                            <div className="flex items-center gap-4 text-sm">
                              <div className="flex items-center gap-1">
                                <User className="w-4 h-4 text-muted-foreground" />
                                <span className="font-medium">{contact.client_name}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Phone className="w-4 h-4 text-muted-foreground" />
                                <span>{contact.client_whatsapp_number}</span>
                              </div>
                            </div>

                            {contact.reason && (
                              <p className="text-sm text-muted-foreground mt-2">
                                <strong>Motivo:</strong> {contact.reason}
                              </p>
                            )}

                            {contact.error_message && (
                              <p className="text-sm text-red-600 mt-2">
                                <strong>Erro:</strong> {contact.error_message}
                              </p>
                            )}

                            <p className="text-xs text-muted-foreground mt-2">
                              Agendado: {formatDistanceToNow(new Date(contact.created_at), { addSuffix: true, locale: ptBR })}
                            </p>
                          </div>

                          {contact.status === 'pending' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => cancelScheduledContact(contact.id)}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
