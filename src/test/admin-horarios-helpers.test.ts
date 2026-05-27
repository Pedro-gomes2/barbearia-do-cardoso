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
    favoritosByCliente: {} as Record<string, { servico_id: string }[]>,
    favoritosInsertError: null,
    favoritosDeleteError: null,
    insertedFavoritosRows: [] as any[],
    deletedFavoritosClienteIds: [] as string[],
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
      if (table === "cliente_servicos_favoritos") {
        return {
          select: (_cols: string) => ({
            eq: async (_col: string, clienteId: string) => ({
              data: state.favoritosByCliente[clienteId] ?? [],
              error: null,
            }),
          }),
          insert: async (rows: any[]) => {
            if (state.favoritosInsertError) return { error: state.favoritosInsertError };
            state.insertedFavoritosRows.push(...rows);
            return { error: null };
          },
          delete: () => ({
            eq: (_col: string, clienteId: string) => {
              state.deletedFavoritosClienteIds.push(clienteId);
              return Promise.resolve({ error: state.favoritosDeleteError });
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
  s.favoritosByCliente = {};
  s.favoritosInsertError = null;
  s.favoritosDeleteError = null;
  s.insertedFavoritosRows = [];
  s.deletedFavoritosClienteIds = [];
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

import { replaceAgendamentoServicos } from "@/lib/admin-horarios-helpers";

describe("replaceAgendamentoServicos", () => {
  it("happy path: update cliente, delete junction antigo, insert novo", async () => {
    await replaceAgendamentoServicos("ag-existente", "cliente-novo", ["s1", "s2"]);
    const s = getState();
    expect(s.updatedAgendamentos).toEqual([
      { id: "ag-existente", payload: { cliente_id: "cliente-novo" } },
    ]);
    expect(s.deletedJunctionAgendamentoIds).toEqual(["ag-existente"]);
    expect(s.insertedJunctionRows).toEqual([
      { agendamento_id: "ag-existente", servico_id: "s1" },
      { agendamento_id: "ag-existente", servico_id: "s2" },
    ]);
  });

  it("propaga erro do update", async () => {
    getState().agendamentoUpdateError = { message: "update falhou" };
    await expect(
      replaceAgendamentoServicos("ag-x", "cli-x", ["s1"])
    ).rejects.toMatchObject({ message: "update falhou" });
  });
});

import { getFavoritosCliente, saveFavoritosCliente } from "@/lib/admin-horarios-helpers";

describe("getFavoritosCliente", () => {
  it("retorna lista de servico_ids para o cliente", async () => {
    getState().favoritosByCliente["cli-1"] = [{ servico_id: "s1" }, { servico_id: "s2" }];
    const result = await getFavoritosCliente("cli-1");
    expect(result).toEqual(["s1", "s2"]);
  });

  it("retorna vazio quando cliente nao tem favoritos", async () => {
    const result = await getFavoritosCliente("cli-sem-favs");
    expect(result).toEqual([]);
  });
});

describe("saveFavoritosCliente", () => {
  it("delete antigos e insere novos", async () => {
    await saveFavoritosCliente("cli-1", ["s1", "s2"]);
    const s = getState();
    expect(s.deletedFavoritosClienteIds).toEqual(["cli-1"]);
    expect(s.insertedFavoritosRows).toEqual([
      { cliente_id: "cli-1", servico_id: "s1" },
      { cliente_id: "cli-1", servico_id: "s2" },
    ]);
  });

  it("array vazio so deleta, nao insere", async () => {
    await saveFavoritosCliente("cli-1", []);
    const s = getState();
    expect(s.deletedFavoritosClienteIds).toEqual(["cli-1"]);
    expect(s.insertedFavoritosRows).toEqual([]);
  });
});
