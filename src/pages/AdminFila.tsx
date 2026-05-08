import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Play, CheckCircle, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export default function AdminFila() {
  const today = format(new Date(), "yyyy-MM-dd");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: cfg } = useQuery({
    queryKey: ["admin-fila-cfg", today],
    queryFn: async () => {
      const { data } = await supabase.from("fila_config").select("*").eq("data", today).maybeSingle();
      return data;
    },
  });

  const [aberta, setAberta] = useState(false);
  const [horaAbertura, setHoraAbertura] = useState("09:00");
  const [horaFechamento, setHoraFechamento] = useState("18:00");

  useEffect(() => {
    if (cfg) {
      setAberta(cfg.aberta);
      setHoraAbertura(cfg.hora_abertura?.slice(0, 5) || "09:00");
      setHoraFechamento(cfg.hora_fechamento?.slice(0, 5) || "18:00");
    }
  }, [cfg]);

  const { data: fila = [] } = useQuery({
    queryKey: ["admin-fila", today],
    queryFn: async () => {
      const { data } = await supabase
        .from("fila_atendimento")
        .select("*, usuarios(nome, telefone), servicos(nome)")
        .eq("data", today)
        .in("status", ["aguardando", "atendendo"])
        .order("posicao");
      return data || [];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("admin-fila-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "fila_atendimento" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-fila", today] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc, today]);

  const saveCfg = useMutation({
    mutationFn: async () => {
      const payload = {
        data: today,
        aberta,
        hora_abertura: horaAbertura + ":00",
        hora_fechamento: horaFechamento + ":00",
      };
      if (cfg) {
        const { error } = await supabase.from("fila_config").update(payload).eq("id", cfg.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("fila_config").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-fila-cfg", today] });
      toast({ title: "Configuração salva" });
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("fila_atendimento")
        .update({ status: status as any, atualizado_em: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-fila", today] }),
  });

  const removeMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("fila_atendimento").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-fila", today] }),
  });

  return (
    <div className="container max-w-3xl py-8 space-y-6 animate-fade-in">
      <div className="text-center space-y-1">
        <Users className="h-8 w-8 text-primary mx-auto" />
        <h2 className="text-3xl font-heading tracking-wider">MODO FILA</h2>
        <p className="font-body text-sm text-muted-foreground">Atendimento por ordem de chegada — hoje</p>
      </div>

      <div className="bg-card rounded-xl p-4 border border-border space-y-4">
        <div className="flex items-center justify-between">
          <Label className="font-heading text-lg">Fila aberta hoje</Label>
          <Switch checked={aberta} onCheckedChange={setAberta} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Abertura</Label>
            <Input type="time" value={horaAbertura} onChange={(e) => setHoraAbertura(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Fechamento</Label>
            <Input type="time" value={horaFechamento} onChange={(e) => setHoraFechamento(e.target.value)} />
          </div>
        </div>
        <Button onClick={() => saveCfg.mutate()} disabled={saveCfg.isPending} className="w-full font-heading tracking-wider">
          SALVAR
        </Button>
      </div>

      <div className="space-y-3">
        <p className="font-heading text-sm text-muted-foreground tracking-wider">
          NA FILA — {fila.length} pessoa(s)
        </p>
        {fila.length === 0 ? (
          <p className="text-center text-muted-foreground font-body py-8">Nenhuma pessoa na fila.</p>
        ) : (
          fila.map((f: any) => (
            <div key={f.id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
              <span className="font-heading text-3xl text-primary w-10 text-center">{f.posicao}</span>
              <div className="flex-1 space-y-0.5">
                <p className="font-body">{f.usuarios?.nome}</p>
                <p className="font-body text-xs text-muted-foreground">{f.usuarios?.telefone}</p>
                {f.servicos?.nome && <p className="text-xs text-primary/80 font-body">✂️ {f.servicos.nome}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                {f.status === "aguardando" ? (
                  <Button size="sm" onClick={() => updateStatus.mutate({ id: f.id, status: "atendendo" })} className="font-heading">
                    <Play className="h-3 w-3 mr-1" /> INICIAR
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => updateStatus.mutate({ id: f.id, status: "finalizado" })} className="font-heading">
                    <CheckCircle className="h-3 w-3 mr-1" /> FINALIZAR
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => removeMut.mutate(f.id)} className="text-destructive">
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
