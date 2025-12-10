import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from 'sonner';
import { 
  Sparkles, 
  Send, 
  History, 
  RotateCcw, 
  Check, 
  Clock,
  Loader2,
  MessageSquare,
  Trash2
} from 'lucide-react';

interface Agent {
  id: string;
  name: string;
  instructions: string;
  gpt_api_key: string;
  gpt_model: string;
}

interface PromptVersion {
  id: string;
  instructions: string;
  version_number: number;
  version_note: string | null;
  created_at: string;
  is_current: boolean;
  performance_score: number | null;
}

interface ImprovementSession {
  id: string;
  agent_id: string;
  session_name: string | null;
  created_at: string;
  status: string;
}

interface ImprovementMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
}

interface AgentPromptImproverProps {
  agent: Agent;
  onPromptUpdate: (newInstructions: string) => void;
}

export function AgentPromptImprover({ agent, onPromptUpdate }: AgentPromptImproverProps) {
  const [sessions, setSessions] = useState<ImprovementSession[]>([]);
  const [currentSession, setCurrentSession] = useState<ImprovementSession | null>(null);
  const [messages, setMessages] = useState<ImprovementMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [promptVersions, setPromptVersions] = useState<PromptVersion[]>([]);
  const [showVersionsDialog, setShowVersionsDialog] = useState(false);
  const [proposedPrompt, setProposedPrompt] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (agent?.id) {
      fetchSessions();
      fetchPromptVersions();
    }
  }, [agent?.id]);

  useEffect(() => {
    if (currentSession) {
      fetchMessages(currentSession.id);
    }
  }, [currentSession]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function fetchSessions() {
    try {
      const { data, error } = await supabase
        .from('agent_improvement_sessions')
        .select('*')
        .eq('agent_id', agent.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSessions(data || []);
      
      // Selecionar sessão ativa mais recente
      const activeSession = data?.find(s => s.status === 'active');
      if (activeSession) {
        setCurrentSession(activeSession);
      }
    } catch (err) {
      console.error('Erro ao buscar sessões:', err);
    }
  }

  async function fetchMessages(sessionId: string) {
    try {
      const { data, error } = await supabase
        .from('agent_improvement_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (err) {
      console.error('Erro ao buscar mensagens:', err);
    }
  }

  async function fetchPromptVersions() {
    try {
      const { data, error } = await supabase
        .from('agent_prompt_versions')
        .select('*')
        .eq('agent_id', agent.id)
        .order('version_number', { ascending: false });

      if (error) throw error;
      setPromptVersions(data || []);
    } catch (err) {
      console.error('Erro ao buscar versões:', err);
    }
  }

  async function createNewSession() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data, error } = await supabase
        .from('agent_improvement_sessions')
        .insert({
          agent_id: agent.id,
          user_id: user.id,
          session_name: `Sessão ${new Date().toLocaleDateString('pt-BR')}`,
          status: 'active'
        })
        .select()
        .single();

      if (error) throw error;

      setSessions(prev => [data, ...prev]);
      setCurrentSession(data);
      setMessages([]);
      
      // Adicionar mensagem inicial do sistema
      await supabase
        .from('agent_improvement_messages')
        .insert({
          session_id: data.id,
          role: 'system',
          content: `Sessão iniciada para melhorar o agente "${agent.name}". O prompt atual é:\n\n"${agent.instructions}"\n\nDescreva o que você gostaria de melhorar ou qual comportamento deseja adicionar ao agente.`
        });

      fetchMessages(data.id);
      toast.success('Nova sessão criada!');
    } catch (err: any) {
      toast.error('Erro ao criar sessão: ' + err.message);
    }
  }

  async function sendMessage() {
    if (!newMessage.trim() || !currentSession || isLoading) return;

    const userMessage = newMessage.trim();
    setNewMessage('');
    setIsLoading(true);

    try {
      // Salvar mensagem do usuário
      const { error: insertError } = await supabase
        .from('agent_improvement_messages')
        .insert({
          session_id: currentSession.id,
          role: 'user',
          content: userMessage
        });

      if (insertError) throw insertError;

      // Buscar todas as mensagens para contexto
      const { data: allMessages } = await supabase
        .from('agent_improvement_messages')
        .select('*')
        .eq('session_id', currentSession.id)
        .order('created_at', { ascending: true });

      // Construir prompt para o GPT
      const systemPrompt = `Você é um especialista em criar prompts para agentes de IA de vendas e atendimento.
Seu objetivo é ajudar a melhorar o prompt do agente "${agent.name}".

PROMPT ATUAL DO AGENTE:
"""
${agent.instructions}
"""

REGRAS:
1. Quando o usuário pedir melhorias, sugira alterações específicas e explique o porquê
2. Quando você propor um novo prompt, formate-o EXATAMENTE assim:
   [NOVO_PROMPT_INICIO]
   <o prompt completo aqui>
   [NOVO_PROMPT_FIM]
3. Seja específico e prático nas sugestões
4. Mantenha o tom profissional do agente
5. Sugira melhorias baseadas em boas práticas de vendas e persuasão
6. Pergunte sobre o contexto e objetivos antes de fazer grandes mudanças

Responda em português brasileiro.`;

      const conversationMessages = (allMessages || [])
        .filter(m => m.role !== 'system')
        .map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content
        }));

      // === CONFIGURAÇÃO DE MODELOS OPENAI (Junho 2025) ===
      const gptModel = agent.gpt_model || 'gpt-4o';
      const isGpt5Series = gptModel.startsWith('gpt-5');
      const isGpt41Series = gptModel.startsWith('gpt-4.1');
      const isOSeries = gptModel.startsWith('o3') || gptModel.startsWith('o4');
      const isNewModel = isGpt5Series || isGpt41Series || isOSeries;
      
      // Role: developer para modelos novos, system para legados
      const systemRole = isNewModel ? "developer" : "system";
      
      // Parâmetros de tokens
      const tokenParam = isNewModel ? { max_completion_tokens: 2000 } : { max_tokens: 2000 };
      
      // Parâmetros extras
      let extraParams: Record<string, any> = {};
      if (isGpt5Series) {
        const isGpt51 = gptModel.startsWith('gpt-5.1');
        extraParams = { reasoning_effort: isGpt51 ? "none" : "low" };
      } else if (isOSeries) {
        extraParams = { reasoning_effort: "low" };
      } else if (isGpt41Series || !isNewModel) {
        extraParams = { temperature: 0.7 };
      }

      // Timeout de 180 segundos (3 minutos)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000);

      try {
        // Chamar GPT via API
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${agent.gpt_api_key}`
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: gptModel,
            messages: [
              { role: systemRole, content: systemPrompt },
              ...conversationMessages,
              { role: 'user', content: userMessage }
            ],
            ...tokenParam,
            ...extraParams
          })
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error?.message || 'Erro ao chamar GPT');
        }

        const data = await response.json();
        const assistantMessage = data.choices[0].message.content;

        // Salvar resposta do assistente
        await supabase
          .from('agent_improvement_messages')
          .insert({
            session_id: currentSession.id,
            role: 'assistant',
            content: assistantMessage
          });

        // Verificar se há um novo prompt proposto
        const promptMatch = assistantMessage.match(/\[NOVO_PROMPT_INICIO\]([\s\S]*?)\[NOVO_PROMPT_FIM\]/);
        if (promptMatch) {
          setProposedPrompt(promptMatch[1].trim());
        }

        // Atualizar mensagens
        fetchMessages(currentSession.id);
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          throw new Error('Timeout: A requisição demorou mais de 3 minutos');
        }
        throw fetchError;
      }
    } catch (err: any) {
      console.error('Erro:', err);
      toast.error('Erro ao processar mensagem: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function applyProposedPrompt() {
    if (!proposedPrompt) return;

    try {
      // Atualizar o agente com o novo prompt
      const { error } = await supabase
        .from('agents')
        .update({ instructions: proposedPrompt })
        .eq('id', agent.id);

      if (error) throw error;

      onPromptUpdate(proposedPrompt);
      setProposedPrompt(null);
      toast.success('Prompt atualizado com sucesso!');
      
      // Atualizar lista de versões
      fetchPromptVersions();
    } catch (err: any) {
      toast.error('Erro ao aplicar prompt: ' + err.message);
    }
  }

  async function restoreVersion(version: PromptVersion) {
    try {
      const { error } = await supabase
        .from('agents')
        .update({ instructions: version.instructions })
        .eq('id', agent.id);

      if (error) throw error;

      onPromptUpdate(version.instructions);
      setShowVersionsDialog(false);
      toast.success(`Prompt restaurado para versão ${version.version_number}!`);
      fetchPromptVersions();
    } catch (err: any) {
      toast.error('Erro ao restaurar versão: ' + err.message);
    }
  }

  async function deleteSession(sessionId: string) {
    try {
      const { error } = await supabase
        .from('agent_improvement_sessions')
        .delete()
        .eq('id', sessionId);

      if (error) throw error;

      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (currentSession?.id === sessionId) {
        setCurrentSession(null);
        setMessages([]);
      }
      toast.success('Sessão excluída!');
    } catch (err: any) {
      toast.error('Erro ao excluir sessão: ' + err.message);
    }
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          Melhorar Prompt com IA
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:w-[540px] sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            Assistente de Melhoria - {agent.name}
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-col h-[calc(100vh-100px)] mt-4">
          {/* Header com ações */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Select
                value={currentSession?.id || 'new'}
                onValueChange={(value) => {
                  if (value === 'new') {
                    createNewSession();
                  } else {
                    const session = sessions.find(s => s.id === value);
                    if (session) setCurrentSession(session);
                  }
                }}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Selecionar sessão" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">
                    <span className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Nova Sessão
                    </span>
                  </SelectItem>
                  {sessions.map((session) => (
                    <SelectItem key={session.id} value={session.id}>
                      {session.session_name || new Date(session.created_at).toLocaleDateString('pt-BR')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {currentSession && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteSession(currentSession.id)}
                  title="Excluir sessão"
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              )}
            </div>

            <Dialog open={showVersionsDialog} onOpenChange={setShowVersionsDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="flex items-center gap-2">
                  <History className="h-4 w-4" />
                  Versões ({promptVersions.length})
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <History className="h-5 w-5" />
                    Histórico de Versões do Prompt
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3 mt-4">
                  {promptVersions.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      Nenhuma versão salva ainda. As versões são salvas automaticamente quando você atualiza o prompt.
                    </p>
                  ) : (
                    promptVersions.map((version) => (
                      <Card key={version.id} className={version.is_current ? 'border-green-500' : ''}>
                        <CardHeader className="py-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Badge variant={version.is_current ? 'default' : 'secondary'}>
                                v{version.version_number}
                              </Badge>
                              {version.is_current && (
                                <Badge variant="outline" className="bg-green-50 text-green-700">
                                  <Check className="h-3 w-3 mr-1" />
                                  Atual
                                </Badge>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {new Date(version.created_at).toLocaleString('pt-BR')}
                            </span>
                          </div>
                        </CardHeader>
                        <CardContent className="py-2">
                          <p className="text-sm text-muted-foreground line-clamp-3 mb-3">
                            {version.instructions}
                          </p>
                          {!version.is_current && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => restoreVersion(version)}
                              className="flex items-center gap-2"
                            >
                              <RotateCcw className="h-4 w-4" />
                              Restaurar esta versão
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Prompt proposto */}
          {proposedPrompt && (
            <Card className="mb-4 border-purple-300 bg-purple-50">
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-purple-500" />
                  Novo Prompt Proposto
                </CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <Textarea
                  value={proposedPrompt}
                  onChange={(e) => setProposedPrompt(e.target.value)}
                  className="min-h-[100px] mb-3"
                />
                <div className="flex gap-2">
                  <Button onClick={applyProposedPrompt} className="flex items-center gap-2">
                    <Check className="h-4 w-4" />
                    Aplicar Prompt
                  </Button>
                  <Button variant="outline" onClick={() => setProposedPrompt(null)}>
                    Descartar
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Mensagens */}
          <ScrollArea className="flex-1 pr-4 mb-4">
            {!currentSession ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-12">
                <Sparkles className="h-12 w-12 text-purple-300 mb-4" />
                <h3 className="font-semibold mb-2">Melhore seu agente com IA</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Converse com o assistente para melhorar o prompt do seu agente. 
                  Ele vai sugerir melhorias e você pode aplicá-las diretamente.
                </p>
                <Button onClick={createNewSession} className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Iniciar Nova Sessão
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-lg p-3 ${
                        message.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : message.role === 'system'
                          ? 'bg-muted text-muted-foreground text-sm'
                          : 'bg-purple-100 text-purple-900'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      <span className="text-xs opacity-70 mt-1 block">
                        {new Date(message.created_at).toLocaleTimeString('pt-BR')}
                      </span>
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-purple-100 rounded-lg p-3 flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Analisando...</span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </ScrollArea>

          {/* Input de mensagem */}
          {currentSession && (
            <div className="flex gap-2">
              <Input
                placeholder="Descreva o que deseja melhorar..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                disabled={isLoading}
                className="flex-1"
              />
              <Button onClick={sendMessage} disabled={isLoading || !newMessage.trim()}>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default AgentPromptImprover;
