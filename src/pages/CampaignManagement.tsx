import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Play, Pause, Eye, Edit } from 'lucide-react';
import BackToHomeButton from '@/components/BackToHomeButton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface Campaign {
  id: string;
  name: string;
  product: string;
  is_active: boolean;
  created_at: string;
  participant_count?: number;
}

export default function CampaignManagement() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusConfirm, setStatusConfirm] = useState<{ open: boolean; campaign: Campaign | null; action: 'pause' | 'activate' }>({
    open: false, campaign: null, action: 'pause'
  });
  const [isToggling, setIsToggling] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    loadCampaigns();
  }, []);

  async function loadCampaigns() {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        navigate('/login');
        return;
      }

      const { data, error } = await supabase
        .from('campaigns')
        .select(`
          id,
          name,
          product,
          is_active,
          created_at
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch participant counts for each campaign
      const campaignsWithCounts = await Promise.all(
        (data || []).map(async (campaign) => {
          const { count } = await supabase
            .from('campaign_participants')
            .select('id', { count: 'exact', head: true })
            .eq('campaign_id', campaign.id);
          return { ...campaign, participant_count: count || 0 };
        })
      );

      setCampaigns(campaignsWithCounts);
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar campanhas',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  const openStatusConfirm = (campaign: Campaign) => {
    setStatusConfirm({
      open: true,
      campaign,
      action: campaign.is_active ? 'pause' : 'activate'
    });
  };

  async function toggleCampaignStatus() {
    if (!statusConfirm.campaign) return;
    
    setIsToggling(true);
    try {
      const newStatus = !statusConfirm.campaign.is_active;
      const { error } = await supabase
        .from('campaigns')
        .update({ is_active: newStatus })
        .eq('id', statusConfirm.campaign.id);

      if (error) throw error;

      toast({
        title: newStatus ? 'Campanha ativada' : 'Campanha pausada',
        description: 'Status atualizado com sucesso',
      });

      setStatusConfirm({ open: false, campaign: null, action: 'pause' });
      loadCampaigns();
    } catch (error: any) {
      toast({
        title: 'Erro ao atualizar status',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsToggling(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-6xl mx-auto">
          <p>Carregando campanhas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <BackToHomeButton />
        
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Campanhas</h1>
            <p className="text-gray-600 mt-2">
              Gerencie suas campanhas de prospecção
            </p>
          </div>
          <Button
            onClick={() => navigate('/campaign-builder')}
            className="flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Nova Campanha
          </Button>
        </div>

        {campaigns.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-gray-500 mb-4">
                Nenhuma campanha criada ainda
              </p>
              <Button
                onClick={() => navigate('/campaign-builder')}
                className="flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Criar Primeira Campanha
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {campaigns.map((campaign) => (
              <Card key={campaign.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg">{campaign.name}</CardTitle>
                    <span
                      className={`px-2 py-1 text-xs rounded ${
                        campaign.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {campaign.is_active ? 'Ativa' : 'Pausada'}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 mb-4">
                    <p className="text-sm text-gray-600">
                      <strong>Produto:</strong> {campaign.product?.substring(0, 50) || 'N/A'}{campaign.product?.length > 50 ? '...' : ''}
                    </p>
                    <p className="text-sm text-gray-600">
                      <strong>Participantes:</strong> {campaign.participant_count || 0}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openStatusConfirm(campaign)}
                      className="flex-1"
                    >
                      {campaign.is_active ? (
                        <>
                          <Pause className="w-4 h-4 mr-1" />
                          Pausar
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 mr-1" />
                          Ativar
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() =>
                        navigate(`/campaign-details?id=${campaign.id}`)
                      }
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      Ver
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        navigate(`/campaign-builder?id=${campaign.id}`)
                      }
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Dialog de Confirmação de Status */}
      <ConfirmDialog
        open={statusConfirm.open}
        onOpenChange={(open) => setStatusConfirm({ ...statusConfirm, open })}
        title={statusConfirm.action === 'pause' ? '⏸️ Pausar Campanha?' : '▶️ Ativar Campanha?'}
        description={statusConfirm.action === 'pause' 
          ? `Tem certeza que deseja PAUSAR a campanha "${statusConfirm.campaign?.name}"?\n\n• Todos os participantes ativos serão pausados\n• Novas mensagens não serão enviadas\n• Você pode reativar a qualquer momento`
          : `Tem certeza que deseja ATIVAR a campanha "${statusConfirm.campaign?.name}"?\n\n• Os participantes começarão a receber mensagens\n• O agente de IA será ativado\n• A campanha entrará em operação imediata`
        }
        confirmText={statusConfirm.action === 'pause' ? 'Sim, Pausar' : 'Sim, Ativar'}
        cancelText="Cancelar"
        variant={statusConfirm.action === 'pause' ? 'warning' : 'default'}
        onConfirm={toggleCampaignStatus}
        isLoading={isToggling}
      />
    </div>
  );
}
