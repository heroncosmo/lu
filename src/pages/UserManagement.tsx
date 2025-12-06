import { useState } from 'react';
import { useAllUsers, useUserProfile, UserPermissions, DEFAULT_PERMISSIONS, ADMIN_PERMISSIONS } from '@/hooks/useUserProfile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { 
  UserPlus, 
  Shield, 
  ShieldCheck, 
  Users, 
  Mail, 
  Calendar,
  Loader2,
  Edit,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

// Mapeamento de permissões para labels em português
const PERMISSION_LABELS: Record<keyof UserPermissions, { label: string; description: string; category: string }> = {
  dashboard: { label: 'Dashboard', description: 'Visão geral do sistema', category: 'Principal' },
  crm_contacts: { label: 'Contatos CRM', description: 'Gerenciar contatos', category: 'CRM' },
  contact_lists: { label: 'Listas de Contatos', description: 'Criar e gerenciar listas', category: 'CRM' },
  crm_chat: { label: 'CRM Chat', description: 'Conversas do CRM', category: 'CRM' },
  campaigns: { label: 'Campanhas', description: 'Gerenciar campanhas', category: 'Vendas' },
  kanban: { label: 'Kanban', description: 'Pipeline de vendas', category: 'Vendas' },
  whatsapp: { label: 'WhatsApp', description: 'Instâncias WhatsApp', category: 'Comunicação' },
  playground: { label: 'Playground', description: 'Testes de prospecção', category: 'Comunicação' },
  create_prospecting: { label: 'Criar Prospecção', description: 'Iniciar novas prospecções', category: 'Comunicação' },
  agents: { label: 'Agentes IA', description: 'Configurar agentes', category: 'Configurações' },
  webhooks: { label: 'Webhooks', description: 'Configurar webhooks', category: 'Configurações' },
  redsis: { label: 'Redsis API', description: 'Integração Redsis', category: 'Configurações' },
  email_smtp: { label: 'Email SMTP', description: 'Configurar email', category: 'Configurações' },
  sms_twilio: { label: 'SMS Twilio', description: 'Configurar SMS', category: 'Configurações' },
  inventory: { label: 'Inventário', description: 'Broadcast de inventário', category: 'Configurações' },
  reports: { label: 'Relatórios', description: 'Métricas e análises', category: 'Configurações' },
  user_management: { label: 'Gerenciar Usuários', description: 'Administrar equipe', category: 'Admin' },
};

export default function UserManagement() {
  const { profile: currentUser, isAdmin } = useUserProfile();
  const { users, isLoading, createUser, updateUser, deleteUser } = useAllUsers();
  
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Form states
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'team_member'>('team_member');
  const [newUserPermissions, setNewUserPermissions] = useState<UserPermissions>({ ...DEFAULT_PERMISSIONS });
  
  const [editingUser, setEditingUser] = useState<{
    user_id: string;
    full_name: string;
    role: 'admin' | 'team_member';
    permissions: UserPermissions;
  } | null>(null);

  // Se não for admin, não mostrar nada
  if (!isAdmin) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertTriangle className="h-12 w-12 text-yellow-500 mb-4" />
              <h2 className="text-xl font-semibold mb-2">Acesso Restrito</h2>
              <p className="text-muted-foreground">
                Você não tem permissão para acessar esta página.
                <br />
                Apenas administradores podem gerenciar usuários.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleCreateUser = async () => {
    if (!newUserEmail || !newUserPassword || !newUserName) {
      toast.error('Preencha todos os campos');
      return;
    }

    if (newUserPassword.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres');
      return;
    }

    setIsSubmitting(true);
    const result = await createUser(newUserEmail, newUserPassword, newUserName, newUserRole, newUserPermissions);
    setIsSubmitting(false);

    if (result.success) {
      toast.success('Usuário criado com sucesso! Um email de confirmação foi enviado.');
      setIsCreateDialogOpen(false);
      resetForm();
    } else {
      toast.error(result.error || 'Erro ao criar usuário');
    }
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;

    setIsSubmitting(true);
    const result = await updateUser(editingUser.user_id, {
      full_name: editingUser.full_name,
      role: editingUser.role,
      permissions: editingUser.permissions,
    });
    setIsSubmitting(false);

    if (result.success) {
      toast.success('Usuário atualizado com sucesso!');
      setIsEditDialogOpen(false);
      setEditingUser(null);
    } else {
      toast.error(result.error || 'Erro ao atualizar usuário');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    setIsSubmitting(true);
    const result = await deleteUser(userId);
    setIsSubmitting(false);

    if (result.success) {
      toast.success('Usuário desativado com sucesso!');
      setDeleteConfirmUser(null);
    } else {
      toast.error(result.error || 'Erro ao desativar usuário');
    }
  };

  const handleToggleActive = async (userId: string, currentActive: boolean) => {
    const result = await updateUser(userId, { is_active: !currentActive });
    
    if (result.success) {
      toast.success(currentActive ? 'Usuário desativado' : 'Usuário ativado');
    } else {
      toast.error(result.error || 'Erro ao atualizar status');
    }
  };

  const resetForm = () => {
    setNewUserEmail('');
    setNewUserPassword('');
    setNewUserName('');
    setNewUserRole('team_member');
    setNewUserPermissions({ ...DEFAULT_PERMISSIONS });
  };

  const openEditDialog = (user: typeof users[0]) => {
    setEditingUser({
      user_id: user.user_id,
      full_name: user.full_name || '',
      role: user.role as 'admin' | 'team_member',
      permissions: user.permissions || DEFAULT_PERMISSIONS,
    });
    setIsEditDialogOpen(true);
  };

  // Componente de seleção de permissões
  const PermissionsSelector = ({ 
    permissions, 
    onChange, 
    disabled = false,
    isAdminRole = false 
  }: { 
    permissions: UserPermissions; 
    onChange: (perms: UserPermissions) => void; 
    disabled?: boolean;
    isAdminRole?: boolean;
  }) => {
    const categories = ['Principal', 'CRM', 'Vendas', 'Comunicação', 'Configurações', 'Admin'];
    
    const togglePermission = (key: keyof UserPermissions) => {
      if (disabled || isAdminRole) return;
      onChange({ ...permissions, [key]: !permissions[key] });
    };

    const toggleAll = (value: boolean) => {
      if (disabled) return;
      const newPerms = { ...permissions };
      (Object.keys(permissions) as (keyof UserPermissions)[]).forEach(key => {
        if (key !== 'user_management') {
          newPerms[key] = value;
        }
      });
      onChange(newPerms);
    };

    if (isAdminRole) {
      return (
        <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
            <ShieldCheck className="h-5 w-5" />
            <span className="font-medium">Administrador tem acesso total</span>
          </div>
          <p className="text-sm text-green-600 dark:text-green-400 mt-1">
            Administradores têm todas as permissões habilitadas automaticamente.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label>Permissões de Acesso</Label>
          <div className="flex gap-2">
            <Button 
              type="button" 
              variant="outline" 
              size="sm"
              onClick={() => toggleAll(true)}
              disabled={disabled}
            >
              Marcar Todos
            </Button>
            <Button 
              type="button" 
              variant="outline" 
              size="sm"
              onClick={() => toggleAll(false)}
              disabled={disabled}
            >
              Desmarcar Todos
            </Button>
          </div>
        </div>
        
        <ScrollArea className="h-[300px] pr-4">
          <div className="space-y-4">
            {categories.map(category => {
              const categoryPerms = (Object.entries(PERMISSION_LABELS) as [keyof UserPermissions, typeof PERMISSION_LABELS[keyof UserPermissions]][])
                .filter(([_, info]) => info.category === category);
              
              if (categoryPerms.length === 0) return null;
              
              return (
                <div key={category} className="space-y-2">
                  <h4 className="text-sm font-semibold text-muted-foreground">{category}</h4>
                  <div className="space-y-2">
                    {categoryPerms.map(([key, info]) => (
                      <div 
                        key={key}
                        className={`flex items-center justify-between p-2 rounded-lg border ${
                          permissions[key] ? 'bg-primary/5 border-primary/20' : 'bg-muted/30'
                        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-muted/50'}`}
                        onClick={() => togglePermission(key)}
                      >
                        <div className="flex items-center gap-3">
                          <Checkbox 
                            checked={permissions[key]} 
                            disabled={disabled}
                            onCheckedChange={() => togglePermission(key)}
                          />
                          <div>
                            <p className="text-sm font-medium">{info.label}</p>
                            <p className="text-xs text-muted-foreground">{info.description}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Separator className="my-2" />
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">Carregando usuários...</span>
        </div>
      </div>
    );
  }

  const activeUsers = users.filter(u => u.is_active);
  const inactiveUsers = users.filter(u => !u.is_active);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" />
            Gerenciamento de Usuários
          </h1>
          <p className="text-muted-foreground mt-1">
            Adicione e gerencie os membros da sua equipe
          </p>
        </div>

        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <UserPlus className="h-4 w-4" />
              Novo Usuário
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Adicionar Novo Usuário</DialogTitle>
              <DialogDescription>
                Crie uma conta para um novo membro da equipe. Ele receberá um email para confirmar o cadastro.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome Completo</Label>
                <Input
                  id="name"
                  placeholder="Ex: João Silva"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="email@exemplo.com"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Senha Inicial</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  O usuário poderá alterar a senha após o primeiro login.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">Função</Label>
                <Select 
                  value={newUserRole} 
                  onValueChange={(v) => {
                    const role = v as 'admin' | 'team_member';
                    setNewUserRole(role);
                    // Se for admin, setar todas as permissões
                    if (role === 'admin') {
                      setNewUserPermissions({ ...ADMIN_PERMISSIONS });
                    } else {
                      setNewUserPermissions({ ...DEFAULT_PERMISSIONS });
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="team_member">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        <span>Membro da Equipe</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="admin">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4" />
                        <span>Administrador</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {newUserRole === 'admin' 
                    ? 'Administradores têm acesso total ao sistema.' 
                    : 'Selecione as permissões abaixo para este membro.'}
                </p>
              </div>

              <PermissionsSelector
                permissions={newUserPermissions}
                onChange={setNewUserPermissions}
                isAdminRole={newUserRole === 'admin'}
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => { setIsCreateDialogOpen(false); resetForm(); }}>
                Cancelar
              </Button>
              <Button onClick={handleCreateUser} disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Criar Usuário
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total de Usuários</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ativos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{activeUsers.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Administradores</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {users.filter(u => u.role === 'admin').length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>Usuários Ativos</CardTitle>
          <CardDescription>
            Lista de todos os usuários com acesso ao sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead>Função</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{user.full_name || 'Sem nome'}</span>
                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {user.email}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                      {user.role === 'admin' ? (
                        <><ShieldCheck className="h-3 w-3 mr-1" /> Admin</>
                      ) : (
                        <><Shield className="h-3 w-3 mr-1" /> Membro</>
                      )}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={user.is_active}
                        onCheckedChange={() => handleToggleActive(user.user_id, user.is_active)}
                        disabled={user.user_id === currentUser?.user_id}
                      />
                      <span className={user.is_active ? 'text-green-600' : 'text-gray-400'}>
                        {user.is_active ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(user.created_at), "dd/MM/yyyy", { locale: ptBR })}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(user)}
                        disabled={user.user_id === currentUser?.user_id}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteConfirmUser(user.user_id)}
                        disabled={user.user_id === currentUser?.user_id}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {activeUsers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Nenhum usuário encontrado
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Inactive Users */}
      {inactiveUsers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground">Usuários Inativos</CardTitle>
            <CardDescription>
              Usuários desativados que não podem mais acessar o sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Função</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Reativar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inactiveUsers.map((user) => (
                  <TableRow key={user.id} className="opacity-60">
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{user.full_name || 'Sem nome'}</span>
                        <span className="text-sm text-muted-foreground">{user.email}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {user.role === 'admin' ? 'Admin' : 'Membro'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-gray-400">
                        Inativo
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleActive(user.user_id, user.is_active)}
                      >
                        Reativar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
            <DialogDescription>
              Atualize as informações e permissões do usuário
            </DialogDescription>
          </DialogHeader>

          {editingUser && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Nome Completo</Label>
                <Input
                  id="edit-name"
                  value={editingUser.full_name}
                  onChange={(e) => setEditingUser({ ...editingUser, full_name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-role">Função</Label>
                <Select 
                  value={editingUser.role} 
                  onValueChange={(v) => {
                    const role = v as 'admin' | 'team_member';
                    setEditingUser({ 
                      ...editingUser, 
                      role,
                      permissions: role === 'admin' ? ADMIN_PERMISSIONS : editingUser.permissions
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="team_member">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        <span>Membro da Equipe</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="admin">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4" />
                        <span>Administrador</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <PermissionsSelector
                permissions={editingUser.permissions}
                onChange={(perms) => setEditingUser({ ...editingUser, permissions: perms })}
                isAdminRole={editingUser.role === 'admin'}
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsEditDialogOpen(false); setEditingUser(null); }}>
              Cancelar
            </Button>
            <Button onClick={handleUpdateUser} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirmUser} onOpenChange={() => setDeleteConfirmUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <span className="text-red-600">⚠️</span>
              Desativar Usuário?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-left whitespace-pre-line">
              {`Tem certeza que deseja desativar este usuário?\n\nEsta ação irá:\n• Bloquear o acesso do usuário ao sistema\n• Manter o histórico de atividades\n• Você pode reativá-lo a qualquer momento`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteConfirmUser && handleDeleteUser(deleteConfirmUser)}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Sim, Desativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
