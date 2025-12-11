import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";
import AgentConfiguration from "./pages/AgentConfiguration";
import Login from "./pages/Login";
import Prospecting from "./pages/Prospecting";
import WebhookConfig from "./pages/WebhookConfig";
import WebhookTest from "./pages/WebhookTest";
import WhatsAppInstances from "./pages/WhatsAppInstances";
import CampaignManagement from "./pages/CampaignManagement";
import CampaignBuilder from "./pages/CampaignBuilder";
import CampaignDetails from "./pages/CampaignDetails";
import KanbanBoard from "./pages/KanbanBoard";
import ParticipantManagement from "./pages/ParticipantManagement";
import CRMContacts from "./pages/CRMContacts";
import ContactLists from "./pages/ContactLists";
import CRMChat from "./pages/CRMChat";
import Inventory from "./pages/Inventory";
import Reports from "./pages/Reports";
import RedsisConfig from "./pages/RedsisConfig";
import SMTPConfig from "./pages/SMTPConfig";
import TwilioConfig from "./pages/TwilioConfig";
import UserManagement from "./pages/UserManagement";
import UserSettings from "./pages/UserSettings";
import ScheduledContacts from "./pages/ScheduledContacts";
import { SessionContextProvider } from "./integrations/supabase/SessionContextProvider";
import ProtectedRoute from "./components/ProtectedRoute";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <SessionContextProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<Layout><Dashboard /></Layout>} path="/" />
              <Route element={<Layout><CRMContacts /></Layout>} path="/crm-contacts" />
              <Route element={<Layout><ContactLists /></Layout>} path="/contact-lists" />
              <Route element={<Layout><CRMChat /></Layout>} path="/crm-chat" />
              <Route element={<Layout><CampaignManagement /></Layout>} path="/campaigns" />
              <Route element={<Layout><CampaignDetails /></Layout>} path="/campaign-details" />
              <Route element={<Layout><CampaignBuilder /></Layout>} path="/campaign-builder" />
              <Route element={<Layout><KanbanBoard /></Layout>} path="/kanban" />
              <Route element={<Layout><ScheduledContacts /></Layout>} path="/scheduled-contacts" />
              <Route element={<Layout><ParticipantManagement /></Layout>} path="/participants/:campaignId" />
              <Route element={<Layout><WhatsAppInstances /></Layout>} path="/whatsapp-instances" />
              <Route element={<Layout><Prospecting /></Layout>} path="/prospecting" />
              <Route element={<Layout><AgentConfiguration /></Layout>} path="/agent-configuration" />
              <Route element={<Layout><WebhookConfig /></Layout>} path="/webhook-config" />
              <Route element={<Layout><RedsisConfig /></Layout>} path="/redsis-config" />
              <Route element={<Layout><SMTPConfig /></Layout>} path="/smtp-config" />
              <Route element={<Layout><TwilioConfig /></Layout>} path="/twilio-config" />
              <Route element={<Layout><UserManagement /></Layout>} path="/user-management" />
              <Route element={<Layout><UserSettings /></Layout>} path="/user-settings" />
              <Route element={<Layout><WebhookTest /></Layout>} path="/webhook-test" />
              <Route element={<Layout><Reports /></Layout>} path="/reports" />
              <Route element={<Layout><Inventory /></Layout>} path="/inventory" />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </SessionContextProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
