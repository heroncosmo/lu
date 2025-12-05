import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import BackToHomeButton from '@/components/BackToHomeButton';

const WebhookTest = () => {
  const [instanceId, setInstanceId] = useState('');
  const [token, setToken] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [webhookStatus, setWebhookStatus] = useState<'unknown' | 'configured' | 'not-configured'>('unknown');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const webhookUrl = supabaseUrl ? `${supabaseUrl}/functions/v1/receive-whatsapp-message` : '';

  const testWebhook = async () => {
    if (!instanceId || !token) {
      toast.error('Por favor, preencha o Instance ID e o Token');
      return;
    }

    if (!webhookUrl) {
      toast.error('Configure VITE_SUPABASE_URL para gerar o webhook alvo.');
      return;
    }

    setIsTesting(true);
    
    try {
      // Testar se o webhook está configurado - endpoint correto da documentação
      const statusResponse = await fetch(`https://api.w-api.app/v1/webhook/fetch-webhook-logs?instanceId=${instanceId}&perPage=1`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!statusResponse.ok) {
        throw new Error('Erro ao verificar status do webhook');
      }

      const statusData = await statusResponse.json();
      console.log('Logs do webhook:', statusData);

      // Verificar se há logs recentes para nosso webhook
      const hasRecentLogs = statusData.logs && statusData.logs.length > 0;
      
      if (hasRecentLogs) {
        setWebhookStatus('configured');
        toast.success('Webhook está configurado e recebendo eventos!');
      } else {
        setWebhookStatus('not-configured');
        toast.error('Webhook não está configurado ou não recebeu eventos recentemente');
      }
    } catch (error) {
      console.error('Erro ao testar webhook:', error);
      toast.error('Erro ao testar webhook: ' + error.message);
      setWebhookStatus('not-configured');
    } finally {
      setIsTesting(false);
    }
  };

  const configureWebhook = async () => {
    if (!instanceId || !token) {
      toast.error('Por favor, preencha o Instance ID e o Token');
      return;
    }

    if (!webhookUrl) {
      toast.error('Configure VITE_SUPABASE_URL para gerar o webhook alvo.');
      return;
    }

    try {
      // Configurar webhook para receber mensagens
      const response = await fetch(`https://api.w-api.app/v1/webhook/update-webhook-received?instanceId=${instanceId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          value: webhookUrl
        })
      });

      if (!response.ok) {
        throw new Error('Erro ao configurar webhook');
      }

      const data = await response.json();
      console.log('Resposta da configuração:', data);
      
      toast.success('Webhook configurado com sucesso!');
      setWebhookStatus('configured');
    } catch (error) {
      console.error('Erro ao configurar webhook:', error);
      toast.error('Erro ao configurar webhook: ' + error.message);
    }
  };

  const testConnection = async () => {
    if (!instanceId || !token) {
      toast.error('Por favor, preencha o Instance ID e o Token');
      return;
    }

    try {
      const response = await fetch(`https://api.w-api.app/v1/instance/status-instance?instanceId=${instanceId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Erro ao verificar status da instância');
      }

      const data = await response.json();
      console.log('Status da instância:', data);
      
      if (data.connected) {
        toast.success('Instância está conectada!');
      } else {
        toast.error('Instância não está conectada. Verifique o QR Code.');
      }
    } catch (error) {
      console.error('Erro ao testar conexão:', error);
      toast.error('Erro ao testar conexão: ' + error.message);
    }
  };

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <BackToHomeButton />
      <h1 className="text-3xl font-bold mb-6 text-center">Teste de Webhook W-API</h1>
      
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>URL do Webhook</CardTitle>
        </CardHeader>
        <CardContent>
          <Input 
            value={webhookUrl || 'Configure VITE_SUPABASE_URL antes de usar'} 
            readOnly 
            className="mb-2"
          />
          <p className="text-sm text-muted-foreground">
            Esta URL deve ser configurada na W-API para receber mensagens.
          </p>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Configuração da W-API</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Instance ID</label>
            <Input 
              value={instanceId}
              onChange={(e) => setInstanceId(e.target.value)}
              placeholder="Seu Instance ID da W-API"
            />
          </div>
          
          <div>
            <label className="text-sm font-medium">Token</label>
            <Input 
              value={token}
              onChange={(e) => setToken(e.target.value)}
              type="password"
              placeholder="Seu Token da W-API"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <Button 
              onClick={testConnection}
              variant="outline"
              className="w-full"
            >
              Testar Conexão
            </Button>
            
            <Button 
              onClick={testWebhook}
              disabled={isTesting}
              className="w-full"
            >
              {isTesting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Testando...
                </>
              ) : (
                'Testar Webhook'
              )}
            </Button>
            
            <Button 
              onClick={configureWebhook}
              variant="outline"
              className="w-full"
            >
              Configurar Webhook
            </Button>
          </div>

          {webhookStatus !== 'unknown' && (
            <div className={`p-4 rounded-md flex items-center gap-2 ${
              webhookStatus === 'configured' 
                ? 'bg-green-50 text-green-800 border border-green-200' 
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              {webhookStatus === 'configured' ? (
                <CheckCircle className="h-5 w-5" />
              ) : (
                <XCircle className="h-5 w-5" />
              )}
              <span>
                {webhookStatus === 'configured' 
                  ? 'Webhook está configurado corretamente!' 
                  : 'Webhook não está configurado corretamente'}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Instruções</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>Preencha seu Instance ID e Token da W-API acima</li>
            <li>Clique em "Testar Conexão" para verificar se a instância está online</li>
            <li>Clique em "Configurar Webhook" para configurar a URL</li>
            <li>Clique em "Testar Webhook" para verificar se está funcionando</li>
            <li>Envie uma mensagem para o número da sua instância W-API</li>
            <li>Verifique os logs da Edge Function no Supabase Dashboard</li>
          </ol>
          
          <div className="mt-4 p-3 bg-muted rounded-md">
            <p className="text-sm font-medium mb-1">Para verificar os logs:</p>
            <ol className="list-decimal list-inside text-xs space-y-1">
              <li>Acesse o Supabase Dashboard</li>
              <li>Vá para "Edge Functions"</li>
              <li>Selecione "receive-whatsapp-message"</li>
              <li>Clique em "Logs" para ver as requisições recebidas</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default WebhookTest;