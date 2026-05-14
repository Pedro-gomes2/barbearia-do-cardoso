import { useState } from "react";
import { Pencil, Save, X, Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface Servico {
  id: string;
  nome: string;
  preco: number;
  duracao_minutos: number;
  ativo: boolean;
  ordem: number;
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
      const { data } = await supabase.from("servicos").select("*").order("ordem", { ascending: true });
      return (data || []) as Servico[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...values }: { id: string; nome?: string; preco?: number; duracao_minutos?: number; ativo?: boolean }) => {
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

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("servicos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-servicos"] });
      queryClient.invalidateQueries({ queryKey: ["servicos"] });
      toast({ title: "Serviço excluído!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });


  const reorderMutation = useMutation({
    mutationFn: async ({ id1, ordem1, id2, ordem2 }: { id1: string; ordem1: number; id2: string; ordem2: number }) => {
      const { error: err1 } = await supabase.from("servicos").update({ ordem: ordem1 }).eq("id", id1);
      if (err1) throw err1;
      const { error: err2 } = await supabase.from("servicos").update({ ordem: ordem2 }).eq("id", id2);
      if (err2) throw err2;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-servicos"] });
      queryClient.invalidateQueries({ queryKey: ["servicos"] });
    },
  });

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    const s1 = servicos[idx];
    const s2 = servicos[idx - 1];
    reorderMutation.mutate({ id1: s1.id, ordem1: s2.ordem, id2: s2.id, ordem2: s1.ordem });
  };

  const moveDown = (idx: number) => {
    if (idx === servicos.length - 1) return;
    const s1 = servicos[idx];
    const s2 = servicos[idx + 1];
    reorderMutation.mutate({ id1: s1.id, ordem1: s2.ordem, id2: s2.id, ordem2: s1.ordem });
  };

  const startEdit = (s: Servico) => {
    setEditingId(s.id);
    setEditValues({ nome: s.nome, preco: s.preco, duracao_minutos: s.duracao_minutos });
  };

  const saveEdit = (id: string) => {
    updateMutation.mutate({ id, ...editValues });
  };

  const toggleAtivo = (s: Servico) => {
    updateMutation.mutate({ id: s.id, ativo: !s.ativo });
  };

  return (
    <div className="container max-w-5xl py-8 space-y-6 animate-fade-in">
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
        {servicos.map((s, idx) => {
          const isEditing = editingId === s.id;
          return (
            <div
              key={s.id}
              className={`bg-card rounded-xl p-4 border border-border space-y-3 ${!s.ativo ? "opacity-50" : ""}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex flex-col gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => moveUp(idx)}
                      disabled={idx === 0}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => moveDown(idx)}
                      disabled={idx === servicos.length - 1}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </div>
                  <span className="font-heading text-xl tracking-wide">{s.nome.toUpperCase()}</span>
                </div>
                <Switch checked={s.ativo} onCheckedChange={() => toggleAtivo(s)} />
              </div>

              {isEditing ? (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground font-body">Nome</label>
                    <Input
                      value={editValues.nome ?? ""}
                      onChange={(e) => setEditValues({ ...editValues, nome: e.target.value })}
                      placeholder="Nome do serviço"
                    />
                  </div>
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
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => startEdit(s)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir serviço</AlertDialogTitle>
                          <AlertDialogDescription>
                            Tem certeza que deseja excluir o serviço <strong>{s.nome}</strong>? Esta ação não pode ser desfeita.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteMutation.mutate(s.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
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
