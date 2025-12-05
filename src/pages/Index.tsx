import { MadeWithDyad } from "@/components/made-with-dyad";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/integrations/supabase/SessionContextProvider";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const Index = () => {
  const { session, isLoading } = useSession();
  const navigate = useNavigate();

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Erro ao fazer logout: " + error.message);
    } else {
      toast.success("Logout realizado com sucesso!");
      navigate('/login');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <p className="text-xl text-gray-600 dark:text-gray-400">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold mb-4 text-gray-900 dark:text-gray-100">Bem-vindo ao Seu Aplicativo de Prospecção</h1>
        <p className="text-xl text-gray-600 dark:text-gray-400">
          Comece configurando seus agentes e iniciando prospecções!
        </p>
      </div>

      <div className="flex flex-col space-y-4">
        {session ? (
          <>
            <Button asChild className="w-64">
              <Link to="/agent-configuration">Configurar Agentes</Link>
            </Button>
            <Button asChild className="w-64">
              <Link to="/whatsapp-instances">Instâncias WhatsApp</Link>
            </Button>
            <Button asChild className="w-64">
              <Link to="/campaigns">Gerenciar Campanhas</Link>
            </Button>
            <Button asChild className="w-64">
              <Link to="/kanban">Kanban Board</Link>
            </Button>
            <Button asChild className="w-64">
              <Link to="/prospecting">Iniciar Prospecção WhatsApp</Link>
            </Button>
            <Button asChild className="w-64" variant="outline">
              <Link to="/feedback">Feedback & Blocklist</Link>
            </Button>
            <Button asChild className="w-64" variant="outline">
              <Link to="/webhook-config">Configurar Webhook</Link>
            </Button>
            <Button asChild className="w-64" variant="outline">
              <Link to="/webhook-test">Testar Webhook</Link>
            </Button>
            <Button onClick={handleLogout} variant="outline" className="w-64">
              Sair
            </Button>
          </>
        ) : (
          <Button asChild className="w-64">
            <Link to="/login">Entrar</Link>
          </Button>
        )}
      </div>

      <MadeWithDyad />
    </div>
  );
};

export default Index;