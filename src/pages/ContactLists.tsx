import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ListPlus,
  RefreshCw,
  Edit2,
  Trash2,
  Users,
  FolderOpen,
  Filter,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';

interface ContactList {
  id: string;
  name: string;
  description?: string;
  type: 'manual' | 'dynamic';
  filters?: any;
  total_contacts?: number;
  created_at: string;
  updated_at: string;
}

interface CRMContact {
  id: string;
  crm_client_code?: number;
  name: string;
  trade_name?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
}

export default function ContactLists() {
  const [lists, setLists] = useState<ContactList[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingList, setEditingList] = useState<ContactList | null>(null);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'manual' as 'manual' | 'dynamic',
  });
  
  // Seleção de contatos do CRM
  const [contacts, setContacts] = useState<CRMContact[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [contactsSearch, setContactsSearch] = useState('');
  const [contactsLoading, setContactsLoading] = useState(false);
  
  // Estado de confirmação de exclusão
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; listId: string | null; listName: string }>({ 
    open: false, listId: null, listName: '' 
  });
  const [isDeleting, setIsDeleting] = useState(false);

  async function loadLists() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('crm_contact_lists')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setLists((data as ContactList[]) || []);
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar listas',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }
  
  async function loadContacts(searchTerm = '') {
    try {
      console.log('📞 loadContacts chamado, searchTerm:', searchTerm);
      setContactsLoading(true);
      
      let query = supabase
        .from('crm_contacts')
        .select('id, crm_client_code, name, trade_name, phone, whatsapp, email')
        .order('name', { ascending: true });
      
      if (searchTerm.trim()) {
        query = query.ilike('name', `%${searchTerm}%`);
      }
      
      console.log('🔎 Executando query no Supabase...');
      const { data, error } = await query.limit(100);
      
      console.log('📊 Resultado:', { data, error, count: data?.length });
      
      if (error) {
        console.error('❌ Erro ao carregar contatos:', error);
        throw error;
      }
      
      if (!data || data.length === 0) {
        console.warn('⚠️ Nenhum contato encontrado no banco. Verifique se há dados em crm_contacts.');
        toast({
          title: 'Nenhum contato encontrado',
          description: 'Sincronize contatos da API Redsis em "Contatos CRM"',
          variant: 'default',
        });
      }
      
      setContacts((data as CRMContact[]) || []);
      console.log('✅ Contatos carregados:', data?.length || 0);
    } catch (error: any) {
      console.error('💥 Erro completo:', error);
      toast({
        title: 'Erro ao carregar contatos',
        description: error.message || 'Não foi possível carregar os contatos do CRM',
        variant: 'destructive',
      });
    } finally {
      setContactsLoading(false);
    }
  }

  useEffect(() => {
    loadLists();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setLoading(true);

      if (editingList) {
        // Update
        const { error } = await supabase
          .from('crm_contact_lists')
          .update({
            name: formData.name,
            description: formData.description,
            type: formData.type,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingList.id);

        if (error) throw error;

        toast({
          title: 'Lista atualizada',
          description: 'A lista foi atualizada com sucesso',
        });
      } else {
        // Create
        const { data: newList, error } = await supabase
          .from('crm_contact_lists')
          .insert({
            name: formData.name,
            description: formData.description,
            type: 'manual',
            filters: {},
            total_contacts: selectedContactIds.length,
          })
          .select()
          .single();

        if (error) throw error;

        // Vincular contatos selecionados à lista
        if (selectedContactIds.length > 0 && newList) {
          // Buscar os crm_client_code dos contatos selecionados
          const listContacts = selectedContactIds.map(contactId => {
            const contact = contacts.find(c => c.id === contactId);
            return {
              list_id: newList.id,
              contact_id: contactId,
              crm_client_code: contact?.crm_client_code || 0,
            };
          });

          console.log('📋 Vinculando contatos à lista:', { listId: newList.id, contacts: listContacts });

          const { error: linkError } = await supabase
            .from('crm_contact_list_items')
            .insert(listContacts);

          if (linkError) {
            console.error('❌ Erro ao vincular contatos:', linkError);
          } else {
            console.log('✅ Contatos vinculados com sucesso!');
          }
        }

        toast({
          title: 'Lista criada',
          description: `Lista criada com ${selectedContactIds.length} contatos`,
        });
      }

      setDialogOpen(false);
      setEditingList(null);
      setFormData({ name: '', description: '', type: 'manual' });
      setSelectedContactIds([]);
      loadLists();
    } catch (error: any) {
      toast({
        title: 'Erro ao salvar lista',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (list: ContactList) => {
    setEditingList(list);
    setFormData({
      name: list.name,
      description: list.description || '',
      type: list.type || 'manual',
    });
    setDialogOpen(true);
  };

  const openDeleteConfirm = (list: ContactList) => {
    setDeleteConfirm({ open: true, listId: list.id, listName: list.name });
  };

  const handleDelete = async () => {
    if (!deleteConfirm.listId) return;

    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('crm_contact_lists')
        .delete()
        .eq('id', deleteConfirm.listId);

      if (error) throw error;

      toast({
        title: 'Lista excluída',
        description: 'A lista foi excluída com sucesso',
      });

      setDeleteConfirm({ open: false, listId: null, listName: '' });
      loadLists();
    } catch (error: any) {
      toast({
        title: 'Erro ao excluir lista',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingList(null);
    setFormData({ name: '', description: '', type: 'manual' });
    setSelectedContactIds([]);
    setContactsSearch('');
    setContacts([]);
  };
  
  const handleCreate = () => {
    setEditingList(null);
    setFormData({ name: '', description: '', type: 'manual' });
    setSelectedContactIds([]);
    setContactsSearch('');
    setDialogOpen(true);
    // Carregar contatos ao abrir o dialog
    console.log('🔍 Abrindo dialog, carregando contatos...');
    loadContacts();
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Listas de Contatos
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Organize seus contatos em listas personalizadas
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total de Listas</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {lists.length}
                </p>
              </div>
              <FolderOpen className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Listas Manuais</p>
                <p className="text-2xl font-bold text-green-600">
                  {lists.filter((l) => l.type === 'manual').length}
                </p>
              </div>
              <Users className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Listas Dinâmicas</p>
                <p className="text-2xl font-bold text-purple-600">
                  {lists.filter((l) => l.type === 'dynamic').length}
                </p>
              </div>
              <Filter className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lists Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <CardTitle>Suas Listas</CardTitle>
              <CardDescription>
                Gerencie e organize suas listas de contatos
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={loadLists}
                disabled={loading}
                variant="outline"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={handleCreate}>
                    <ListPlus className="h-4 w-4 mr-2" />
                    Nova Lista
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <form onSubmit={handleSubmit}>
                    <DialogHeader>
                      <DialogTitle>
                        {editingList ? 'Editar Lista' : 'Nova Lista'}
                      </DialogTitle>
                      <DialogDescription>
                        {editingList
                          ? 'Atualize as informações da lista'
                          : 'Crie uma nova lista para organizar seus contatos'}
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                      <div>
                        <label className="text-sm font-medium mb-1 block">
                          Nome da Lista *
                        </label>
                        <Input
                          placeholder="Ex: Clientes Premium"
                          value={formData.name}
                          onChange={(e) =>
                            setFormData({ ...formData, name: e.target.value })
                          }
                          required
                        />
                      </div>

                      <div>
                        <label className="text-sm font-medium mb-1 block">
                          Descrição
                        </label>
                        <Textarea
                          placeholder="Descreva o propósito desta lista..."
                          value={formData.description}
                          onChange={(e) =>
                            setFormData({ ...formData, description: e.target.value })
                          }
                          rows={3}
                        />
                      </div>

                      {!editingList && (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-sm font-medium">
                              Contatos da Lista
                            </label>
                            <Badge variant="secondary">
                              {selectedContactIds.length} selecionados
                            </Badge>
                          </div>
                          
                          <Input
                            placeholder="Buscar contatos..."
                            value={contactsSearch}
                            onChange={(e) => {
                              setContactsSearch(e.target.value);
                              loadContacts(e.target.value);
                            }}
                            className="mb-2"
                          />
                          
                          <ScrollArea className="h-64 border rounded-md">
                            {contactsLoading ? (
                              <div className="flex items-center justify-center h-full">
                                <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
                                <p className="text-sm text-gray-500 mt-2">Carregando contatos...</p>
                              </div>
                            ) : contacts.length === 0 ? (
                              <div className="flex flex-col items-center justify-center h-full text-gray-500 p-4">
                                <Users className="h-12 w-12 mb-3 text-gray-300" />
                                <p className="text-sm font-medium mb-1">Nenhum contato encontrado no CRM</p>
                                <p className="text-xs text-gray-400 text-center mb-3">
                                  Vá em "Contatos CRM" e clique em "Sincronizar da API"<br />
                                  para importar contatos do Redsis
                                </p>
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => window.location.href = '/crm-contacts'}
                                >
                                  Ir para Contatos CRM
                                </Button>
                              </div>
                            ) : (
                              <div className="divide-y">
                                {contacts.map((contact) => {
                                  const checked = selectedContactIds.includes(contact.id);
                                  return (
                                    <label
                                      key={contact.id}
                                      className="flex items-start gap-3 p-3 cursor-pointer hover:bg-gray-50"
                                    >
                                      <Checkbox
                                        checked={checked}
                                        onCheckedChange={(value) => {
                                          if (value) {
                                            setSelectedContactIds([...selectedContactIds, contact.id]);
                                          } else {
                                            setSelectedContactIds(selectedContactIds.filter(id => id !== contact.id));
                                          }
                                        }}
                                      />
                                      <div className="text-sm flex-1">
                                        <p className="font-medium">
                                          {contact.name}
                                          {contact.trade_name && (
                                            <span className="text-gray-500 ml-1">· {contact.trade_name}</span>
                                          )}
                                        </p>
                                        <p className="text-xs text-gray-500">
                                          {contact.whatsapp || contact.phone || 'Sem telefone'}
                                          {contact.email && ` · ${contact.email}`}
                                        </p>
                                      </div>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </ScrollArea>
                        </div>
                      )}
                    </div>

                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleDialogClose}
                      >
                        Cancelar
                      </Button>
                      <Button type="submit" disabled={loading}>
                        {loading ? 'Salvando...' : editingList ? 'Atualizar' : 'Criar'}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Contatos</TableHead>
                  <TableHead>Criada em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <RefreshCw className="h-6 w-6 animate-spin mx-auto text-gray-400" />
                      <p className="text-sm text-gray-500 mt-2">Carregando listas...</p>
                    </TableCell>
                  </TableRow>
                ) : lists.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <FolderOpen className="h-12 w-12 mx-auto text-gray-300 mb-2" />
                      <p className="text-gray-500">Nenhuma lista criada</p>
                      <p className="text-sm text-gray-400 mb-4">
                        Crie sua primeira lista para organizar contatos
                      </p>
                      <Button onClick={() => setDialogOpen(true)} size="sm">
                        <ListPlus className="h-4 w-4 mr-2" />
                        Criar Lista
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : (
                  lists.map((list) => (
                    <TableRow key={list.id}>
                      <TableCell className="font-medium">{list.name}</TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {list.description || '-'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={list.type === 'manual' ? 'default' : 'secondary'}
                        >
                          {list.type === 'manual' ? 'Manual' : 'Dinâmica'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Users className="h-4 w-4 text-gray-400" />
                          <span>{list.total_contacts || 0}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {new Date(list.created_at).toLocaleDateString('pt-BR')}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(list)}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDeleteConfirm(list)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Dialog de Confirmação de Exclusão */}
      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => setDeleteConfirm({ ...deleteConfirm, open })}
        title="Excluir Lista de Contatos?"
        description={`Tem certeza que deseja excluir a lista "${deleteConfirm.listName}"?\n\nEsta ação é IRREVERSÍVEL e você:\n• Perderá todos os contatos associados a esta lista\n• Não poderá recuperar a lista depois\n• Campanhas usando esta lista ficarão sem contatos`}
        confirmText="Sim, Excluir Lista"
        cancelText="Cancelar"
        variant="danger"
        onConfirm={handleDelete}
        isLoading={isDeleting}
      />
    </div>
  );
}
