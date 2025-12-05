import { useState, useEffect } from 'react';
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
import { toast } from 'sonner';
import { Trash2, Edit, Bot, RotateCcw, Clock, Zap } from 'lucide-react';
import BackToHomeButton from '@/components/BackToHomeButton';
import AgentPromptImprover from '@/components/AgentPromptImprover';

const agentSchema = z.object({
  name: z.string().min(1, "O nome do agente é obrigatório."),
  instructions: z.string().min(1, "As instruções do agente são obrigatórias."),
  gpt_api_key: z.string().min(1, "A chave da API GPT é obrigatória."),
  gpt_model: z.string().min(1, "Selecione um modelo GPT."),
  response_delay_seconds: z.number().min(5, "Mínimo 5 segundos").max(300, "Máximo 5 minutos"),
  word_delay_seconds: z.number().min(0.5, "Mínimo 0.5 segundos").max(5.0, "Máximo 5 segundos"),
});

type Agent = z.infer<typeof agentSchema> & { id: string };

const GPT_MODELS = [
  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo (Rápido, Econômico)' },
  { value: 'gpt-4', label: 'GPT-4 (Padrão, Equilibrado)' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo (Mais Inteligente)' },
  { value: 'gpt-4o', label: 'GPT-4o (Multimodal, Rápido)' },
  { value: 'gpt-4.1', label: 'GPT-4.1 (Nova Geração)' },
  { value: 'gpt-5.1', label: 'GPT-5.1 (Mais Avançado)' },
];

const AgentConfiguration = () => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);

  const form = useForm<z.infer<typeof agentSchema>>({
    resolver: zodResolver(agentSchema),
    defaultValues: {
      name: "",
      instructions: "",
      gpt_api_key: "",
      gpt_model: "gpt-4",
      response_delay_seconds: 30,
      word_delay_seconds: 1.6,
    },
  });

  const resetToDefaults = () => {
    form.setValue('response_delay_seconds', 30);
    form.setValue('word_delay_seconds', 1.6);
    toast.success("Valores de delay redefinidos para o padrão!");
  };

  const selectedAgent = agents.find((agent) => agent.id === editingAgentId) || null;

  const handlePromptUpdate = (newInstructions: string) => {
    setAgents((prev) => prev.map((agent) =>
      agent.id === selectedAgent?.id ? { ...agent, instructions: newInstructions } : agent
    ));
    form.setValue('instructions', newInstructions);
  };

  const fetchAgents = async () => {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) {
        toast.error("Você precisa estar logado para ver os agentes.");
        return;
      }

      const { data, error } = await supabase
        .from('agents')
        .select('*')
        .eq('user_id', user.user.id);

      if (error) {
        toast.error("Erro ao carregar agentes: " + error.message);
      } else {
        setAgents(data as Agent[]);
      }
    } catch (err) {
      toast.error("Erro ao carregar agentes");
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  const onSubmit = async (values: z.infer<typeof agentSchema>) => {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) {
        toast.error("Você precisa estar logado para criar/editar agentes.");
        return;
      }

      if (editingAgentId) {
        // Update agent
        const { error } = await supabase
          .from('agents')
          .update(values)
          .eq('id', editingAgentId)
          .eq('user_id', user.user.id);

        if (error) {
          toast.error("Erro ao atualizar agente: " + error.message);
        } else {
          toast.success("Agente atualizado com sucesso!");
          setEditingAgentId(null);
          form.reset({
            name: "",
            instructions: "",
            gpt_api_key: "",
            gpt_model: "gpt-4",
            response_delay_seconds: 30,
            word_delay_seconds: 1.6,
          });
          fetchAgents();
        }
      } else {
        // Create new agent
        const { error } = await supabase
          .from('agents')
          .insert({ ...values, user_id: user.user.id });

        if (error) {
          toast.error("Erro ao criar agente: " + error.message);
        } else {
          toast.success("Agente criado com sucesso!");
          form.reset({
            name: "",
            instructions: "",
            gpt_api_key: "",
            gpt_model: "gpt-4",
            response_delay_seconds: 30,
            word_delay_seconds: 1.6,
          });
          fetchAgents();
        }
      }
    } catch (err) {
      toast.error("Erro ao salvar agente");
    }
  };

  const handleEdit = (agent: Agent) => {
    setEditingAgentId(agent.id);
    form.reset(agent);
  };

  const handleDelete = async (id: string) => {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) {
        toast.error("Você precisa estar logado para deletar agentes.");
        return;
      }

      const { error } = await supabase
        .from('agents')
        .delete()
        .eq('id', id)
        .eq('user_id', user.user.id);

      if (error) {
        toast.error("Erro ao deletar agente: " + error.message);
      } else {
        toast.success("Agente deletado com sucesso!");
        fetchAgents();
      }
    } catch (err) {
      toast.error("Erro ao deletar agente");
    }
  };

  return (
    <div className="container mx-auto p-4">
      <BackToHomeButton />
      <h1 className="text-3xl font-bold mb-6 text-center">Configuração do Agente de Prospecção</h1>

      <div className={`grid gap-6 ${selectedAgent ? 'lg:grid-cols-[1fr_420px]' : ''}`}>
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              {editingAgentId ? "Editar Agente" : "Criar Novo Agente"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome do Agente</FormLabel>
                      <FormControl>
                        <Input placeholder="Agente de Vendas B2B" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="gpt_model"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Modelo GPT</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o modelo GPT" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {GPT_MODELS.map((model) => (
                            <SelectItem key={model.value} value={model.value}>
                              {model.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                      <p className="text-sm text-muted-foreground">
                        Modelos mais recentes são mais inteligentes, mas mais lentos e caros.
                      </p>
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="instructions"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Instruções do Agente (Prompt GPT)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Você é um agente de vendas amigável e persuasivo. Seu objetivo é..."
                          className="min-h-[120px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                      <p className="text-sm text-muted-foreground">
                        Seja específico sobre o tom, abordagem e objetivos do agente.
                      </p>
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="gpt_api_key"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Chave da API GPT</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="sk-proj-..." {...field} />
                      </FormControl>
                      <FormMessage />
                      <p className="text-sm text-muted-foreground">
                        Atenção: Armazenar chaves de API diretamente no banco de dados não é o ideal para ambientes de produção.
                      </p>
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="response_delay_seconds"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          Tempo de Leitura (segundos)
                        </FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            placeholder="30" 
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                        <p className="text-sm text-muted-foreground">
                          Tempo que o agente leva para ler e começar a responder.
                        </p>
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="word_delay_seconds"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <Zap className="h-4 w-4" />
                          Tempo por Palavra (segundos)
                        </FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            step="0.1"
                            placeholder="1.6" 
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                        <p className="text-sm text-muted-foreground">
                          Tempo de digitação simulado por palavra.
                        </p>
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Button 
                    type="submit" 
                    className="flex-1"
                  >
                    {editingAgentId ? "Atualizar Agente" : "Criar Agente"}
                  </Button>
                  
                  <Button 
                    type="button" 
                    variant="outline"
                    onClick={resetToDefaults}
                    className="flex items-center gap-2"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Redefinir Padrão
                  </Button>
                </div>
                
                {editingAgentId && (
                  <Button 
                    variant="outline" 
                    onClick={() => { 
                      setEditingAgentId(null); 
                      form.reset({
                        name: "",
                        instructions: "",
                        gpt_api_key: "",
                        gpt_model: "gpt-4",
                        response_delay_seconds: 30,
                        word_delay_seconds: 1.6,
                      }); 
                    }} 
                    className="w-full"
                  >
                    Cancelar Edição
                  </Button>
                )}
              </form>
            </Form>
          </CardContent>
        </Card>

        {selectedAgent && (
          <div className="h-full">
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                  Calibrar Agente (Teste ao vivo)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <AgentPromptImprover agent={selectedAgent} onPromptUpdate={handlePromptUpdate} />
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Meus Agentes</CardTitle>
        </CardHeader>
        <CardContent>
          {agents.length === 0 ? (
            <p className="text-center text-muted-foreground">Nenhum agente configurado ainda.</p>
          ) : (
            <div className="space-y-4">
              {agents.map((agent) => (
                <div key={agent.id} className="flex items-center justify-between p-4 border rounded-md">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold">{agent.name}</h3>
                      <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full">
                        {GPT_MODELS.find(m => m.value === agent.gpt_model)?.label || agent.gpt_model}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">{agent.instructions}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {agent.response_delay_seconds}s leitura
                      </span>
                      <span className="flex items-center gap-1">
                        <Zap className="h-3 w-3" />
                        {agent.word_delay_seconds}s/palavra
                      </span>
                    </div>
                  </div>
                  <div className="flex space-x-2 ml-4">
                    <Button variant="outline" size="icon" onClick={() => handleEdit(agent)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="destructive" size="icon" onClick={() => handleDelete(agent.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AgentConfiguration;