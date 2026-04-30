import { useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Scissors, ArrowLeft, Ban, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function AdminBloqueios() {
  const [date, setDate] = useState<Date>();
  const [horario, setHorario] = useState("08:00");
  const [motivo, setMotivo] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: bloqueios = [] } = useQuery({
    queryKey: ["bloqueios"],
    queryFn: async () => {
      const { data } = await supabase
        .from("bloqueios")
        .select("*")
        .gte("data", format(new Date(), "yyyy-MM-dd"))
        .order("data")
        .order("horario");
      return data || [];
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!date) throw new Error("Selecione uma data");
      const { error } = await supabase.from("bloqueios").insert({
        data: format(date, "yyyy-MM-dd"),
        horario: horario + ":00",
        motivo: motivo || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bloqueios"] });
      toast({ title: "Horário bloqueado!" });
      setMotivo("");
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bloqueios").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bloqueios"] });
      toast({ title: "Bloqueio removido" });
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container flex items-center gap-4 py-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/admin/dashboard"><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <Scissors className="h-6 w-6 text-primary" />
          <h1 className="text-2xl tracking-wider">BLOQUEIOS</h1>
        </div>
      </header>

      <main className="container max-w-lg py-8 space-y-8 animate-fade-in">
        <div className="bg-card rounded-xl p-4 border border-border space-y-4">
          <Calendar
            mode="single"
            selected={date}
            onSelect={setDate}
            locale={ptBR}
            disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
            className="pointer-events-auto mx-auto"
          />
          <div className="space-y-2">
            <Label>Horário</Label>
            <Input type="time" value={horario} onChange={(e) => setHorario(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Motivo (opcional)</Label>
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex: Folga pessoal" maxLength={255} />
          </div>
          <Button onClick={() => addMutation.mutate()} disabled={!date || addMutation.isPending} className="w-full font-heading tracking-widest">
            <Ban className="mr-2 h-4 w-4" />
            BLOQUEAR HORÁRIO
          </Button>
        </div>

        {/* List */}
        <div className="space-y-3">
          <h2 className="text-2xl">BLOQUEIOS ATIVOS</h2>
          {bloqueios.length === 0 ? (
            <p className="text-muted-foreground text-center py-4 font-body">Nenhum bloqueio.</p>
          ) : (
            bloqueios.map((b: any) => (
              <div key={b.id} className="bg-card rounded-xl p-4 border border-border flex items-center justify-between">
                <div>
                  <p className="font-heading text-lg text-primary">
                    {format(new Date(b.data + "T12:00:00"), "dd/MM/yyyy")} — {b.horario?.slice(0, 5)}
                  </p>
                  {b.motivo && <p className="text-sm text-muted-foreground font-body">{b.motivo}</p>}
                </div>
                <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(b.id)} className="text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
