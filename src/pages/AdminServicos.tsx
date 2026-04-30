import { useState } from "react";
import { Pencil, Save, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface Servico {
  id: string;
  nome: string;
  preco: number;
  duracao_minutos: number;
  ativo: boolean;
}

export default function AdminServicos() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<Servico>>({});
  const [showNew, setShowNew] = useState(false);
  const [newValues, setNewValues] = useState({ nome: "", preco: 0, duracao_minutos: 60 });

  const { data: servicos = [] } = useQuery({
    queryKey: ["admin-servicos"],
    queryFn: async () => {
      const { data } = await supabase.from("servicos").select("*").order("nome");
      return (data || []) as Servico[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...values }: { id: string; preco?: number; duracao_minutos?: number; ativo?: boolean }) => {
      const { error } = await supabase.from("servicos").update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-servicos"] });
      queryClient.invalidateQueries({ queryKey: ["servicos"] });
      toast({ title: "Serviço atualizado!" });
      setEditingId(null);
      setEditValues({});
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!newValues.nome.trim()) throw new Error("Nome é obrigatório");
      const { error } = await supabase.from("servicos").insert({
        nome: newValues.nome.trim(),
        preco: newValues.preco,
        duracao_minutos: newValues.duracao_minutos,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-servicos"] });
      queryClient.invalidateQueries({ queryKey: ["servicos"] });
      toast({ title: "Serviço criado!" });
      setShowNew(false);
      setNewValues({ nome: "", preco: 0, duracao_minutos: 60 });
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const startEdit = (s: Servico) => {
    setEditingId(s.id);
    setEditValues({ preco: s.preco, duracao_minutos: s.duracao_minutos });
  };

  const saveEdit = (id: string) => {
    updateMutation.mutate({ id, ...editValues });
  };

  const toggleAtivo = (s: Servico) => {
    updateMutation.mutate({ id: s.id, ativo: !s.ativo });
  };

  return (
    <div className="container max-w-lg py-8 space-y-6 animate-fade-in">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-heading tracking-wider">SERVIÇOS</h2>
        <p className="text-muted-foreground font-body text-sm">Gerencie preços e duração dos serviços</p>
      </div>

      <Button onClick={() => setShowNew(!showNew)} variant={showNew ? "secondary" : "default"} className="w-full font-heading tracking-widest">
        <Plus className="h-4 w-4 mr-2" />
        {showNew ? "CANCELAR" : "NOVO SERVIÇO"}
      </Button>

      {showNew && (
        <div className="bg-card rounded-xl p-4 border border-primary/50 space-y-3 animate-fade-in">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground font-body">Nome do serviço</label>
            <Input value={newValues.nome} onChange={(e) => setNewValues({ ...newValues, nome: e.target.value })} placeholder="Ex: Barba" />
          </div>
          <div className="flex gap-3">
            <div className="flex-1 space-y-1">
              <label className="text-xs text-muted-foreground font-body">Preço (R$)</label>
              <Input type="number" step="0.01" value={newValues.preco || ""} onChange={(e) => setNewValues({ ...newValues, preco: Number(e.target.value) })} />
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-xs text-muted-foreground font-body">Duração (min)</label>
              <Input type="number" value={newValues.duracao_minutos || ""} onChange={(e) => setNewValues({ ...newValues, duracao_minutos: Number(e.target.value) })} />
            </div>
          </div>
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="w-full font-heading tracking-widest">
            <Save className="h-4 w-4 mr-2" />
            {createMutation.isPending ? "SALVANDO..." : "SALVAR SERVIÇO"}
          </Button>
        </div>
      )}

      <div className="space-y-3">
        {servicos.map((s) => {
          const isEditing = editingId === s.id;
          return (
            <div
              key={s.id}
              className={`bg-card rounded-xl p-4 border border-border space-y-3 ${!s.ativo ? "opacity-50" : ""}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-heading text-xl tracking-wide">{s.nome.toUpperCase()}</span>
                <Switch checked={s.ativo} onCheckedChange={() => toggleAtivo(s)} />
              </div>

              {isEditing ? (
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <div className="flex-1 space-y-1">
                      <label className="text-xs text-muted-foreground font-body">Preço (R$)</label>
                      <Input
                        type="number"
                        step="0.01"
                        value={editValues.preco ?? ""}
                        onChange={(e) => setEditValues({ ...editValues, preco: Number(e.target.value) })}
                      />
                    </div>
                    <div className="flex-1 space-y-1">
                      <label className="text-xs text-muted-foreground font-body">Duração (min)</label>
                      <Input
                        type="number"
                        value={editValues.duracao_minutos ?? ""}
                        onChange={(e) => setEditValues({ ...editValues, duracao_minutos: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => saveEdit(s.id)} disabled={updateMutation.isPending} className="flex-1">
                      <Save className="h-4 w-4 mr-1" /> Salvar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="font-body text-sm text-muted-foreground">
                    <span className="text-primary font-semibold">R$ {s.preco.toFixed(2).replace(".", ",")}</span>
                    {" · "}
                    {s.duracao_minutos} min
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => startEdit(s)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
