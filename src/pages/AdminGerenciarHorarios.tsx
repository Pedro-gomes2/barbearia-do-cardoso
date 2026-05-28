import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, Plus, X, Clock, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

const DIAS_SEMANA = [
  { val: 0, label: "Domingo" },
  { val: 1, label: "Segunda" },
  { val: 2, label: "Terça" },
  { val: 3, label: "Quarta" },
  { val: 4, label: "Quinta" },
  { val: 5, label: "Sexta" },
  { val: 6, label: "Sábado" },
];

function normalizaHora(input: string): string | null {
  const m = input.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`;
}

function exibeHora(h: string): string {
  return h.slice(0, 5);
}

export default function AdminGerenciarHorarios() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") === "data" ? "data" : "semanal";
  const initialData = searchParams.get("data") || format(new Date(), "yyyy-MM-dd");

  const [tab, setTab] = useState<"semanal" | "data">(initialTab as any);
  const [diaSemana, setDiaSemana] = useState<number>(1);
  const [data, setData] = useState(initialData);
  const [novoHorario, setNovoHorario] = useState("");

  const queryClient = useQueryClient();

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", tab);
    if (tab === "data") next.set("data", data);
    else next.delete("data");
    setSearchParams(next, { replace: true });
  }, [tab, data]);

  // Template semanal
  const { data: horariosTemplate = [] } = useQuery({
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

  const addTemplate = useMutation({
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

  const removeTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("horarios_customizados").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["horarios-template", diaSemana] }),
  });

  // Override por data
  const { data: horariosData = [] } = useQuery({
    queryKey: ["horarios-data", data],
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("horarios_data")
        .select("id, horario")
        .eq("data", data)
        .eq("ativo", true)
        .order("horario");
      return rows || [];
    },
  });

  const addData = useMutation({
    mutationFn: async (horario: string) => {
      const { error } = await supabase
        .from("horarios_data")
        .insert({ data, horario, ativo: true });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["horarios-data", data] });
      setNovoHorario("");
    },
    onError: (e: any) => {
      const msg = e?.code === "23505" ? "Esse horário já existe" : (e?.message || "Erro ao adicionar");
      toast({ title: "Erro", description: msg, variant: "destructive" });
    },
  });

  const removeData = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("horarios_data").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["horarios-data", data] }),
  });

  const clearData = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("horarios_data").delete().eq("data", data);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["horarios-data", data] });
      toast({ title: "Override removido", description: "Voltou a usar o template da semana" });
    },
  });

  const handleAdd = () => {
    const norm = normalizaHora(novoHorario);
    if (!norm) {
      toast({ title: "Formato inválido", description: "Use HH:MM (ex: 08:40)", variant: "destructive" });
      return;
    }
    if (tab === "semanal") addTemplate.mutate(norm);
    else addData.mutate(norm);
  };

  const dataDisplay = format(parse(data, "yyyy-MM-dd", new Date()), "EEEE, dd 'de' MMMM", { locale: ptBR });
  const lista = tab === "semanal" ? horariosTemplate : horariosData;
  const onRemove = (id: string) => (tab === "semanal" ? removeTemplate.mutate(id) : removeData.mutate(id));

  return (
    <div className="container max-w-3xl py-8 space-y-6 animate-fade-in">
      <div className="text-center space-y-1">
        <Clock className="h-8 w-8 text-primary mx-auto" />
        <h2 className="text-3xl font-heading tracking-wider">GERENCIAR HORÁRIOS</h2>
        <p className="font-body text-sm text-muted-foreground">
          Defina manualmente os horários disponíveis na agenda
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="semanal">Template semanal</TabsTrigger>
          <TabsTrigger value="data">Ajuste por data</TabsTrigger>
        </TabsList>

        <TabsContent value="semanal" className="space-y-4 pt-4">
          <div className="space-y-1">
            <Label>Dia da semana</Label>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
              {DIAS_SEMANA.map((d) => (
                <Button
                  key={d.val}
                  type="button"
                  size="sm"
                  variant={diaSemana === d.val ? "default" : "outline"}
                  onClick={() => setDiaSemana(d.val)}
                >
                  {d.label.slice(0, 3)}
                </Button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Esses horários se repetem toda {DIAS_SEMANA[diaSemana].label.toLowerCase()}.
          </p>
        </TabsContent>

        <TabsContent value="data" className="space-y-4 pt-4">
          <div className="space-y-1">
            <Label className="flex items-center gap-2 text-xs text-muted-foreground">
              <CalendarDays className="h-4 w-4" /> Data
            </Label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            <p className="text-xs text-muted-foreground font-body capitalize">{dataDisplay}</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Se você cadastrar horários aqui, eles substituem o template da semana só para este dia.
          </p>
          {horariosData.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => clearData.mutate()}
              disabled={clearData.isLoading}
              className="text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-1" /> Limpar override (volta ao template)
            </Button>
          )}
        </TabsContent>
      </Tabs>

      {/* Input de novo horário */}
      <div className="space-y-2 pt-2 border-t">
        <Label>Adicionar horário</Label>
        <div className="flex gap-2">
          <Input
            type="time"
            value={novoHorario}
            onChange={(e) => setNovoHorario(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
            className="max-w-[140px]"
          />
          <Button
            onClick={handleAdd}
            disabled={!novoHorario || addTemplate.isLoading || addData.isLoading}
          >
            <Plus className="h-4 w-4 mr-1" /> Adicionar
          </Button>
        </div>
      </div>

      {/* Chips da lista */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">
          Horários cadastrados ({lista.length})
        </Label>
        {lista.length === 0 ? (
          <div className="bg-muted border border-border rounded-xl p-6 text-center">
            <p className="font-body text-sm text-muted-foreground">
              Nenhum horário cadastrado{tab === "data" ? " para esta data" : ""}.
            </p>
            {tab === "data" && (
              <p className="font-body text-xs text-muted-foreground mt-1">
                Sem override, a agenda usa o template da semana.
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {lista.map((h: any) => (
              <div
                key={h.id}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20"
              >
                <span className="font-heading text-sm">{exibeHora(h.horario)}</span>
                <button
                  type="button"
                  onClick={() => onRemove(h.id)}
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
