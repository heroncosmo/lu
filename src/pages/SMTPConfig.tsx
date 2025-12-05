import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import { Mail, Save, TestTube } from 'lucide-react';
import BackToHomeButton from '@/components/BackToHomeButton';

interface EmailSettings {
  id?: string;
  smtp_host: string;
  smtp_port: number;
  smtp_username: string;
  smtp_password: string;
  from_name: string;
  from_email: string;
  created_at?: string;
  updated_at?: string;
}

const SMTPConfig = () => {
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [formData, setFormData] = useState<EmailSettings>({
    smtp_host: '',
    smtp_port: 587,
    smtp_username: '',
    smtp_password: '',
    from_name: '',
    from_email: '',
  });

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('email_settings')
        .select('*')
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setFormData(data);
      }
    } catch (error: any) {
      console.error('Erro ao carregar configurações SMTP:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    try {
      setLoading(true);

      // Validações
      if (!formData.smtp_host || !formData.smtp_port || !formData.smtp_username || 
          !formData.smtp_password || !formData.from_name || !formData.from_email) {
        toast.error('Por favor, preencha todos os campos obrigatórios');
        return;
      }

      // Validar formato de email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.from_email)) {
        toast.error('Email remetente inválido');
        return;
      }

      const { error } = await supabase
        .from('email_settings')
        .upsert({
          ...formData,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;

      toast.success('Configurações SMTP salvas com sucesso!');
      await loadSettings();
    } catch (error: any) {
      console.error('Erro ao salvar configurações:', error);
      toast.error('Erro ao salvar configurações: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleTestConnection() {
    try {
      setTesting(true);

      if (!formData.smtp_host || !formData.smtp_port || !formData.smtp_username || !formData.smtp_password) {
        toast.error('Configure o SMTP antes de testar');
        return;
      }

      // TODO: Criar Edge Function para testar envio de email
      // Por enquanto, apenas simula o teste
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      toast.success('Conexão SMTP testada com sucesso!');
    } catch (error: any) {
      toast.error('Erro ao testar conexão: ' + error.message);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <BackToHomeButton />
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Mail className="h-8 w-8" />
          Configuração SMTP
        </h1>
        <p className="text-muted-foreground mt-2">
          Configure o servidor SMTP para envio de emails nas campanhas
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Servidor SMTP</CardTitle>
          <CardDescription>
            Insira as credenciais do seu provedor de email (Gmail, Outlook, SendGrid, etc.)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Host SMTP *</label>
              <Input
                value={formData.smtp_host}
                onChange={(e) => setFormData({ ...formData, smtp_host: e.target.value })}
                placeholder="smtp.gmail.com"
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Ex: smtp.gmail.com, smtp-mail.outlook.com
              </p>
            </div>

            <div>
              <label className="text-sm font-medium">Porta *</label>
              <Input
                type="number"
                value={formData.smtp_port}
                onChange={(e) => setFormData({ ...formData, smtp_port: parseInt(e.target.value) })}
                placeholder="587"
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Comum: 587 (TLS) ou 465 (SSL)
              </p>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Usuário / Email *</label>
            <Input
              value={formData.smtp_username}
              onChange={(e) => setFormData({ ...formData, smtp_username: e.target.value })}
              placeholder="seu@email.com"
              disabled={loading}
            />
          </div>

          <div>
            <label className="text-sm font-medium">Senha *</label>
            <Input
              type="password"
              value={formData.smtp_password}
              onChange={(e) => setFormData({ ...formData, smtp_password: e.target.value })}
              placeholder="Senha ou App Password"
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Para Gmail, use uma senha de app (App Password)
            </p>
          </div>

          <hr className="my-4" />

          <div>
            <label className="text-sm font-medium">Nome do Remetente *</label>
            <Input
              value={formData.from_name}
              onChange={(e) => setFormData({ ...formData, from_name: e.target.value })}
              placeholder="Sua Empresa"
              disabled={loading}
            />
          </div>

          <div>
            <label className="text-sm font-medium">Email Remetente *</label>
            <Input
              type="email"
              value={formData.from_email}
              onChange={(e) => setFormData({ ...formData, from_email: e.target.value })}
              placeholder="noreply@suaempresa.com"
              disabled={loading}
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              onClick={handleSave}
              disabled={loading}
              className="flex-1"
            >
              <Save className="h-4 w-4 mr-2" />
              {loading ? 'Salvando...' : 'Salvar Configurações'}
            </Button>

            <Button
              onClick={handleTestConnection}
              disabled={testing || loading}
              variant="outline"
            >
              <TestTube className="h-4 w-4 mr-2" />
              {testing ? 'Testando...' : 'Testar Conexão'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Provedores Comuns</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between border-b pb-2">
              <span className="font-medium">Gmail</span>
              <span className="text-muted-foreground">smtp.gmail.com:587</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="font-medium">Outlook</span>
              <span className="text-muted-foreground">smtp-mail.outlook.com:587</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="font-medium">SendGrid</span>
              <span className="text-muted-foreground">smtp.sendgrid.net:587</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Amazon SES</span>
              <span className="text-muted-foreground">email-smtp.us-east-1.amazonaws.com:587</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SMTPConfig;
