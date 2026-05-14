import { useState } from "react";
import { DollarSign, TrendingUp, Calendar, ArrowLeft, ArrowRight, Wallet, Info, Phone, Clock, User, Scissors, ArrowDownCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, addDays, subWeeks, addWeeks, subMonths, addMonths, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

type Period = "dia" | "semana" | "mes" | "historico";

export default function AdminFinanceiro() {
  const [period, setPeriod] = useState<Period>("dia");
  const [refDate, setRefDate] = useState<Date>(new Date());
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [selectedApt, setSelectedApt] = useState<any>(null);
  const [debugError, setDebugError] = useState<string | null>(null);

  const range = (() => {
    if (period === "dia") {
      return { start: startOfDay(refDate), end: endOfDay(refDate) };
    }
    if (period === "semana") {
      return { start: startOfWeek(refDate, { weekStartsOn: 1 }), end: endOfWeek(refDate, { weekStartsOn: 1 }) };
    }
    if (period === "mes") {
      return { start: startOfMonth(refDate), end: endOfMonth(refDate) };
    }
    return { start: subMonths(new Date(), 24), end: addMonths(new Date(), 1) };
  })();

  const { data: report = { total: 0, count: 0, items: [], totalDespesas: 0 }, isLoading } = useQuery({
    queryKey: ["financeiro", period, range.start.toISOString(), range.end.toISOString(), statusFilter],
    queryFn: async () => {
      try {
        setDebugError(null);
        let query = supabase
          .from("agendamentos")
          .select("*, usuarios(nome, telefone), servicos(nome, preco)")
          .order("data", { ascending: false })
          .order("horario", { ascending: false });

        let despesasQuery = supabase
          .from("despesas")
          .select("valor")
          .gte("data", format(range.start, "yyyy-MM-dd"))
          .lte("data", format(range.end, "yyyy-MM-dd"));

        if (period !== "historico") {
          query = query
            .eq("status", "finalizado")
            .gte("data", format(range.start, "yyyy-MM-dd"))
            .lte("data", format(range.end, "yyyy-MM-dd"));
        } else {
          if (statusFilter !== "todos") {
            query = query.eq("status", statusFilter);
          }
          query = query.limit(100);
        }

        const [resAgendamentos, resDespesas] = await Promise.all([query, despesasQuery]);
        
        if (resAgendamentos.error) throw resAgendamentos.error;
        if (resDespesas.error) throw resDespesas.error;

        const data = resAgendamentos.data || [];
        const despesasData = resDespesas.data || [];

        const totalDespesas = despesasData.reduce((acc, curr) => acc + Number(curr.valor), 0);
        const aptIds = data.map(a => a.id);
        let total = 0;
        const items: any[] = [];

        if (aptIds.length > 0) {
          const { data: junction, error: jError } = await supabase
            .from("agendamento_servicos")
            .select("agendamento_id, servicos(nome, preco)")
            .in("agendamento_id", aptIds);
          
          if (jError) throw jError;

          const priceMap: Record<string, { total: number, names: string[] }> = {};
          (junction || []).forEach((j: any) => {
            if (!priceMap[j.agendamento_id]) priceMap[j.agendamento_id] = { total: 0, names: [] };
            priceMap[j.agendamento_id].total += Number(j.servicos?.preco || 0);
            priceMap[j.agendamento_id].names.push(j.servicos?.nome);
          });

          data.forEach((a: any) => {
            const price = priceMap[a.id]?.total || Number(a.servicos?.preco || 0);
            const services = priceMap[a.id]?.names.join(", ") || a.servicos?.nome || "Sem serviço";
            if (a.status === "finalizado") total += price;
            items.push({
              id: a.id,
              cliente: a.usuarios?.nome || "Cliente avulso",
              telefone: a.usuarios?.telefone || a.telefone_cliente || "Não informado",
              data: a.data,
              horario: a.horario,
              servicos: services,
              valor: price,
              status: a.status
            });
          });
        }

        return { total, count: data.filter(a => a.status === 'finalizado').length, items, totalDespesas };
      } catch (err: any) {
        console.error("Erro no financeiro:", err);
        setDebugError(err.message);
        throw err;
      }
    }
  });

  const navPrev = () => {
    if (period === "dia") setRefDate(subDays(refDate, 1));
    else if (period === "semana") setRefDate(subWeeks(refDate, 1));
    else if (period === "mes") setRefDate(subMonths(refDate, 1));
  };

  const navNext = () => {
    if (period === "dia") setRefDate(addDays(refDate, 1));
    else if (period === "semana") setRefDate(addWeeks(refDate, 1));
    else if (period === "mes") setRefDate(addMonths(refDate, 1));
  };

  const label = (() => {
    if (period === "dia") return format(refDate, "dd 'de' MMMM", { locale: ptBR });
    if (period === "semana") return `${format(range.start, "dd/MM")} - ${format(range.end, "dd/MM")}`;
    if (period === "mes") return format(refDate, "MMMM 'de' yyyy", { locale: ptBR });
    return "Tudo";
  })();

  return (
    <div className="container max-w-5xl py-8 space-y-6 animate-fade-in">
      <div className="text-center space-y-2">
        <DollarSign className="h-10 w-10 text-primary mx-auto" />
        <h2 className="text-3xl font-heading tracking-wider">GESTÃO E FATURAMENTO</h2>
        <p className="text-muted-foreground font-body text-sm">Resumo financeiro e histórico de atendimentos</p>
      </div>

      <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)} className="w-full">
        <TabsList className="grid grid-cols-4 w-full max-w-md mx-auto">
          <TabsTrigger value="dia">HOJE</TabsTrigger>
          <TabsTrigger value="semana">SEMANA</TabsTrigger>
          <TabsTrigger value="mes">MÊS</TabsTrigger>
          <TabsTrigger value="historico">HISTÓRICO</TabsTrigger>
        </TabsList>

        <div className="mt-8 space-y-8">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="flex-1 space-y-6">
              {period !== "historico" ? (
                <div className="flex items-center justify-between bg-card border border-border p-4 rounded-2xl shadow-sm">
                  <Button variant="ghost" size="icon" onClick={navPrev}><ArrowLeft className="h-5 w-5" /></Button>
                  <p className="font-heading text-lg uppercase tracking-widest text-primary">{label}</p>
                  <Button variant="ghost" size="icon" onClick={navNext}><ArrowRight className="h-5 w-5" /></Button>
                </div>
              ) : (
                <div className="bg-primary/5 border border-primary/10 p-4 rounded-2xl text-center">
                  <p className="font-heading text-lg uppercase tracking-widest text-primary">Resumo dos Últimos 24 Meses</p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-primary/10 border border-primary/20 rounded-2xl p-6 text-center space-y-1 shadow-sm">
                  <Wallet className="h-5 w-5 text-primary mx-auto mb-1" />
                  <p className="text-2xl font-heading text-primary">R$ {report.total.toFixed(2).replace(".", ",")}</p>
                  <p className="text-[10px] text-muted-foreground font-body tracking-widest uppercase font-bold">Faturamento Bruto</p>
                </div>
                <div className="bg-red-50 border border-red-100 rounded-2xl p-6 text-center space-y-1 shadow-sm">
                  <ArrowDownCircle className="h-5 w-5 text-red-500 mx-auto mb-1" />
                  <p className="text-2xl font-heading text-red-600">R$ {report.totalDespesas.toFixed(2).replace(".", ",")}</p>
                  <p className="text-[10px] text-muted-foreground font-body tracking-widest uppercase font-bold">Total Despesas</p>
                </div>
                <div className="bg-green-50 border border-green-100 rounded-2xl p-6 text-center space-y-1 shadow-sm">
                  <TrendingUp className="h-5 w-5 text-green-600 mx-auto mb-1" />
                  <p className="text-2xl font-heading text-green-700">R$ {(report.total - report.totalDespesas).toFixed(2).replace(".", ",")}</p>
                  <p className="text-[10px] text-muted-foreground font-body tracking-widest uppercase font-bold">Lucro Real</p>
                </div>
              </div>
            </div>
          </div>

          {period === "historico" && (
            <div className="flex justify-center gap-2 flex-wrap">
              {["todos", "ativo", "finalizado", "cancelado"].map((s) => (
                <Button
                  key={s}
                  variant={statusFilter === s ? "default" : "outline"}
                  size="sm"
                  className="capitalize font-heading tracking-widest"
                  onClick={() => setStatusFilter(s)}
                >
                  {s}
                </Button>
              ))}
            </div>
          )}

          <div className="space-y-4">
            <h3 className="font-heading text-sm tracking-[0.2em] text-muted-foreground border-b border-border pb-2">
              {period === "historico" ? "LISTA COMPLETA" : "DETALHAMENTO DO PERÍODO"}
            </h3>
            
            {debugError && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center space-y-2">
                <p className="text-red-600 font-body text-sm font-bold">Erro ao carregar dados:</p>
                <p className="text-red-500 font-body text-xs">{debugError}</p>
                <Button variant="outline" size="sm" onClick={() => window.location.reload()} className="mt-2">
                  TENTAR NOVAMENTE
                </Button>
              </div>
            )}

            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                <p className="text-muted-foreground font-body animate-pulse">Carregando dados...</p>
              </div>
            ) : !debugError && report.items.length === 0 ? (
              <div className="bg-muted/30 border border-dashed border-border rounded-2xl p-12 text-center">
                <p className="text-muted-foreground font-body">Nenhum registro encontrado para este critério.</p>
              </div>
            ) : !debugError && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {report.items.map((item: any) => (
                  <div 
                    key={item.id} 
                    onClick={() => setSelectedApt(item)}
                    className="bg-card border border-border hover:border-primary/50 rounded-2xl p-5 flex items-center justify-between transition-all cursor-pointer hover:shadow-md group"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <p className="font-heading text-lg tracking-wide group-hover:text-primary transition-colors">{item.cliente}</p>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter ${
                          item.status === 'finalizado' ? 'bg-green-100 text-green-700' :
                          item.status === 'cancelado' ? 'bg-red-100 text-red-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {item.status}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <p className="text-[11px] text-muted-foreground font-body flex items-center gap-1.5">
                          <Calendar className="h-3 w-3" /> {format(parseISO(item.data), "dd/MM/yyyy")}
                          <Clock className="h-3 w-3 ml-2" /> {item.horario.slice(0, 5)}
                        </p>
                        <p className="text-[11px] text-primary/80 font-body font-medium flex items-center gap-1.5">
                          <Scissors className="h-3 w-3" /> {item.servicos}
                        </p>
                      </div>
                    </div>
                    <div className="text-right space-y-1">
                      <p className="font-heading text-xl text-foreground">R$ {item.valor.toFixed(2).replace(".", ",")}</p>
                      <Info className="h-4 w-4 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Tabs>

      {/* Modal de Detalhes */}
      <Dialog open={!!selectedApt} onOpenChange={() => setSelectedApt(null)}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-heading tracking-widest text-center text-2xl border-b border-border pb-4">
              DETALHES DO ATENDIMENTO
            </DialogTitle>
          </DialogHeader>
          {selectedApt && (
            <div className="py-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted/50 p-4 rounded-xl space-y-1">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Cliente</p>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-primary" />
                    <p className="font-body font-bold">{selectedApt.cliente}</p>
                  </div>
                </div>
                <div className="bg-muted/50 p-4 rounded-xl space-y-1">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Telefone</p>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-primary" />
                    <p className="font-body font-bold">{selectedApt.telefone}</p>
                  </div>
                </div>
              </div>

              <div className="bg-card border border-border p-5 rounded-2xl space-y-4">
                <div className="flex justify-between items-center border-b border-border/50 pb-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary" />
                    <p className="font-body">{format(parseISO(selectedApt.data), "EEEE, dd 'de' MMMM", { locale: ptBR })}</p>
                  </div>
                  <div className="flex items-center gap-2 font-bold">
                    <Clock className="h-4 w-4 text-primary" />
                    <p>{selectedApt.horario.slice(0, 5)}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Serviços Contratados</p>
                  <div className="flex items-start gap-2">
                    <Scissors className="h-4 w-4 text-primary mt-1" />
                    <p className="font-body text-sm leading-relaxed">{selectedApt.servicos}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between bg-primary/5 p-6 rounded-2xl border border-primary/10">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Status</p>
                  <p className={`font-heading tracking-widest capitalize ${
                    selectedApt.status === 'finalizado' ? 'text-green-600' :
                    selectedApt.status === 'cancelado' ? 'text-red-600' :
                    'text-blue-600'
                  }`}>
                    {selectedApt.status}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Valor Total</p>
                  <p className="text-3xl font-heading text-primary">R$ {selectedApt.valor.toFixed(2).replace(".", ",")}</p>
                </div>
              </div>

              <Button onClick={() => setSelectedApt(null)} className="w-full py-6 font-heading tracking-widest text-lg">
                FECHAR DETALHES
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
