import { supabase } from "@/integrations/supabase/client";
import { addMinutes, parse, format, isBefore } from "date-fns";
import { normalizarTelefone } from "@/lib/telefone";

export const SLOT_UNIQUE_INDEX = "agendamentos_unique_slot_active";
export const SLOT_STEP = 15; // minutes between each slot (minimum service duration)

export class SlotIndisponivelError extends Error {
  constructor() {
    super("Esse horário acabou de ser reservado por outra pessoa.");
    this.name = "SlotIndisponivelError";
  }
}

/**
 * Calculates the occupied time intervals for a given date.
 * Each interval is [startMinutes, endMinutes) relative to midnight.
 */
async function getOccupiedIntervals(date: string): Promise<{ start: number; end: number }[]> {
  // Get all active/pending bookings for this date with their services
  const { data: agendamentos } = await supabase
    .from("agendamentos")
    .select("horario, agendamento_servicos(servico_id)")
    .eq("data", date)
    .in("status", ["pendente", "ativo"]);

  const intervals: { start: number; end: number }[] = [];

  if (!agendamentos || agendamentos.length === 0) return intervals;

  // Collect all service IDs
  const allServiceIds = new Set<string>();
  for (const ag of agendamentos as any[]) {
    const junctions = ag.agendamento_servicos || [];
    for (const j of junctions) {
      if (j.servico_id) allServiceIds.add(j.servico_id);
    }
  }

  // Fetch durations for all services in one query
  let durationMap: Record<string, number> = {};
  if (allServiceIds.size > 0) {
    const { data: servicos } = await supabase
      .from("servicos")
      .select("id, duracao_minutos")
      .in("id", Array.from(allServiceIds));
    if (servicos) {
      for (const s of servicos) {
        durationMap[s.id] = s.duracao_minutos;
      }
    }
  }

  for (const ag of agendamentos as any[]) {
    const startTime = parse(ag.horario.slice(0, 5), "HH:mm", new Date());
    const startMinutes = startTime.getHours() * 60 + startTime.getMinutes();

    const junctions = ag.agendamento_servicos || [];
    let totalDuration = 0;
    for (const j of junctions) {
      totalDuration += durationMap[j.servico_id] || 0;
    }
    // Fallback: if no services linked, assume at least 15 minutes (minimum service)
    if (totalDuration === 0) totalDuration = 15;

    intervals.push({ start: startMinutes, end: startMinutes + totalDuration });
  }

  return intervals;
}

/**
 * Helper: convert "HH:mm" string to minutes since midnight
 */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Helper: convert minutes since midnight to "HH:mm:ss" string
 */
function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}:00`;
}

/**
 * Retorna a lista de horários (HH:mm:ss) configurados para a data.
 * Se existir override em `horarios_data`, usa só ele; senão cai no template
 * semanal de `horarios_customizados`.
 */
async function getHorariosDaData(date: string): Promise<string[]> {
  const { data: override } = await supabase
    .from("horarios_data")
    .select("horario")
    .eq("data", date)
    .eq("ativo", true)
    .order("horario");

  if (override && override.length > 0) {
    return override.map((r: any) => r.horario);
  }

  const dayOfWeek = new Date(date + "T12:00:00").getDay();
  const { data: template } = await supabase
    .from("horarios_customizados")
    .select("horario")
    .eq("dia_semana", dayOfWeek)
    .eq("ativo", true)
    .order("horario");

  return (template || []).map((r: any) => r.horario);
}

export async function getAvailableSlots(date: string, requiredMinutes: number = 0) {
  await supabase.rpc("expire_pending_agendamentos");

  const dayOfWeek = new Date(date + "T12:00:00").getDay();

  // Day config: respeita o flag "ativo" do dia, e usa hora_fim como limite final
  const { data: config } = await supabase
    .from("configuracoes_agenda")
    .select("ativo, hora_inicio, hora_fim")
    .eq("dia_semana", dayOfWeek)
    .single();

  if (!config || !config.ativo) {
    return [];
  }

  const closeMinutes = timeToMinutes(config.hora_fim);

  const [horarios, occupiedIntervals, blockedResult] = await Promise.all([
    getHorariosDaData(date),
    getOccupiedIntervals(date),
    supabase.from("bloqueios").select("horario").eq("data", date),
  ]);

  const blockedSet = new Set(
    (blockedResult.data || []).map((b: any) => b.horario.slice(0, 5))
  );

  // Se o cliente ainda não escolheu serviço, mostra os horários crus marcando
  // disponibilidade só pelo conflito direto (sem somar duração).
  const duration = requiredMinutes > 0 ? requiredMinutes : 0;

  const slots: { time: string; available: boolean }[] = [];

  for (const horario of horarios) {
    const timeStr = horario.length === 5 ? `${horario}:00` : horario;
    const displayStr = timeStr.slice(0, 5);
    const startMinutes = timeToMinutes(displayStr);

    if (blockedSet.has(displayStr)) {
      slots.push({ time: timeStr, available: false });
      continue;
    }

    // Estoura o expediente
    if (duration > 0 && startMinutes + duration > closeMinutes) {
      slots.push({ time: timeStr, available: false });
      continue;
    }

    const candidateStart = startMinutes;
    const candidateEnd = startMinutes + (duration > 0 ? duration : 1);
    const hasConflict = occupiedIntervals.some(
      (interval) => candidateStart < interval.end && candidateEnd > interval.start
    );

    slots.push({ time: timeStr, available: !hasConflict });
  }

  return slots;
}

export async function createAppointment(
  nome: string,
  telefone: string,
  data: string,
  horario: string,
  servicoIds: string[]
) {
  const telNorm = normalizarTelefone(telefone);

  let usuario: { id: string } | null = null;
  let usuarioFoiCriado = false;
  if (telNorm) {
    const { data: existente } = await supabase
      .from("usuarios")
      .select("id")
      .eq("telefone_normalizado", telNorm)
      .eq("tipo", "cliente")
      .maybeSingle();
    if (existente) usuario = existente;
  }

  if (!usuario) {
    const { data: novo, error: insErr } = await supabase
      .from("usuarios")
      .insert({ nome, telefone, tipo: "cliente" })
      .select("id")
      .single();
    if (insErr) {
      if (insErr.code === "23505" && telNorm) {
        const { data: retry, error: retryErr } = await supabase
          .from("usuarios")
          .select("id")
          .eq("telefone_normalizado", telNorm)
          .eq("tipo", "cliente")
          .single();
        if (retryErr) throw retryErr;
        usuario = retry;
      } else {
        throw insErr;
      }
    } else {
      usuario = novo;
      usuarioFoiCriado = true;
    }
  }

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
      if (usuarioFoiCriado) {
        await supabase.from("usuarios").delete().eq("id", usuario.id);
      }
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
