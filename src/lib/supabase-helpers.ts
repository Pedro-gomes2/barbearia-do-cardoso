import { supabase } from "@/integrations/supabase/client";

export async function getAvailableSlots(date: string) {
  const dayOfWeek = new Date(date + "T12:00:00").getDay();

  // Check for custom slots first
  const { data: customSlots } = await supabase
    .from("horarios_customizados")
    .select("horario")
    .eq("dia_semana", dayOfWeek)
    .eq("ativo", true)
    .order("horario");

  let slots: string[] = [];

  if (customSlots && customSlots.length > 0) {
    // Use custom slots
    slots = customSlots.map((s) => s.horario);
  } else {
    // Fallback to fixed interval
    const { data: config } = await supabase
      .from("configuracoes_agenda")
      .select("*")
      .eq("dia_semana", dayOfWeek)
      .eq("ativo", true)
      .single();

    if (!config) return [];

    const intervalo = (config as any).intervalo_minutos || 60;
    const [sh, sm] = config.hora_inicio.split(":").map(Number);
    const [eh, em] = config.hora_fim.split(":").map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;

    for (let m = startMin; m < endMin; m += intervalo) {
      const h = Math.floor(m / 60);
      const min = m % 60;
      slots.push(`${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`);
    }
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
