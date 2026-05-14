import { useEffect, useState } from "react";
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subDays,
  addDays,
  addWeeks,
  addMonths,
  subWeeks,
  subMonths,
  isSameDay,
  parse,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, X, ChevronLeft, ChevronRight, Search, MessageCircle, Plus, ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ServiceSelector, type Servico } from "@/components/ServiceSelector";

type StatusFilter = "todos" | "ativo" | "cancelado";

export default function AdminDashboard() {
  const [tab, setTab] = useState<"dia" | "semana" | "mes">("dia");
  const [encaixeAberto, setEncaixeAberto] = useState(false);
  const [encaixeNome, setEncaixeNome] = useState("");
  const [encaixeTelefone, setEncaixeTelefone] = useState("");
  const [encaixeData, setEncaixeData] = useState(format(new Date(), "yyyy-MM-dd"));
  const [encaixeHorario, setEncaixeHorario] = useState("09:00");
  const [encaixeServicos, setEncaixeServicos] = useState<Servico[]>([]);
  const [refDate, setRefDate] = useState<Date>(new Date());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ativo");
  const [whatsappAdmin, setWhatsappAdmin] = useState("5521995323454");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    supabase.from("configuracoes_app").select("whatsapp_admin").limit(1).maybeSingle().then(({ data }) => {
      if (data?.whatsapp_admin) setWhatsappAdmin(data.whatsapp_admin);
    });
  }, []);

  // Range based on tab
  const range = (() => {
    if (tab === "dia") {
      const s = format(refDate, "yyyy-MM-dd");
      return { start: s, end: s };
    }
    if (tab === "semana") {
      return {
        start: format(startOfWeek(refDate, { weekStartsOn: 0 }), "yyyy-MM-dd"),
        end: format(endOfWeek(refDate, { weekStartsOn: 0 }), "yyyy-MM-dd"),
      };
    }
    return {
      start: format(startOfMonth(refDate), "yyyy-MM-dd"),
      end: format(endOfMonth(refDate), "yyyy-MM-dd"),
    };
  })();

  const { data: appointments = [] } = useQuery({
    queryKey: ["admin-appointments", range.start, range.end, statusFilter],
    queryFn: async () => {
      let q = supabase
        .from("agendamentos")
        .select("*, usuarios(nome, telefone), servicos(nome)")
        .gte("data", range.start)
        .lte("data", range.end)
        .order("data")
        .order("horario");
      if (statusFilter !== "todos") q = q.eq("status", statusFilter as any);
      const { data } = await q;

      if (data && data.length > 0) {
        const ids = data.map((a: any) => a.id);
        const { data: junction } = await supabase
          .from("agendamento_servicos")
          .select("agendamento_id, servicos:servico_id(nome)")
          .in("agendamento_id", ids);
        const map: Record<string, string[]> = {};
        (junction || []).forEach((j: any) => {
          if (!map[j.agendamento_id]) map[j.agendamento_id] = [];
          if (j.servicos?.nome) map[j.agendamento_id].push(j.servicos.nome);
        });
        return data.map((a: any) => ({
          ...a,
          allServicos: map[a.id] || (a.servicos?.nome ? [a.servicos.nome] : []),
        }));
      }
      return data || [];
    },
  });

  const filtered = appointments.filter((a: any) =>
    search.trim() === "" ? true : (a.usuarios?.nome || "").toLowerCase().includes(search.toLowerCase())
  );

  // Stats
  const today = new Date();
  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const todayStr = format(today, "yyyy-MM-dd");
      const ws = format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");
      const we = format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");
      const ms = format(startOfMonth(today), "yyyy-MM-dd");
      const me = format(endOfMonth(today), "yyyy-MM-dd");
      const [d, w, m] = await Promise.all([
        supabase.from("agendamentos").select("id", { count: "exact", head: true }).eq("data", todayStr).eq("status", "ativo"),
        supabase.from("agendamentos").select("id", { count: "exact", head: true }).gte("data", ws).lte("data", we).eq("status", "ativo"),
        supabase.from("agendamentos").select("id", { count: "exact", head: true }).gte("data", ms).lte("data", me).eq("status", "ativo"),
      ]);
      return { day: d.count || 0, week: w.count || 0, month: m.count || 0 };
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (apt: any) => {
      const { error } = await supabase.from("agendamentos").update({ status: "cancelado" }).eq("id", apt.id);
      if (error) throw error;
      return apt;
    },
    onSuccess: (apt) => {
      queryClient.invalidateQueries({ queryKey: ["admin-appointments"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      const tel = apt.usuarios?.telefone?.replace(/\D/g, "");
      if (tel) {
        const dataDisp = format(parse(apt.data, "yyyy-MM-dd", new Date()), "dd/MM/yyyy", { locale: ptBR });
        const msg = encodeURIComponent(
          `Olá ${apt.usuarios?.nome || ""}, seu horário na Barbearia em ${dataDisp} às ${apt.horario.slice(
            0,
            5
          )} foi cancelado. Entre em contato para reagendar.`
        );
        window.open(`https://wa.me/55${tel.replace(/^55/, "")}?text=${msg}`, "_blank");
      }
      toast({ title: "Cancelado e WhatsApp aberto" });
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("agendamentos").update({ status: "finalizado" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-appointments"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      toast({ title: "Agendamento finalizado!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const encaixeMutation = useMutation({
    mutationFn: async () => {
      if (!encaixeNome.trim()) throw new Error("Informe o nome do cliente");
      const tel = encaixeTelefone.replace(/\D/g, "");
      if (tel.length < 10) throw new Error("Telefone inválido");
      if (encaixeServicos.length === 0) throw new Error("Selecione ao menos um serviço");

      const { data: usuario, error: uErr } = await supabase
        .from("usuarios")
        .insert({ nome: encaixeNome.trim(), telefone: tel, tipo: "cliente" })
        .select()
        .single();
      if (uErr) throw uErr;

      const { data: ag, error: agErr } = await supabase
        .from("agendamentos")
        .insert({
          cliente_id: usuario.id,
          data: encaixeData,
          horario: encaixeHorario + ":00",
          telefone_cliente: tel,
          servico_id: encaixeServicos[0].id,
        })
        .select()
        .single();
      if (agErr) throw agErr;

      if (encaixeServicos.length > 0) {
        await supabase.from("agendamento_servicos").insert(
          encaixeServicos.map((s) => ({ agendamento_id: ag.id, servico_id: s.id }))
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-appointments"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      toast({ title: "Encaixe criado!" });
      setEncaixeNome("");
      setEncaixeTelefone("");
      setEncaixeHorario("09:00");
      setEncaixeServicos([]);
      setEncaixeAberto(false);
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  // Navigation
  const navPrev = () => setRefDate(tab === "dia" ? subDays(refDate, 1) : tab === "semana" ? subWeeks(refDate, 1) : subMonths(refDate, 1));
  const navNext = () => setRefDate(tab === "dia" ? addDays(refDate, 1) : tab === "semana" ? addWeeks(refDate, 1) : addMonths(refDate, 1));

  const headerLabel = (() => {
    if (tab === "dia") return format(refDate, "dd 'de' MMMM yyyy", { locale: ptBR });
    if (tab === "semana") {
      const s = startOfWeek(refDate, { weekStartsOn: 0 });
      const e = endOfWeek(refDate, { weekStartsOn: 0 });
      return `${format(s, "dd MMM", { locale: ptBR })} — ${format(e, "dd MMM", { locale: ptBR })}`;
    }
    return format(refDate, "MMMM yyyy", { locale: ptBR });
  })();

  // Group by day for week view
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(refDate, { weekStartsOn: 0 }), i));

  return (
    <div className="container max-w-5xl py-8 space-y-6 animate-fade-in">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "HOJE", value: stats?.day ?? 0 },
          { label: "SEMANA", value: stats?.week ?? 0 },
          { label: "MÊS", value: stats?.month ?? 0 },
        ].map((s) => (
          <div key={s.label} className="bg-card rounded-xl p-4 border border-border text-center">
            <p className="text-3xl font-heading text-primary">{s.value}</p>
            <p className="text-xs text-muted-foreground font-body mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Encaixe */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <button
          onClick={() => setEncaixeAberto((v) => !v)}
          className="w-full flex items-center justify-between p-4 text-left"
        >
          <div className="flex items-center gap-2 text-primary">
            <Plus className="h-5 w-5" />
            <span className="font-heading text-lg tracking-wider">ENCAIXE MANUAL</span>
          </div>
          {encaixeAberto ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
        </button>

        {encaixeAberto && (
          <div className="px-4 pb-4 border-t border-border space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Nome do cliente</Label>
                <Input value={encaixeNome} onChange={(e) => setEncaixeNome(e.target.value)} placeholder="Nome completo" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Telefone</Label>
                <Input value={encaixeTelefone} onChange={(e) => setEncaixeTelefone(e.target.value)} placeholder="(21) 99999-9999" maxLength={20} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Data</Label>
                <Input type="date" value={encaixeData} onChange={(e) => setEncaixeData(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Horário</Label>
                <Input type="time" value={encaixeHorario} onChange={(e) => setEncaixeHorario(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Serviços</Label>
              <ServiceSelector
                selectedIds={encaixeServicos.map((s) => s.id)}
                onToggle={(s) =>
                  setEncaixeServicos((prev) =>
                    prev.find((x) => x.id === s.id) ? prev.filter((x) => x.id !== s.id) : [...prev, s]
                  )
                }
              />
            </div>
            <Button
              onClick={() => encaixeMutation.mutate()}
              disabled={encaixeMutation.isPending}
              className="w-full font-heading tracking-widest"
            >
              <Plus className="h-4 w-4 mr-2" />
              {encaixeMutation.isPending ? "SALVANDO..." : "CRIAR ENCAIXE"}
            </Button>
          </div>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="dia" className="font-heading tracking-wider">DIA</TabsTrigger>
          <TabsTrigger value="semana" className="font-heading tracking-wider">SEMANA</TabsTrigger>
          <TabsTrigger value="mes" className="font-heading tracking-wider">MÊS</TabsTrigger>
        </TabsList>

        {/* Filters bar */}
        <div className="flex flex-col sm:flex-row gap-2 mt-4">
          <div className="flex items-center gap-2 flex-1">
            <Button variant="outline" size="icon" onClick={navPrev}><ChevronLeft className="h-4 w-4" /></Button>
            <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2 flex-1 justify-center">
              <CalendarDays className="h-4 w-4 text-primary" />
              <span className="font-heading tracking-wider text-sm">{headerLabel.toUpperCase()}</span>
            </div>
            <Button variant="outline" size="icon" onClick={navNext}><ChevronRight className="h-4 w-4" /></Button>
            <Button variant="ghost" size="sm" onClick={() => setRefDate(new Date())} className="font-heading">HOJE</Button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 mt-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome..." className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="ativo">Ativos</SelectItem>
              <SelectItem value="cancelado">Cancelados</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <TabsContent value="dia" className="mt-4">
          <AppointmentsList 
            appointments={filtered} 
            onCancel={(a) => cancelMutation.mutate(a)} 
            onFinalize={(a) => finalizeMutation.mutate(a.id)}
          />
        </TabsContent>

        <TabsContent value="semana" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
            {weekDays.map((d) => {
              const dayApts = filtered.filter((a: any) => isSameDay(parse(a.data, "yyyy-MM-dd", new Date()), d));
              return (
                <div key={d.toISOString()} className="bg-card border border-border rounded-lg p-2 min-h-[180px]">
                  <p className="font-heading text-center text-sm tracking-wider mb-2">
                    {format(d, "EEE dd", { locale: ptBR }).toUpperCase()}
                  </p>
                  <div className="space-y-1">
                    {dayApts.length === 0 ? (
                      <p className="text-xs text-muted-foreground/60 text-center py-4">—</p>
                    ) : (
                      dayApts.map((a: any) => (
                        <div key={a.id} className={`text-xs bg-primary/10 border border-primary/30 rounded p-1.5 ${a.status !== "ativo" ? "opacity-50" : ""}`}>
                          <p className="font-heading text-primary">{a.horario.slice(0, 5)}</p>
                          <p className="font-body truncate">{a.usuarios?.nome}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-6">
            <p className="font-heading text-sm tracking-wider text-muted-foreground mb-2">DETALHES</p>
            <AppointmentsList 
              appointments={filtered} 
              onCancel={(a) => cancelMutation.mutate(a)} 
              onFinalize={(a) => finalizeMutation.mutate(a.id)}
            />
          </div>
        </TabsContent>

        <TabsContent value="mes" className="mt-4">
          <MonthGrid refDate={refDate} appointments={filtered} onSelectDay={(d) => { setRefDate(d); setTab("dia"); }} />
          <div className="mt-6">
            <p className="font-heading text-sm tracking-wider text-muted-foreground mb-2">DETALHES DO MÊS</p>
            <AppointmentsList 
              appointments={filtered} 
              onCancel={(a) => cancelMutation.mutate(a)} 
              onFinalize={(a) => finalizeMutation.mutate(a.id)}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AppointmentsList({ appointments, onCancel, onFinalize }: { appointments: any[]; onCancel: (a: any) => void; onFinalize: (a: any) => void }) {
  if (appointments.length === 0) {
    return <p className="text-muted-foreground text-center py-8 font-body">Nenhum agendamento.</p>;
  }
  return (
    <div className="space-y-2">
      {appointments.map((apt) => (
        <div
          key={apt.id}
          className={`bg-card rounded-xl p-4 border border-border flex items-center justify-between ${
            apt.status !== "ativo" ? "opacity-60" : ""
          }`}
        >
          <div className="space-y-1 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-primary font-heading text-lg">
                {format(parse(apt.data, "yyyy-MM-dd", new Date()), "dd/MM", { locale: ptBR })} · {apt.horario.slice(0, 5)}
              </span>
              {apt.status === "cancelado" && <span className="text-xs bg-destructive/20 text-destructive px-2 py-0.5 rounded font-body">Cancelado</span>}
              {apt.status === "finalizado" && <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded font-body">Finalizado</span>}
            </div>
            <p className="font-body text-sm">{apt.usuarios?.nome}</p>
            <p className="font-body text-xs text-muted-foreground">{apt.usuarios?.telefone}</p>
            {apt.allServicos && apt.allServicos.length > 0 && (
              <p className="font-body text-xs text-primary/80">✂️ {apt.allServicos.join(", ")}</p>
            )}
          </div>
          {apt.status === "ativo" && (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onFinalize(apt)}
                className="text-primary hover:text-primary font-heading"
              >
                <CheckCircle2 className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">Finalizar</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onCancel(apt)}
                className="text-destructive hover:text-destructive font-heading"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function MonthGrid({
  refDate,
  appointments,
  onSelectDay,
}: {
  refDate: Date;
  appointments: any[];
  onSelectDay: (d: Date) => void;
}) {
  const start = startOfMonth(refDate);
  const end = endOfMonth(refDate);
  const gridStart = startOfWeek(start, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(end, { weekStartsOn: 0 });
  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);

  const counts: Record<string, number> = {};
  appointments.forEach((a: any) => {
    counts[a.data] = (counts[a.data] || 0) + 1;
  });

  return (
    <div>
      <div className="grid grid-cols-7 text-center text-xs font-heading text-muted-foreground tracking-wider mb-1">
        {["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const inMonth = d >= start && d <= end;
          const key = format(d, "yyyy-MM-dd");
          const count = counts[key] || 0;
          return (
            <button
              key={d.toISOString()}
              onClick={() => onSelectDay(d)}
              className={`aspect-square rounded-md border flex flex-col items-center justify-center transition-all ${
                inMonth ? "bg-card border-border hover:border-primary/60" : "border-transparent opacity-30"
              }`}
            >
              <span className="font-heading text-sm">{format(d, "dd")}</span>
              {count > 0 && (
                <span className="text-[10px] font-body bg-primary/20 text-primary px-1.5 rounded mt-0.5">{count}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
