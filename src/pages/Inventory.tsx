/**
 * Inventory Management - Gerenciamento de Estoque via API Redsis
 * Features:
 * - Busca chapas e cavaletes do Redsis (via Edge Function)
 * - Exibe estoque disponível com fotos
 * - Permite filtrar e buscar produtos
 * - Envia promoções/novidades para clientes
 * - GPT gera mensagens personalizadas por produto (via Edge Function)
 * 
 * SECURITY: Todas as chamadas a APIs externas (Redsis, GPT) são feitas
 * através de Edge Functions para proteger credenciais.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import type { Chapa, Cavalete } from '@/integrations/redsis/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  Loader2, 
  Package, 
  Search, 
  ImageOff,
  Box
} from 'lucide-react';
import BackToHomeButton from '@/components/BackToHomeButton';

type InventoryItem = (Chapa | Cavalete) & {
  type: 'chapa' | 'cavalete';
};

export default function Inventory() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [chapas, setChapas] = useState<Chapa[]>([]);
  const [cavaletes, setCavaletes] = useState<Cavalete[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    checkAuthAndFetch();
  }, []);

  // Verificar autenticação antes de carregar dados
  const checkAuthAndFetch = async () => {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      toast({
        title: 'Não autorizado',
        description: 'Faça login para acessar o inventário',
        variant: 'destructive',
      });
      navigate('/login');
      return;
    }
    fetchInventory();
  };

  const fetchInventory = async () => {
    console.log('📦 Carregando estoque via Edge Function');
    try {
      setLoading(true);

      // Buscar estoque via Edge Function (protege credenciais Redsis)
      const [chapasResult, cavaletesResult] = await Promise.all([
        supabase.functions.invoke('inventory-api', { body: { action: 'getChapas' } }),
        supabase.functions.invoke('inventory-api', { body: { action: 'getCavaletes' } }),
      ]);

      if (chapasResult.error) throw new Error(chapasResult.error.message);
      if (cavaletesResult.error) throw new Error(cavaletesResult.error.message);

      const chapasData = chapasResult.data?.data || [];
      const cavaletesData = cavaletesResult.data?.data || [];

      setChapas(chapasData);
      setCavaletes(cavaletesData);

      toast({
        title: 'Estoque carregado',
        description: `${chapasData.length} chapas e ${cavaletesData.length} cavaletes encontrados`,
      });

    } catch (error) {
      console.error('Erro ao buscar estoque:', error);
      toast({
        title: 'Erro ao carregar estoque',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredChapas = chapas.filter(chapa =>
    chapa.material.toLowerCase().includes(searchTerm.toLowerCase()) ||
    chapa.lote.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredCavaletes = cavaletes.filter(cav =>
    cav.material.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cav.blocotc.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="container mx-auto p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando estoque da API Redsis...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Package className="w-8 h-8" />
            Inventário
          </h1>
          <p className="text-muted-foreground mt-1">
            Estoque em tempo real da API Redsis
          </p>
        </div>
        <BackToHomeButton />
      </div>

      {/* Busca e Estatísticas */}
      <div className="mb-6 flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="Buscar por material, lote ou bloco..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Badge variant="secondary" className="text-sm">
          {chapas.length + cavaletes.length} itens em estoque
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* Lista de Produtos */}
        <div>
          <Tabs defaultValue="chapas">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="chapas">
                Chapas ({filteredChapas.length})
              </TabsTrigger>
              <TabsTrigger value="cavaletes">
                Cavaletes ({filteredCavaletes.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="chapas" className="space-y-4 mt-4">
              {filteredChapas.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <Box className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground">Nenhuma chapa encontrada</p>
                  </CardContent>
                </Card>
              ) : (
                filteredChapas.map(chapa => (
                  <Card 
                    key={chapa.codigo}
                    className="transition-all hover:shadow-md"
                  >
                    <CardContent className="p-4">
                      <div className="flex gap-4">
                        <div className="w-24 h-24 bg-gray-100 rounded-lg flex items-center justify-center">
                          {chapa.foto ? (
                            <img
                              src={`https://seu-servidor.com/fotos/chapas/${chapa.codigo}.jpg`}
                              alt={chapa.material}
                              className="w-full h-full object-cover rounded-lg"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                e.currentTarget.nextElementSibling?.classList.remove('hidden');
                              }}
                            />
                          ) : null}
                          <ImageOff className="w-8 h-8 text-muted-foreground" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className="font-bold text-lg">{chapa.material}</h3>
                              <p className="text-sm text-muted-foreground">
                                Lote: {chapa.lote} | Chapa: {chapa.chapa}
                              </p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
                            <div>
                              <p className="text-muted-foreground">Estoque</p>
                              <p className="font-semibold">{chapa.estoque_m2} m²</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Peças</p>
                              <p className="font-semibold">{chapa.pecas}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Preço/m²</p>
                              <p className="font-semibold text-green-600">R$ {chapa.preco_m2}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Situação</p>
                              <Badge variant={chapa.situacao === 'D' ? 'default' : 'secondary'}>
                                {chapa.situacao === 'D' ? 'Disponível' : chapa.situacao}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="cavaletes" className="space-y-4 mt-4">
              {filteredCavaletes.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <Box className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground">Nenhum cavalete encontrado</p>
                  </CardContent>
                </Card>
              ) : (
                filteredCavaletes.map(cavalete => (
                  <Card 
                    key={cavalete.codigo}
                    className="transition-all hover:shadow-md"
                  >
                    <CardContent className="p-4">
                      <div className="flex gap-4">
                        <div className="w-24 h-24 bg-gray-100 rounded-lg flex items-center justify-center">
                          <ImageOff className="w-8 h-8 text-muted-foreground" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className="font-bold text-lg">{cavalete.material}</h3>
                              <p className="text-sm text-muted-foreground">
                                Bloco: {cavalete.blocotc} | Esp: {cavalete.espessura}mm
                              </p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
                            <div>
                              <p className="text-muted-foreground">Estoque</p>
                              <p className="font-semibold">{cavalete.estoque_m2} m²</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Peças</p>
                              <p className="font-semibold">{cavalete.pecas}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Preço/m²</p>
                              <p className="font-semibold text-green-600">R$ {cavalete.preco_m2}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Situação</p>
                              <Badge variant={cavalete.situacao === 'D' ? 'default' : 'secondary'}>
                                {cavalete.situacao === 'D' ? 'Disponível' : cavalete.situacao}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}





