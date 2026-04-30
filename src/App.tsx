import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RequireAuth } from "@/components/RequireAuth";
import Index from "./pages/Index";
import Agendamento from "./pages/Agendamento";
import AgendamentoDados from "./pages/AgendamentoDados";
import AgendamentoSucesso from "./pages/AgendamentoSucesso";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import AdminAgenda from "./pages/AdminAgenda";
import AdminBloqueios from "./pages/AdminBloqueios";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/agendamento" element={<Agendamento />} />
          <Route path="/agendamento/dados" element={<AgendamentoDados />} />
          <Route path="/agendamento/sucesso" element={<AgendamentoSucesso />} />
          <Route path="/admin" element={<AdminLogin />} />
          <Route path="/admin/dashboard" element={<RequireAuth><AdminDashboard /></RequireAuth>} />
          <Route path="/admin/agenda" element={<RequireAuth><AdminAgenda /></RequireAuth>} />
          <Route path="/admin/bloqueios" element={<RequireAuth><AdminBloqueios /></RequireAuth>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
