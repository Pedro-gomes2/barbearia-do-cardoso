import { useState } from "react";
import { Plus, Trash2, Wallet, Calendar as CalendarIcon, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function AdminDespesas() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [newDespesa, setNewDespesa] = useState({
    descricao: "",
    valor: 0,
    data: format(new Date(), "yyyy-MM-dd"),
    categoria: "Outros",
  });

  const { data: despesas = [], isLoading } = useQuery({
    queryKey: ["admin-despesas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("despesas")
        .select("*")
        .order("data", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!newDespesa.descricao.trim()) throw new Error("Informe a descrição");
      if (newDespesa.valor <= 0) throw new Error("Informe um valor válido");
      const { error } = await supabase.from("despesas").insert(newDespesa);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-despesas"] });
      queryClient.invalidateQueries({ queryKey: ["financeiro"] });
      toast({ title: "Despesa registrada!" });
      setShowNew(false);
      setNewDespesa({
        descricao: "",
        valor: 0,
        data: format(new Date(), "yyyy-MM-dd"),
        categoria: "Outros",
      });
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("despesas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-despesas"] });
      queryClient.invalidateQueries({ queryKey: ["financeiro"] });
      toast({ title: "Despesa excluída!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const totalDespesas = despesas.reduce((acc, curr) => acc + Number(curr.valor), 0);

  return (
    <div className="container max-w-5xl py-8 space-y-6 animate-fade-in">
      <div className="text-center space-y-2">
        <Wallet className="h-10 w-10 text-primary mx-auto" />
        <h2 className="text-3xl font-heading tracking-wider">CONTROLE DE DESPESAS</h2>
        <p className="text-muted-foreground font-body text-sm">Registre seus custos e gastos fixos/variáveis</p>
      </div>

      <div className="bg-primary/10 border border-primary/20 rounded-2xl p-6 text-center">
        <p className="text-sm text-muted-foreground font-body uppercase tracking-widest font-semibold mb-1">Total em Despesas</p>
        <p className="text-4xl font-heading text-primary">R$ {totalDespesas.toFixed(2).replace(".", ",")}</p>
      </div>

      <Button onClick={() => setShowNew(!showNew)} variant={showNew ? "secondary" : "default"} className="w-full font-heading tracking-widest">
        <Plus className="h-4 w-4 mr-2" />
        {showNew ? "CANCELAR" : "NOVA DESPESA"}
      </Button>

      {showNew && (
        <div className="bg-card rounded-xl p-6 border border-primary/50 space-y-4 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Descrição</Label>
              <Input 
                value={newDespesa.descricao} 
                onChange={(e) => setNewDespesa({ ...newDespesa, descricao: e.target.value })} 
                placeholder="Ex: Aluguel, Conta de Luz..." 
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Valor (R$)</Label>
              <Input 
                type="number" 
                step="0.01" 
                value={newDespesa.valor || ""} 
                onChange={(e) => setNewDespesa({ ...newDespesa, valor: Number(e.target.value) })} 
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Data</Label>
              <Input 
                type="date" 
                value={newDespesa.data} 
                onChange={(e) => setNewDespesa({ ...newDespesa, data: e.target.value })} 
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Categoria</Label>
              <Select 
                value={newDespesa.categoria} 
                onValueChange={(v) => setNewDespesa({ ...newDespesa, categoria: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Aluguel">Aluguel</SelectItem>
                  <SelectItem value="Luz">Luz</SelectItem>
                  <SelectItem value="Água">Água</SelectItem>
                  <SelectItem value="Produtos">Produtos</SelectItem>
                  <SelectItem value="Marketing">Marketing</SelectItem>
                  <SelectItem value="Outros">Outros</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="w-full font-heading tracking-widest">
            {createMutation.isPending ? "SALVANDO..." : "SALVAR DESPESA"}
          </Button>
        </div>
      )}

      <div className="space-y-4">
        <h3 className="font-heading text-sm tracking-widest text-muted-foreground border-b border-border pb-2">LISTA DE GASTOS</h3>
        {isLoading ? (
          <p className="text-center py-10 text-muted-foreground animate-pulse">Carregando despesas...</p>
        ) : despesas.length === 0 ? (
          <p className="text-center py-10 text-muted-foreground font-body">Nenhuma despesa registrada.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {despesas.map((d) => (
              <div key={d.id} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between group">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-heading text-lg">{d.descricao}</p>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-bold uppercase tracking-widest">
                      {d.categoria}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <CalendarIcon className="h-3 w-3" />
                      {format(parseISO(d.data), "dd/MM/yyyy")}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <p className="font-heading text-xl text-destructive">- R$ {Number(d.valor).toFixed(2).replace(".", ",")}</p>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => deleteMutation.mutate(d.id)}
                    className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
