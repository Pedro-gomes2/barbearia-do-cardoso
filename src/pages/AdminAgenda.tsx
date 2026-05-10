import { useEffect, useState } from "react";
import { Plus, Trash2, MessageCircle, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const DAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const FALLBACK_WHATSAPP = "5521995323454";

interface DayConfig {
  id?: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fim: string;
  ativo: boolean;
  intervalo_minutos: number;
}

interface HorarioCustom {
  id: string;
  dia_semana: number;
  horario: string;
  ativo: boolean;
}

export default function AdminAgenda() {
  const [configs, setConfigs] = useState<DayConfig[]>([]);
  const [newTimes, setNewTimes] = useState<Record<number, string>>({});
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const today = format(new Date(), "yyyy-MM-dd");

  useEffect(() => {
    supabase.from("configuracoes_agenda").select("*").order("dia_semana").then(({ data }) => {
      if (data) setConfigs(data as any);
    });
  }, []);

  const { data: agendamentosHoje = [] } = useQuery({
    queryKey: ["agendamentos-hoje", today],
    queryFn: async () => {
      const { data } = await supabase
        .from("agendamentos")
        .select("id, horario, telefone_cliente, usuarios(nome)")
        .eq("data", today)
        .eq("status", "ativo")
        .order("horario");
      return data || [];
    },
  });

  const { data: cfgApp } = useQuery({
    queryKey: ["cfg-app-agenda"],
    queryFn: async () => {
      const { data } = await supabase.from("configuracoes_app").select("whatsapp_admin").limit(1).maybeSingle();
      return data;
    },
  });

  const { data: allCustomSlots = [] } = useQuery({
    queryKey: ["custom-slots-all"],
    queryFn: async () => {
      const { data } = await supabase.from("horarios_customizados").select("*").order("horario");
      return (data || []) as HorarioCustom[];
    },
  });

  // Toggle dia — salva imediatamente
  const toggleDia = async (idx: number, ativo: boolean) => {
    const config = configs[idx];
    setConfigs((prev) => prev.map((c, i) => (i === idx ? { ...c, ativo } : c)));
    if (config.id) {
      const { error } = await supabase
        .from("configuracoes_agenda")
        .update({ ativo } as any)
        .eq("id", config.id);
      if (error) {
        toast({ title: "Erro ao salvar", variant: "destructive" });
        setConfigs((prev) => prev.map((c, i) => (i === idx ? { ...c, ativo: !ativo } : c)));
      }
    }
  };

  const addSlotMutation = useMutation({
    mutationFn: async ({ dayOfWeek, time }: { dayOfWeek: number; time: string }) => {
      const { error } = await supabase.from("horarios_customizados").insert({
        dia_semana: dayOfWeek,
        horario: time + ":00",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-slots-all"] });
      toast({ title: "Horário adicionado!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const deleteSlotMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("horarios_customizados").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-slots-all"] });
      toast({ title: "Horário removido" });
    },
  });

  const enviarLembrete = (ag: any) => {
    const nome = ag.usuarios?.nome || "Cliente";
    const horario = ag.horario?.slice(0, 5) || "";
    const dateDisplay = format(new Date(), "dd 'de' MMMM", { locale: ptBR });
    const telefone = ag.telefone_cliente?.replace(/\D/g, "") || "";
    const msg = `Olá ${nome}! Lembrando do seu agendamento hoje, ${dateDisplay}, às ${horario}. Até logo! ✂️`;
    const numero = telefone || (cfgApp?.whatsapp_admin || FALLBACK_WHATSAPP);
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const getCustomSlotsForDay = (day: number) => allCustomSlots.filter((s) => s.dia_semana === day);

  return (
    <div className="container max-w-lg py-8 space-y-6 animate-fade-in">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-heading tracking-wider">AGENDA</h2>
        <p className="text-muted-foreground font-body text-sm">Ative os dias e configure os horários</p>
      </div>

      {/* Lembretes do dia */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-primary">
          <MessageCircle className="h-5 w-5" />
          <span className="font-heading text-lg">LEMBRETES DE HOJE</span>
        </div>
        {agendamentosHoje.length === 0 ? (
          <p className="text-muted-foreground font-body text-sm">Nenhum agendamento para hoje.</p>
        ) : (
          <div className="space-y-2">
            {agendamentosHoje.map((ag: any) => (
              <div key={ag.id} className="flex items-center justify-between gap-2 border border-border rounded-lg px-3 py-2">
                <div>
                  <p className="font-body text-sm font-semibold">{ag.usuarios?.nome || "Cliente"}</p>
                  <p className="font-body text-xs text-muted-foreground">{ag.horario?.slice(0, 5)}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => enviarLembrete(ag)}>
                  <MessageCircle className="h-4 w-4 mr-1" /> WhatsApp
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dias da semana */}
      <div className="space-y-3">
        {configs.map((config, idx) => {
          const daySlots = getCustomSlotsForDay(config.dia_semana);
          const newTime = newTimes[config.dia_semana] || "08:00";

          return (
            <div
              key={config.dia_semana}
              className={`rounded-xl border transition-all ${
                config.ativo
                  ? "bg-card border-primary/40"
                  : "bg-muted/30 border-border opacity-70"
              }`}
            >
              {/* Cabeçalho do dia — clica para ativar/desativar */}
              <button
                onClick={() => toggleDia(idx, !config.ativo)}
                className="w-full flex items-center justify-between p-4 text-left"
              >
                <div className="flex items-center gap-3">
                  {config.ativo
                    ? <CheckCircle2 className="h-5 w-5 text-primary" />
                    : <XCircle className="h-5 w-5 text-muted-foreground" />
                  }
                  <span className="font-heading text-xl">{DAYS[config.dia_semana]}</span>
                </div>
                <span className={`font-body text-xs font-semibold px-2 py-1 rounded-full ${
                  config.ativo
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {config.ativo ? "ATIVO" : "INATIVO"}
                </span>
              </button>

              {/* Horários — só aparece quando ativo */}
              {config.ativo && (
                <div className="px-4 pb-4 border-t border-border/50 pt-3 space-y-3">
                  <Label className="text-xs text-muted-foreground">Horários do dia</Label>

                  {daySlots.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {daySlots.map((slot) => (
                        <div key={slot.id} className="bg-primary/10 border border-primary/30 rounded-lg px-3 py-1 flex items-center gap-2">
                          <span className="font-heading text-sm text-primary">{slot.horario?.slice(0, 5)}</span>
                          <button
                            onClick={() => deleteSlotMutation.mutate(slot.id)}
                            className="text-destructive hover:text-destructive/80"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Input
                      type="time"
                      value={newTime}
                      onChange={(e) => setNewTimes({ ...newTimes, [config.dia_semana]: e.target.value })}
                      className="flex-1"
                    />
                    <Button
                      size="sm"
                      onClick={() => addSlotMutation.mutate({ dayOfWeek: config.dia_semana, time: newTime })}
                      disabled={addSlotMutation.isPending}
                    >
                      <Plus className="h-4 w-4 mr-1" /> Adicionar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
