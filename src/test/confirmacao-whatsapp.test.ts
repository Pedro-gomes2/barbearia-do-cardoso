import { describe, it, expect } from "vitest";
import {
  buildWhatsappConfirmMessage,
  buildWhatsappConfirmUrl,
  buildLembreteMessage,
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

describe("buildLembreteMessage", () => {
  it("monta mensagem de lembrete com nome, data e horario formatados", () => {
    const msg = buildLembreteMessage({
      nome: "Joao Silva",
      data: "2026-06-15",
      horario: "10:30:00",
    });
    expect(msg).toBe(
      "Olá, Joao Silva. Sou da Barbearia Cardoso. Passando para lembrar do seu Agendamento 15 de junho às 10:30. Por favor, não se atrase, até logo."
    );
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

import { vi, beforeEach, afterEach } from "vitest";

vi.mock("@/integrations/supabase/client", () => {
  const client = { from: () => ({}), rpc: () => Promise.resolve({ data: null, error: null }) };
  return { supabase: client };
});

import { supabase } from "@/integrations/supabase/client";

describe("getAvailableSlots - cleanup e pendente como ocupado", () => {
  let originalFrom: typeof supabase.from;
  let originalRpc: typeof supabase.rpc;
  beforeEach(() => {
    originalFrom = supabase.from.bind(supabase);
    originalRpc = supabase.rpc.bind(supabase);
  });
  afterEach(() => {
    (supabase as any).from = originalFrom;
    (supabase as any).rpc = originalRpc;
  });

  it("chama RPC expire_pending_agendamentos antes da consulta", async () => {
    const rpcCalls: string[] = [];
    (supabase as any).rpc = (name: string) => {
      rpcCalls.push(name);
      if (name === "get_occupied_intervals") return Promise.resolve({ data: [], error: null });
      return Promise.resolve({ data: null, error: null });
    };
    (supabase as any).from = (table: string) => {
      if (table === "configuracoes_agenda" || table === "horarios_customizados" || table === "horarios_data") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => Promise.resolve({ data: [] }),
              }),
              single: async () => ({ data: { ativo: true, hora_inicio: "08:00:00", hora_fim: "20:00:00" } }),
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
    await getAvailableSlots("2026-06-15");
    expect(rpcCalls).toContain("expire_pending_agendamentos");
    expect(rpcCalls).toContain("get_occupied_intervals");
  });

  it("trata agendamento pendente como ocupado", async () => {
    (supabase as any).rpc = (name: string) => {
      if (name === "get_occupied_intervals") {
        return Promise.resolve({ data: [{ horario: "10:00:00", duracao_minutos: 15 }], error: null });
      }
      return Promise.resolve({ data: null, error: null });
    };
    (supabase as any).from = (table: string) => {
      if (table === "configuracoes_agenda") {
        return {
          select: () => ({
            eq: () => ({ single: async () => ({ data: { ativo: true, hora_inicio: "08:00:00", hora_fim: "20:00:00" } }) }),
          }),
        };
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
      if (table === "horarios_data") {
        return { select: () => ({ eq: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [] }) }) }) }) };
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
