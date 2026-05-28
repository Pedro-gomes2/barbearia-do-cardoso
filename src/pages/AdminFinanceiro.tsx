import { useState, useEffect } from "react";
import { DollarSign, TrendingUp, Calendar, ArrowLeft, ArrowRight, Wallet, Info, Phone, Clock, User, Scissors, ArrowDownCircle, Plus, X, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, addDays, subWeeks, addWeeks, subMonths, addMonths, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

type Period = "dia" | "semana" | "mes" | "historico";

interface ServicoOption {
  id: string;
  nome: string;
  preco: number;
  duracao_minutos: number;
}

export default function AdminFinanceiro() {
  const [period, setPeriod] = useState<Period>("dia");
  const [refDate, setRefDate] = useState<Date>(new Date());
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [selectedApt, setSelectedApt] = useState<any>(null);
  const [debugError, setDebugError] = useState<string | null>(null);

  // Service editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editServicos, setEditServicos] = useState<ServicoOption[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all active services for the selector
  const { data: allServicos = [] } = useQuery({
    queryKey: ["servicos-all-financeiro"],
    queryFn: async () => {
      const { data } = await supabase
        .from("servicos")
        .select("id, nome, preco, duracao_minutos")
        .eq("ativo", true)
        .order("ordem", { ascending: true });
      return (data || []) as ServicoOption[];
    },
  });

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
          // Receita = qualquer atendimento que ocorreu (ativo OU finalizado),
          // excluindo cancelados e pendentes não confirmados.
          query = query
            .in("status", ["ativo", "finalizado"])
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
            .select("agendamento_id, servicos(id, nome, preco, duracao_minutos)")
            .in("agendamento_id", aptIds);
          
          if (jError) throw jError;

          const priceMap: Record<string, { total: number, names: string[], servicoIds: string[] }> = {};
          (junction || []).forEach((j: any) => {
            if (!priceMap[j.agendamento_id]) priceMap[j.agendamento_id] = { total: 0, names: [], servicoIds: [] };
            priceMap[j.agendamento_id].total += Number(j.servicos?.preco || 0);
            priceMap[j.agendamento_id].names.push(j.servicos?.nome);
            priceMap[j.agendamento_id].servicoIds.push(j.servicos?.id);
          });

          data.forEach((a: any) => {
            const price = priceMap[a.id]?.total || Number(a.servicos?.preco || 0);
            const services = priceMap[a.id]?.names.join(", ") || a.servicos?.nome || "Sem serviço";
            const servicoIds = priceMap[a.id]?.servicoIds || [];
            if (a.status === "finalizado" || a.status === "ativo") total += price;
            items.push({
              id: a.id,
              cliente: a.usuarios?.nome || "Cliente avulso",
              clienteId: a.cliente_id,
              telefone: a.usuarios?.telefone || a.telefone_cliente || "Não informado",
              data: a.data,
              horario: a.horario,
              servicos: services,
              servicoIds: servicoIds,
              valor: price,
              status: a.status
            });
          });
        }

        return {
          total,
          count: data.filter(a => a.status === 'finalizado' || a.status === 'ativo').length,
          items,
          totalDespesas,
        };
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

  // When opening an appointment detail, load its current services for editing
  const handleOpenDetail = (item: any) => {
    setSelectedApt(item);
    setIsEditing(false);
    // Pre-populate editServicos from servicoIds
    const currentServicos = (item.servicoIds || [])
      .map((id: string) => allServicos.find((s) => s.id === id))
      .filter(Boolean) as ServicoOption[];
    setEditServicos(currentServicos);
  };

  const editTotal = editServicos.reduce((sum, s) => sum + Number(s.preco), 0);
  const editDuration = editServicos.reduce((sum, s) => sum + s.duracao_minutos, 0);

  const addServicoToEdit = (servico: ServicoOption) => {
    setEditServicos((prev) => [...prev, servico]);
  };

  const removeServicoFromEdit = (index: number) => {
    setEditServicos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveServicos = async () => {
    if (!selectedApt) return;
    setIsSaving(true);
    try {
      // Delete existing services for this appointment
      const { error: deleteError } = await supabase
        .from("agendamento_servicos")
        .delete()
        .eq("agendamento_id", selectedApt.id);
      if (deleteError) throw deleteError;

      // Insert new services
      if (editServicos.length > 0) {
        const rows = editServicos.map((s) => ({
          agendamento_id: selectedApt.id,
          servico_id: s.id,
        }));
        const { error: insertError } = await supabase
          .from("agendamento_servicos")
          .insert(rows);
        if (insertError) throw insertError;
      }

      // Update the servico_id on the main agendamento (first service)
      if (editServicos.length > 0) {
        await supabase
          .from("agendamentos")
          .update({ servico_id: editServicos[0].id })
          .eq("id", selectedApt.id);
      }

      toast({ title: "Serviços atualizados", description: "Os serviços foram salvos com sucesso." });
      setIsEditing(false);
      setSelectedApt(null);
      queryClient.invalidateQueries({ queryKey: ["financeiro"] });
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message || "Tente novamente.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  // Services not yet added (for the add dropdown)
  const availableToAdd = allServicos.filter(
    (s) => !editServicos.find((es) => es.id === s.id)
  );

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

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-primary/10 border border-primary/20 rounded-2xl p-6 text-center space-y-1 shadow-sm">
            <User className="h-5 w-5 text-primary mx-auto mb-1" />
            <p className="text-2xl font-heading text-primary">{period !== "historico" ? report.count : report.items.length}</p>
            <p className="text-[10px] text-muted-foreground font-body tracking-widest uppercase font-bold">Atendimentos</p>
          </div>
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
                    onClick={() => handleOpenDetail(item)}
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

      {/* Sheet de Detalhes com Edição de Serviços */}
      <Sheet open={!!selectedApt} onOpenChange={(open) => { if (!open) { setSelectedApt(null); setIsEditing(false); } }}>
        <SheetContent className="overflow-y-auto w-full sm:max-w-md bg-background border-l-border">
          <SheetHeader className="mb-6 border-b border-border pb-4">
            <SheetTitle className="font-heading tracking-widest text-left text-xl">
              DETALHES DO ATENDIMENTO
            </SheetTitle>
          </SheetHeader>
          
          {selectedApt && (
            <div className="space-y-6">
              {/* Informações Rápidas */}
              <div className="flex items-center gap-4 bg-muted/30 p-4 rounded-xl border border-border/50">
                <div className="bg-primary/10 p-3 rounded-full">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-heading text-lg">{selectedApt.cliente}</p>
                  <p className="font-body text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {selectedApt.telefone}
                  </p>
                </div>
              </div>

              {/* Quando */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-card border border-border p-3 rounded-xl flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground font-semibold">Data</p>
                    <p className="font-body text-sm font-medium">{format(parseISO(selectedApt.data), "dd/MM/yyyy")}</p>
                  </div>
                </div>
                <div className="bg-card border border-border p-3 rounded-xl flex items-center gap-3">
                  <Clock className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground font-semibold">Horário</p>
                    <p className="font-body text-sm font-medium">{selectedApt.horario.slice(0, 5)}</p>
                  </div>
                </div>
              </div>

              {/* Status */}
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-2">Status do Atendimento</p>
                <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border ${
                  selectedApt.status === 'finalizado' ? 'bg-green-50 border-green-200 text-green-700' :
                  selectedApt.status === 'cancelado' ? 'bg-red-50 border-red-200 text-red-700' :
                  'bg-blue-50 border-blue-200 text-blue-700'
                }`}>
                  <span className="relative flex h-2 w-2">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                      selectedApt.status === 'finalizado' ? 'bg-green-400' :
                      selectedApt.status === 'cancelado' ? 'bg-red-400' :
                      'bg-blue-400'
                    }`}></span>
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${
                      selectedApt.status === 'finalizado' ? 'bg-green-500' :
                      selectedApt.status === 'cancelado' ? 'bg-red-500' :
                      'bg-blue-500'
                    }`}></span>
                  </span>
                  <span className="capitalize">{selectedApt.status}</span>
                </div>
              </div>

              {/* Serviços */}
              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">Serviços Executados</p>
                  <Button
                    variant={isEditing ? "outline" : "ghost"}
                    size="sm"
                    className={`h-8 text-xs font-heading tracking-wider ${isEditing ? 'text-destructive border-destructive hover:bg-destructive/5 hover:text-destructive' : 'text-primary'}`}
                    onClick={() => setIsEditing(!isEditing)}
                  >
                    {isEditing ? "CANCELAR EDIÇÃO" : "EDITAR SERVIÇOS"}
                  </Button>
                </div>

                {!isEditing ? (
                  <div className="bg-card border border-border rounded-xl p-4">
                    <ul className="space-y-3">
                      {editServicos.length > 0 ? editServicos.map((s, i) => (
                        <li key={i} className="flex justify-between items-center font-body text-sm">
                          <span className="flex items-center gap-2"><Scissors className="h-3 w-3 text-muted-foreground" /> {s.nome}</span>
                          <span className="font-heading">R$ {Number(s.preco).toFixed(2).replace(".", ",")}</span>
                        </li>
                      )) : (
                        <p className="text-muted-foreground font-body text-sm flex items-center gap-2">
                          <Scissors className="h-4 w-4" /> {selectedApt.servicos}
                        </p>
                      )}
                    </ul>
                  </div>
                ) : (
                  <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-4 animate-in slide-in-from-top-2">
                    {/* Serviços Atuais (Removíveis) */}
                    <div className="space-y-2">
                      {editServicos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum serviço selecionado.</p>}
                      {editServicos.map((s, idx) => (
                        <div key={`${s.id}-${idx}`} className="flex items-center justify-between bg-card border border-border rounded-lg px-3 py-2">
                          <span className="font-body text-sm font-medium">{s.nome}</span>
                          <div className="flex items-center gap-3">
                            <span className="font-heading text-sm text-primary">R$ {Number(s.preco).toFixed(0)}</span>
                            <button onClick={() => removeServicoFromEdit(idx)} className="text-destructive hover:bg-destructive/10 p-1.5 rounded-md transition-colors">
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Botões para adicionar */}
                    {availableToAdd.length > 0 && (
                      <div className="pt-2 border-t border-border/50">
                        <p className="text-[10px] uppercase text-muted-foreground font-semibold mb-2">Adicionar mais serviços</p>
                        <div className="flex flex-wrap gap-2">
                          {availableToAdd.map((s) => (
                            <button
                              key={s.id}
                              onClick={() => addServicoToEdit(s)}
                              className="flex items-center gap-1.5 bg-card hover:bg-primary hover:text-primary-foreground border border-border hover:border-primary rounded-full px-3 py-1.5 text-xs font-body transition-all"
                            >
                              <Plus className="h-3 w-3" />
                              {s.nome}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Salvar Botão */}
                    <Button
                      onClick={handleSaveServicos}
                      disabled={isSaving || editServicos.length === 0}
                      className="w-full font-heading tracking-widest mt-2"
                    >
                      <Save className="h-4 w-4 mr-2" />
                      {isSaving ? "SALVANDO..." : "SALVAR SERVIÇOS"}
                    </Button>
                  </div>
                )}
              </div>

              {/* Totalizador */}
              <div className="flex items-center justify-between bg-primary text-primary-foreground p-5 rounded-2xl shadow-lg mt-6">
                <div>
                  <p className="text-[10px] uppercase tracking-widest opacity-80 font-semibold">Valor Final</p>
                  <p className="text-xs opacity-75 flex items-center gap-1 mt-0.5"><Clock className="h-3 w-3" /> {isEditing ? editDuration : selectedApt.servicoIds?.length ? editDuration : "--"} min total</p>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-heading">
                    R$ {isEditing ? editTotal.toFixed(2).replace(".", ",") : selectedApt.valor.toFixed(2).replace(".", ",")}
                  </p>
                </div>
              </div>
              
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
