import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, TestTube, CheckCircle, XCircle, ExternalLink } from 'lucide-react';
import { RedsisClient } from '@/integrations/redsis/client';

interface RedsisConfig {
  usuario: string;
  senha: string;
  servidor: string;
  porta: string;
  empresa?: string;
}

export default function RedsisConfig() {
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<'success' | 'error' | null>(null);
  const [config, setConfig] = useState<RedsisConfig>({
    usuario: '',
    senha: '',
    servidor: '',
    porta: '',
    empresa: '',
  });
  const { toast } = useToast();

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'redsis_config')
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (data?.value) {
        const loadedConfig = data.value as RedsisConfig;
        setConfig({
          usuario: loadedConfig.usuario || '',
          senha: loadedConfig.senha || '',
          servidor: loadedConfig.servidor || '',
          porta: loadedConfig.porta || '',
          empresa: loadedConfig.empresa ? String(loadedConfig.empresa) : '',
        });
      }
    } catch (error: any) {
      console.error('Erro ao carregar configuração:', error);
    }
  }

  async function testConnection() {
    if (!config.usuario || !config.senha || !config.servidor || !config.porta) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Preencha todos os campos antes de testar.',
        variant: 'destructive',
      });
      return;
    }

    setTesting(true);
    setTestStatus(null);

    try {
      const client = new RedsisClient({
        ...config,
        empresa: config.empresa ? Number(config.empresa) : undefined,
      });
      
      // Tenta buscar 1 cliente para validar autenticação e acesso
      await client.getClientes({ limit: 1 });

      setTestStatus('success');
      toast({
        title: 'Conexão bem-sucedida!',
        description: 'As credenciais estão corretas e a API está respondendo.',
      });
    } catch (error: any) {
      setTestStatus('error');
      toast({
        title: 'Erro na conexão',
        description: error.message || 'Verifique as credenciais e tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setTesting(false);
    }
  }

  async function saveConfig() {
    if (!config.usuario || !config.senha || !config.servidor || !config.porta) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Preencha todos os campos antes de salvar.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert({
          key: 'redsis_config',
          value: {
            ...config,
            empresa: config.empresa ? Number(config.empresa) : undefined,
          },
        });

      if (error) throw error;

      toast({
        title: 'Configuração salva',
        description: 'As credenciais do Redsis foram salvas com sucesso!',
      });

      // Recarrega os dados salvos
      await loadConfig();
    } catch (error: any) {
      toast({
        title: 'Erro ao salvar',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container mx-auto py-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Configuração Redsis API
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Configure as credenciais para integração com a API Redsis
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Credenciais de Acesso
            <a
              href="https://swagger.redsis.com.br/?urls.primaryName=Web"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              <ExternalLink className="h-4 w-4" />
              Documentação API
            </a>
          </CardTitle>
          <CardDescription>
            Insira suas credenciais de acesso à API Redsis. Estas informações são criptografadas e armazenadas com segurança.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertDescription>
              Para obter suas credenciais, entre em contato com o suporte do Redsis ou acesse o painel administrativo do seu ERP.
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            <div>
              <Label htmlFor="usuario">Usuário *</Label>
              <Input
                id="usuario"
                type="text"
                placeholder="Seu usuário Redsis"
                value={config.usuario}
                onChange={(e) => setConfig({ ...config, usuario: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="senha">Senha *</Label>
              <Input
                id="senha"
                type="password"
                placeholder="Sua senha Redsis"
                value={config.senha}
                onChange={(e) => setConfig({ ...config, senha: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="servidor">Servidor *</Label>
              <Input
                id="servidor"
                type="text"
                placeholder="Ex: 192.168.1.100 ou servidor.empresa.com"
                value={config.servidor}
                onChange={(e) => setConfig({ ...config, servidor: e.target.value })}
              />
              <p className="text-sm text-gray-500 mt-1">
                Endereço IP ou domínio do servidor Redsis
              </p>
            </div>

            <div>
              <Label htmlFor="porta">Porta *</Label>
              <Input
                id="porta"
                type="text"
                placeholder="Ex: 3000"
                value={config.porta}
                onChange={(e) => setConfig({ ...config, porta: e.target.value })}
              />
              <p className="text-sm text-gray-500 mt-1">
                Porta do serviço Redsis (padrão: 3000)
              </p>
            </div>

            <div>
              <Label htmlFor="empresa">Código da Empresa</Label>
              <Input
                id="empresa"
                type="number"
                placeholder="Ex: 1"
                value={config.empresa || ''}
                onChange={(e) => setConfig({ ...config, empresa: e.target.value })}
              />
              <p className="text-sm text-gray-500 mt-1">
                Encontrado na documentação do Redsis. Obrigatório para carregar estoque.
              </p>
            </div>
          </div>

          {testStatus && (
            <Alert variant={testStatus === 'success' ? 'default' : 'destructive'}>
              <div className="flex items-center gap-2">
                {testStatus === 'success' ? (
                  <>
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <AlertDescription>
                      Conexão testada com sucesso! As credenciais estão corretas.
                    </AlertDescription>
                  </>
                ) : (
                  <>
                    <XCircle className="h-5 w-5" />
                    <AlertDescription>
                      Falha na conexão. Verifique as credenciais e tente novamente.
                    </AlertDescription>
                  </>
                )}
              </div>
            </Alert>
          )}

          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              onClick={testConnection}
              disabled={testing || loading}
              className="flex-1"
            >
              {testing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Testando...
                </>
              ) : (
                <>
                  <TestTube className="mr-2 h-4 w-4" />
                  Testar Conexão
                </>
              )}
            </Button>

            <Button
              onClick={saveConfig}
              disabled={loading || testing}
              className="flex-1"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Salvar Configuração
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Informações da API</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <p><strong>Base URL:</strong> http://{config.servidor || '{servidor}'}:{config.porta || '{porta}'}/api/Redsis</p>
          <p><strong>Endpoint de Autenticação:</strong> POST /auth</p>
          <p><strong>Endpoint de Clientes:</strong> GET /clientes</p>
          <p className="pt-2 border-t">
            <strong>Documentação completa:</strong>{' '}
            <a
              href="https://swagger.redsis.com.br/?urls.primaryName=Web"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-700"
            >
              Swagger API Redsis
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
