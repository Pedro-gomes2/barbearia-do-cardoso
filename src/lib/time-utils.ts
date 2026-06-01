import { parse, format } from "date-fns";

/**
 * Formata um horário TIME (HH:MM:SS) para exibição (HH:MM)
 * @param time TIME string (HH:MM:SS ou HH:MM)
 * @returns Formatted string (HH:MM)
 */
export function formatTimeDisplay(time: string | null | undefined): string {
  if (!time) return "";
  return time.slice(0, 5);
}

/**
 * Normaliza entrada de horário para TIME format (HH:MM:SS)
 * Aceita HH:MM ou HH:MM:SS
 * @param input Time input (HH:MM or HH:MM:SS)
 * @returns HH:MM:SS ou null se inválido
 */
export function normalizeTimeInput(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Match HH:MM or HH:MM:SS
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;

  const h = Number(match[1]);
  const m = Number(match[2]);
  const s = match[3] ? Number(match[3]) : 0;

  // Validate ranges
  if (h < 0 || h > 23 || m < 0 || m > 59 || s < 0 || s > 59) {
    return null;
  }

  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Converte TIME string para minutos desde midnight
 * @param time HH:MM ou HH:MM:SS
 * @returns Minutos desde midnight
 */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Converte minutos desde midnight para TIME string
 * @param minutes Minutos desde midnight
 * @returns HH:MM:SS
 */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}:00`;
}

/**
 * Obtém dia da semana (0-6) de uma data YYYY-MM-DD string
 * Usa UTC para evitar problemas de timezone
 * @param dateStr YYYY-MM-DD
 * @returns 0-6 (0=Sunday)
 */
export function getDayOfWeek(dateStr: string): number {
  // Parse manualmente para garantir UTC
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCDay();
}

/**
 * Obtém data de hoje em YYYY-MM-DD format (local timezone)
 * @returns YYYY-MM-DD
 */
export function getTodayString(): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Verifica se uma data é no passado (local timezone)
 * @param dateStr YYYY-MM-DD
 * @returns true se no passado
 */
export function isDateInPast(dateStr: string): boolean {
  const today = getTodayString();
  return dateStr < today;
}

/**
 * Verifica se uma data é hoje ou depois (local timezone)
 * @param dateStr YYYY-MM-DD
 * @returns true se hoje ou depois
 */
export function isDateTodayOrAfter(dateStr: string): boolean {
  const today = getTodayString();
  return dateStr >= today;
}
