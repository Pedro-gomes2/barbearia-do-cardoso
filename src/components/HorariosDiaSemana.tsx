import { useState } from "react";
import { Plus, X, Wand2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { normalizeTimeInput, minutesToTime, timeToMinutes, formatTimeDisplay } from "@/lib/time-utils";

export function HorariosDiaSemana({ diaSemana }: { diaSemana: number }) {
  const [novoHorario, setNovoHorario] = useState("");
  const [openGerar, setOpenGerar] = useState(false);
  const [gerarInicio, setGerarInicio] = useState("08:00");
  const [gerarFim, setGerarFim] = useState("18:00");
  const [gerarIntervalo, setGerarIntervalo] = useState(30);
  const queryClient = useQueryClient();

  const { data: horarios = [] } = useQuery({
    queryKey: ["horarios-template", diaSemana],
    queryFn: async () => {
      const { data } = await supabase
        .from("horarios_customizados")
        .select("id, horario")
        .eq("dia_semana", diaSemana)
        .eq("ativo", true)
        .order("horario");
      return data || [];
    },
  });

  const addMut = useMutation({
    mutationFn: async (horario: string) => {
      const { error } = await supabase
        .from("horarios_customizados")
        .insert({ dia_semana: diaSemana, horario, ativo: true });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["horarios-template", diaSemana] });
      setNovoHorario("");
    },
    onError: (e: any) => {
      const msg = e?.code === "23505" ? "Esse horário já existe" : (e?.message || "Erro ao adicionar");
      toast({ title: "Erro", description: msg, variant: "destructive" });
    },
  });

  const gerarMut = useMutation({
    mutationFn: async () => {
      const ini = normalizeTimeInput(gerarInicio);
      const fim = normalizeTimeInput(gerarFim);
      if (!ini || !fim) throw new Error("Horários inválidos");
      const startMin = timeToMinutes(ini);
      const endMin = timeToMinutes(fim);
      if (gerarIntervalo < 5 || gerarIntervalo > 240) throw new Error("Intervalo entre 5 e 240");
      if (endMin <= startMin) throw new Error("Fim precisa ser depois do início");

      const lista: string[] = [];
      for (let m = startMin; m <= endMin; m += gerarIntervalo) {
        lista.push(minutesToTime(m));
      }

      const rows = lista.map((horario) => ({ dia_semana: diaSemana, horario, ativo: true }));
      const { error } = await supabase
        .from("horarios_customizados")
        .upsert(rows, { onConflict: "dia_semana,horario", ignoreDuplicates: true });
      if (error) throw error;
      return lista.length;
    },
    onSuccess: (n) => {
      queryClient.invalidateQueries({ queryKey: ["horarios-template", diaSemana] });
      setOpenGerar(false);
      toast({ title: "Grade gerada", description: `${n} horários processados (duplicados ignorados)` });
    },
    onError: (e: any) => {
      toast({ title: "Erro", description: e?.message || "Erro ao gerar", variant: "destructive" });
    },
  });

  const removeMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("horarios_customizados").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["horarios-template", diaSemana] }),
  });

  const handleAdd = () => {
    const norm = normalizeTimeInput(novoHorario);
    if (!norm) {
      toast({ title: "Formato inválido", description: "Use HH:MM (ex: 08:40)", variant: "destructive" });
      return;
    }
    addMut.mutate(norm);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground font-semibold uppercase tracking-widest">
          Adicionar horário
        </Label>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            type="time"
            value={novoHorario}
            onChange={(e) => setNovoHorario(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
            className="font-heading w-full sm:w-auto sm:max-w-[140px]"
          />
          <Button onClick={handleAdd} disabled={!novoHorario || addMut.isPending} size="sm" className="whitespace-nowrap">
            <Plus className="h-4 w-4 mr-1" /> Adicionar
          </Button>
          <Button variant="outline" size="sm" onClick={() => setOpenGerar(true)} className="whitespace-nowrap">
            <Wand2 className="h-4 w-4 mr-1" /> Gerar grade
          </Button>
        </div>
      </div>

      <Dialog open={openGerar} onOpenChange={setOpenGerar}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Gerar grade de horários</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Cria horários automaticamente entre início e fim, com intervalo fixo. Duplicados são ignorados.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Início</Label>
                <Input type="time" value={gerarInicio} onChange={(e) => setGerarInicio(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Fim</Label>
                <Input type="time" value={gerarFim} onChange={(e) => setGerarFim(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Intervalo (minutos)</Label>
              <Input
                type="number"
                min={5}
                max={240}
                value={gerarIntervalo}
                onChange={(e) => setGerarIntervalo(Number(e.target.value))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenGerar(false)}>Cancelar</Button>
            <Button onClick={() => gerarMut.mutate()} disabled={gerarMut.isPending}>
              Gerar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">
          Horários cadastrados ({horarios.length})
        </Label>
        {horarios.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            Nenhum horário cadastrado. Adicione acima.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {horarios.map((h: any) => (
              <div
                key={h.id}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20"
              >
                <span className="font-heading text-sm">{formatTimeDisplay(h.horario)}</span>
                <button
                  type="button"
                  onClick={() => removeMut.mutate(h.id)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Remover"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
