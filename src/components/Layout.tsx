import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useSession, UserPermissions } from '@/integrations/supabase/SessionContextProvider';
import { toast } from 'sonner';
import {
  LayoutDashboard,
  Users,
  ListChecks,
  Target,
  MessageSquare,
  Phone,
  BarChart3,
  FolderKanban,
  LogOut,
  Menu,
  X,
  UserCog,
  Webhook,
  Package,
  Settings,
  Mail,
  MessageCircle,
  UsersRound,
  ShieldCheck,
  SettingsIcon,
  CalendarClock,
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

interface NavItem {
  title: string;
  href: string;
  icon: React.ElementType;
  description?: string;
  permissionKey?: keyof UserPermissions;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

// Todas as seções de navegação com suas permissões
const ALL_NAV_SECTIONS: NavSection[] = [
  {
    title: 'Principal',
    items: [
      {
        title: 'Dashboard',
        href: '/',
        icon: LayoutDashboard,
        description: 'Visão geral do sistema',
        permissionKey: 'dashboard',
      },
    ],
  },
  {
    title: 'CRM & Contatos',
    items: [
      {
        title: 'Contatos CRM',
        href: '/crm-contacts',
        icon: Users,
        description: 'Gerenciar contatos do CRM',
        permissionKey: 'crm_contacts',
      },
      {
        title: 'Listas de Contatos',
        href: '/contact-lists',
        icon: ListChecks,
        description: 'Criar e gerenciar listas',
        permissionKey: 'contact_lists',
      },
      {
        title: 'CRM Chat',
        href: '/crm-chat',
        icon: MessageCircle,
        description: 'Conversas e filtros de leads',
        permissionKey: 'crm_chat',
      },
    ],
  },
  {
    title: 'Campanhas',
    items: [
      {
        title: 'Prospecção',
        href: '/campaigns',
        icon: Target,
        description: 'Gerenciar campanhas',
        permissionKey: 'campaigns',
      },
      {
        title: 'Playground',
        href: '/prospecting',
        icon: Phone,
        description: 'Playground de testes',
        permissionKey: 'playground',
      },
      {
        title: 'Kanban',
        href: '/kanban',
        icon: FolderKanban,
        description: 'Pipeline de vendas',
        permissionKey: 'kanban',
      },
      {
        title: 'Agendamentos',
        href: '/scheduled-contacts',
        icon: CalendarClock,
        description: 'Contatos agendados pela IA',
        permissionKey: 'playground',
      },
    ],
  },
  {
    title: 'Configurações',
    items: [
      {
        title: 'WhatsApp',
        href: '/whatsapp-instances',
        icon: MessageSquare,
        description: 'Instâncias WhatsApp',
        permissionKey: 'whatsapp',
      },
      {
        title: 'Usuários',
        href: '/user-management',
        icon: UsersRound,
        description: 'Gerenciar equipe',
        permissionKey: 'user_management',
      },
      {
        title: 'Agentes IA',
        href: '/agent-configuration',
        icon: UserCog,
        description: 'Configurar agentes',
        permissionKey: 'agents',
      },
      {
        title: 'Webhooks',
        href: '/webhook-config',
        icon: Webhook,
        description: 'Configurar webhooks',
        permissionKey: 'webhooks',
      },
      {
        title: 'Redsis API',
        href: '/redsis-config',
        icon: Settings,
        description: 'Configurar Redsis',
        permissionKey: 'redsis',
      },
      {
        title: 'Email SMTP',
        href: '/smtp-config',
        icon: Mail,
        description: 'Configurar SMTP',
        permissionKey: 'email_smtp',
      },
      {
        title: 'SMS Twilio',
        href: '/twilio-config',
        icon: MessageSquare,
        description: 'Configurar Twilio',
        permissionKey: 'sms_twilio',
      },
      {
        title: 'Inventário',
        href: '/inventory',
        icon: Package,
        permissionKey: 'inventory',
        description: 'Broadcast de inventário',
      },
      {
        title: 'Relatórios',
        href: '/reports',
        icon: BarChart3,
        description: 'Métricas e análises',
        permissionKey: 'reports',
      },
    ],
  },
];

export default function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { userProfile, isAdmin, hasPermission } = useSession();
  
  // Filtrar seções e itens baseado nas permissões do usuário
  const navSections = ALL_NAV_SECTIONS.map(section => ({
    ...section,
    items: section.items.filter(item => {
      // Se não tem permissionKey, mostrar sempre
      if (!item.permissionKey) return true;
      // Verificar permissão
      return hasPermission(item.permissionKey);
    }),
  })).filter(section => section.items.length > 0); // Remover seções vazias

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error('Erro ao fazer logout: ' + error.message);
    } else {
      toast.success('Logout realizado com sucesso!');
      navigate('/login');
    }
  };

  const isActive = (href: string) => {
    return location.pathname === href;
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      {/* Sidebar Desktop */}
      <aside
        className={`hidden lg:flex flex-col bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-all duration-300 ${
          sidebarOpen ? 'w-64' : 'w-20'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200 dark:border-gray-700">
          {sidebarOpen && (
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              Luchoa IA
            </h1>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="ml-auto"
          >
            {sidebarOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </Button>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 py-4">
          <nav className="space-y-6 px-3">
            {navSections.map((section) => (
              <div key={section.title}>
                {sidebarOpen && (
                  <h3 className="mb-2 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {section.title}
                  </h3>
                )}
                <div className="space-y-1">
                  {section.items.map((item) => (
                    <Link
                      key={item.href}
                      to={item.href}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                        isActive(item.href)
                          ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                      title={!sidebarOpen ? item.title : undefined}
                    >
                      <item.icon className="h-5 w-5 flex-shrink-0" />
                      {sidebarOpen && (
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{item.title}</span>
                          {item.adminOnly && (
                            <Badge variant="secondary" className="text-xs px-1 py-0">
                              <ShieldCheck className="h-3 w-3" />
                            </Badge>
                          )}
                        </div>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </ScrollArea>

        {/* Footer with User Info */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-4 space-y-3">
          {sidebarOpen && userProfile && (
            <div className="px-2">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {userProfile.full_name || userProfile.email.split('@')[0]}
              </p>
              <div className="flex items-center gap-1.5">
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {userProfile.email}
                </p>
                {isAdmin && (
                  <Badge variant="outline" className="text-xs px-1 py-0 h-4">
                    Admin
                  </Badge>
                )}
              </div>
            </div>
          )}
          <Link to="/user-settings" className="block">
            <Button
              variant="ghost"
              className="w-full justify-start"
            >
              <SettingsIcon className="h-5 w-5" />
              {sidebarOpen && <span className="ml-3">Configurações</span>}
            </Button>
          </Link>
          <Button
            variant="ghost"
            onClick={handleLogout}
            className="w-full justify-start"
          >
            <LogOut className="h-5 w-5" />
            {sidebarOpen && <span className="ml-3">Sair</span>}
          </Button>
        </div>
      </aside>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="fixed left-0 top-0 bottom-0 w-64 bg-white dark:bg-gray-800 shadow-xl">
            <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200 dark:border-gray-700">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                Luchoa Ia - CRM
              </h1>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileMenuOpen(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <ScrollArea className="h-[calc(100vh-8rem)] py-4">
              <nav className="space-y-6 px-3">
                {navSections.map((section) => (
                  <div key={section.title}>
                    <h3 className="mb-2 px-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {section.title}
                    </h3>
                    <div className="space-y-1">
                      {section.items.map((item) => (
                        <Link
                          key={item.href}
                          to={item.href}
                          onClick={() => setMobileMenuOpen(false)}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                            isActive(item.href)
                              ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                          }`}
                        >
                          <item.icon className="h-5 w-5" />
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{item.title}</span>
                            {item.adminOnly && (
                              <Badge variant="secondary" className="text-xs px-1 py-0">
                                <ShieldCheck className="h-3 w-3" />
                              </Badge>
                            )}
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </nav>
            </ScrollArea>

            <div className="absolute bottom-0 left-0 right-0 border-t border-gray-200 dark:border-gray-700 p-4 space-y-3 bg-white dark:bg-gray-800">
              {userProfile && (
                <div className="px-2">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {userProfile.full_name || userProfile.email.split('@')[0]}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {userProfile.email}
                    </p>
                    {isAdmin && (
                      <Badge variant="outline" className="text-xs px-1 py-0 h-4">
                        Admin
                      </Badge>
                    )}
                  </div>
                </div>
              )}
              <Link to="/user-settings" onClick={() => setMobileMenuOpen(false)} className="block">
                <Button variant="ghost" className="w-full justify-start">
                  <SettingsIcon className="h-5 w-5 mr-3" />
                  Configurações
                </Button>
              </Link>
              <Button
                variant="ghost"
                onClick={handleLogout}
                className="w-full justify-start"
              >
                <LogOut className="h-5 w-5 mr-3" />
                Sair
              </Button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar Mobile */}
        <header className="lg:hidden flex items-center justify-between h-16 px-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">
            Luchoa IA
          </h1>
          <div className="w-10" />
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
