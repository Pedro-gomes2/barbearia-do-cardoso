import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/integrations/supabase/client", () => {
  const state: any = {
    rpcError: null,
    rpcData: null,
    lastRpcCall: null,
    planosData: [] as any[],
    planoServicosData: [] as any[],
  };
  const client = {
    rpc: (name: string, params: any) => {
      state.lastRpcCall = { name, params };
      if (state.rpcError) return Promise.resolve({ data: null, error: state.rpcError });
      return Promise.resolve({ data: state.rpcData, error: null });
    },
    from: (table: string) => {
      if (table === "planos") {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({ data: state.planosData, error: null }),
            }),
          }),
        };
      }
      if (table === "plano_servicos") {
        return {
          select: () => ({
            in: async () => ({ data: state.planoServicosData, error: null }),
          }),
          delete: () => ({
            eq: (_col: string, planoId: string) => {
              state.deletedPlanoServicosIds = state.deletedPlanoServicosIds || [];
              state.deletedPlanoServicosIds.push(planoId);
              return Promise.resolve({ error: null });
            },
          }),
          insert: async (rows: any[]) => {
            state.insertedPlanoServicosRows = state.insertedPlanoServicosRows || [];
            state.insertedPlanoServicosRows.push(...rows);
            return { error: null };
          },
        };
      }
      return {};
    },
    __state: state,
  };
  return { supabase: client };
});

import { supabase } from "@/integrations/supabase/client";
import {
  solicitarPlano,
  AssinaturaExistenteError,
  getPlanoAtivoPorTelefone,
  listPlanosPublicos,
} from "@/lib/planos-helpers";

const getState = () => (supabase as any).__state;

beforeEach(() => {
  const s = getState();
  s.rpcError = null;
  s.rpcData = null;
  s.lastRpcCall = null;
  s.planosData = [];
  s.planoServicosData = [];
  s.deletedPlanoServicosIds = undefined;
  s.insertedPlanoServicosRows = undefined;
});

describe("solicitarPlano", () => {
  it("chama a RPC solicitar_plano com os parametros corretos e retorna o id", async () => {
    getState().rpcData = "assinatura-1";
    const id = await solicitarPlano("Joao", "21999999999", "plano-1");
    expect(getState().lastRpcCall).toEqual({
      name: "solicitar_plano",
      params: { _nome: "Joao", _telefone: "21999999999", _plano_id: "plano-1" },
    });
    expect(id).toBe("assinatura-1");
  });

  it("mapeia erro ASSINATURA_EXISTENTE para AssinaturaExistenteError", async () => {
    getState().rpcError = { message: "ASSINATURA_EXISTENTE" };
    await expect(solicitarPlano("Joao", "21999999999", "plano-1")).rejects.toBeInstanceOf(
      AssinaturaExistenteError
    );
  });
});

describe("getPlanoAtivoPorTelefone", () => {
  it("retorna null quando a RPC nao retorna linha", async () => {
    getState().rpcData = [];
    const result = await getPlanoAtivoPorTelefone("21999999999");
    expect(result).toBeNull();
  });

  it("mapeia a linha retornada para o formato camelCase", async () => {
    getState().rpcData = [
      {
        assinatura_id: "ass-1",
        plano_nome: "Corte e Barba",
        creditos_restantes: 3,
        expira_em: "2026-11-01T00:00:00Z",
        servico_ids: ["s1", "s2"],
      },
    ];
    const result = await getPlanoAtivoPorTelefone("21999999999");
    expect(result).toEqual({
      assinaturaId: "ass-1",
      planoNome: "Corte e Barba",
      creditosRestantes: 3,
      expiraEm: "2026-11-01T00:00:00Z",
      servicoIds: ["s1", "s2"],
    });
  });
});

describe("listPlanosPublicos", () => {
  it("junta planos ativos com seus servico_ids", async () => {
    getState().planosData = [{ id: "p1", nome: "Corte", preco: "94.99" }];
    getState().planoServicosData = [{ plano_id: "p1", servico_id: "srv-corte" }];
    const result = await listPlanosPublicos();
    expect(result).toEqual([
      { id: "p1", nome: "Corte", preco: 94.99, servico_ids: ["srv-corte"] },
    ]);
  });

  it("retorna array vazio sem chamar plano_servicos quando nao ha planos", async () => {
    getState().planosData = [];
    const result = await listPlanosPublicos();
    expect(result).toEqual([]);
  });
});

import { setPlanoServicos, aprovarPlano, rejeitarPlano } from "@/lib/planos-helpers";

describe("setPlanoServicos", () => {
  it("deleta vinculos antigos e insere os novos", async () => {
    await setPlanoServicos("plano-1", ["s1", "s2"]);
    const s = getState();
    expect(s.deletedPlanoServicosIds).toEqual(["plano-1"]);
    expect(s.insertedPlanoServicosRows).toEqual([
      { plano_id: "plano-1", servico_id: "s1" },
      { plano_id: "plano-1", servico_id: "s2" },
    ]);
  });

  it("array vazio so deleta, nao insere", async () => {
    await setPlanoServicos("plano-1", []);
    const s = getState();
    expect(s.deletedPlanoServicosIds).toEqual(["plano-1"]);
    expect(s.insertedPlanoServicosRows).toBeUndefined();
  });
});

describe("aprovarPlano / rejeitarPlano", () => {
  it("aprovarPlano chama a RPC aprovar_plano com o id certo", async () => {
    await aprovarPlano("ass-1");
    expect(getState().lastRpcCall).toEqual({ name: "aprovar_plano", params: { _assinatura_id: "ass-1" } });
  });

  it("rejeitarPlano chama a RPC rejeitar_plano com o id certo", async () => {
    await rejeitarPlano("ass-1");
    expect(getState().lastRpcCall).toEqual({ name: "rejeitar_plano", params: { _assinatura_id: "ass-1" } });
  });
});
