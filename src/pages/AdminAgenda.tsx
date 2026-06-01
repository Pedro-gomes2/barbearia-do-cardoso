import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MessageCircle, CheckCircle2, XCircle, Clock, Pencil } from "lucide-react";
import { HorariosDiaSemana } from "@/components/HorariosDiaSemana";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { confirmAgendamento, cancelAgendamentoAdmin } from "@/lib/confirmacao-helpers";
import { timeToMinutes, formatTimeDisplay } from "@/lib/time-utils";

const DAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

interface DayConfig {
  id?: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fim: string;
  ativo: boolean;
  intervalo_minutos: number;
}

export default function AdminAgenda() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const today = format(new Date(), "yyyy-MM-dd");
  const [ajusteData, setAjusteData] = useState(today);

  const { data: configs = [], isLoading: configsLoading } = useQuery({
    queryKey: ["admin-configuracoes-agenda"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("configuracoes_agenda")
        .select("*")
        .order("dia_semana");
      if (error) throw error;
      return (data || []) as DayConfig[];
    },
  });

  const { data: agendamentosHoje = [] } = useQuery({
    queryKey: ["agendamentos-hoje", today],
    queryFn: async () => {
      await supabase.rpc("expire_pending_agendamentos");
      const { data } = await supabase
        .from("agendamentos")
        .select("id, horario, telefone_cliente, status, expira_em, usuarios(nome)")
        .eq("data", today)
        .in("status", ["pendente", "ativo"])
        .order("horario");
      return (data || []).sort((a: any, b: any) => {
        if (a.status === b.status) return a.horario.localeCompare(b.horario);
        return a.status === "pendente" ? -1 : 1;
      });
    },
  });

  const toggleDia = useMutation({
    mutationFn: async ({ config, newActive }: { config: DayConfig; newActive: boolean }) => {
      if (!config.id) return;
      const { error } = await supabase
        .from("configuracoes_agenda")
        .update({ ativo: newActive } as any)
        .eq("id", config.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-configuracoes-agenda"] });
    },
    onError: () => {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    },
  });

  const saveConfigMutation = useMutation({
    mutationFn: async (config: DayConfig) => {
      if (!config.id) return;
      // Validar que hora_fim > hora_inicio
      const inicioMin = timeToMinutes(config.hora_inicio);
      const fimMin = timeToMinutes(config.hora_fim);
      if (fimMin <= inicioMin) {
        throw new Error("Hora de fechamento deve ser posterior à de abertura");
      }
      const { error } = await supabase
        .from("configuracoes_agenda")
        .update({ hora_inicio: config.hora_inicio, hora_fim: config.hora_fim } as any)
        .eq("id", config.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Configurações salvas!" });
      queryClient.invalidateQueries({ queryKey: ["admin-configuracoes-agenda"] });
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const enviarLembrete = (ag: any) => {
    const telefone = ag.telefone_cliente?.replace(/\D/g, "") || "";
    if (!telefone) {
      toast({ title: "Cliente sem telefone", description: "Não é possível enviar lembrete.", variant: "destructive" });
      return;
    }
    const nome = ag.usuarios?.nome || "Cliente";
    const horario = ag.horario?.slice(0, 5) || "";
    const dateDisplay = format(new Date(), "dd 'de' MMMM", { locale: ptBR });
    const msg = `Olá ${nome}! Lembrando do seu agendamento hoje, ${dateDisplay}, às ${horario}. Até logo! ✂️`;
    window.open(`https://wa.me/${telefone}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  return (
    <div className="container max-w-5xl py-8 space-y-6 animate-fade-in">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-heading tracking-wider">AGENDA</h2>
        <p className="text-muted-foreground font-body text-sm">Ative os dias e configure os horários de abertura</p>
        <div className="pt-2 flex items-end gap-2 justify-center">
          <div className="space-y-1 text-left">
            <Label className="text-xs text-muted-foreground">Ajustar dia específico</Label>
            <Input
              type="date"
              value={ajusteData}
              onChange={(e) => setAjusteData(e.target.value)}
              className="max-w-[180px]"
            />
          </div>
          <Button asChild size="sm" variant="outline" className="gap-2">
            <Link to={`/admin/gerenciar-horarios?tab=data&data=${ajusteData}`}>
              <Pencil className="h-4 w-4" /> Editar
            </Link>
          </Button>
        </div>
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
              <div
                key={ag.id}
                className={`flex flex-col gap-2 border rounded-lg px-3 py-2 ${
                  ag.status === "pendente"
                    ? "border-yellow-400 bg-yellow-50"
                    : "border-border"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-body text-sm font-semibold">{ag.usuarios?.nome || "Cliente"}</p>
                    <p className="font-body text-xs text-muted-foreground">{ag.horario?.slice(0, 5)}</p>
                    {ag.status === "pendente" && (
                      <div className="flex items-center gap-2 text-xs text-yellow-700 font-body mt-1">
                        <Clock className="h-3 w-3" />
                        <span>AGUARDANDO CONFIRMAÇÃO</span>
                        {ag.expira_em && (
                          <span>(expira em {Math.max(0, Math.round((new Date(ag.expira_em).getTime() - Date.now()) / 60000))} min)</span>
                        )}
                      </div>
                    )}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => enviarLembrete(ag)}>
                    <MessageCircle className="h-4 w-4 mr-1" /> WhatsApp
                  </Button>
                </div>
                {ag.status === "pendente" && (
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" onClick={async () => {
                      try {
                        await confirmAgendamento(ag.id);
                        queryClient.invalidateQueries({ queryKey: ["agendamentos-hoje", today] });
                        queryClient.invalidateQueries({ queryKey: ["pendentes-count"] });
                        toast({ title: "Confirmado", description: "Agendamento confirmado" });
                      } catch (e: any) {
                        toast({ title: "Erro", description: e.message, variant: "destructive" });
                      }
                    }}>Confirmar</Button>
                    <Button size="sm" variant="outline" onClick={async () => {
                      try {
                        await cancelAgendamentoAdmin(ag.id);
                        queryClient.invalidateQueries({ queryKey: ["agendamentos-hoje", today] });
                        queryClient.invalidateQueries({ queryKey: ["pendentes-count"] });
                        toast({ title: "Cancelado", description: "Agendamento cancelado" });
                      } catch (e: any) {
                        toast({ title: "Erro", description: e.message, variant: "destructive" });
                      }
                    }}>Cancelar</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dias da semana */}
      {configsLoading ? (
        <p className="text-center text-muted-foreground py-8">Carregando configurações...</p>
      ) : (
      <div className="space-y-3">
        {configs.map((config) => {
          const configFromQuery = configs.find(c => c.dia_semana === config.dia_semana);
          const currentConfig = configFromQuery || config;

          return (
            <div
              key={config.dia_semana}
              className={`rounded-xl border transition-all ${
                currentConfig.ativo
                  ? "bg-card border-primary/40"
                  : "bg-muted/30 border-border opacity-70"
              }`}
            >
              {/* Cabeçalho do dia — clica para ativar/desativar */}
              <button
                onClick={() => toggleDia.mutate({ config: currentConfig, newActive: !currentConfig.ativo })}
                className="w-full flex items-center justify-between p-4 text-left focus:outline-none"
              >
                <div className="flex items-center gap-3">
                  {currentConfig.ativo
                    ? <CheckCircle2 className="h-5 w-5 text-primary" />
                    : <XCircle className="h-5 w-5 text-muted-foreground" />
                  }
                  <span className="font-heading text-xl">{DAYS[currentConfig.dia_semana]}</span>
                </div>
                <span className={`font-body text-xs font-semibold px-2 py-1 rounded-full ${
                  currentConfig.ativo
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {currentConfig.ativo ? "ATIVO" : "INATIVO"}
                </span>
              </button>

              {/* Horários — só aparece quando ativo */}
              {currentConfig.ativo && (
                <div className="px-4 pb-4 border-t border-border/50 pt-4 space-y-4">
                  <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                    <div className="space-y-1 flex-1">
                      <Label className="text-xs text-muted-foreground font-semibold uppercase tracking-widest">
                        Abertura (início dos atendimentos)
                      </Label>
                      <Input
                        type="time"
                        value={currentConfig.hora_inicio?.slice(0, 5) || ""}
                        onChange={(e) => {
                          const updated = { ...currentConfig, hora_inicio: e.target.value + ":00" };
                          queryClient.setQueryData(["admin-configuracoes-agenda"],
                            (configs: DayConfig[]) => configs.map(c => c.id === currentConfig.id ? updated : c)
                          );
                        }}
                        className="font-heading max-w-[160px]"
                      />
                    </div>
                    <div className="space-y-1 flex-1">
                      <Label className="text-xs text-muted-foreground font-semibold uppercase tracking-widest">
                        Fechamento (limite final dos atendimentos)
                      </Label>
                      <Input
                        type="time"
                        value={currentConfig.hora_fim?.slice(0, 5) || ""}
                        onChange={(e) => {
                          const updated = { ...currentConfig, hora_fim: e.target.value + ":00" };
                          queryClient.setQueryData(["admin-configuracoes-agenda"],
                            (configs: DayConfig[]) => configs.map(c => c.id === currentConfig.id ? updated : c)
                          );
                        }}
                        className="font-heading max-w-[160px]"
                      />
                    </div>
                    <Button
                      size="sm"
                      onClick={() => saveConfigMutation.mutate(currentConfig)}
                      disabled={saveConfigMutation.isPending}
                    >
                      Salvar horários
                    </Button>
                  </div>
                  <HorariosDiaSemana diaSemana={currentConfig.dia_semana} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
