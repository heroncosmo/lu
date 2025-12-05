import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { ThumbsUp, ThumbsDown, AlertTriangle, Ban } from 'lucide-react';
import BackToHomeButton from '@/components/BackToHomeButton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Message {
  id: string;
  content: string;
  is_from_user?: boolean;
  created_at: string;
  participant_id?: string;
  feedback?: 'positive' | 'negative';
}

export default function FeedbackAndBlocklist() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [blockReason, setBlockReason] = useState('');
  const [showBlockDialog, setShowBlockDialog] = useState(false);

  // Buscar mensagens recentes
  const { data: messages, isLoading: messagesLoading } = useQuery({
    queryKey: ['messages-feedback'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('id, message_content, sender, timestamp')
        .eq('sender', 'agent') // Apenas mensagens da IA
        .order('timestamp', { ascending: false })
        .limit(50);

      if (error) throw error;

      // Fetch feedback for each message (RLS já filtra por user através de session_id)
      const messagesWithFeedback = await Promise.all(
        (data || []).map(async (msg) => {
          const { data: feedbackData } = await supabase
            .from('message_feedback')
            .select('feedback_type')
            .eq('message_id', msg.id)
            .maybeSingle();
          
          const feedback = feedbackData?.feedback_type === 'approved' ? 'positive' as const : feedbackData?.feedback_type === 'rejected' ? 'negative' as const : undefined;
          
          return {
            id: msg.id,
            content: msg.message_content,
            is_from_user: false,
            participant_id: '',
            created_at: msg.timestamp,
            feedback,
          } as Message;
        })
      );

      return messagesWithFeedback;
    },
  });

  // Buscar blocklist (agregado de todas as campanhas)
  const { data: blocklist, isLoading: blocklistLoading } = useQuery({
    queryKey: ['blocklist'],
    queryFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) return [];

      const { data, error } = await supabase
        .from('campaign_profiles')
        .select('id, campaign_id, blocklist, campaigns(name)')
        .not('blocklist', 'is', null);

      if (error) throw error;

      // Flatten blocklist arrays into unique phrases
      const allBlockedPhrases = new Map<string, any>();
      data?.forEach((profile: any) => {
        profile.blocklist?.forEach((phrase: string) => {
          if (!allBlockedPhrases.has(phrase)) {
            allBlockedPhrases.set(phrase, {
              id: `${profile.id}-${phrase}`,
              phrase,
              campaign_name: profile.campaigns?.name || 'Desconhecida',
              campaign_id: profile.campaign_id,
              profile_id: profile.id,
            });
          }
        });
      });

      return Array.from(allBlockedPhrases.values());
    },
  });

  // Enviar feedback
  const feedbackMutation = useMutation({
    mutationFn: async ({
      messageId,
      feedback,
    }: {
      messageId: string;
      feedback: 'positive' | 'negative';
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autenticado');

      const feedbackType = feedback === 'positive' ? 'approved' : 'rejected';

      const { error } = await supabase.from('message_feedback').upsert({
        message_id: messageId,
        feedback_type: feedbackType,
        user_id: user.id,
        campaign_id: null, // Will need to fetch this from context if available
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: 'Feedback registrado',
        description: 'Obrigado! Isso nos ajuda a melhorar.',
      });
      queryClient.invalidateQueries({ queryKey: ['messages-feedback'] });
    },
    onError: (error) => {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Adicionar à blocklist (append to all campaign_profiles)
  const blockMutation = useMutation({
    mutationFn: async ({
      phrase,
      reason: _reason,
    }: {
      phrase: string;
      reason: string;
    }) => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error('Não autenticado');

      // Get all campaign_profiles for user's campaigns
      const { data: campaigns } = await supabase
        .from('campaigns')
        .select('id')
        .eq('user_id', session.session.user.id);

      if (!campaigns || campaigns.length === 0) {
        throw new Error('Nenhuma campanha encontrada');
      }

      // Add phrase to each campaign_profile's blocklist
      const updates = campaigns.map(async (campaign) => {
        const { data: profile } = await supabase
          .from('campaign_profiles')
          .select('id, blocklist')
          .eq('campaign_id', campaign.id)
          .single();

        if (profile) {
          const currentBlocklist = profile.blocklist || [];
          if (!currentBlocklist.includes(phrase)) {
            await supabase
              .from('campaign_profiles')
              .update({ blocklist: [...currentBlocklist, phrase] })
              .eq('id', profile.id);
          }
        }
      });

      await Promise.all(updates);
    },
    onSuccess: () => {
      toast({
        title: 'Frase bloqueada',
        description: 'A IA não enviará mais mensagens contendo esta frase.',
      });
      setShowBlockDialog(false);
      setBlockReason('');
      setSelectedMessage(null);
      queryClient.invalidateQueries({ queryKey: ['blocklist'] });
    },
    onError: (error) => {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Remover da blocklist
  const unblockMutation = useMutation({
    mutationFn: async (entry: any) => {
      const { data: profile } = await supabase
        .from('campaign_profiles')
        .select('id, blocklist')
        .eq('id', entry.profile_id)
        .single();

      if (profile) {
        const updatedBlocklist = (profile.blocklist || []).filter(
          (p: string) => p !== entry.phrase
        );
        
        const { error } = await supabase
          .from('campaign_profiles')
          .update({ blocklist: updatedBlocklist })
          .eq('id', profile.id);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({
        title: 'Frase desbloqueada',
        description: 'A frase foi removida da blocklist.',
      });
      queryClient.invalidateQueries({ queryKey: ['blocklist'] });
    },
  });

  const handleBlockPhrase = () => {
    if (!selectedMessage || !blockReason.trim()) return;

    blockMutation.mutate({
      phrase: selectedMessage.content,
      reason: blockReason,
    });
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Feedback & Blocklist</h1>
            <p className="text-muted-foreground">
              Avalie mensagens e gerencie frases bloqueadas
            </p>
          </div>
          <BackToHomeButton />
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Mensagens Recentes */}
          <Card>
            <CardHeader>
              <CardTitle>Mensagens Recentes da IA</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px]">
                <div className="space-y-3">
                  {messagesLoading ? (
                    <p className="text-sm text-muted-foreground">Carregando...</p>
                  ) : (
                    messages?.map((msg) => (
                      <Card key={msg.id} className="p-3">
                        <div className="space-y-2">
                          <p className="text-sm">{msg.content}</p>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">
                              {new Date(msg.created_at).toLocaleString('pt-BR')}
                            </span>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant={msg.feedback === 'positive' ? 'default' : 'outline'}
                                onClick={() =>
                                  feedbackMutation.mutate({
                                    messageId: msg.id,
                                    feedback: 'positive',
                                  })
                                }
                              >
                                <ThumbsUp className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant={msg.feedback === 'negative' ? 'destructive' : 'outline'}
                                onClick={() =>
                                  feedbackMutation.mutate({
                                    messageId: msg.id,
                                    feedback: 'negative',
                                  })
                                }
                              >
                                <ThumbsDown className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedMessage(msg);
                                  setShowBlockDialog(true);
                                }}
                              >
                                <Ban className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </Card>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Blocklist */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                Frases Bloqueadas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px]">
                <div className="space-y-3">
                  {blocklistLoading ? (
                    <p className="text-sm text-muted-foreground">Carregando...</p>
                  ) : blocklist && blocklist.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhuma frase bloqueada ainda.
                    </p>
                  ) : (
                    blocklist?.map((entry: any) => (
                      <Card key={entry.id} className="p-3">
                        <div className="space-y-2">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <p className="text-sm font-medium">{entry.phrase}</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                Campanha: {entry.campaign_name}
                              </p>
                            </div>
                            <Badge variant="secondary">
                              Bloqueado
                            </Badge>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => unblockMutation.mutate(entry)}
                          >
                            Desbloquear
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
      </div>

      {/* Dialog para bloquear frase */}
      <Dialog open={showBlockDialog} onOpenChange={setShowBlockDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bloquear Frase</DialogTitle>
            <DialogDescription>
              Esta frase será adicionada à blocklist e a IA não enviará mais mensagens contendo-a.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Frase a bloquear:</label>
              <p className="text-sm bg-muted p-2 rounded mt-1">
                {selectedMessage?.content}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">Motivo:</label>
              <Textarea
                placeholder="Por que esta frase deve ser bloqueada?"
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBlockDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleBlockPhrase}
              disabled={!blockReason.trim()}
            >
              Bloquear Frase
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
