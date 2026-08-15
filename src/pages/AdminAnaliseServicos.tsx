import { useState } from "react";
import {
  Scissors,
  Calendar,
  ArrowLeft,
  ArrowRight,
  TrendingUp,
  Clock,
  DollarSign,
  Users,
  Search,
  CheckCircle2,
  PieChart,
  Layers,
  Sparkles,
  BarChart2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  format,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  subDays,
  addDays,
  subWeeks,
  addWeeks,
  subMonths,
  addMonths,
  subYears,
  addYears,
  parseISO,
} from "date-fns";
import { ptBR } from "date-fns/locale";

type Period = "dia" | "semana" | "mes" | "ano" | "historico";
type StatusFilter = "finalizado" | "ativo" | "todos";

interface ServicoStats {
  id: string;
  nome: string;
  preco: number;
  duracao_minutos: number;
  totalAtendimentos: number;
  faturamentoTotal: number;
  porcentagemQtd: number;
  porcentagemFaturamento: number;
}

export default function AdminAnaliseServicos() {
  const [period, setPeriod] = useState<Period>("mes");
  const [refDate, setRefDate] = useState<Date>(new Date());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("finalizado");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedServiceFilter, setSelectedServiceFilter] = useState<string>("todos");

  // Calculate range based on selected period
  const range = (() => {
    if (period === "dia") {
      return { start: startOfDay(refDate), end: endOfDay(refDate) };
    }
    if (period === "semana") {
      return {
        start: startOfWeek(refDate, { weekStartsOn: 1 }),
        end: endOfWeek(refDate, { weekStartsOn: 1 }),
      };
    }
    if (period === "mes") {
      return {
        start: startOfMonth(refDate),
        end: endOfMonth(refDate),
      };
    }
    if (period === "ano") {
      return {
        start: startOfYear(refDate),
        end: endOfYear(refDate),
      };
    }
    // historico
    return {
      start: new Date(2020, 0, 1),
      end: addMonths(new Date(), 12),
    };
  })();

  const handlePrev = () => {
    if (period === "dia") setRefDate((d) => subDays(d, 1));
    else if (period === "semana") setRefDate((d) => subWeeks(d, 1));
    else if (period === "mes") setRefDate((d) => subMonths(d, 1));
    else if (period === "ano") setRefDate((d) => subYears(d, 1));
  };

  const handleNext = () => {
    if (period === "dia") setRefDate((d) => addDays(d, 1));
    else if (period === "semana") setRefDate((d) => addWeeks(d, 1));
    else if (period === "mes") setRefDate((d) => addMonths(d, 1));
    else if (period === "ano") setRefDate((d) => addYears(d, 1));
  };

  // Fetch all registered services
  const { data: allServices = [] } = useQuery({
    queryKey: ["admin-all-servicos-analysis"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("servicos")
        .select("id, nome, preco, duracao_minutos, ativo")
        .order("ordem", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch appointments and junction services in range
  const { data: analysisData, isLoading } = useQuery({
    queryKey: ["admin-servicos-analise", period, range.start.toISOString(), range.end.toISOString(), statusFilter],
    staleTime: 0,
    queryFn: async () => {
      const startStr = format(range.start, "yyyy-MM-dd");
      const endStr = format(range.end, "yyyy-MM-dd");

      let query = supabase
        .from("agendamentos")
        .select("id, data, horario, status, cliente_id, telefone_cliente, servico_id, usuarios(nome, telefone), servicos(id, nome, preco, duracao_minutos)")
        .order("data", { ascending: false })
        .order("horario", { ascending: false });

      if (period !== "historico") {
        query = query.gte("data", startStr).lte("data", endStr);
      }

      if (statusFilter !== "todos") {
        query = query.eq("status", statusFilter as any);
      }

      const { data: agendamentos, error } = await query;
      if (error) throw error;

      const apts = agendamentos || [];
      const aptIds = apts.map((a: any) => a.id);

      // Junction query for multiple services
      let junctionMap: Record<
        string,
        Array<{ id: string; nome: string; preco: number; duracao_minutos: number }>
      > = {};

      if (aptIds.length > 0) {
        const { data: junctions, error: jError } = await supabase
          .from("agendamento_servicos")
          .select("agendamento_id, servicos(id, nome, preco, duracao_minutos)")
          .in("agendamento_id", aptIds);

        if (jError) throw jError;

        (junctions || []).forEach((j: any) => {
          if (j.servicos) {
            if (!junctionMap[j.agendamento_id]) {
              junctionMap[j.agendamento_id] = [];
            }
            junctionMap[j.agendamento_id].push({
              id: j.servicos.id,
              nome: j.servicos.nome,
              preco: Number(j.servicos.preco || 0),
              duracao_minutos: Number(j.servicos.duracao_minutos || 0),
            });
          }
        });
      }

      // Build detailed appointment list
      const detailedAppointments = apts.map((a: any) => {
        const svcsFromJunction = junctionMap[a.id];
        let svcs: Array<{ id: string; nome: string; preco: number; duracao_minutos: number }> = [];

        if (svcsFromJunction && svcsFromJunction.length > 0) {
          svcs = svcsFromJunction;
        } else if (a.servicos) {
          svcs = [
            {
              id: a.servicos.id,
              nome: a.servicos.nome,
              preco: Number(a.servicos.preco || 0),
              duracao_minutos: Number(a.servicos.duracao_minutos || 0),
            },
          ];
        }

        const valorTotal = svcs.reduce((sum, s) => sum + s.preco, 0);
        const duracaoTotal = svcs.reduce((sum, s) => sum + s.duracao_minutos, 0);

        return {
          id: a.id,
          data: a.data,
          horario: a.horario,
          status: a.status,
          clienteNome: a.usuarios?.nome || "Cliente avulso",
          clienteTelefone: a.usuarios?.telefone || a.telefone_cliente || "Não informado",
          servicos: svcs,
          valorTotal,
          duracaoTotal,
        };
      });

      // Compute service statistics
      const countsMap: Record<
        string,
        { id: string; nome: string; preco: number; duracao_minutos: number; count: number; faturamento: number }
      > = {};

      // Initialize with registered services
      allServices.forEach((s: any) => {
        countsMap[s.id] = {
          id: s.id,
          nome: s.nome,
          preco: Number(s.preco || 0),
          duracao_minutos: Number(s.duracao_minutos || 0),
          count: 0,
          faturamento: 0,
        };
      });

      let totalServicosPrestados = 0;
      let faturamentoGeralServicos = 0;

      detailedAppointments.forEach((apt) => {
        apt.servicos.forEach((s) => {
          totalServicosPrestados += 1;
          faturamentoGeralServicos += s.preco;

          if (!countsMap[s.id]) {
            countsMap[s.id] = {
              id: s.id,
              nome: s.nome,
              preco: s.preco,
              duracao_minutos: s.duracao_minutos,
              count: 0,
              faturamento: 0,
            };
          }
          countsMap[s.id].count += 1;
          countsMap[s.id].faturamento += s.preco;
        });
      });

      const ranking: ServicoStats[] = Object.values(countsMap)
        .map((item) => ({
          id: item.id,
          nome: item.nome,
          preco: item.preco,
          duracao_minutos: item.duracao_minutos,
          totalAtendimentos: item.count,
          faturamentoTotal: item.faturamento,
          porcentagemQtd: totalServicosPrestados > 0 ? (item.count / totalServicosPrestados) * 100 : 0,
          porcentagemFaturamento:
            faturamentoGeralServicos > 0 ? (item.faturamento / faturamentoGeralServicos) * 100 : 0,
        }))
        .sort((a, b) => b.totalAtendimentos - a.totalAtendimentos || b.faturamentoTotal - a.faturamentoTotal);

      return {
        totalAgendamentos: detailedAppointments.length,
        totalServicosPrestados,
        faturamentoGeralServicos,
        ticketMedio:
          detailedAppointments.length > 0
            ? faturamentoGeralServicos / detailedAppointments.length
            : 0,
        servicoMaisPopular: ranking.length > 0 && ranking[0].totalAtendimentos > 0 ? ranking[0] : null,
        ranking,
        appointments: detailedAppointments,
      };
    },
  });

  // Filter detailed appointments by search term & service filter
  const filteredAppointments = (analysisData?.appointments || []).filter((apt) => {
    const matchesSearch =
      searchTerm.trim() === "" ||
      apt.clienteNome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      apt.clienteTelefone.includes(searchTerm) ||
      apt.servicos.some((s) => s.nome.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesService =
      selectedServiceFilter === "todos" ||
      apt.servicos.some((s) => s.id === selectedServiceFilter);

    return matchesSearch && matchesService;
  });

  const getPeriodLabel = () => {
    if (period === "dia") {
      return format(refDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
    }
    if (period === "semana") {
      const s = format(startOfWeek(refDate, { weekStartsOn: 1 }), "dd/MM", { locale: ptBR });
      const e = format(endOfWeek(refDate, { weekStartsOn: 1 }), "dd/MM/yyyy", { locale: ptBR });
      return `Semana: ${s} a ${e}`;
    }
    if (period === "mes") {
      return format(refDate, "MMMM 'de' yyyy", { locale: ptBR });
    }
    if (period === "ano") {
      return format(refDate, "yyyy", { locale: ptBR });
    }
    return "Todo o Histórico";
  };

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-heading tracking-wider flex items-center gap-2">
            <BarChart2 className="h-7 w-7 text-primary" />
            ANÁLISE DE ATENDIMENTOS POR SERVIÇO
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground font-body">
            Acompanhe a quantidade, frequência e faturamento de cada serviço realizado na barbearia.
          </p>
        </div>
      </div>

      {/* Navigation and Period Tabs */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-card p-4 rounded-xl border border-border">
        <Tabs
          value={period}
          onValueChange={(v) => {
            setPeriod(v as Period);
            setRefDate(new Date());
          }}
          className="w-full md:w-auto"
        >
          <TabsList className="grid grid-cols-5 w-full md:w-auto">
            <TabsTrigger value="dia" className="text-xs sm:text-sm">Dia</TabsTrigger>
            <TabsTrigger value="semana" className="text-xs sm:text-sm">Semana</TabsTrigger>
            <TabsTrigger value="mes" className="text-xs sm:text-sm">Mês</TabsTrigger>
            <TabsTrigger value="ano" className="text-xs sm:text-sm">Ano</TabsTrigger>
            <TabsTrigger value="historico" className="text-xs sm:text-sm">Geral</TabsTrigger>
          </TabsList>
        </Tabs>

        {period !== "historico" && (
          <div className="flex items-center justify-between md:justify-end gap-2">
            <Button variant="outline" size="icon" onClick={handlePrev} className="h-9 w-9">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <span className="font-heading text-xs sm:text-sm capitalize px-2 text-center min-w-[150px] sm:min-w-[200px]">
              {getPeriodLabel()}
            </span>
            <Button variant="outline" size="icon" onClick={handleNext} className="h-9 w-9">
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setRefDate(new Date())}
              className="text-xs font-heading ml-1"
            >
              Hoje
            </Button>
          </div>
        )}

        {/* Status Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-body whitespace-nowrap">Status:</span>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-[140px] h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="finalizado">Finalizados</SelectItem>
              <SelectItem value="ativo">Ativos/Agendados</SelectItem>
              <SelectItem value="todos">Todos os Status</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Total de Atendimentos */}
        <div className="bg-card p-4 sm:p-5 rounded-xl border border-border space-y-1 relative overflow-hidden">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-body uppercase tracking-wider">Atendimentos</span>
            <Users className="h-4 w-4 text-primary" />
          </div>
          <div className="text-2xl sm:text-3xl font-heading text-foreground">
            {isLoading ? "..." : analysisData?.totalAgendamentos || 0}
          </div>
          <p className="text-[11px] text-muted-foreground font-body">
            {statusFilter === "finalizado"
              ? "Atendimentos concluídos"
              : statusFilter === "ativo"
              ? "Agendamentos ativos"
              : "Total registrado"}
          </p>
        </div>

        {/* Card 2: Total de Serviços Executados */}
        <div className="bg-card p-4 sm:p-5 rounded-xl border border-border space-y-1 relative overflow-hidden">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-body uppercase tracking-wider">Serviços Prestados</span>
            <Scissors className="h-4 w-4 text-primary" />
          </div>
          <div className="text-2xl sm:text-3xl font-heading text-primary">
            {isLoading ? "..." : analysisData?.totalServicosPrestados || 0}
          </div>
          <p className="text-[11px] text-muted-foreground font-body">
            {analysisData?.totalAgendamentos
              ? `${((analysisData.totalServicosPrestados || 0) / (analysisData.totalAgendamentos || 1)).toFixed(1)} serviços / cliente`
              : "Nenhum no período"}
          </p>
        </div>

        {/* Card 3: Faturamento Total em Serviços */}
        <div className="bg-card p-4 sm:p-5 rounded-xl border border-border space-y-1 relative overflow-hidden">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-body uppercase tracking-wider">Faturamento Serviços</span>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-heading text-emerald-500">
            {isLoading
              ? "..."
              : `R$ ${(analysisData?.faturamentoGeralServicos || 0).toLocaleString("pt-BR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`}
          </div>
          <p className="text-[11px] text-muted-foreground font-body">
            Ticket médio: R${" "}
            {(analysisData?.ticketMedio || 0).toFixed(2).replace(".", ",")}
          </p>
        </div>

        {/* Card 4: Top 1 Serviço */}
        <div className="bg-card p-4 sm:p-5 rounded-xl border border-border space-y-1 relative overflow-hidden">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-body uppercase tracking-wider">Mais Realizado</span>
            <Sparkles className="h-4 w-4 text-amber-500" />
          </div>
          <div className="text-lg sm:text-xl font-heading text-foreground truncate" title={analysisData?.servicoMaisPopular?.nome || "Nenhum"}>
            {isLoading ? "..." : analysisData?.servicoMaisPopular ? analysisData.servicoMaisPopular.nome : "—"}
          </div>
          <p className="text-[11px] text-muted-foreground font-body">
            {analysisData?.servicoMaisPopular
              ? `${analysisData.servicoMaisPopular.totalAtendimentos}x (${analysisData.servicoMaisPopular.porcentagemQtd.toFixed(0)}% do total)`
              : "Sem registros"}
          </p>
        </div>
      </div>

      {/* Service Breakdown & Ranking Section */}
      <div className="bg-card rounded-xl border border-border p-4 sm:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-4">
          <div>
            <h2 className="text-lg sm:text-xl font-heading tracking-wide flex items-center gap-2">
              <PieChart className="h-5 w-5 text-primary" />
              RANKING E DISTRIBUIÇÃO POR CADA SERVIÇO
            </h2>
            <p className="text-xs text-muted-foreground font-body">
              Quantidade de atendimentos realizados e participação no faturamento por serviço
            </p>
          </div>
          <Badge variant="outline" className="w-fit text-xs">
            {analysisData?.ranking?.filter((s) => s.totalAtendimentos > 0).length || 0} serviços com atendimentos
          </Badge>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground font-body animate-pulse">
            Carregando métricas de serviços...
          </div>
        ) : !analysisData || analysisData.ranking.length === 0 || analysisData.totalServicosPrestados === 0 ? (
          <div className="py-12 text-center space-y-2">
            <Scissors className="h-10 w-10 text-muted-foreground/50 mx-auto" />
            <p className="text-muted-foreground font-body text-sm">
              Nenhum atendimento registrado para o período e filtros selecionados.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {analysisData.ranking.map((s, index) => {
              const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}º`;
              return (
                <div
                  key={s.id}
                  className={`p-4 rounded-xl border transition-all ${
                    s.totalAtendimentos > 0
                      ? "bg-card/70 border-border/80 hover:border-primary/50"
                      : "bg-muted/20 border-border/40 opacity-60"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base font-heading w-6 text-center shrink-0">
                        {medal}
                      </span>
                      <div className="min-w-0">
                        <h3 className="font-heading text-base tracking-wide truncate" title={s.nome}>
                          {s.nome}
                        </h3>
                        <p className="text-[11px] text-muted-foreground font-body flex items-center gap-2">
                          <span>R$ {s.preco.toFixed(2).replace(".", ",")}</span>
                          <span>•</span>
                          <span>
                            <Clock className="h-3 w-3 inline mr-1" />
                            {s.duracao_minutos} min
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-lg font-heading text-primary">
                        {s.totalAtendimentos} {s.totalAtendimentos === 1 ? "atendimento" : "atendimentos"}
                      </span>
                      <p className="text-[11px] font-semibold text-emerald-500 font-body">
                        R$ {s.faturamentoTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>

                  {/* Progress Bar for Volume */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex justify-between text-[11px] font-body text-muted-foreground">
                      <span>Participação no Volume:</span>
                      <span className="font-semibold text-foreground">{s.porcentagemQtd.toFixed(1)}%</span>
                    </div>
                    <Progress value={s.porcentagemQtd} className="h-2 bg-muted" />
                  </div>

                  {/* Revenue share */}
                  <div className="flex justify-between text-[10px] text-muted-foreground font-body mt-2 pt-2 border-t border-border/40">
                    <span>Participação na Receita:</span>
                    <span className="text-emerald-500 font-medium">
                      {s.porcentagemFaturamento.toFixed(1)}% do total
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Detailed List of Appointments */}
      <div className="bg-card rounded-xl border border-border p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-heading tracking-wide flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              DETALHAMENTO DE ATENDIMENTOS NO PERÍODO
            </h2>
            <p className="text-xs text-muted-foreground font-body">
              Veja exatamente quais atendimentos e clientes compõem os números acima
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            {/* Filter by specific service */}
            <Select value={selectedServiceFilter} onValueChange={setSelectedServiceFilter}>
              <SelectTrigger className="w-full sm:w-[180px] h-9 text-xs">
                <SelectValue placeholder="Filtrar por serviço" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Serviços</SelectItem>
                {allServices.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Search Input */}
            <div className="relative w-full sm:w-[220px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar cliente..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-9 text-xs"
              />
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground text-sm font-body animate-pulse">
            Carregando lista de atendimentos...
          </div>
        ) : filteredAppointments.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground font-body text-xs sm:text-sm">
            Nenhum atendimento encontrado com os filtros atuais.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm font-body">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="py-3 px-2 font-heading tracking-wider">DATA / HORA</th>
                  <th className="py-3 px-2 font-heading tracking-wider">CLIENTE</th>
                  <th className="py-3 px-2 font-heading tracking-wider">SERVIÇOS REALIZADOS</th>
                  <th className="py-3 px-2 font-heading tracking-wider text-right">VALOR</th>
                  <th className="py-3 px-2 font-heading tracking-wider text-center">STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filteredAppointments.map((apt) => (
                  <tr key={apt.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-3 px-2 whitespace-nowrap">
                      <div className="font-medium">
                        {format(parseISO(apt.data), "dd/MM/yyyy")}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {apt.horario.slice(0, 5)}
                      </div>
                    </td>
                    <td className="py-3 px-2">
                      <div className="font-medium text-foreground">{apt.clienteNome}</div>
                      <div className="text-xs text-muted-foreground">{apt.clienteTelefone}</div>
                    </td>
                    <td className="py-3 px-2">
                      <div className="flex flex-wrap gap-1">
                        {apt.servicos.map((s, idx) => (
                          <Badge
                            key={`${apt.id}-${s.id}-${idx}`}
                            variant="secondary"
                            className="text-[11px] font-normal py-0.5"
                          >
                            {s.nome}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-2 text-right whitespace-nowrap font-heading text-primary">
                      R$ {apt.valorTotal.toFixed(2).replace(".", ",")}
                    </td>
                    <td className="py-3 px-2 text-center whitespace-nowrap">
                      <Badge
                        variant={
                          apt.status === "finalizado"
                            ? "default"
                            : apt.status === "ativo"
                            ? "secondary"
                            : "outline"
                        }
                        className={`text-[10px] uppercase font-heading ${
                          apt.status === "finalizado"
                            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                            : apt.status === "ativo"
                            ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {apt.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
