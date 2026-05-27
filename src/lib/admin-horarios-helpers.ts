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
