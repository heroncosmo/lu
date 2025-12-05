import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import {
  Users,
  Target,
  MessageSquare,
  TrendingUp,
  ListChecks,
  Phone,
  Mail,
  Calendar,
  ArrowRight,
  Activity,
} from 'lucide-react';

interface DashboardStats {
  totalCampaigns: number;
  activeCampaigns: number;
  totalContacts: number;
  totalLists: number;
  whatsappInstances: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalCampaigns: 0,
    activeCampaigns: 0,
    totalContacts: 0,
    totalLists: 0,
    whatsappInstances: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    try {
      setLoading(true);

      const [campaigns, contacts, lists, instances] = await Promise.all([
        supabase.from('campaigns').select('id, is_active', { count: 'exact' }),
        supabase.from('crm_contacts').select('id', { count: 'exact' }),
        supabase.from('crm_contact_lists').select('id', { count: 'exact' }),
        supabase.from('whatsapp_instances').select('id, is_active', { count: 'exact' }),
      ]);

      setStats({
        totalCampaigns: campaigns.count || 0,
        activeCampaigns: campaigns.data?.filter((c) => c.is_active).length || 0,
        totalContacts: contacts.count || 0,
        totalLists: lists.count || 0,
        whatsappInstances: instances.data?.filter((i) => i.is_active).length || 0,
      });
    } catch (error) {
      console.error('Erro ao carregar estatísticas:', error);
    } finally {
      setLoading(false);
    }
  }

  const statCards = [
    {
      title: 'Campanhas Ativas',
      value: stats.activeCampaigns,
      total: stats.totalCampaigns,
      icon: Target,
      color: 'text-blue-500',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      link: '/campaigns',
    },
    {
      title: 'Contatos CRM',
      value: stats.totalContacts,
      icon: Users,
      color: 'text-green-500',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
      link: '/crm-contacts',
    },
    {
      title: 'Listas de Contatos',
      value: stats.totalLists,
      icon: ListChecks,
      color: 'text-purple-500',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20',
      link: '/contact-lists',
    },
    {
      title: 'WhatsApp Ativo',
      value: stats.whatsappInstances,
      icon: MessageSquare,
      color: 'text-orange-500',
      bgColor: 'bg-orange-50 dark:bg-orange-900/20',
      link: '/whatsapp-instances',
    },
  ];

  const quickActions = [
    {
      title: 'Nova Campanha',
      description: 'Criar uma nova campanha de prospecção',
      icon: Target,
      link: '/campaign-builder',
      color: 'text-blue-600',
    },
    {
      title: 'Gerenciar Contatos',
      description: 'Ver e editar contatos do CRM',
      icon: Users,
      link: '/crm-contacts',
      color: 'text-green-600',
    },
    {
      title: 'Criar Lista',
      description: 'Organizar contatos em listas',
      icon: ListChecks,
      link: '/contact-lists',
      color: 'text-purple-600',
    },
    {
      title: 'Pipeline Kanban',
      description: 'Visualizar funil de vendas',
      icon: Activity,
      link: '/kanban',
      color: 'text-orange-600',
    },
  ];

  const recentActivity = [
    { icon: Phone, text: 'Prospecção iniciada', time: '2 horas atrás', color: 'text-blue-500' },
    { icon: Mail, text: 'Novo contato adicionado', time: '5 horas atrás', color: 'text-green-500' },
    { icon: Target, text: 'Campanha finalizada', time: '1 dia atrás', color: 'text-purple-500' },
  ];

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Dashboard
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Visão geral do seu CRM de Prospecção
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statCards.map((stat, index) => (
          <Link key={index} to={stat.link}>
            <Card className="hover:shadow-lg transition-shadow cursor-pointer">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                    <stat.icon className={`h-6 w-6 ${stat.color}`} />
                  </div>
                  <TrendingUp className="h-5 w-5 text-gray-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                    {stat.title}
                  </p>
                  <div className="flex items-baseline gap-2">
                    <p className="text-3xl font-bold text-gray-900 dark:text-white">
                      {loading ? '...' : stat.value}
                    </p>
                    {stat.total !== undefined && (
                      <p className="text-sm text-gray-500">de {stat.total}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Ações Rápidas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {quickActions.map((action, index) => (
                  <Link key={index} to={action.link}>
                    <Card className="hover:shadow-md transition-all hover:scale-105 cursor-pointer border-2 border-transparent hover:border-blue-200 dark:hover:border-blue-800">
                      <CardContent className="pt-6">
                        <div className="flex items-start gap-4">
                          <div className={`p-2 rounded-lg bg-gray-50 dark:bg-gray-800`}>
                            <action.icon className={`h-6 w-6 ${action.color}`} />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                              {action.title}
                            </h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {action.description}
                            </p>
                          </div>
                          <ArrowRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Atividades Recentes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentActivity.map((activity, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg bg-gray-50 dark:bg-gray-800`}>
                      <activity.icon className={`h-4 w-4 ${activity.color}`} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {activity.text}
                      </p>
                      <p className="text-xs text-gray-500">{activity.time}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="outline" className="w-full mt-4">
                Ver Todas
              </Button>
            </CardContent>
          </Card>

          {/* Calendar Widget */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Próximas Ações
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Nenhuma ação agendada
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
