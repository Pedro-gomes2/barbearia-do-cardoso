import { supabase } from "@/integrations/supabase/client";

export const SLOT_UNIQUE_INDEX = "agendamentos_unique_slot_active";

export class SlotIndisponivelError extends Error {
  constructor() {
    super("Esse horário acabou de ser reservado por outra pessoa.");
    this.name = "SlotIndisponivelError";
  }
}

export async function getAvailableSlots(date: string) {
  const dayOfWeek = new Date(date + "T12:00:00").getDay();

  // Check if day is active in general config
  const { data: config } = await supabase
    .from("configuracoes_agenda")
    .select("ativo")
    .eq("dia_semana", dayOfWeek)
    .single();

  if (config && !config.ativo) {
    return [];
  }

  // Check for custom slots
  const { data: customSlots } = await supabase
    .from("horarios_customizados")
    .select("horario")
    .eq("dia_semana", dayOfWeek)
    .eq("ativo", true)
    .order("horario");

  let slots: string[] = [];

  if (customSlots && customSlots.length > 0) {
    slots = customSlots.map((s) => s.horario);
  } else {
    // Sem horários manuais cadastrados — dia indisponível
    return [];
  }

  // Filter booked and blocked
  const [{ data: booked }, { data: blocked }] = await Promise.all([
    supabase.from("agendamentos").select("horario").eq("data", date).eq("status", "ativo"),
    supabase.from("bloqueios").select("horario").eq("data", date),
  ]);

  const bookedSet = new Set((booked || []).map((b) => b.horario));
  const blockedSet = new Set((blocked || []).map((b) => b.horario));

  return slots.map((slot) => ({
    time: slot,
    available: !bookedSet.has(slot) && !blockedSet.has(slot),
  }));
}

export async function createAppointment(
  nome: string,
  telefone: string,
  data: string,
  horario: string,
  servicoIds: string[]
) {
  const { data: usuario, error: userError } = await supabase
    .from("usuarios")
    .insert({ nome, telefone, tipo: "cliente" })
    .select()
    .single();

  if (userError) throw userError;

  const insertData: any = {
    cliente_id: usuario.id,
    data,
    horario,
    telefone_cliente: telefone.replace(/\D/g, ""),
    status: "pendente",
    expira_em: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  };
  if (servicoIds.length > 0) insertData.servico_id = servicoIds[0];

  const { data: agendamento, error: agError } = await supabase
    .from("agendamentos")
    .insert(insertData)
    .select()
    .single();

  if (agError) {
    if (
      agError.code === "23505" &&
      typeof agError.message === "string" &&
      agError.message.includes(SLOT_UNIQUE_INDEX)
    ) {
      await supabase.from("usuarios").delete().eq("id", usuario.id);
      throw new SlotIndisponivelError();
    }
    throw agError;
  }

  // Insert all services into junction table
  if (servicoIds.length > 0) {
    const rows = servicoIds.map((sid) => ({
      agendamento_id: agendamento.id,
      servico_id: sid,
    }));
    const { error: junctionError } = await supabase
      .from("agendamento_servicos")
      .insert(rows);
    if (junctionError) throw junctionError;
  }

  return { usuario, agendamento };
}
