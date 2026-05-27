import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type WhatsappMsgInput = {
  nome: string;
  data: string;
  horario: string;
  servicos: string[];
};

export function buildWhatsappConfirmMessage(input: WhatsappMsgInput): string {
  const dataDisplay = format(parse(input.data, "yyyy-MM-dd", new Date()), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  const horarioDisplay = input.horario.slice(0, 5);
  const lines = [
    `Olá! Acabei de agendar para ${dataDisplay} às ${horarioDisplay}.`,
    `Nome: ${input.nome}.`,
  ];
  if (input.servicos.length > 0) {
    lines.push(`Serviço(s): ${input.servicos.join(", ")}.`);
  }
  lines.push("Por favor confirme meu horário.");
  return lines.join(" ");
}

export function buildWhatsappConfirmUrl(adminPhone: string, msg: string): string {
  const digits = adminPhone.replace(/\D/g, "");
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(msg)}`;
}

export async function confirmAgendamento(id: string): Promise<void> {
  const { error } = await supabase
    .from("agendamentos")
    .update({ status: "ativo", expira_em: null })
    .eq("id", id);
  if (error) throw error;
}

export async function cancelAgendamentoAdmin(id: string): Promise<void> {
  const { error } = await supabase
    .from("agendamentos")
    .update({ status: "cancelado" })
    .eq("id", id);
  if (error) throw error;
}

export function usePendentesCount(): { count: number; loading: boolean } {
  const { data = 0, isLoading } = useQuery({
    queryKey: ["pendentes-count"],
    queryFn: async () => {
      await supabase.rpc("expire_pending_agendamentos");
      const { count } = await supabase
        .from("agendamentos")
        .select("id", { count: "exact", head: true })
        .eq("status", "pendente");
      return count ?? 0;
    },
    refetchInterval: 30_000,
  });
  return { count: data, loading: isLoading };
}
