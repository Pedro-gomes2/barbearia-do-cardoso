import { supabase } from "@/integrations/supabase/client";

export async function getAvailableSlots(date: string) {
  const dayOfWeek = new Date(date + "T12:00:00").getDay();

  const { data: config } = await supabase
    .from("configuracoes_agenda")
    .select("*")
    .eq("dia_semana", dayOfWeek)
    .eq("ativo", true)
    .single();

  if (!config) return [];

  const intervalo = (config as any).intervalo_minutos || 60;

  // Parse start/end times in minutes
  const [sh, sm] = config.hora_inicio.split(":").map(Number);
  const [eh, em] = config.hora_fim.split(":").map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;

  const slots: string[] = [];
  for (let m = startMin; m < endMin; m += intervalo) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`);
  }

  const { data: booked } = await supabase
    .from("agendamentos")
    .select("horario")
    .eq("data", date)
    .eq("status", "ativo");

  const bookedSet = new Set((booked || []).map((b) => b.horario));

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
  horario: string,
  servicoId?: string
) {
  const { data: usuario, error: userError } = await supabase
    .from("usuarios")
    .insert({ nome, telefone, tipo: "cliente" })
    .select()
    .single();

  if (userError) throw userError;

  const insertData: any = { cliente_id: usuario.id, data, horario };
  if (servicoId) insertData.servico_id = servicoId;

  const { data: agendamento, error: agError } = await supabase
    .from("agendamentos")
    .insert(insertData)
    .select()
    .single();

  if (agError) throw agError;

  return { usuario, agendamento };
}
