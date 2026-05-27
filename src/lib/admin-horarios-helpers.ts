import { supabase } from "@/integrations/supabase/client";
import { SLOT_UNIQUE_INDEX, SlotIndisponivelError } from "@/lib/supabase-helpers";

export type AgendamentoStatus = "pendente" | "ativo";

export type AgendamentoRow = {
  id: string;
  horario: string;
  status: AgendamentoStatus;
  usuarios: { nome: string } | null;
  agendamento_servicos: { servicos: { nome: string } | null }[] | null;
};

export type SlotInfo = {
  nome: string;
  servicos: string[];
  status: AgendamentoStatus;
};

export function mapAgendamentoToSlot(ag: AgendamentoRow): SlotInfo {
  return {
    nome: ag.usuarios?.nome ?? "Cliente",
    servicos: (ag.agendamento_servicos ?? [])
      .map((j) => j.servicos?.nome)
      .filter((n): n is string => !!n),
    status: ag.status,
  };
}

export async function createEncaixe(
  clienteId: string,
  data: string,
  horario: string,
  servicoIds: string[]
): Promise<void> {
  const { data: agendamento, error: insertError } = await supabase
    .from("agendamentos")
    .insert({ cliente_id: clienteId, data, horario, status: "ativo" })
    .select()
    .single();

  if (insertError) {
    if (
      insertError.code === "23505" &&
      typeof insertError.message === "string" &&
      insertError.message.includes(SLOT_UNIQUE_INDEX)
    ) {
      throw new SlotIndisponivelError();
    }
    throw insertError;
  }

  if (servicoIds.length === 0) return;

  const rows = servicoIds.map((sid) => ({
    agendamento_id: agendamento.id,
    servico_id: sid,
  }));
  const { error: junctionError } = await supabase
    .from("agendamento_servicos")
    .insert(rows);

  if (junctionError) {
    await supabase.from("agendamentos").delete().eq("id", agendamento.id);
    throw junctionError;
  }
}

export async function replaceAgendamentoServicos(
  agendamentoId: string,
  novoClienteId: string,
  servicoIds: string[]
): Promise<void> {
  const { error: updateError } = await supabase
    .from("agendamentos")
    .update({ cliente_id: novoClienteId })
    .eq("id", agendamentoId);
  if (updateError) throw updateError;

  const { error: deleteError } = await supabase
    .from("agendamento_servicos")
    .delete()
    .eq("agendamento_id", agendamentoId);
  if (deleteError) throw deleteError;

  if (servicoIds.length === 0) return;

  const rows = servicoIds.map((sid) => ({
    agendamento_id: agendamentoId,
    servico_id: sid,
  }));
  const { error: insertError } = await supabase
    .from("agendamento_servicos")
    .insert(rows);
  if (insertError) throw insertError;
}

export async function getFavoritosCliente(clienteId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("cliente_servicos_favoritos")
    .select("servico_id")
    .eq("cliente_id", clienteId);
  if (error) throw error;
  return (data ?? []).map((r: any) => r.servico_id);
}

export async function saveFavoritosCliente(
  clienteId: string,
  servicoIds: string[]
): Promise<void> {
  const { error: deleteError } = await supabase
    .from("cliente_servicos_favoritos")
    .delete()
    .eq("cliente_id", clienteId);
  if (deleteError) throw deleteError;

  if (servicoIds.length === 0) return;

  const rows = servicoIds.map((sid) => ({
    cliente_id: clienteId,
    servico_id: sid,
  }));
  const { error: insertError } = await supabase
    .from("cliente_servicos_favoritos")
    .insert(rows);
  if (insertError) throw insertError;
}
