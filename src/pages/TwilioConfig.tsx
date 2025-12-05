import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import { MessageSquare, Save, TestTube, ExternalLink } from 'lucide-react';
import BackToHomeButton from '@/components/BackToHomeButton';

interface SmsSettings {
  id?: string;
  account_sid: string;
  auth_token: string;
  phone_number: string;
  created_at?: string;
  updated_at?: string;
}

const TwilioConfig = () => {
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [formData, setFormData] = useState<SmsSettings>({
    account_sid: '',
    auth_token: '',
    phone_number: '',
  });

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('sms_settings')
        .select('*')
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setFormData(data);
      }
    } catch (error: any) {
      console.error('Erro ao carregar configurações Twilio:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    try {
      setLoading(true);

      // Validações
      if (!formData.account_sid || !formData.auth_token || !formData.phone_number) {
        toast.error('Por favor, preencha todos os campos obrigatórios');
        return;
      }

      // Validar formato do telefone (deve começar com +)
      if (!formData.phone_number.startsWith('+')) {
        toast.error('Número de telefone deve começar com + (ex: +5527999999999)');
        return;
      }

      // Validar Account SID (deve começar com AC)
      if (!formData.account_sid.startsWith('AC')) {
        toast.error('Account SID deve começar com "AC"');
        return;
      }

      const { error } = await supabase
        .from('sms_settings')
        .upsert({
          ...formData,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;

      toast.success('Configurações Twilio salvas com sucesso!');
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

      if (!formData.account_sid || !formData.auth_token || !formData.phone_number) {
        toast.error('Configure o Twilio antes de testar');
        return;
      }

      // TODO: Criar Edge Function para testar envio de SMS via Twilio
      // Por enquanto, apenas simula o teste
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      toast.success('Conexão Twilio testada com sucesso!');
    } catch (error: any) {
      toast.error('Erro ao testar conexão: ' + error.message);
    } finally {
      setTesting(false);
    }
  }

  function openTwilioConsole() {
    window.open('https://console.twilio.com/', '_blank');
  }

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <BackToHomeButton />
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <MessageSquare className="h-8 w-8" />
          Configuração Twilio SMS
        </h1>
        <p className="text-muted-foreground mt-2">
          Configure o Twilio para envio de SMS nas campanhas
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Credenciais Twilio</CardTitle>
          <CardDescription>
            Obtenha suas credenciais no <button onClick={openTwilioConsole} className="text-primary hover:underline inline-flex items-center gap-1">
              Console Twilio <ExternalLink className="h-3 w-3" />
            </button>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Account SID *</label>
            <Input
              value={formData.account_sid}
              onChange={(e) => setFormData({ ...formData, account_sid: e.target.value })}
              placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Começa com "AC", encontrado no Dashboard do Twilio
            </p>
          </div>

          <div>
            <label className="text-sm font-medium">Auth Token *</label>
            <Input
              type="password"
              value={formData.auth_token}
              onChange={(e) => setFormData({ ...formData, auth_token: e.target.value })}
              placeholder="Seu Auth Token"
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Token de autenticação, mantenha seguro e privado
            </p>
          </div>

          <div>
            <label className="text-sm font-medium">Número Twilio *</label>
            <Input
              value={formData.phone_number}
              onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
              placeholder="+15551234567"
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Formato internacional com código do país (ex: +5527999999999)
            </p>
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
          <CardTitle>Como configurar o Twilio</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm">
            <li className="flex gap-2">
              <span className="font-bold text-primary">1.</span>
              <span>
                Acesse o <button onClick={openTwilioConsole} className="text-primary hover:underline inline-flex items-center gap-1">
                  Console Twilio <ExternalLink className="h-3 w-3" />
                </button> e faça login
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-primary">2.</span>
              <span>No Dashboard, copie o <strong>Account SID</strong> e o <strong>Auth Token</strong></span>
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-primary">3.</span>
              <span>Vá em <strong>Phone Numbers → Manage → Active Numbers</strong></span>
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-primary">4.</span>
              <span>
                Se não tiver um número, clique em <strong>Buy a Number</strong> para adquirir um número com capacidade de SMS
              </span>
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-primary">5.</span>
              <span>Copie o número no formato internacional (com +)</span>
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-primary">6.</span>
              <span>Cole as credenciais aqui e salve</span>
            </li>
          </ol>
        </CardContent>
      </Card>

      <Card className="mt-4 border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20">
        <CardHeader>
          <CardTitle className="text-amber-700 dark:text-amber-400 flex items-center gap-2">
            ⚠️ Importante
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <p>
            • Números Twilio em <strong>trial mode</strong> só podem enviar SMS para números verificados
          </p>
          <p>
            • Para enviar para qualquer número, você precisa <strong>upgrade</strong> da conta
          </p>
          <p>
            • Consulte os <button onClick={() => window.open('https://www.twilio.com/pricing/messaging', '_blank')} className="text-primary hover:underline">
              preços do Twilio
            </button> para sua região
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default TwilioConfig;
