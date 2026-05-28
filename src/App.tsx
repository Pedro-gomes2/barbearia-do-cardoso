import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RequireAuth } from "@/components/RequireAuth";
import AdminLayout from "@/components/AdminLayout";

// Páginas públicas: carrega no bundle inicial (são as que o cliente vê primeiro)
import Index from "./pages/Index";
import Agendamento from "./pages/Agendamento";
import AgendamentoDados from "./pages/AgendamentoDados";
import AgendamentoSucesso from "./pages/AgendamentoSucesso";
import Cancelar from "./pages/Cancelar";
import Produtos from "./pages/Produtos";
import NotFound from "./pages/NotFound";

// Admin: lazy — o cliente no mobile não baixa esse código.
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminAgenda = lazy(() => import("./pages/AdminAgenda"));
const AdminBloqueios = lazy(() => import("./pages/AdminBloqueios"));
const AdminServicos = lazy(() => import("./pages/AdminServicos"));
const AdminConfiguracoes = lazy(() => import("./pages/AdminConfiguracoes"));
const AdminGerenciarHorarios = lazy(() => import("./pages/AdminGerenciarHorarios"));
const AdminProdutos = lazy(() => import("./pages/AdminProdutos"));
const AdminFinanceiro = lazy(() => import("./pages/AdminFinanceiro"));
const AdminDespesas = lazy(() => import("./pages/AdminDespesas"));
const AdminPortfolio = lazy(() => import("./pages/AdminPortfolio"));
const AdminClientes = lazy(() => import("./pages/AdminClientes"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache razoável → menos requisições no mobile (3G/4G fraco).
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 1,
    },
  },
});

const LoadingScreen = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="animate-pulse text-muted-foreground font-body text-sm">Carregando…</div>
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={<LoadingScreen />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/agendamento" element={<Agendamento />} />
            <Route path="/agendamento/dados" element={<AgendamentoDados />} />
            <Route path="/agendamento/sucesso" element={<AgendamentoSucesso />} />
            <Route path="/cancelar" element={<Cancelar />} />
            <Route path="/produtos" element={<Produtos />} />
            <Route path="/admin" element={<AdminLogin />} />
            <Route element={<RequireAuth><AdminLayout /></RequireAuth>}>
              <Route path="/admin/dashboard" element={<AdminDashboard />} />
              <Route path="/admin/agenda" element={<AdminAgenda />} />
              <Route path="/admin/bloqueios" element={<AdminBloqueios />} />
              <Route path="/admin/servicos" element={<AdminServicos />} />
              <Route path="/admin/produtos" element={<AdminProdutos />} />
              <Route path="/admin/configuracoes" element={<AdminConfiguracoes />} />
              <Route path="/admin/horarios" element={<AdminGerenciarHorarios />} />
              <Route path="/admin/financeiro" element={<AdminFinanceiro />} />
              <Route path="/admin/despesas" element={<AdminDespesas />} />
              <Route path="/admin/portfolio" element={<AdminPortfolio />} />
              <Route path="/admin/clientes" element={<AdminClientes />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
