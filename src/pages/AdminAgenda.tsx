import { useEffect, useState } from "react";
import { Save, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const DAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const INTERVALS = [
  { value: "15", label: "15 min" },
  { value: "20", label: "20 min" },
  { value: "30", label: "30 min" },
  { value: "40", label: "40 min" },
  { value: "45", label: "45 min" },
  { value: "60", label: "1 hora" },
];

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
  const [loading, setLoading] = useState(false);
  const [newTimes, setNewTimes] = useState<Record<number, string>>({});
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    supabase.from("configuracoes_agenda").select("*").order("dia_semana").then(({ data }) => {
      if (data) setConfigs(data as any);
    });
  }, []);

  // Load all custom slots
  const { data: allCustomSlots = [] } = useQuery({
    queryKey: ["custom-slots-all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("horarios_customizados")
        .select("*")
        .order("horario");
      return (data || []) as HorarioCustom[];
    },
  });

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

  const updateConfig = (idx: number, field: keyof DayConfig, value: any) => {
    setConfigs((prev) => prev.map((c, i) => (i === idx ? { ...c, [field]: value } : c)));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      for (const c of configs) {
        if (c.id) {
          await supabase
            .from("configuracoes_agenda")
            .update({
              hora_inicio: c.hora_inicio,
              hora_fim: c.hora_fim,
              ativo: c.ativo,
              intervalo_minutos: c.intervalo_minutos,
            } as any)
            .eq("id", c.id);
        }
      }
      toast({ title: "Configurações salvas!" });
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const getCustomSlotsForDay = (day: number) =>
    allCustomSlots.filter((s) => s.dia_semana === day);

  return (
    <div className="container max-w-lg py-8 space-y-6 animate-fade-in">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-heading tracking-wider">CONFIGURAR AGENDA</h2>
        <p className="text-muted-foreground font-body text-sm">Horários fixos e manuais por dia</p>
      </div>

      <div className="space-y-6">
        {configs.map((config, idx) => {
          const daySlots = getCustomSlotsForDay(config.dia_semana);
          const newTime = newTimes[config.dia_semana] || "08:00";

          return (
            <div key={config.dia_semana} className="bg-card rounded-xl p-4 border border-border space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-heading text-xl">{DAYS[config.dia_semana]}</span>
                <Switch checked={config.ativo} onCheckedChange={(v) => updateConfig(idx, "ativo", v)} />
              </div>
              {config.ativo && (
                <div className="space-y-4">
                  <div className="flex gap-4">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs text-muted-foreground">Início</Label>
                      <Input type="time" value={config.hora_inicio?.slice(0, 5)} onChange={(e) => updateConfig(idx, "hora_inicio", e.target.value + ":00")} />
                    </div>
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs text-muted-foreground">Fim</Label>
                      <Input type="time" value={config.hora_fim?.slice(0, 5)} onChange={(e) => updateConfig(idx, "hora_fim", e.target.value + ":00")} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Intervalo entre horários</Label>
                    <Select value={String(config.intervalo_minutos || 60)} onValueChange={(v) => updateConfig(idx, "intervalo_minutos", Number(v))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {INTERVALS.map((i) => (
                          <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Manual extra slots */}
                  <div className="border-t border-border pt-3 space-y-3">
                    <Label className="text-xs text-muted-foreground">Horários manuais extras</Label>
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
                    {daySlots.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {daySlots.map((slot) => (
                          <div key={slot.id} className="bg-primary/10 border border-primary/30 rounded-lg px-3 py-1 flex items-center gap-2">
                            <span className="font-heading text-sm text-primary">{slot.horario?.slice(0, 5)}</span>
                            <button onClick={() => deleteSlotMutation.mutate(slot.id)} className="text-destructive hover:text-destructive/80">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Button onClick={handleSave} disabled={loading} className="w-full py-6 font-heading tracking-widest text-lg" size="lg">
        <Save className="mr-2 h-5 w-5" />
        {loading ? "SALVANDO..." : "SALVAR CONFIGURAÇÕES"}
      </Button>
    </div>
  );
}
