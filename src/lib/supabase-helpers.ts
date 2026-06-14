import { supabase } from "@/integrations/supabase/client";
import { addMinutes, parse, format, isBefore } from "date-fns";
import { timeToMinutes, minutesToTime, getDayOfWeek, getTodayString, normalizeTimeInput } from "@/lib/time-utils";

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
  const { data, error } = await supabase.rpc("get_occupied_intervals", { _date: date });
  if (error) throw error;

  return (data || []).map((row: any) => {
    const startTime = parse(row.horario.slice(0, 5), "HH:mm", new Date());
    const startMinutes = startTime.getHours() * 60 + startTime.getMinutes();
    return { start: startMinutes, end: startMinutes + row.duracao_minutos };
  });
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

  const dayOfWeek = getDayOfWeek(date);
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

  const dayOfWeek = getDayOfWeek(date);

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

    // Verifica se horário ultrapassa hora_fim
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
  const { data: rows, error } = await supabase.rpc("criar_agendamento", {
    _nome: nome,
    _telefone: telefone,
    _data: data,
    _horario: horario,
    _servico_ids: servicoIds,
  });

  if (error) {
    if (error.message?.includes("SLOT_INDISPONIVEL")) {
      throw new SlotIndisponivelError();
    }
    throw error;
  }

  const result = Array.isArray(rows) ? rows[0] : rows;
  return {
    usuario: { id: result.cliente_id },
    agendamento: { id: result.agendamento_id, cancel_token: result.cancel_token },
  };
}
