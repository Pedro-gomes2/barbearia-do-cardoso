import { Users, Phone, Calendar, Plus, Edit2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";

interface Cliente {
  id: string;
  nome: string;
  telefone: string;
  criado_em: string;
  total_agendamentos: number;
}

export default function AdminClientes() {
  const [openDialog, setOpenDialog] = useState(false);
  const [openDeleteAlert, setOpenDeleteAlert] = useState(false);
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [formData, setFormData] = useState({ nome: "", telefone: "" });
  const queryClient = useQueryClient();

  const { data: clientes = [], isLoading } = useQuery({
    queryKey: ["admin-clientes"],
    queryFn: async () => {
      const { data: usuarios } = await supabase
        .from("usuarios")
        .select("id, nome, telefone, criado_em")
        .eq("tipo", "cliente")
        .order("criado_em", { ascending: false });

      if (!usuarios || usuarios.length === 0) return [];

      const clientesComTotal = await Promise.all(
        usuarios.map(async (u) => {
          const { count } = await supabase
            .from("agendamentos")
            .select("id", { count: "exact", head: true })
            .eq("cliente_id", u.id);
          return { ...u, total_agendamentos: count ?? 0 } as Cliente;
        })
      );

      // Ordena alfabeticamente por nome (case/acentos-insensível)
      clientesComTotal.sort((a, b) =>
        a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" })
      );

      return clientesComTotal;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: { nome: string; telefone: string }) => {
      const { error } = await supabase.from("usuarios").insert({
        nome: data.nome,
        telefone: data.telefone,
        tipo: "cliente",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-clientes"] });
      setOpenDialog(false);
      setFormData({ nome: "", telefone: "" });
      toast({
        title: "Cliente adicionado",
        description: "Cliente foi adicionado com sucesso",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Erro ao adicionar cliente",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; nome: string; telefone: string }) => {
      const { error } = await supabase
        .from("usuarios")
        .update({
          nome: data.nome,
          telefone: data.telefone,
        })
        .eq("id", data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-clientes"] });
      setOpenDialog(false);
      setSelectedCliente(null);
      setFormData({ nome: "", telefone: "" });
      toast({
        title: "Cliente atualizado",
        description: "Dados do cliente foram atualizados com sucesso",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Erro ao atualizar cliente",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (clienteId: string) => {
      const { error } = await supabase
        .from("usuarios")
        .delete()
        .eq("id", clienteId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-clientes"] });
      setOpenDeleteAlert(false);
      setSelectedCliente(null);
      toast({
        title: "Cliente deletado",
        description: "Cliente foi removido com sucesso",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Erro ao deletar cliente",
        variant: "destructive",
      });
    },
  });

  const handleOpenDialog = (cliente?: Cliente) => {
    if (cliente) {
      setSelectedCliente(cliente);
      setFormData({ nome: cliente.nome, telefone: cliente.telefone });
    } else {
      setSelectedCliente(null);
      setFormData({ nome: "", telefone: "" });
    }
    setOpenDialog(true);
  };

  const handleSave = () => {
    if (!formData.nome || !formData.telefone) {
      toast({
        title: "Aviso",
        description: "Preencha todos os campos",
        variant: "destructive",
      });
      return;
    }

    if (selectedCliente) {
      updateMutation.mutate({
        id: selectedCliente.id,
        nome: formData.nome,
        telefone: formData.telefone,
      });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDeleteClick = (cliente: Cliente) => {
    setSelectedCliente(cliente);
    setOpenDeleteAlert(true);
  };

  const handleConfirmDelete = () => {
    if (selectedCliente) {
      deleteMutation.mutate(selectedCliente.id);
    }
  };

  return (
    <div className="container max-w-5xl py-8 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <h2 className="text-3xl font-heading tracking-wider">CLIENTES</h2>
          <p className="text-muted-foreground font-body text-sm">Lista de clientes cadastrados</p>
        </div>
        <Button
          onClick={() => handleOpenDialog()}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Adicionar Cliente
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      )}

      {!isLoading && clientes.length === 0 && (
        <div className="text-center py-16 space-y-3">
          <Users className="h-12 w-12 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground font-body">Nenhum cliente cadastrado ainda.</p>
        </div>
      )}

      <div className="space-y-3">
        {clientes.map((c) => (
          <div key={c.id} className="bg-card rounded-xl p-4 border border-border flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2 rounded-xl">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-heading text-lg tracking-wide">{c.nome.toUpperCase()}</p>
                <div className="flex items-center gap-1 text-xs text-muted-foreground font-body">
                  <Phone className="h-3 w-3" /> {c.telefone}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right space-y-1">
                <div className="flex items-center gap-1 text-xs text-muted-foreground font-body justify-end">
                  <Calendar className="h-3 w-3" />
                  {c.total_agendamentos} agendamento{c.total_agendamentos !== 1 ? "s" : ""}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Desde {new Date(c.criado_em).toLocaleDateString("pt-BR")}
                </p>
              </div>
              <div className="flex gap-2 ml-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleOpenDialog(c)}
                  className="h-8 w-8 p-0"
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteClick(c)}
                  className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Dialog de Adicionar/Editar */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {selectedCliente ? "Editar Cliente" : "Adicionar Cliente"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome</Label>
              <Input
                id="nome"
                placeholder="Nome do cliente"
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="telefone">Telefone</Label>
              <Input
                id="telefone"
                placeholder="(11) 99999-9999"
                value={formData.telefone}
                onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {selectedCliente ? "Atualizar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Alert Dialog de Confirmação de Deleção */}
      <AlertDialog open={openDeleteAlert} onOpenChange={setOpenDeleteAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deletar Cliente</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja deletar o cliente "{selectedCliente?.nome}"?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
            >
              Deletar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
