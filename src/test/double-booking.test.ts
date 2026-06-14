import { describe, it, expect, vi, beforeEach } from "vitest";
import { SlotIndisponivelError } from "@/lib/supabase-helpers";

describe("SlotIndisponivelError", () => {
  it("é uma subclasse de Error com nome e mensagem corretos", () => {
    const err = new SlotIndisponivelError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("SlotIndisponivelError");
    expect(err.message).toMatch(/horário/i);
  });
});

vi.mock("@/integrations/supabase/client", () => {
  const state: any = { rpcError: null, rpcData: null, lastRpcCall: null };
  const client = {
    rpc: (name: string, params: any) => {
      state.lastRpcCall = { name, params };
      if (state.rpcError) return Promise.resolve({ data: null, error: state.rpcError });
      return Promise.resolve({ data: state.rpcData, error: null });
    },
    __state: state,
  };
  return { supabase: client };
});

import { supabase } from "@/integrations/supabase/client";
import { createAppointment } from "@/lib/supabase-helpers";

const getState = () => (supabase as any).__state;

beforeEach(() => {
  const s = getState();
  s.rpcError = null;
  s.rpcData = [{ agendamento_id: "ag-1", cancel_token: "token-1", cliente_id: "user-1" }];
  s.lastRpcCall = null;
});

describe("createAppointment", () => {
  it("chama a RPC criar_agendamento com os parametros corretos", async () => {
    await createAppointment("Joao", "21999999999", "2026-06-01", "10:00:00", ["srv-1"]);
    expect(getState().lastRpcCall).toEqual({
      name: "criar_agendamento",
      params: {
        _nome: "Joao",
        _telefone: "21999999999",
        _data: "2026-06-01",
        _horario: "10:00:00",
        _servico_ids: ["srv-1"],
      },
    });
  });

  it("retorna usuario e agendamento (incluindo cancel_token) a partir da RPC", async () => {
    const result = await createAppointment("Joao", "21999999999", "2026-06-01", "10:00:00", []);
    expect(result).toEqual({
      usuario: { id: "user-1" },
      agendamento: { id: "ag-1", cancel_token: "token-1" },
    });
  });

  it("lança SlotIndisponivelError quando a RPC retorna erro SLOT_INDISPONIVEL", async () => {
    getState().rpcError = { message: "SLOT_INDISPONIVEL" };
    await expect(
      createAppointment("Joao", "21999999999", "2026-06-01", "10:00:00", [])
    ).rejects.toBeInstanceOf(SlotIndisponivelError);
  });

  it("propaga outros erros da RPC sem transformar", async () => {
    getState().rpcError = { message: "connection refused" };
    await expect(
      createAppointment("Joao", "21999999999", "2026-06-01", "10:00:00", [])
    ).rejects.not.toBeInstanceOf(SlotIndisponivelError);
  });
});
