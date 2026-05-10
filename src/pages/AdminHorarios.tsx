import { useState } from "react";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Clock, CheckCircle2, XCircle, CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

export default function AdminHorarios() {
  const [data, setData] = useState(format(new Date(), "yyyy-MM-dd"));

  const dayOfWeek = new Date(data + "T12:00:00").getDay();

  const { data: slots = [], isLoading } = useQuery({
    queryKey: ["admin-horarios", data],
    queryFn: async () => {
      const [{ data: customSlots }, { data: agendados }, { data: bloqueados }] = await Promise.all([
        supabase
          .from("horarios_customizados")
          .select("horario")
          .eq("dia_semana", dayOfWeek)
          .eq("ativo", true)
          .order("horario"),
        supabase
          .from("agendamentos")
          .select("horario, usuarios(nome)")
          .eq("data", data)
          .eq("status", "ativo"),
        supabase
          .from("bloqueios")
          .select("horario, motivo")
          .eq("data", data),
      ]);

      const agendadosMap = Object.fromEntries(
        (agendados || []).map((a: any) => [a.horario, a.usuarios?.nome || "Cliente"])
      );
      const bloqueadosMap = Object.fromEntries(
        (bloqueados || []).map((b: any) => [b.horario, b.motivo || "Bloqueado"])
      );

      return (customSlots || []).map((s) => {
        const h = s.horario;
        if (agendadosMap[h]) return { horario: h, status: "ocupado", info: agendadosMap[h] };
        if (bloqueadosMap[h]) return { horario: h, status: "bloqueado", info: bloqueadosMap[h] };
        return { horario: h, status: "livre", info: "" };
      });
    },
  });

  const livres = slots.filter((s) => s.status === "livre").length;
  const ocupados = slots.filter((s) => s.status === "ocupado").length;
  const bloqueados = slots.filter((s) => s.status === "bloqueado").length;

  const dataDisplay = format(parse(data, "yyyy-MM-dd", new Date()), "EEEE, dd 'de' MMMM", { locale: ptBR });

  return (
    <div className="container max-w-lg py-8 space-y-6 animate-fade-in">
      <div className="text-center space-y-1">
        <Clock className="h-8 w-8 text-primary mx-auto" />
        <h2 className="text-3xl font-heading tracking-wider">HORÁRIOS</h2>
        <p className="font-body text-sm text-muted-foreground">Visualize os horários vagos e ocupados</p>
      </div>

      {/* Seletor de data */}
      <div className="space-y-1">
        <Label className="flex items-center gap-2 text-xs text-muted-foreground">
          <CalendarDays className="h-4 w-4" /> Data
        </Label>
        <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
        <p className="text-xs text-muted-foreground font-body capitalize">{dataDisplay}</p>
      </div>

      {/* Resumo */}
      {slots.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
            <p className="font-heading text-2xl text-green-700">{livres}</p>
            <p className="font-body text-xs text-green-600">Vagos</p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
            <p className="font-heading text-2xl text-red-700">{ocupados}</p>
            <p className="font-body text-xs text-red-600">Ocupados</p>
          </div>
          <div className="bg-muted border border-border rounded-xl p-3 text-center">
            <p className="font-heading text-2xl text-muted-foreground">{bloqueados}</p>
            <p className="font-body text-xs text-muted-foreground">Bloqueados</p>
          </div>
        </div>
      )}

      {/* Lista de horários */}
      {isLoading ? (
        <p className="text-center text-muted-foreground font-body py-8">Carregando...</p>
      ) : slots.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center space-y-2">
          <p className="font-heading text-xl text-muted-foreground">SEM HORÁRIOS</p>
          <p className="font-body text-sm text-muted-foreground">
            Nenhum horário configurado para este dia.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {slots.map((s) => (
            <div
              key={s.horario}
              className={`flex items-center justify-between px-4 py-3 rounded-xl border ${
                s.status === "livre"
                  ? "bg-green-50 border-green-200"
                  : s.status === "ocupado"
                  ? "bg-red-50 border-red-200"
                  : "bg-muted border-border opacity-60"
              }`}
            >
              <div className="flex items-center gap-3">
                {s.status === "livre" ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
                <span className="font-heading text-xl">{s.horario.slice(0, 5)}</span>
              </div>
              <div className="text-right">
                <span className={`font-body text-xs px-2 py-0.5 rounded-full ${
                  s.status === "livre"
                    ? "bg-green-100 text-green-700"
                    : s.status === "ocupado"
                    ? "bg-red-100 text-red-700"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {s.status === "livre" ? "VAGO" : s.status === "ocupado" ? "OCUPADO" : "BLOQUEADO"}
                </span>
                {s.info && (
                  <p className="font-body text-xs text-muted-foreground mt-0.5">{s.info}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
