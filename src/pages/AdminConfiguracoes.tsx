import { useEffect, useState } from "react";
import { Save, Settings, CalendarIcon, Lock, Unlock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parse, isAfter, isBefore } from "date-fns";
import { ptBR } from "date-fns/locale";

function fmtDate(iso: string) {
  return format(parse(iso, "yyyy-MM-dd", new Date()), "dd/MM/yyyy", { locale: ptBR });
}

function agendaStatus(inicio: string | null, fim: string | null): "aberta" | "fechada" | "futura" {
  if (!inicio || !fim) return "fechada";
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const d0 = parse(inicio, "yyyy-MM-dd", new Date());
  const d1 = parse(fim, "yyyy-MM-dd", new Date());
  d1.setHours(23, 59, 59);
  if (isBefore(hoje, d0)) return "futura";
  if (isAfter(hoje, d1)) return "fechada";
  return "aberta";
}

export default function AdminConfiguracoes() {
  const { toast } = useToast();
  const [whats, setWhats] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [id, setId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [agendaManual, setAgendaManual] = useState(false);

  const { data: cfg, refetch } = useQuery({
    queryKey: ["admin-cfg-app"],
    queryFn: async () => {
      const { data } = await supabase.from("configuracoes_app").select("*").limit(1).maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (cfg) {
      setId(cfg.id);
      setWhats(cfg.whatsapp_admin || "");
      setInicio(cfg.agenda_abertura_inicio || "");
      setFim(cfg.agenda_abertura_fim || "");
      setAgendaManual(!!cfg.agenda_aberta_manual);
    }
  }, [cfg]);

  const queryClient = useQueryClient();

  const handleSave = async () => {
    if (inicio && fim && fim < inicio) {
      toast({ title: "Data inválida", description: "A data de fechamento deve ser igual ou posterior à de abertura.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const payload = {
        whatsapp_admin: whats.replace(/\D/g, ""),
        agenda_abertura_inicio: inicio || null,
        agenda_abertura_fim: fim || null,
        agenda_aberta_manual: agendaManual,
      };
      if (id) {
        const { error } = await supabase.from("configuracoes_app").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("configuracoes_app").insert(payload);
        if (error) throw error;
      }
      toast({ title: "Configurações salvas!" });
      refetch();
      queryClient.invalidateQueries({ queryKey: ["agenda-periodo"] });
      queryClient.invalidateQueries({ queryKey: ["admin-cfg-app"] });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleClosePeriodo = async () => {
    const payload = {
      whatsapp_admin: whats.replace(/\D/g, ""),
      agenda_abertura_inicio: null,
      agenda_abertura_fim: null,
      agenda_aberta_manual: false,
    };
    setLoading(true);
    try {
      if (id) {
        const { error } = await supabase.from("configuracoes_app").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("configuracoes_app").insert(payload);
        if (error) throw error;
      }
      setInicio("");
      setFim("");
      setAgendaManual(false);
      toast({ title: "Período fechado", description: "A agenda foi fechada com sucesso." });
      refetch();
      queryClient.invalidateQueries({ queryKey: ["agenda-periodo"] });
      queryClient.invalidateQueries({ queryKey: ["admin-cfg-app"] });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const status = agendaManual ? "aberta" : agendaStatus(inicio, fim);

  return (
    <div className="container max-w-5xl py-8 space-y-6 animate-fade-in">
      <div className="text-center space-y-1">
        <Settings className="h-8 w-8 text-primary mx-auto" />
        <h2 className="text-3xl font-heading tracking-wider">CONFIGURAÇÕES</h2>
        <p className="font-body text-sm text-muted-foreground">Agenda e WhatsApp</p>
      </div>

      {/* Status atual */}
      <div className={`rounded-xl p-4 border flex items-center gap-3 ${
        status === "aberta"
          ? "bg-green-50 border-green-300 text-green-800"
          : status === "futura"
          ? "bg-yellow-50 border-yellow-300 text-yellow-800"
          : "bg-muted border-border text-muted-foreground"
      }`}>
        {status === "aberta" ? <Unlock className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
        <div>
          <p className="font-heading text-sm tracking-wider">
            {status === "aberta" && "AGENDA ABERTA"}
            {status === "futura" && "AGENDA ABRE EM BREVE"}
            {status === "fechada" && "AGENDA FECHADA"}
          </p>
          {inicio && fim && (
            <p className="font-body text-xs mt-0.5">
              {fmtDate(inicio)} até {fmtDate(fim)}
            </p>
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-xs">Agenda (abrir/fechar manualmente)</Label>
            <p className="text-xs text-muted-foreground">When ON the agenda stays open regardless of the period</p>
          </div>
          <Switch checked={agendaManual} onCheckedChange={(v) => setAgendaManual(!!v)} />
        </div>
        {/* Período da agenda */}
        <div className="space-y-3">
          <Label className="flex items-center gap-2 font-semibold">
            <CalendarIcon className="h-4 w-4 text-primary" />
            Período de agendamento
          </Label>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Abre em</Label>
              <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Fecha em</Label>
              <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} min={inicio} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground font-body">
            Deixe em branco para manter a agenda fechada.
          </p>
        </div>

        {/* WhatsApp */}
        <div className="space-y-2">
          <Label>WhatsApp do admin (com DDI, ex: 5521995323454)</Label>
          <Input value={whats} onChange={(e) => setWhats(e.target.value)} maxLength={15} />
        </div>

        <div className="flex flex-col gap-3 md:flex-row">
          <Button onClick={handleSave} disabled={loading} className="flex-1 py-5 font-heading tracking-widest" size="lg">
            <Save className="mr-2 h-4 w-4" /> {loading ? "SALVANDO..." : "SALVAR"}
          </Button>
          <Button variant="outline" onClick={handleClosePeriodo} className="flex-1 py-5 font-heading tracking-widest" size="lg">
            Fechar período de agendamento
          </Button>
        </div>
      </div>
    </div>
  );
}
