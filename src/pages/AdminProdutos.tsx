import { useState } from "react";
import { Pencil, Save, X, Plus, Trash2, GripVertical } from "lucide-react";
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
import type { Produto } from "@/lib/produto-types";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";

export default function AdminProdutos() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<Produto>>({});
  const [showNew, setShowNew] = useState(false);
  const [newValues, setNewValues] = useState({ nome: "", descricao: "", preco: 0 });

  const { data: produtos = [] } = useQuery({
    queryKey: ["admin-produtos"],
    queryFn: async () => {
      const { data } = await supabase.from("produtos").select("*").order("ordem", { ascending: true });
      return (data || []) as Produto[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...values }: Partial<Produto> & { id: string }) => {
      const { error } = await supabase.from("produtos").update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-produtos"] });
      queryClient.invalidateQueries({ queryKey: ["produtos-publico"] });
      toast({ title: "Produto atualizado!" });
      setEditingId(null);
      setEditValues({});
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const saveOrderMutation = useMutation({
    mutationFn: async (items: { id: string; ordem: number }[]) => {
      for (const item of items) {
        const { error } = await supabase.from("produtos").update({ ordem: item.ordem }).eq("id", item.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-produtos"] });
      queryClient.invalidateQueries({ queryKey: ["produtos-publico"] });
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!newValues.nome.trim()) throw new Error("Nome é obrigatório");
      const maxOrdem = produtos.length > 0 ? Math.max(...produtos.map(p => p.ordem ?? 0)) + 1 : 0;
      const { error } = await supabase.from("produtos").insert({
        nome: newValues.nome.trim(),
        descricao: newValues.descricao.trim() || null,
        preco: newValues.preco,
        ordem: maxOrdem,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-produtos"] });
      queryClient.invalidateQueries({ queryKey: ["produtos-publico"] });
      toast({ title: "Produto criado!" });
      setShowNew(false);
      setNewValues({ nome: "", descricao: "", preco: 0 });
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("produtos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-produtos"] });
      queryClient.invalidateQueries({ queryKey: ["produtos-publico"] });
      toast({ title: "Produto excluído!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const startEdit = (p: Produto) => {
    setEditingId(p.id);
    setEditValues({ nome: p.nome, descricao: p.descricao, preco: p.preco });
  };

  const saveEdit = (id: string) => {
    updateMutation.mutate({ id, ...editValues });
  };

  const toggleAtivo = (p: Produto) => {
    updateMutation.mutate({ id: p.id, ativo: !p.ativo });
  };

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const reordered = Array.from(produtos);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    const updates = reordered.map((p, i) => ({ id: p.id, ordem: i }));
    saveOrderMutation.mutate(updates);
  };

  return (
    <div className="container max-w-5xl py-8 space-y-6 animate-fade-in">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-heading tracking-wider">PRODUTOS</h2>
        <p className="text-muted-foreground font-body text-sm">Gerencie os produtos da barbearia. Arraste para reordenar.</p>
      </div>

      <Button onClick={() => setShowNew(!showNew)} variant={showNew ? "secondary" : "default"} className="w-full font-heading tracking-widest">
        <Plus className="h-4 w-4 mr-2" />
        {showNew ? "CANCELAR" : "NOVO PRODUTO"}
      </Button>

      {showNew && (
        <div className="bg-card rounded-xl p-4 border border-primary/50 space-y-3 animate-fade-in">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground font-body">Nome do produto *</label>
            <Input value={newValues.nome} onChange={(e) => setNewValues({ ...newValues, nome: e.target.value })} placeholder="Ex: Pomada Modeladora" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground font-body">Descrição</label>
            <Input value={newValues.descricao} onChange={(e) => setNewValues({ ...newValues, descricao: e.target.value })} placeholder="Breve descrição do produto" />
          </div>
          <div className="flex gap-3">
            <div className="flex-1 space-y-1">
              <label className="text-xs text-muted-foreground font-body">Preço (R$)</label>
              <Input type="number" step="0.01" value={newValues.preco || ""} onChange={(e) => setNewValues({ ...newValues, preco: Number(e.target.value) })} />
            </div>
          </div>
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="w-full font-heading tracking-widest">
            <Save className="h-4 w-4 mr-2" />
            {createMutation.isPending ? "SALVANDO..." : "SALVAR PRODUTO"}
          </Button>
        </div>
      )}

      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="produtos">
          {(provided) => (
            <div className="space-y-3" ref={provided.innerRef} {...provided.droppableProps}>
              {produtos.map((p, index) => {
                const isEditing = editingId === p.id;
                return (
                  <Draggable key={p.id} draggableId={p.id} index={index}>
                    {(drag) => (
                      <div
                        ref={drag.innerRef}
                        {...drag.draggableProps}
                        className={`bg-card rounded-xl p-4 border border-border space-y-3 ${!p.ativo ? "opacity-50" : ""}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span {...drag.dragHandleProps} className="cursor-grab text-muted-foreground hover:text-foreground">
                              <GripVertical className="h-5 w-5" />
                            </span>
                            <span className="font-heading text-xl tracking-wide">{p.nome.toUpperCase()}</span>
                          </div>
                          <Switch checked={p.ativo} onCheckedChange={() => toggleAtivo(p)} />
                        </div>

                        {isEditing ? (
                          <div className="space-y-3">
                            <div className="space-y-1">
                              <label className="text-xs text-muted-foreground font-body">Nome</label>
                              <Input
                                value={editValues.nome ?? ""}
                                onChange={(e) => setEditValues({ ...editValues, nome: e.target.value })}
                                placeholder="Nome do produto"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs text-muted-foreground font-body">Descrição</label>
                              <Input
                                value={editValues.descricao ?? ""}
                                onChange={(e) => setEditValues({ ...editValues, descricao: e.target.value })}
                                placeholder="Descrição"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs text-muted-foreground font-body">Preço (R$)</label>
                              <Input
                                type="number"
                                step="0.01"
                                value={editValues.preco ?? ""}
                                onChange={(e) => setEditValues({ ...editValues, preco: Number(e.target.value) })}
                              />
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => saveEdit(p.id)} disabled={updateMutation.isPending} className="flex-1">
                                <Save className="h-4 w-4 mr-1" /> Salvar
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <div className="font-body text-sm text-muted-foreground space-y-0.5">
                              {p.descricao && <p>{p.descricao}</p>}
                              {p.preco > 0 && (
                                <span className="text-primary font-semibold">
                                  R$ {Number(p.preco).toFixed(2).replace(".", ",")}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <Button size="sm" variant="ghost" onClick={() => startEdit(p)}>
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
                                    <AlertDialogTitle>Excluir produto</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Tem certeza que deseja excluir o produto <strong>{p.nome}</strong>? Esta ação não pode ser desfeita.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => deleteMutation.mutate(p.id)}
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
                    )}
                  </Draggable>
                );
              })}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  );
}
