import { useState } from "react";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Clock, CheckCircle2, XCircle, CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Plus, Edit2, Trash2 } from "lucide-react";

export default function AdminHorarios() {
  const [data, setData] = useState(format(new Date(), "yyyy-MM-dd"));

  // Clientes management / encaixe
  const [openClientesDialog, setOpenClientesDialog] = useState(false);
  const [openEncaixeDialog, setOpenEncaixeDialog] = useState(false);
  const [selectedCliente, setSelectedCliente] = useState<any | null>(null);
  const [formCliente, setFormCliente] = useState({ nome: "", telefone: "" });
  const [selectedSlot, setSelectedSlot] = useState<any | null>(null);
  const [openReplaceDialog, setOpenReplaceDialog] = useState(false);
  const [openRemoveDialog, setOpenRemoveDialog] = useState(false);
  const [selectedAgendamentoId, setSelectedAgendamentoId] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const dayOfWeek = new Date(data + "T12:00:00").getDay();

  const { data: slots = [], isLoading } = useQuery({
    queryKey: ["admin-horarios", data],
    queryFn: async () => {
      const [{ data: customSlots }, { data: agendados }, { data: bloqueados }] = await Promise.all([
        supabase
          .from("horarios_customizados")
          .select("horario")
          .eq("dia_semana", dayOfWeek)
          .eq("ativo", true)
          .order("horario"),
        supabase
          .from("agendamentos")
          .select("horario, usuarios(nome)")
          .eq("data", data)
          .eq("status", "ativo"),
        supabase
          .from("bloqueios")
          .select("horario, motivo")
          .eq("data", data),
      ]);

      const agendadosMap = Object.fromEntries(
        (agendados || []).map((a: any) => [a.horario, a.usuarios?.nome || "Cliente"])
      );
      const bloqueadosMap = Object.fromEntries(
        (bloqueados || []).map((b: any) => [b.horario, b.motivo || "Bloqueado"])

      );

      return (customSlots || []).map((s) => {
        const h = s.horario;
        if (agendadosMap[h]) return { horario: h, status: "ocupado", info: agendadosMap[h] };
        if (bloqueadosMap[h]) return { horario: h, status: "bloqueado", info: bloqueadosMap[h] };
        return { horario: h, status: "livre", info: "" };
      });
    },
  });

  // Clientes list (re-uses same cache key as AdminClientes)
  const { data: clientes = [] } = useQuery({
    queryKey: ["admin-clientes"],
    queryFn: async () => {
      const { data: usuarios } = await supabase
        .from("usuarios")
        .select("id, nome, telefone, criado_em")
        .eq("tipo", "cliente")
        .order("nome", { ascending: true });

      if (!usuarios) return [];

      usuarios.sort((a: any, b: any) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
      return usuarios;
    },
  });

  const createCliente = useMutation({
    mutationFn: async (data: { nome: string; telefone: string }) => {
      const { error } = await supabase.from("usuarios").insert({ ...data, tipo: "cliente" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-clientes"] });
      setFormCliente({ nome: "", telefone: "" });
      toast({ title: "Cliente adicionado", description: "Cliente adicionado com sucesso" });
    },
    onError: () => {
      toast({ title: "Erro", description: "Erro ao adicionar cliente", variant: "destructive" });
    },
  });

  const updateCliente = useMutation({
    mutationFn: async (data: { id: string; nome: string; telefone: string }) => {
      const { error } = await supabase.from("usuarios").update({ nome: data.nome, telefone: data.telefone }).eq("id", data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-clientes"] });
      setSelectedCliente(null);
      setFormCliente({ nome: "", telefone: "" });
      toast({ title: "Cliente atualizado", description: "Dados do cliente atualizados" });
    },
  });

  const deleteCliente = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("usuarios").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-clientes"] });
      toast({ title: "Cliente deletado", description: "Cliente removido com sucesso" });
    },
  });

  const encaixeMutation = useMutation({
    mutationFn: async (payload: { cliente_id: string; data: string; horario: string }) => {
      const { error } = await supabase.from("agendamentos").insert({ cliente_id: payload.cliente_id, data: payload.data, horario: payload.horario, status: "ativo" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-horarios", data] });
      toast({ title: "Agendamento criado", description: "Encaixe criado com sucesso" });
      setOpenEncaixeDialog(false);
      setSelectedSlot(null);
    },
  });

  const removeAgendamento = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("agendamentos").update({ status: "cancelado" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-horarios", data] });
      toast({ title: "Agendamento removido", description: "Cliente removido do horário" });
      setOpenRemoveDialog(false);
      setSelectedAgendamentoId(null);
      setSelectedSlot(null);
    },
  });

  const replaceAgendamento = useMutation({
    mutationFn: async (payload: { agendamentoId: string; clienteId: string }) => {
      const { error } = await supabase.from("agendamentos").update({ cliente_id: payload.clienteId }).eq("id", payload.agendamentoId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-horarios", data] });
      toast({ title: "Substituição realizada", description: "Cliente substituído com sucesso" });
      setOpenReplaceDialog(false);
      setSelectedAgendamentoId(null);
      setSelectedSlot(null);
      setSelectedCliente(null);
    },
  });

  const livres = slots.filter((s) => s.status === "livre").length;
  const ocupados = slots.filter((s) => s.status === "ocupado").length;
  const bloqueados = slots.filter((s) => s.status === "bloqueado").length;

  const dataDisplay = format(parse(data, "yyyy-MM-dd", new Date()), "EEEE, dd 'de' MMMM", { locale: ptBR });

  return (
    <div className="container max-w-5xl py-8 space-y-6 animate-fade-in">
      <div className="text-center space-y-1">
        <Clock className="h-8 w-8 text-primary mx-auto" />
        <h2 className="text-3xl font-heading tracking-wider">HORÁRIOS</h2>
        <p className="font-body text-sm text-muted-foreground">Visualize os horários vagos e ocupados</p>
      </div>

      {/* Seletor de data */}
      <div className="space-y-1">
        <Label className="flex items-center gap-2 text-xs text-muted-foreground">
          <CalendarDays className="h-4 w-4" /> Data
        </Label>
        <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
        <p className="text-xs text-muted-foreground font-body capitalize">{dataDisplay}</p>
        <div className="pt-2">
          <Button size="sm" onClick={() => setOpenClientesDialog(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Gerenciar Clientes
          </Button>
        </div>
      </div>

      {/* Resumo */}
      {slots.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
            <p className="font-heading text-2xl text-green-700">{livres}</p>
            <p className="font-body text-xs text-green-600">Vagos</p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
            <p className="font-heading text-2xl text-red-700">{ocupados}</p>
            <p className="font-body text-xs text-red-600">Ocupados</p>
          </div>
          <div className="bg-muted border border-border rounded-xl p-3 text-center">
            <p className="font-heading text-2xl text-muted-foreground">{bloqueados}</p>
            <p className="font-body text-xs text-muted-foreground">Bloqueados</p>
          </div>
        </div>
      )}

      {/* Dialog: Gerenciar Clientes */}
      <Dialog open={openClientesDialog} onOpenChange={setOpenClientesDialog}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Clientes</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              {clientes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum cliente cadastrado.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-auto">
                  {clientes.map((c: any) => (
                    <div key={c.id} className="flex items-center justify-between p-2 rounded-md border">
                      <div>
                        <p className="font-medium">{c.nome}</p>
                        <p className="text-xs text-muted-foreground">{c.telefone}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="ghost" onClick={() => { setSelectedCliente(c); setFormCliente({ nome: c.nome, telefone: c.telefone }); }}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteCliente.mutate(c.id)} className="text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2 pt-2 border-t">
              <Label>Adicionar / Editar Cliente</Label>
              <Input placeholder="Nome" value={formCliente.nome} onChange={(e) => setFormCliente({ ...formCliente, nome: e.target.value })} />
              <Input placeholder="Telefone" value={formCliente.telefone} onChange={(e) => setFormCliente({ ...formCliente, telefone: e.target.value })} />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => { setOpenClientesDialog(false); setSelectedCliente(null); setFormCliente({ nome: "", telefone: "" }); }}>
                  Fechar
                </Button>
                <Button
                  onClick={() => {
                    if (!formCliente.nome || !formCliente.telefone) return toast({ title: "Aviso", description: "Preencha todos os campos", variant: "destructive" });
                    if (selectedCliente) {
                      updateCliente.mutate({ id: selectedCliente.id, nome: formCliente.nome, telefone: formCliente.telefone });
                    } else {
                      createCliente.mutate(formCliente);
                    }
                  }}
                  disabled={createCliente.isLoading || updateCliente.isLoading}
                >
                  {selectedCliente ? "Atualizar" : "Adicionar"}
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter />
        </DialogContent>
      </Dialog>

      {/* Dialog: Encaixe */}
      <Dialog open={openEncaixeDialog} onOpenChange={setOpenEncaixeDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Encaixe de Horário</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm">Horário: <strong>{selectedSlot?.horario?.slice?.(0,5)}</strong></p>
            <div className="space-y-2">
              <Label>Escolha o cliente</Label>
              <div className="max-h-40 overflow-auto space-y-1">
                {clientes.map((c: any) => (
                  <div key={c.id} className={`p-2 rounded-md border flex items-center justify-between ${selectedCliente?.id === c.id ? 'bg-primary/10' : ''}`}>
                    <div>
                      <p className="font-medium">{c.nome}</p>
                      <p className="text-xs text-muted-foreground">{c.telefone}</p>
                    </div>
                    <Button size="sm" onClick={() => setSelectedCliente(c)}>
                      Selecionar
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpenEncaixeDialog(false); setSelectedCliente(null); setSelectedSlot(null); }}>
              Cancelar
            </Button>
            <Button onClick={() => {
              if (!selectedCliente || !selectedSlot) return toast({ title: "Aviso", description: "Selecione um cliente", variant: "destructive" });
              encaixeMutation.mutate({ cliente_id: selectedCliente.id, data, horario: selectedSlot.horario });
            }} disabled={encaixeMutation.isLoading}>
              Confirmar Encaixe
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Remover Cliente (confirm) */}
      <Dialog open={openRemoveDialog} onOpenChange={setOpenRemoveDialog}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Remover Cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p>Tem certeza que deseja remover o cliente deste horário?</p>
            <p className="text-sm text-muted-foreground">{selectedSlot?.horario?.slice?.(0,5)} — {selectedSlot?.info}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpenRemoveDialog(false); setSelectedAgendamentoId(null); setSelectedSlot(null); }}>
              Cancelar
            </Button>
            <Button className="bg-destructive text-destructive-foreground" onClick={() => {
              if (!selectedAgendamentoId) return;
              removeAgendamento.mutate(selectedAgendamentoId);
            }} disabled={removeAgendamento.isLoading}>
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Substituir Cliente */}
      <Dialog open={openReplaceDialog} onOpenChange={setOpenReplaceDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Substituir Cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm">Horário: <strong>{selectedSlot?.horario?.slice?.(0,5)}</strong></p>
            <div className="space-y-2">
              <Label>Escolha o cliente substituto</Label>
              <div className="max-h-40 overflow-auto space-y-1">
                {clientes.map((c: any) => (
                  <div key={c.id} className={`p-2 rounded-md border flex items-center justify-between ${selectedCliente?.id === c.id ? 'bg-primary/10' : ''}`}>
                    <div>
                      <p className="font-medium">{c.nome}</p>
                      <p className="text-xs text-muted-foreground">{c.telefone}</p>
                    </div>
                    <Button size="sm" onClick={() => setSelectedCliente(c)}>
                      Selecionar
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpenReplaceDialog(false); setSelectedCliente(null); setSelectedAgendamentoId(null); setSelectedSlot(null); }}>
              Cancelar
            </Button>
            <Button onClick={() => {
              if (!selectedAgendamentoId || !selectedCliente?.id) return toast({ title: 'Aviso', description: 'Selecione um cliente', variant: 'destructive' });
              replaceAgendamento.mutate({ agendamentoId: selectedAgendamentoId, clienteId: selectedCliente.id });
            }} disabled={replaceAgendamento.isLoading}>
              Confirmar Substituição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lista de horários */}
      {isLoading ? (
        <p className="text-center text-muted-foreground font-body py-8">Carregando...</p>
      ) : slots.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center space-y-2">
          <p className="font-heading text-xl text-muted-foreground">SEM HORÁRIOS</p>
          <p className="font-body text-sm text-muted-foreground">
            Nenhum horário configurado para este dia.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {slots.map((s) => (
            <div
              key={s.horario}
              className={`flex items-center justify-between px-4 py-3 rounded-xl border ${
                s.status === "livre"
                  ? "bg-green-50 border-green-200"
                  : s.status === "ocupado"
                  ? "bg-red-50 border-red-200"
                  : "bg-muted border-border opacity-60"
              }`}
            >
              <div className="flex items-center gap-3">
                {s.status === "livre" ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
                <span className="font-heading text-xl">{s.horario.slice(0, 5)}</span>
              </div>
              <div className="text-right">
                <span className={`font-body text-xs px-2 py-0.5 rounded-full ${
                  s.status === "livre"
                    ? "bg-green-100 text-green-700"
                    : s.status === "ocupado"
                    ? "bg-red-100 text-red-700"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {s.status === "livre" ? "VAGO" : s.status === "ocupado" ? "OCUPADO" : "BLOQUEADO"}
                </span>
                {s.status === "livre" && (
                  <div className="mt-2 flex justify-end">
                    <Button size="sm" onClick={() => { setSelectedSlot(s); setOpenEncaixeDialog(true); }}>
                      Encaixe
                    </Button>
                  </div>
                )}
                {s.info && (
                  <p className="font-body text-xs text-muted-foreground mt-0.5">{s.info}</p>
                )}
                {s.status === "ocupado" && (
                  <div className="mt-2 flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={async () => {
                      // fetch agendamento id
                      const { data: ag, error } = await supabase.from('agendamentos').select('id, cliente_id').eq('data', data).eq('horario', s.horario).eq('status', 'ativo').maybeSingle();
                      if (error || !ag) return toast({ title: 'Erro', description: 'Não foi possível localizar o agendamento', variant: 'destructive' });
                      setSelectedAgendamentoId(ag.id);
                      setSelectedCliente({ id: ag.cliente_id });
                      setSelectedSlot(s);
                      setOpenRemoveDialog(true);
                    }}>
                      Remover
                    </Button>
                    <Button size="sm" onClick={async () => {
                      const { data: ag, error } = await supabase.from('agendamentos').select('id, cliente_id').eq('data', data).eq('horario', s.horario).eq('status', 'ativo').maybeSingle();
                      if (error || !ag) return toast({ title: 'Erro', description: 'Não foi possível localizar o agendamento', variant: 'destructive' });
                      setSelectedAgendamentoId(ag.id);
                      setSelectedCliente({ id: ag.cliente_id });
                      setSelectedSlot(s);
                      setOpenReplaceDialog(true);
                    }}>
                      Substituir
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
