import { useState } from "react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, X, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function AdminDashboard() {
  const [date, setDate] = useState<Date>(new Date());
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const dateStr = format(date, "yyyy-MM-dd");

  const { data: appointments = [] } = useQuery({
    queryKey: ["admin-appointments", dateStr],
    queryFn: async () => {
      const { data } = await supabase
        .from("agendamentos")
        .select("*, usuarios(nome, telefone), servicos(nome)")
        .eq("data", dateStr)
        .order("horario");

      // Fetch junction table services for each appointment
      if (data && data.length > 0) {
        const ids = data.map((a: any) => a.id);
        const { data: junctionData } = await supabase
          .from("agendamento_servicos")
          .select("agendamento_id, servico_id, servicos:servico_id(nome)")
          .in("agendamento_id", ids);

        const servicesByApt: Record<string, string[]> = {};
        (junctionData || []).forEach((j: any) => {
          if (!servicesByApt[j.agendamento_id]) servicesByApt[j.agendamento_id] = [];
          if (j.servicos?.nome) servicesByApt[j.agendamento_id].push(j.servicos.nome);
        });

        return data.map((a: any) => ({
          ...a,
          allServicos: servicesByApt[a.id] || (a.servicos?.nome ? [a.servicos.nome] : []),
        }));
      }
      return data || [];
    },
  });

  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");
  const weekStart = format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const weekEnd = format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const monthStart = format(startOfMonth(today), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(today), "yyyy-MM-dd");

  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const [dayRes, weekRes, monthRes] = await Promise.all([
        supabase.from("agendamentos").select("id", { count: "exact", head: true }).eq("data", todayStr).eq("status", "ativo"),
        supabase.from("agendamentos").select("id", { count: "exact", head: true }).gte("data", weekStart).lte("data", weekEnd).eq("status", "ativo"),
        supabase.from("agendamentos").select("id", { count: "exact", head: true }).gte("data", monthStart).lte("data", monthEnd).eq("status", "ativo"),
      ]);
      return { day: dayRes.count || 0, week: weekRes.count || 0, month: monthRes.count || 0 };
    },
  });

  const thirtyDaysAgo = format(subDays(today, 29), "yyyy-MM-dd");
  const { data: chartData = [] } = useQuery({
    queryKey: ["admin-chart"],
    queryFn: async () => {
      const { data } = await supabase
        .from("agendamentos")
        .select("data")
        .gte("data", thirtyDaysAgo)
        .eq("status", "ativo");

      const counts: Record<string, number> = {};
      (data || []).forEach((a: any) => { counts[a.data] = (counts[a.data] || 0) + 1; });

      const result = [];
      for (let i = 29; i >= 0; i--) {
        const d = format(subDays(today, i), "yyyy-MM-dd");
        result.push({ date: format(subDays(today, i), "dd/MM"), count: counts[d] || 0 });
      }
      return result;
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("agendamentos").update({ status: "cancelado" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-appointments"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      queryClient.invalidateQueries({ queryKey: ["admin-chart"] });
      toast({ title: "Agendamento cancelado" });
    },
  });

  return (
    <div className="container max-w-5xl py-8 space-y-8 animate-fade-in">
      {/* Stats cards */}
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

      {/* Chart */}
      <div className="bg-card rounded-xl p-4 border border-border">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="h-5 w-5 text-primary" />
          <span className="font-heading text-lg">ÚLTIMOS 30 DIAS</span>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData}>
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval={4} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={25} />
            <Tooltip
              contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
              labelStyle={{ color: "hsl(var(--foreground))" }}
            />
            <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Agendamentos" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Calendar + Appointments side by side on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Calendar */}
        <div className="bg-card rounded-xl p-4 border border-border">
          <Calendar
            mode="single"
            selected={date}
            onSelect={(d) => d && setDate(d)}
            locale={ptBR}
            className="pointer-events-auto mx-auto"
          />
        </div>

        {/* Day appointments */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <CalendarDays className="h-5 w-5 text-primary" />
            <h2 className="text-2xl">{format(date, "dd 'DE' MMMM", { locale: ptBR }).toUpperCase()}</h2>
          </div>

          {appointments.length === 0 ? (
            <p className="text-muted-foreground text-center py-8 font-body">Nenhum agendamento para esta data.</p>
          ) : (
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
              {appointments.map((apt: any) => (
                <div
                  key={apt.id}
                  className={`bg-card rounded-xl p-4 border border-border flex items-center justify-between ${
                    apt.status === "cancelado" ? "opacity-50" : ""
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-primary font-heading text-xl">{apt.horario?.slice(0, 5)}</span>
                      {apt.status === "cancelado" && (
                        <span className="text-xs bg-destructive/20 text-destructive px-2 py-0.5 rounded font-body">Cancelado</span>
                      )}
                    </div>
                    <p className="font-body text-sm">{apt.usuarios?.nome}</p>
                    <p className="font-body text-xs text-muted-foreground">{apt.usuarios?.telefone}</p>
                    {apt.allServicos && apt.allServicos.length > 0 && (
                      <p className="font-body text-xs text-primary/80">✂️ {apt.allServicos.join(", ")}</p>
                    )}
                  </div>
                  {apt.status === "ativo" && (
                    <Button variant="ghost" size="icon" onClick={() => cancelMutation.mutate(apt.id)} className="text-destructive hover:text-destructive">
                      <X className="h-5 w-5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
