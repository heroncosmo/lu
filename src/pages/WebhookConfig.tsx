import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Copy, ExternalLink } from 'lucide-react';
import BackToHomeButton from '@/components/BackToHomeButton';

const WebhookConfig = () => {
  const [instanceId, setInstanceId] = useState('');
  const [token, setToken] = useState('');
  
  const webhookUrl = 'https://jufguvfzieysywthbafu.supabase.co/functions/v1/receive-whatsapp-message';

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('URL copiada para a área de transferência!');
  };

  const openWebhookConfig = () => {
    if (!instanceId || !token) {
      toast.error('Por favor, preencha o Instance ID e o Token');
      return;
    }

    const configUrl = `https://api.w-api.app/v1/webhook/update-webhook-received?instanceId=${instanceId}`;
    
    // Abrir o Postman ou ferramenta similar com a configuração
    const curlCommand = `curl --request PUT \\
  --url "${configUrl}" \\
  --header 'Authorization: Bearer ${token}' \\
  --header 'Content-Type: application/json' \\
  --data '{"value": "${webhookUrl}"}'`;

    copyToClipboard(curlCommand);
    toast.success('Comando cURL copiado! Execute-o para configurar o webhook.');
  };

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <BackToHomeButton />
      <h1 className="text-3xl font-bold mb-6 text-center">Configuração do Webhook W-API</h1>
      
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>URL do Webhook</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Input 
              value={webhookUrl} 
              readOnly 
              className="flex-1"
            />
            <Button 
              variant="outline" 
              onClick={() => copyToClipboard(webhookUrl)}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Esta URL receberá todas as mensagens enviadas para o seu WhatsApp.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Configurar Webhook na W-API</CardTitle>
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

          <Button 
            onClick={openWebhookConfig}
            className="w-full"
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Gerar Comando de Configuração
          </Button>

          <div className="bg-muted p-4 rounded-md">
            <h4 className="font-medium mb-2">Instruções:</h4>
            <ol className="list-decimal list-inside space-y-1 text-sm">
              <li>Preencha seu Instance ID e Token acima</li>
              <li>Clique em "Gerar Comando de Configuração"</li>
              <li>O comando cURL será copiado para sua área de transferência</li>
              <li>Cole e execute o comando em um terminal ou ferramenta como Postman</li>
              <li>Pronto! Seu webhook está configurado para receber mensagens</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Outros Webhooks Úteis</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between p-3 border rounded">
            <div>
              <p className="font-medium">Status de Conexão</p>
              <p className="text-sm text-muted-foreground">
                Recebe notificações quando a instância conecta ou desconecta
              </p>
            </div>
            <Button variant="outline" size="sm">
              Configurar
            </Button>
          </div>
          
          <div className="flex items-center justify-between p-3 border rounded">
            <div>
              <p className="font-medium">Status de Mensagens</p>
              <p className="text-sm text-muted-foreground">
                Recebe atualizações quando mensagens são entregues/lidas
              </p>
            </div>
            <Button variant="outline" size="sm">
              Configurar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default WebhookConfig;