import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/integrations/supabase/client", () => {
  const state: any = {
    agendamentoInsertError: null,
    junctionInsertError: null,
    junctionDeleteError: null,
    agendamentoUpdateError: null,
    insertedAgendamentoId: "ag-novo",
    deletedAgendamentoIds: [] as string[],
    insertedJunctionRows: [] as any[],
    deletedJunctionAgendamentoIds: [] as string[],
    updatedAgendamentos: [] as any[],
  };
  const client = {
    from: (table: string) => {
      if (table === "agendamentos") {
        return {
          insert: (payload: any) => ({
            select: () => ({
              single: async () =>
                state.agendamentoInsertError
                  ? { data: null, error: state.agendamentoInsertError }
                  : { data: { id: state.insertedAgendamentoId, ...payload }, error: null },
            }),
          }),
          delete: () => ({
            eq: (_col: string, id: string) => {
              state.deletedAgendamentoIds.push(id);
              return Promise.resolve({ error: null });
            },
          }),
          update: (payload: any) => ({
            eq: (_col: string, id: string) => {
              state.updatedAgendamentos.push({ id, payload });
              return Promise.resolve({ error: state.agendamentoUpdateError });
            },
          }),
        };
      }
      if (table === "agendamento_servicos") {
        return {
          insert: async (rows: any[]) => {
            if (state.junctionInsertError) return { error: state.junctionInsertError };
            state.insertedJunctionRows.push(...rows);
            return { error: null };
          },
          delete: () => ({
            eq: (_col: string, id: string) => {
              state.deletedJunctionAgendamentoIds.push(id);
              return Promise.resolve({ error: state.junctionDeleteError });
            },
          }),
        };
      }
      return {};
    },
    __state: state,
  };
  return { supabase: client };
});

import { supabase } from "@/integrations/supabase/client";
import { mapAgendamentoToSlot, createEncaixe } from "@/lib/admin-horarios-helpers";
import { SlotIndisponivelError } from "@/lib/supabase-helpers";

const getState = () => (supabase as any).__state;

beforeEach(() => {
  const s = getState();
  s.agendamentoInsertError = null;
  s.junctionInsertError = null;
  s.junctionDeleteError = null;
  s.agendamentoUpdateError = null;
  s.insertedAgendamentoId = "ag-novo";
  s.deletedAgendamentoIds = [];
  s.insertedJunctionRows = [];
  s.deletedJunctionAgendamentoIds = [];
  s.updatedAgendamentos = [];
});

describe("mapAgendamentoToSlot", () => {
  it("mapeia 2 servicos via junction para array de nomes", () => {
    const result = mapAgendamentoToSlot({
      id: "ag-1",
      horario: "10:00:00",
      status: "ativo",
      usuarios: { nome: "Joao" },
      agendamento_servicos: [
        { servicos: { nome: "Corte" } },
        { servicos: { nome: "Barba" } },
      ],
    });
    expect(result).toEqual({ nome: "Joao", servicos: ["Corte", "Barba"], status: "ativo" });
  });

  it("agendamento legado sem junction retorna servicos vazio e preserva nome", () => {
    const result = mapAgendamentoToSlot({
      id: "ag-2",
      horario: "11:00:00",
      status: "ativo",
      usuarios: { nome: "Maria" },
      agendamento_servicos: null,
    });
    expect(result).toEqual({ nome: "Maria", servicos: [], status: "ativo" });
  });

  it("usa fallback 'Cliente' quando usuarios é null", () => {
    const result = mapAgendamentoToSlot({
      id: "ag-3",
      horario: "12:00:00",
      status: "pendente",
      usuarios: null,
      agendamento_servicos: [],
    });
    expect(result.nome).toBe("Cliente");
    expect(result.status).toBe("pendente");
  });
});

describe("createEncaixe", () => {
  it("happy path: insere agendamento e junction sem rollback", async () => {
    await createEncaixe("cliente-1", "2026-06-01", "10:00:00", ["s1", "s2"]);
    const s = getState();
    expect(s.insertedJunctionRows).toEqual([
      { agendamento_id: "ag-novo", servico_id: "s1" },
      { agendamento_id: "ag-novo", servico_id: "s2" },
    ]);
    expect(s.deletedAgendamentoIds).toEqual([]);
  });

  it("rollback: se junction falha, deleta agendamento e propaga erro", async () => {
    const s = getState();
    s.junctionInsertError = { message: "fk violation" };
    await expect(
      createEncaixe("cliente-1", "2026-06-01", "10:00:00", ["s1"])
    ).rejects.toMatchObject({ message: "fk violation" });
    expect(s.deletedAgendamentoIds).toContain("ag-novo");
  });

  it("slot ocupado: lança SlotIndisponivelError quando erro 23505 do índice", async () => {
    getState().agendamentoInsertError = {
      code: "23505",
      message: 'duplicate key value violates unique constraint "agendamentos_unique_slot_active"',
    };
    await expect(
      createEncaixe("cliente-1", "2026-06-01", "10:00:00", ["s1"])
    ).rejects.toBeInstanceOf(SlotIndisponivelError);
  });
});
