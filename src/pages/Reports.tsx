import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BarChart3, TrendingUp, Users, Target, MessageSquare, Calendar } from 'lucide-react';

export default function Reports() {
  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Relatórios e Métricas
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Análises detalhadas do desempenho das suas campanhas
        </p>
      </div>

      {/* Coming Soon Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="border-2 border-dashed">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                <Target className="h-6 w-6 text-blue-500" />
              </div>
              <CardTitle>Performance de Campanhas</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <CardDescription>
              Métricas detalhadas de conversão, taxa de resposta e ROI por campanha
            </CardDescription>
            <p className="text-sm text-gray-500 mt-4 italic">Em breve...</p>
          </CardContent>
        </Card>

        <Card className="border-2 border-dashed">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20">
                <Users className="h-6 w-6 text-green-500" />
              </div>
              <CardTitle>Análise de Contatos</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <CardDescription>
              Segmentação de contatos, engajamento e histórico de interações
            </CardDescription>
            <p className="text-sm text-gray-500 mt-4 italic">Em breve...</p>
          </CardContent>
        </Card>

        <Card className="border-2 border-dashed">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20">
                <MessageSquare className="h-6 w-6 text-purple-500" />
              </div>
              <CardTitle>Mensagens WhatsApp</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <CardDescription>
              Volume de mensagens, horários de pico e taxa de entrega
            </CardDescription>
            <p className="text-sm text-gray-500 mt-4 italic">Em breve...</p>
          </CardContent>
        </Card>

        <Card className="border-2 border-dashed">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-900/20">
                <TrendingUp className="h-6 w-6 text-orange-500" />
              </div>
              <CardTitle>Funil de Vendas</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <CardDescription>
              Visualização do pipeline, taxa de conversão por estágio e tempo médio
            </CardDescription>
            <p className="text-sm text-gray-500 mt-4 italic">Em breve...</p>
          </CardContent>
        </Card>

        <Card className="border-2 border-dashed">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20">
                <Calendar className="h-6 w-6 text-red-500" />
              </div>
              <CardTitle>Tendências Temporais</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <CardDescription>
              Análise por período, sazonalidade e previsões de performance
            </CardDescription>
            <p className="text-sm text-gray-500 mt-4 italic">Em breve...</p>
          </CardContent>
        </Card>

        <Card className="border-2 border-dashed">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-indigo-50 dark:bg-indigo-900/20">
                <BarChart3 className="h-6 w-6 text-indigo-500" />
              </div>
              <CardTitle>Dashboard Executivo</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <CardDescription>
              Visão consolidada com KPIs principais e insights estratégicos
            </CardDescription>
            <p className="text-sm text-gray-500 mt-4 italic">Em breve...</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
