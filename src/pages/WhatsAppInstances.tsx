import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useForm } from 'react-hook-form';
import { Plus, Trash2, Edit, CheckCircle, XCircle } from 'lucide-react';
import BackToHomeButton from '@/components/BackToHomeButton';

interface WhatsAppInstance {
  id: string;
  name: string;
  instance_id: string;
  token: string;
  webhook_url: string | null;
  phone_number: string | null;
  status: string;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
  last_connection_check: string | null;
}

interface InstanceFormData {
  name: string;
  instance_id: string;
  token: string;
  webhook_url?: string;
  phone_number?: string;
  is_active: boolean;
  is_default: boolean;
}

export default function WhatsAppInstances() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingInstance, setEditingInstance] = useState<WhatsAppInstance | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; instance: WhatsAppInstance | null }>({
    open: false, instance: null
  });

  const form = useForm<InstanceFormData>({
    defaultValues: {
      name: '',
      instance_id: '',
      token: '',
      webhook_url: '',
      phone_number: '',
      is_active: true,
      is_default: false,
    },
  });

  // Verificar status real da instância via API W-API
  const checkInstanceStatus = async (instanceId: string, token: string) => {
    try {
      const response = await fetch(
        `https://api.w-api.app/get-status?instance_id=${instanceId}&token=${token}`
      );
      const data = await response.json();
      
      // API retorna { status: "connected" } ou { status: "disconnected" }
      return data.status === 'connected' ? 'connected' : 'disconnected';
    } catch (error) {
      console.error('Erro ao verificar status:', error);
      return 'disconnected';
    }
  };

  // Buscar instâncias e verificar status real
  const { data: instances, isLoading } = useQuery({
    queryKey: ['whatsapp-instances'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Verificar status real de cada instância
      const instancesWithStatus = await Promise.all(
        (data || []).map(async (instance) => {
          const realStatus = await checkInstanceStatus(
            instance.instance_id,
            instance.token
          );
          
          // Atualizar no banco se o status mudou
          if (realStatus !== instance.status) {
            await supabase
              .from('whatsapp_instances')
              .update({ 
                status: realStatus,
                last_connection_check: new Date().toISOString()
              })
              .eq('id', instance.id);
          }
          
          return { ...instance, status: realStatus };
        })
      );
      
      return instancesWithStatus as WhatsAppInstance[];
    },
  });

  // Criar ou atualizar instância
  const saveMutation = useMutation({
    mutationFn: async (data: InstanceFormData) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error('Usuário não autenticado');

      if (editingInstance) {
        // Atualizar
        const { error } = await supabase
          .from('whatsapp_instances')
          .update(data)
          .eq('id', editingInstance.id);

        if (error) throw error;
      } else {
        // Criar
        const { error } = await supabase
          .from('whatsapp_instances')
          .insert({ ...data, created_by: user.id });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({
        title: editingInstance ? 'Instância atualizada' : 'Instância criada',
        description: 'As alterações foram salvas com sucesso.',
      });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });
      setDialogOpen(false);
      setEditingInstance(null);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Deletar instância
  const deleteMutation = useMutation({
    mutationFn: async (instanceId: string) => {
      const { error } = await supabase
        .from('whatsapp_instances')
        .delete()
        .eq('id', instanceId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: 'Instância removida',
        description: 'A instância WhatsApp foi removida com sucesso.',
      });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao remover',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleEdit = (instance: WhatsAppInstance) => {
    setEditingInstance(instance);
    form.reset({
      name: instance.name,
      instance_id: instance.instance_id,
      token: instance.token,
      webhook_url: instance.webhook_url || '',
      phone_number: instance.phone_number || '',
      is_active: instance.is_active,
      is_default: instance.is_default,
    });
    setDialogOpen(true);
  };

  const handleCreate = () => {
    setEditingInstance(null);
    form.reset();
    setDialogOpen(true);
  };

  const onSubmit = (data: InstanceFormData) => {
    saveMutation.mutate(data);
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Instâncias WhatsApp</h1>
            <p className="text-muted-foreground mt-2">
              Gerencie múltiplas contas WhatsApp para uso em campanhas e prospecções
            </p>
          </div>
          <BackToHomeButton />
        </div>

        <div className="flex justify-end">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={handleCreate}>
                <Plus className="mr-2 h-4 w-4" />
                Nova Instância
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>
                  {editingInstance ? 'Editar Instância' : 'Nova Instância WhatsApp'}
                </DialogTitle>
                <DialogDescription>
                  Configure uma nova instância W-API para enviar e receber mensagens
                </DialogDescription>
              </DialogHeader>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome da Instância *</FormLabel>
                        <FormControl>
                          <Input placeholder="Ex: Vendas SP, Suporte RJ" {...field} />
                        </FormControl>
                        <FormDescription>
                          Nome identificador para facilitar a escolha
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="instance_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Instance ID *</FormLabel>
                          <FormControl>
                            <Input placeholder="W-API Instance ID" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="phone_number"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Número WhatsApp</FormLabel>
                          <FormControl>
                            <Input placeholder="+55 11 98765-4321" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="token"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Token *</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="Bearer token da W-API"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="webhook_url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Webhook URL (Opcional)</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="https://seu-dominio.com/webhook"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          URL para receber webhooks da W-API
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex gap-6">
                    <FormField
                      control={form.control}
                      name="is_active"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-2">
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <FormLabel className="!mt-0">Ativa</FormLabel>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="is_default"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-2">
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <FormLabel className="!mt-0">Padrão do Sistema</FormLabel>
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setDialogOpen(false)}
                    >
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={saveMutation.isPending}>
                      {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-6 bg-muted rounded w-3/4" />
                  <div className="h-4 bg-muted rounded w-1/2 mt-2" />
                </CardHeader>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {instances?.map((instance) => (
              <Card key={instance.id} className="relative">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="flex items-center gap-2">
                        {instance.name}
                        {instance.is_default && (
                          <Badge variant="secondary">Padrão</Badge>
                        )}
                      </CardTitle>
                      <CardDescription>
                        {instance.phone_number || 'Sem número'}
                      </CardDescription>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleEdit(instance)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDeleteConfirm({ open: true, instance })}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Status:</span>
                      <div className="flex items-center gap-2">
                        {instance.status === 'connected' ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-destructive" />
                        )}
                        <Badge
                          variant={
                            instance.status === 'connected' ? 'default' : 'destructive'
                          }
                        >
                          {instance.status === 'connected' ? 'Conectado' : 'Desconectado'}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Ativa:</span>
                      <Badge variant={instance.is_active ? 'default' : 'secondary'}>
                        {instance.is_active ? 'Sim' : 'Não'}
                      </Badge>
                    </div>

                    <div className="pt-2 border-t">
                      <p className="text-xs text-muted-foreground truncate">
                        Instance: {instance.instance_id}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {!isLoading && instances?.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground mb-4">
                Nenhuma instância WhatsApp configurada
              </p>
              <Button onClick={handleCreate}>
                <Plus className="mr-2 h-4 w-4" />
                Criar Primeira Instância
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Dialog de Confirmação de Exclusão */}
      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => setDeleteConfirm({ ...deleteConfirm, open })}
        title="Excluir Instância WhatsApp?"
        description={`Tem certeza que deseja excluir a instância "${deleteConfirm.instance?.name}"?\n\nEsta ação é IRREVERSÍVEL e você:\n• Perderá a conexão com o WhatsApp\n• Campanhas usando esta instância pararão de funcionar\n• Precisará reconfigurar uma nova instância\n• Perderá o histórico de conexão`}
        confirmText="Sim, Excluir Instância"
        cancelText="Cancelar"
        variant="danger"
        onConfirm={() => {
          if (deleteConfirm.instance) {
            deleteMutation.mutate(deleteConfirm.instance.id);
            setDeleteConfirm({ open: false, instance: null });
          }
        }}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
