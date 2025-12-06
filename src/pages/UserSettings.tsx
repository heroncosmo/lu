import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserProfile } from '@/hooks/useUserProfile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Loader2, AlertCircle, CheckCircle2, Lock, User, Mail } from 'lucide-react';

export default function UserSettings() {
  const { profile } = useUserProfile();
  const [isLoading, setIsLoading] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const handleChangePassword = async () => {
    setPasswordError(null);
    setPasswordSuccess(false);

    // Validações
    if (!currentPassword.trim()) {
      setPasswordError('Digite sua senha atual');
      return;
    }

    if (!newPassword.trim()) {
      setPasswordError('Digite a nova senha');
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError('A nova senha deve ter no mínimo 6 caracteres');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('A confirmação de senha não corresponde');
      return;
    }

    if (currentPassword === newPassword) {
      setPasswordError('A nova senha deve ser diferente da atual');
      return;
    }

    setIsLoading(true);

    try {
      // Primeiro, tentar fazer login com email e senha atual para verificar
      const { data: sessionData, error: signInError } = await supabase.auth.signInWithPassword({
        email: profile?.email || '',
        password: currentPassword,
      });

      if (signInError) {
        setPasswordError('Senha atual incorreta');
        setIsLoading(false);
        return;
      }

      // Se o login funcionou, atualizar a senha
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        setPasswordError(updateError.message);
      } else {
        setPasswordSuccess(true);
        toast.success('Senha alterada com sucesso!');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        
        // Limpar mensagem de sucesso após 5 segundos
        setTimeout(() => setPasswordSuccess(false), 5000);
      }
    } catch (err) {
      console.error('Erro ao alterar senha:', err);
      setPasswordError('Erro ao alterar senha. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!profile) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <div className="space-y-6">
        {/* Cabeçalho */}
        <div>
          <h1 className="text-3xl font-bold">Configurações</h1>
          <p className="text-muted-foreground mt-2">Gerencie suas configurações de conta pessoal</p>
        </div>

        {/* Informações do Perfil */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Informações do Perfil
            </CardTitle>
            <CardDescription>
              Seus dados de cadastro no sistema
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Nome Completo</Label>
              <div className="p-3 bg-muted rounded-lg border border-input text-sm">
                {profile.full_name || 'Não informado'}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                E-mail
              </Label>
              <div className="p-3 bg-muted rounded-lg border border-input text-sm">
                {profile.email}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Função</Label>
              <div className="p-3 bg-muted rounded-lg border border-input text-sm">
                <span className="font-medium">
                  {profile.role === 'admin' ? '👤 Administrador' : '👥 Membro da Equipe'}
                </span>
              </div>
            </div>

            {profile.created_at && (
              <div className="space-y-2">
                <Label>Membro desde</Label>
                <div className="p-3 bg-muted rounded-lg border border-input text-sm">
                  {new Date(profile.created_at).toLocaleDateString('pt-BR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Alterar Senha */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Alterar Senha
            </CardTitle>
            <CardDescription>
              Mantenha sua conta segura com uma senha forte
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {passwordError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Erro</AlertTitle>
                <AlertDescription>{passwordError}</AlertDescription>
              </Alert>
            )}

            {passwordSuccess && (
              <Alert className="border-green-200 bg-green-50 text-green-900 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300">
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Sucesso!</AlertTitle>
                <AlertDescription>
                  Sua senha foi alterada com sucesso. Você pode usar a nova senha no próximo login.
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="current-password">Senha Atual</Label>
              <Input
                id="current-password"
                type="password"
                placeholder="Digite sua senha atual"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Precisamos confirmar sua identidade antes de alterar a senha
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-password">Nova Senha</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="Digite a nova senha"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Mínimo 6 caracteres
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmar Nova Senha</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="Confirme a nova senha"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <div className="pt-4">
              <Button
                onClick={handleChangePassword}
                disabled={isLoading || !currentPassword || !newPassword || !confirmPassword}
                className="w-full"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Alterando senha...
                  </>
                ) : (
                  <>
                    <Lock className="mr-2 h-4 w-4" />
                    Alterar Senha
                  </>
                )}
              </Button>
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Dica de Segurança</AlertTitle>
              <AlertDescription>
                Use uma combinação de letras maiúsculas, minúsculas, números e símbolos para uma senha mais segura.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
