import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RequireAuth } from "@/components/RequireAuth";
import AdminLayout from "@/components/AdminLayout";
import Index from "./pages/Index";
import Agendamento from "./pages/Agendamento";
import AgendamentoDados from "./pages/AgendamentoDados";
import AgendamentoSucesso from "./pages/AgendamentoSucesso";
import Cancelar from "./pages/Cancelar";
import Fila from "./pages/Fila";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import AdminAgenda from "./pages/AdminAgenda";
import AdminBloqueios from "./pages/AdminBloqueios";
import AdminServicos from "./pages/AdminServicos";
import AdminFila from "./pages/AdminFila";
import AdminConfiguracoes from "./pages/AdminConfiguracoes";
import AdminHorarios from "./pages/AdminHorarios";
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
          <Route path="/cancelar" element={<RequireAuth><Cancelar /></RequireAuth>} />
          <Route path="/fila" element={<Fila />} />
          <Route path="/admin" element={<AdminLogin />} />
          <Route element={<RequireAuth><AdminLayout /></RequireAuth>}>
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/admin/agenda" element={<AdminAgenda />} />
            <Route path="/admin/fila" element={<AdminFila />} />
            <Route path="/admin/bloqueios" element={<AdminBloqueios />} />
            <Route path="/admin/servicos" element={<AdminServicos />} />
            <Route path="/admin/configuracoes" element={<AdminConfiguracoes />} />
            <Route path="/admin/horarios" element={<AdminHorarios />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
