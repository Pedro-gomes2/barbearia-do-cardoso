import { useState } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { GripVertical, Pencil, Save, X, Plus, Trash2 } from "lucide-react";
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
  tipo: 'corte_barba' | 'extra'; 
}

export default function AdminServicos() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<Servico>>({});
  const [showNew, setShowNew] = useState(false);
  const [newValues, setNewValues] = useState<{
    nome: string;
    preco: number;
    duracao_minutos: number;
    tipo: 'corte_barba' | 'extra';
  }>({ nome: "", preco: 0, duracao_minutos: 45, tipo: "corte_barba" });

  // Busca os serviços
  const { data: servicos = [] } = useQuery({
    queryKey: ["admin-servicos"],
    queryFn: async () => {
      const { data } = await supabase.from("servicos").select("*").order("ordem", { ascending: true });
      return (data || []) as Servico[];
    },
  });

  // Filtros apenas para as duas categorias solicitadas
  const listaCorteBarba = servicos.filter(s => s.tipo === 'corte_barba' || !s.tipo);
  const listaExtras = servicos.filter(s => s.tipo === 'extra');

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...values }: { id: string; nome?: string; preco?: number; duracao_minutos?: number; ativo?: boolean; tipo?: string }) => {
      const { error } = await supabase.from("servicos").update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-servicos"] });
      queryClient.invalidateQueries({ queryKey: ["servicos"] });
      toast({ title: "Atualizado com sucesso!" });
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
      
      const itensDoMesmoTipo = servicos.filter(s => s.tipo === newValues.tipo);
      const proximaOrdem = itensDoMesmoTipo.length > 0 ? Math.max(...itensDoMesmoTipo.map(s => s.ordem)) + 1 : 0;

      const { error } = await supabase.from("servicos").insert({
        nome: newValues.nome.trim(),
        preco: newValues.preco,
        duracao_minutos: newValues.duracao_minutos,
        tipo: newValues.tipo,
        ordem: proximaOrdem
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-servicos"] });
      queryClient.invalidateQueries({ queryKey: ["servicos"] });
      toast({ title: "Criado com sucesso!" });
      setShowNew(false);
      setNewValues({ nome: "", preco: 0, duracao_minutos: 45, tipo: "corte_barba" });
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
      toast({ title: "Excluído com sucesso!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const saveOrderMutation = useMutation({
    mutationFn: async (items: Servico[]) => {
      const updates = items.map((item, index) => 
        supabase.from("servicos").update({ ordem: index }).eq("id", item.id)
      );
      const results = await Promise.all(updates);
      const firstError = results.find(r => r.error);
      if (firstError) throw firstError.error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-servicos"] });
      queryClient.invalidateQueries({ queryKey: ["servicos"] });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao salvar ordem", description: err.message, variant: "destructive" });
    }
  });

  const onDragEnd = (result: any) => {
    if (!result.destination) return;
    
    const { source, destination } = result;
    const tipoLista = source.droppableId as 'corte_barba' | 'extra';
    
    const itensFiltrados = servicos.filter(s => s.tipo === tipoLista);
    const [reorderedItem] = itensFiltrados.splice(source.index, 1);
    itensFiltrados.splice(destination.index, 0, reorderedItem);

    const listaAtualizada = servicos.map(s => {
      if (s.tipo === tipoLista) {
        const novoIndex = itensFiltrados.findIndex(item => item.id === s.id);
        return { ...s, ordem: novoIndex };
      }
      return s;
    }).sort((a, b) => a.ordem - b.ordem);

    queryClient.setQueryData(["admin-servicos"], listaAtualizada);
    saveOrderMutation.mutate(itensFiltrados);
  };

  const startEdit = (s: Servico) => {
    setEditingId(s.id);
    setEditValues({ nome: s.nome, preco: s.preco, duracao_minutos: s.duracao_minutos, tipo: s.tipo });
  };

  const saveEdit = (id: string) => {
    updateMutation.mutate({ id, ...editValues });
  };

  const toggleAtivo = (s: Servico) => {
    updateMutation.mutate({ id: s.id, ativo: !s.ativo });
  };

  const RenderGrupamentoServicos = ({ titulo, tipoId, lista }: { titulo: string, tipoId: 'corte_barba' | 'extra', lista: Servico[] }) => (
    <div className="space-y-4 pt-4 border-t border-border/60">
      <h3 className="text-xl font-heading tracking-wider text-primary uppercase">{titulo} ({lista.length})</h3>
      
      <Droppable droppableId={tipoId}>
        {(provided) => (
          <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-3 min-h-[50px]">
            {lista.map((s, index) => {
              const isEditing = editingId === s.id;
              return (
                <Draggable key={s.id} draggableId={s.id} index={index}>
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      className={`bg-card rounded-xl p-4 border border-border space-y-3 ${!s.ativo ? "opacity-50" : ""}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div {...provided.dragHandleProps} className="cursor-grab hover:text-primary">
                            <GripVertical className="h-5 w-5" />
                          </div>
                          <span className="font-heading text-lg tracking-wide">{s.nome.toUpperCase()}</span>
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
                            <div className="flex-1 space-y-1">
                              <label className="text-xs text-muted-foreground font-body">Categoria</label>
                              <select 
                                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                                value={editValues.tipo ?? "corte_barba"}
                                onChange={(e) => setEditValues({ ...editValues, tipo: e.target.value as any })}
                              >
                                <option value="corte_barba">Corte / Barba</option>
                                <option value="extra">Serviço Extra</option>
                              </select>
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
                            <span className="text-primary font-semibold">R$ {Number(s.preco).toFixed(2).replace(".", ",")}</span>
                            {" · "}{s.duracao_minutos} min
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
                                  <AlertDialogTitle>Excluir item</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Tem certeza que deseja excluir o serviço <strong>{s.nome}</strong>?
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deleteMutation.mutate(s.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
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
    </div>
  );

  return (
    <div className="container max-w-5xl py-8 space-y-6 animate-fade-in">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-heading tracking-wider">GERENCIAMENTO DE SERVIÇOS</h2>
        <p className="text-muted-foreground font-body text-sm">Organize preços, tempos e ordens visuais do menu</p>
      </div>

      <Button onClick={() => setShowNew(!showNew)} variant={showNew ? "secondary" : "default"} className="w-full font-heading tracking-widest">
        <Plus className="h-4 w-4 mr-2" />
        {showNew ? "CANCELAR" : "NOVO SERVIÇO"}
      </Button>

      {showNew && (
        <div className="bg-card rounded-xl p-4 border border-primary/50 space-y-3 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-body">Nome do serviço</label>
              <Input value={newValues.nome} onChange={(e) => setNewValues({ ...newValues, nome: e.target.value })} placeholder="Ex: Corte Degradê" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-body">Categoria do Serviço</label>
              <select 
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={newValues.tipo}
                onChange={(e) => setNewValues({ ...newValues, tipo: e.target.value as any })}
              >
                <option value="corte_barba">Serviço Corte / Barba</option>
                <option value="extra">Serviço Extra</option>
              </select>
            </div>
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

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="space-y-12">
          <RenderGrupamentoServicos titulo="✂️ Serviço Corte / Barba" tipoId="corte_barba" lista={listaCorteBarba} />
          <RenderGrupamentoServicos titulo="✨ Serviços Extras" tipoId="extra" lista={listaExtras} />
        </div>
      </DragDropContext>
    </div>
  );
}