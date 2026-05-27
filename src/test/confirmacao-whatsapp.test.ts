import { describe, it, expect } from "vitest";
import {
  buildWhatsappConfirmMessage,
  buildWhatsappConfirmUrl,
} from "@/lib/confirmacao-helpers";

describe("buildWhatsappConfirmMessage", () => {
  it("formata data, horario, nome e CSV de servicos", () => {
    const msg = buildWhatsappConfirmMessage({
      nome: "Joao Silva",
      data: "2026-06-15",
      horario: "10:30:00",
      servicos: ["Corte", "Barba"],
    });
    expect(msg).toContain("Joao Silva");
    expect(msg).toContain("10:30");
    expect(msg).toContain("Corte, Barba");
    expect(msg).toMatch(/15 de junho de 2026/i);
    expect(msg).toMatch(/confirme/i);
  });

  it("omite trecho de servicos quando lista vazia", () => {
    const msg = buildWhatsappConfirmMessage({
      nome: "Maria",
      data: "2026-06-15",
      horario: "10:30:00",
      servicos: [],
    });
    expect(msg).not.toMatch(/servi[cç]o/i);
    expect(msg).toContain("Maria");
  });
});

describe("buildWhatsappConfirmUrl", () => {
  it("normaliza telefone com 55 e URL-encoda a mensagem", () => {
    const url = buildWhatsappConfirmUrl("(21) 99532-3454", "ola mundo & cia");
    expect(url).toBe("https://wa.me/5521995323454?text=ola%20mundo%20%26%20cia");
  });

  it("nao duplica o 55 quando ja presente", () => {
    const url = buildWhatsappConfirmUrl("5521995323454", "x");
    expect(url).toBe("https://wa.me/5521995323454?text=x");
  });
});

import { vi, beforeEach } from "vitest";
import { createAppointment } from "@/lib/supabase-helpers";

vi.mock("@/integrations/supabase/client", () => {
  const state: any = { lastAgendamentoInsert: null };
  const client = {
    from: (table: string) => {
      if (table === "usuarios") {
        return {
          insert: () => ({
            select: () => ({ single: async () => ({ data: { id: "u-1" }, error: null }) }),
          }),
          delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }
      if (table === "agendamentos") {
        return {
          insert: (payload: any) => {
            state.lastAgendamentoInsert = payload;
            return {
              select: () => ({ single: async () => ({ data: { id: "ag-1" }, error: null }) }),
            };
          },
        };
      }
      if (table === "agendamento_servicos") {
        return { insert: async () => ({ error: null }) };
      }
      return {};
    },
    __state: state,
  };
  return { supabase: client };
});

import { supabase } from "@/integrations/supabase/client";
const getState = () => (supabase as any).__state;

beforeEach(() => { getState().lastAgendamentoInsert = null; });

describe("getAvailableSlots - cleanup e pendente como ocupado", () => {
  let originalFrom: typeof supabase.from;
  beforeEach(() => { originalFrom = supabase.from.bind(supabase); });
  afterEach(() => { (supabase as any).from = originalFrom; delete (supabase as any).rpc; });

  it("chama RPC expire_pending_agendamentos antes da consulta", async () => {
    const rpcCalls: string[] = [];
    (supabase as any).rpc = (name: string) => {
      rpcCalls.push(name);
      return Promise.resolve({ error: null });
    };
    (supabase as any).from = (table: string) => {
      if (table === "configuracoes_agenda" || table === "horarios_customizados") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => Promise.resolve({ data: [] }),
                single: async () => ({ data: { ativo: true } }),
              }),
              single: async () => ({ data: { ativo: true } }),
            }),
          }),
        };
      }
      if (table === "agendamentos" || table === "bloqueios") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ data: [] }),
              in: () => Promise.resolve({ data: [] }),
            }),
          }),
        };
      }
      return originalFrom(table);
    };

    const { getAvailableSlots } = await import("@/lib/supabase-helpers");
    await getAvailableSlots("2026-06-15");
    expect(rpcCalls).toContain("expire_pending_agendamentos");
  });

  it("trata agendamento pendente como ocupado", async () => {
    (supabase as any).rpc = () => Promise.resolve({ error: null });
    (supabase as any).from = (table: string) => {
      if (table === "configuracoes_agenda") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { ativo: true } }) }) }) };
      }
      if (table === "horarios_customizados") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ order: () => Promise.resolve({ data: [{ horario: "10:00:00" }] }) }),
            }),
          }),
        };
      }
      if (table === "agendamentos") {
        return {
          select: () => ({
            eq: () => ({
              in: () => Promise.resolve({ data: [{ horario: "10:00:00" }] }),
            }),
          }),
        };
      }
      if (table === "bloqueios") {
        return { select: () => ({ eq: () => Promise.resolve({ data: [] }) }) };
      }
      return {};
    };

    const { getAvailableSlots } = await import("@/lib/supabase-helpers");
    const slots = await getAvailableSlots("2026-06-15");
    expect(slots).toEqual([{ time: "10:00:00", available: false }]);
  });
});

describe("createAppointment - status pendente + expira_em", () => {
  it("insere com status pendente", async () => {
    await createAppointment("Joao", "21999999999", "2026-06-15", "10:30:00", []);
    expect(getState().lastAgendamentoInsert.status).toBe("pendente");
  });

  it("define expira_em ~30 min no futuro", async () => {
    const before = Date.now();
    await createAppointment("Joao", "21999999999", "2026-06-15", "10:30:00", []);
    const after = Date.now();
    const expiraMs = new Date(getState().lastAgendamentoInsert.expira_em).getTime();
    expect(expiraMs).toBeGreaterThanOrEqual(before + 30 * 60 * 1000 - 5000);
    expect(expiraMs).toBeLessThanOrEqual(after + 30 * 60 * 1000 + 5000);
  });
});
