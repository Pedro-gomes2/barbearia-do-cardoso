import { supabase } from "@/integrations/supabase/client";

export async function getAvailableSlots(date: string) {
  const dayOfWeek = new Date(date + "T12:00:00").getDay();

  // Get schedule config for that day
  const { data: config } = await supabase
    .from("configuracoes_agenda")
    .select("*")
    .eq("dia_semana", dayOfWeek)
    .eq("ativo", true)
    .single();

  if (!config) return [];

  // Generate 1-hour slots
  const startHour = parseInt(config.hora_inicio.split(":")[0]);
  const endHour = parseInt(config.hora_fim.split(":")[0]);
  const slots: string[] = [];
  for (let h = startHour; h < endHour; h++) {
    slots.push(`${String(h).padStart(2, "0")}:00:00`);
  }

  // Get booked slots
  const { data: booked } = await supabase
    .from("agendamentos")
    .select("horario")
    .eq("data", date)
    .eq("status", "ativo");

  const bookedSet = new Set((booked || []).map((b) => b.horario));

  // Get blocked slots
  const { data: blocked } = await supabase
    .from("bloqueios")
    .select("horario")
    .eq("data", date);

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
  horario: string
) {
  // Create user
  const { data: usuario, error: userError } = await supabase
    .from("usuarios")
    .insert({ nome, telefone, tipo: "cliente" })
    .select()
    .single();

  if (userError) throw userError;

  // Create appointment
  const { data: agendamento, error: agError } = await supabase
    .from("agendamentos")
    .insert({ cliente_id: usuario.id, data, horario })
    .select()
    .single();

  if (agError) throw agError;

  return { usuario, agendamento };
}
