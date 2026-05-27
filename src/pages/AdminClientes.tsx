import { Users, Phone, Calendar, Plus, Edit2, Trash2, Scissors, Info, Clock, DollarSign } from "lucide-react";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { getFavoritosCliente, saveFavoritosCliente } from "@/lib/admin-horarios-helpers";
import { normalizarTelefone } from "@/lib/telefone";
import { format, parseISO } from "date-fns";

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
  
  const [selectedClienteForEdit, setSelectedClienteForEdit] = useState<Cliente | null>(null);
  
  // Detalhes view
  const [selectedClienteDetails, setSelectedClienteDetails] = useState<Cliente | null>(null);

  const [formData, setFormData] = useState({ nome: "", telefone: "" });
  const [selectedServicoIds, setSelectedServicoIds] = useState<string[]>([]);
  const queryClient = useQueryClient();

  const { data: servicosAtivos = [] } = useQuery({
    queryKey: ["servicos-ativos"],
    queryFn: async () => {
      const { data } = await supabase
        .from("servicos")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome", { ascending: true });
      return data || [];
    },
  });

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

      // Ordena alfabeticamente
      clientesComTotal.sort((a, b) =>
        a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" })
      );

      return clientesComTotal;
    },
  });

  // Client Details Fetcher
  const { data: clientDetails, isLoading: isLoadingDetails } = useQuery({
    queryKey: ["cliente-detalhes", selectedClienteDetails?.id],
    queryFn: async () => {
      if (!selectedClienteDetails) return null;
      
      const { data: agendamentos, error } = await supabase
        .from("agendamentos")
        .select("id, data, horario, status, agendamento_servicos(servicos(id, nome, preco))")
        .eq("cliente_id", selectedClienteDetails.id)
        .order("data", { ascending: false });

      if (error) throw error;
      
      let totalGasto = 0;
      let svcCounts: Record<string, { nome: string; count: number }> = {};
      
      const formatados = (agendamentos || []).map((ag: any) => {
        let valor = 0;
        let svcs: string[] = [];
        (ag.agendamento_servicos || []).forEach((as: any) => {
          const svc = as.servicos;
          if (svc) {
            valor += Number(svc.preco || 0);
            svcs.push(svc.nome);
            if (!svcCounts[svc.id]) svcCounts[svc.id] = { nome: svc.nome, count: 0 };
            svcCounts[svc.id].count++;
          }
        });

        if (ag.status === 'finalizado') {
          totalGasto += valor;
        }

        return {
          id: ag.id,
          data: ag.data,
          horario: ag.horario,
          status: ag.status,
          servicos: svcs.join(", "),
          valor
        };
      });

      const topServicos = Object.values(svcCounts).sort((a, b) => b.count - a.count).slice(0, 3);
      const ultimaVisita = formatados.find(a => a.status === 'finalizado' || a.status === 'ativo');

      return {
        agendamentos: formatados,
        totalGasto,
        topServicos,
        ultimaVisita: ultimaVisita ? ultimaVisita.data : null
      };
    },
    enabled: !!selectedClienteDetails
  });

  const createMutation = useMutation({
    mutationFn: async (data: { nome: string; telefone: string; servicoIds: string[] }) => {
      const telNorm = normalizarTelefone(data.telefone);
      if (telNorm) {
        const { data: existente } = await supabase
          .from("usuarios")
          .select("id")
          .eq("telefone_normalizado", telNorm)
          .eq("tipo", "cliente")
          .maybeSingle();
        if (existente) {
          throw new Error("DUPLICADO");
        }
      }
      const { data: novo, error } = await supabase
        .from("usuarios")
        .insert({ nome: data.nome, telefone: data.telefone, tipo: "cliente" })
        .select("id")
        .single();
      if (error) throw error;
      await saveFavoritosCliente(novo.id, data.servicoIds);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-clientes"] });
      setOpenDialog(false);
      setFormData({ nome: "", telefone: "" });
      setSelectedServicoIds([]);
      toast({ title: "Cliente adicionado", description: "Cliente foi adicionado com sucesso" });
    },
    onError: (err: any) => {
      if (err?.message === "DUPLICADO") {
        toast({ title: "Telefone já cadastrado", description: "Já existe um cliente com este telefone.", variant: "destructive" });
      } else {
        toast({ title: "Erro", description: "Erro ao adicionar cliente", variant: "destructive" });
      }
    }
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; nome: string; telefone: string; servicoIds: string[] }) => {
      const telNorm = normalizarTelefone(data.telefone);
      if (telNorm) {
        const { data: outro } = await supabase
          .from("usuarios")
          .select("id")
          .eq("telefone_normalizado", telNorm)
          .eq("tipo", "cliente")
          .neq("id", data.id)
          .maybeSingle();
        if (outro) {
          throw new Error("DUPLICADO");
        }
      }
      const { error } = await supabase
        .from("usuarios")
        .update({ nome: data.nome, telefone: data.telefone })
        .eq("id", data.id);
      if (error) throw error;
      await saveFavoritosCliente(data.id, data.servicoIds);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-clientes"] });
      setOpenDialog(false);
      setSelectedClienteForEdit(null);
      setFormData({ nome: "", telefone: "" });
      setSelectedServicoIds([]);
      toast({ title: "Cliente atualizado", description: "Dados do cliente foram atualizados com sucesso" });
    },
    onError: (err: any) => {
      if (err?.message === "DUPLICADO") {
        toast({ title: "Telefone já cadastrado", description: "Já existe um cliente com este telefone.", variant: "destructive" });
      } else {
        toast({ title: "Erro", description: "Erro ao atualizar cliente", variant: "destructive" });
      }
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (clienteId: string) => {
      const { error } = await supabase.from("usuarios").delete().eq("id", clienteId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-clientes"] });
      setOpenDeleteAlert(false);
      setSelectedClienteForEdit(null);
      toast({ title: "Cliente deletado", description: "Cliente foi removido com sucesso" });
    },
    onError: () => toast({ title: "Erro", description: "Erro ao deletar cliente", variant: "destructive" })
  });

  const handleOpenDialog = async (cliente?: Cliente) => {
    if (cliente) {
      setSelectedClienteForEdit(cliente);
      setFormData({ nome: cliente.nome, telefone: cliente.telefone });
      try {
        const favs = await getFavoritosCliente(cliente.id);
        setSelectedServicoIds(favs);
      } catch {
        setSelectedServicoIds([]);
      }
    } else {
      setSelectedClienteForEdit(null);
      setFormData({ nome: "", telefone: "" });
      setSelectedServicoIds([]);
    }
    setOpenDialog(true);
  };

  const handleSave = () => {
    if (!formData.nome || !formData.telefone) {
      toast({ title: "Aviso", description: "Preencha todos os campos", variant: "destructive" });
      return;
    }

    if (selectedClienteForEdit) {
      updateMutation.mutate({
        id: selectedClienteForEdit.id,
        nome: formData.nome,
        telefone: formData.telefone,
        servicoIds: selectedServicoIds,
      });
    } else {
      createMutation.mutate({ ...formData, servicoIds: selectedServicoIds });
    }
  };

  const handleDeleteClick = (cliente: Cliente, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedClienteForEdit(cliente);
    setOpenDeleteAlert(true);
  };

  const handleConfirmDelete = () => {
    if (selectedClienteForEdit) {
      deleteMutation.mutate(selectedClienteForEdit.id);
    }
  };

  const handleEditClick = (cliente: Cliente, e: React.MouseEvent) => {
    e.stopPropagation();
    handleOpenDialog(cliente);
  };

  return (
    <div className="container max-w-5xl py-8 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <h2 className="text-3xl font-heading tracking-wider">CLIENTES</h2>
          <p className="text-muted-foreground font-body text-sm">Lista de clientes cadastrados</p>
        </div>
        <Button onClick={() => handleOpenDialog()} className="gap-2 font-heading tracking-widest">
          <Plus className="h-4 w-4" />
          ADICIONAR
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 bg-muted/50 animate-pulse rounded-2xl" />
          ))}
        </div>
      )}

      {!isLoading && clientes.length === 0 && (
        <div className="text-center py-16 space-y-3 bg-muted/20 border border-dashed rounded-2xl">
          <Users className="h-12 w-12 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground font-body">Nenhum cliente cadastrado ainda.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {clientes.map((c) => (
          <div 
            key={c.id} 
            onClick={() => setSelectedClienteDetails(c)}
            className="bg-card rounded-2xl p-5 border border-border flex items-center justify-between gap-4 cursor-pointer hover:border-primary/50 hover:shadow-sm transition-all group"
          >
            <div className="flex items-center gap-4">
              <div className="bg-primary/10 p-3 rounded-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <p className="font-heading text-lg tracking-wide">{c.nome.toUpperCase()}</p>
                <div className="flex items-center gap-1 text-xs text-muted-foreground font-body mt-0.5">
                  <Phone className="h-3 w-3" /> {c.telefone}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right space-y-1 mr-2 hidden sm:block">
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-body justify-end">
                  <Calendar className="h-3 w-3" />
                  {c.total_agendamentos} agendamento{c.total_agendamentos !== 1 ? "s" : ""}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Desde {new Date(c.criado_em).toLocaleDateString("pt-BR")}
                </p>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={(e) => handleEditClick(c, e)} className="h-8 w-8 text-muted-foreground hover:text-primary">
                  <Edit2 className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={(e) => handleDeleteClick(c, e)} className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Sheet de Detalhes do Cliente */}
      <Sheet open={!!selectedClienteDetails} onOpenChange={(open) => { if (!open) setSelectedClienteDetails(null); }}>
        <SheetContent className="overflow-y-auto w-full sm:max-w-md bg-background border-l-border">
          <SheetHeader className="mb-6 border-b border-border pb-4">
            <SheetTitle className="font-heading tracking-widest text-left text-xl flex items-center gap-2">
              <UserCircleIcon /> DETALHES DO CLIENTE
            </SheetTitle>
          </SheetHeader>

          {selectedClienteDetails && (
            <div className="space-y-6">
              {/* Resumo */}
              <div className="bg-muted/30 border border-border/50 rounded-xl p-4 flex flex-col gap-1">
                <h3 className="font-heading text-xl">{selectedClienteDetails.nome}</h3>
                <p className="font-body text-sm text-muted-foreground flex items-center gap-2">
                  <Phone className="h-3 w-3" /> {selectedClienteDetails.telefone}
                </p>
                <p className="font-body text-xs text-muted-foreground opacity-60">Cliente desde {new Date(selectedClienteDetails.criado_em).toLocaleDateString("pt-BR")}</p>
              </div>

              {isLoadingDetails ? (
                <div className="py-12 text-center text-muted-foreground flex flex-col items-center gap-2">
                  <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-xs font-heading">CARREGANDO...</span>
                </div>
              ) : clientDetails ? (
                <>
                  {/* Cards de Métricas */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-primary/5 border border-primary/20 p-4 rounded-xl space-y-1">
                      <DollarSign className="h-5 w-5 text-primary mb-2" />
                      <p className="text-[10px] uppercase text-muted-foreground font-semibold">Total Gasto</p>
                      <p className="font-heading text-lg">R$ {clientDetails.totalGasto.toFixed(2).replace(".", ",")}</p>
                    </div>
                    <div className="bg-card border border-border p-4 rounded-xl space-y-1">
                      <Calendar className="h-5 w-5 text-primary mb-2" />
                      <p className="text-[10px] uppercase text-muted-foreground font-semibold">Última Visita</p>
                      <p className="font-body text-sm font-semibold mt-1">
                        {clientDetails.ultimaVisita ? format(parseISO(clientDetails.ultimaVisita), "dd/MM/yyyy") : "Nunca"}
                      </p>
                    </div>
                  </div>

                  {/* Cortes Mais Usuais */}
                  {clientDetails.topServicos.length > 0 && (
                    <div className="space-y-3 pt-2">
                      <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">Serviços Favoritos</p>
                      <div className="flex flex-wrap gap-2">
                        {clientDetails.topServicos.map((ts, idx) => (
                          <div key={idx} className="bg-muted/50 border border-border px-3 py-1.5 rounded-lg flex items-center gap-2 text-sm font-body">
                            <Scissors className="h-3 w-3 text-muted-foreground" />
                            {ts.nome} <span className="opacity-50 text-xs">({ts.count}x)</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Histórico */}
                  <div className="space-y-4 pt-4 border-t border-border/50">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold flex items-center gap-2">
                      <Clock className="h-3 w-3" /> Histórico de Agendamentos
                    </p>
                    
                    {clientDetails.agendamentos.length === 0 ? (
                      <p className="text-sm text-muted-foreground font-body text-center py-4 bg-muted/20 rounded-xl">
                        Nenhum agendamento encontrado.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {clientDetails.agendamentos.map((ag: any) => (
                          <div key={ag.id} className="bg-card border border-border rounded-xl p-3 flex justify-between items-center group hover:border-primary/30 transition-colors">
                            <div>
                              <p className="font-body text-sm font-medium flex items-center gap-1.5">
                                {format(parseISO(ag.data), "dd/MM/yyyy")} às {ag.horario.slice(0, 5)}
                              </p>
                              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                <Scissors className="h-3 w-3" /> {ag.servicos || "Sem serviços"}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-heading text-sm">R$ {ag.valor.toFixed(2).replace(".", ",")}</p>
                              <span className={`text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-md ${
                                ag.status === 'finalizado' ? 'bg-green-100 text-green-700' :
                                ag.status === 'cancelado' ? 'bg-red-100 text-red-700' :
                                'bg-blue-100 text-blue-700'
                              }`}>
                                {ag.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Outros dialogs permanecem... */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {selectedClienteForEdit ? "Editar Cliente" : "Adicionar Cliente"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
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
            <div className="space-y-2">
              <Label>Serviços favoritos</Label>
              <div className="max-h-32 overflow-auto space-y-1 border rounded-md p-2 bg-muted/20">
                {servicosAtivos.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum serviço ativo cadastrado.</p>
                ) : servicosAtivos.map((sv: any) => (
                  <label key={sv.id} className="flex items-center gap-2 p-1 cursor-pointer hover:bg-muted rounded-sm">
                    <input
                      type="checkbox"
                      checked={selectedServicoIds.includes(sv.id)}
                      onChange={(e) => {
                        setSelectedServicoIds((prev) =>
                          e.target.checked ? [...prev, sv.id] : prev.filter((id) => id !== sv.id)
                        );
                      }}
                      className="accent-primary"
                    />
                    <span className="text-sm font-body">{sv.nome}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
              {selectedClienteForEdit ? "Atualizar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={openDeleteAlert} onOpenChange={setOpenDeleteAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deletar Cliente</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja deletar o cliente "{selectedClienteForEdit?.nome}"?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive hover:bg-destructive/90 text-white">Deletar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function UserCircleIcon() {
  return <Users className="h-5 w-5 text-primary" />;
}
