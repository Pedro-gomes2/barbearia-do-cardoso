import { describe, it, expect } from "vitest";
import { SlotIndisponivelError } from "@/lib/supabase-helpers";

describe("SlotIndisponivelError", () => {
  it("é uma subclasse de Error com nome e mensagem corretos", () => {
    const err = new SlotIndisponivelError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("SlotIndisponivelError");
    expect(err.message).toMatch(/horário/i);
  });
});

import { vi, beforeEach } from "vitest";
import { createAppointment } from "@/lib/supabase-helpers";

vi.mock("@/integrations/supabase/client", () => {
  const state: any = { agendamentoError: null, usuarioId: "user-1", deletedUserIds: [] };
  const client = {
    from: (table: string) => {
      if (table === "usuarios") {
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({ data: { id: state.usuarioId }, error: null }),
            }),
          }),
          delete: () => ({
            eq: (_col: string, id: string) => {
              state.deletedUserIds.push(id);
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      if (table === "agendamentos") {
        return {
          insert: () => ({
            select: () => ({
              single: async () =>
                state.agendamentoError
                  ? { data: null, error: state.agendamentoError }
                  : { data: { id: "ag-1" }, error: null },
            }),
          }),
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

beforeEach(() => {
  const s = getState();
  s.agendamentoError = null;
  s.deletedUserIds = [];
  s.usuarioId = "user-" + Math.random().toString(36).slice(2, 8);
});

describe("createAppointment - erro de slot ocupado", () => {
  it("lança SlotIndisponivelError quando erro 23505 referencia o indice de slot", async () => {
    getState().agendamentoError = {
      code: "23505",
      message: 'duplicate key value violates unique constraint "agendamentos_unique_slot_active"',
    };
    await expect(
      createAppointment("Joao", "21999999999", "2026-06-01", "10:00:00", [])
    ).rejects.toBeInstanceOf(SlotIndisponivelError);
  });

  it("faz rollback do usuario criado quando slot esta ocupado", async () => {
    const s = getState();
    s.usuarioId = "user-rollback";
    s.agendamentoError = {
      code: "23505",
      message: 'duplicate key value violates unique constraint "agendamentos_unique_slot_active"',
    };
    await expect(
      createAppointment("Joao", "21999999999", "2026-06-01", "10:00:00", [])
    ).rejects.toBeInstanceOf(SlotIndisponivelError);
    expect(s.deletedUserIds).toContain("user-rollback");
  });

  it("propaga erro original quando 23505 vem de outra constraint", async () => {
    getState().agendamentoError = {
      code: "23505",
      message: 'duplicate key value violates unique constraint "outro_indice"',
    };
    await expect(
      createAppointment("Joao", "21999999999", "2026-06-01", "10:00:00", [])
    ).rejects.not.toBeInstanceOf(SlotIndisponivelError);
  });

  it("propaga erro original em outros codigos (ex 23503)", async () => {
    getState().agendamentoError = { code: "23503", message: "foreign key" };
    await expect(
      createAppointment("Joao", "21999999999", "2026-06-01", "10:00:00", [])
    ).rejects.not.toBeInstanceOf(SlotIndisponivelError);
  });

  it("duas chamadas paralelas: primeira passa, segunda lança SlotIndisponivelError", async () => {
    let callCount = 0;
    const originalFrom = supabase.from.bind(supabase);
    (supabase as any).from = (table: string) => {
      if (table === "agendamentos") {
        return {
          insert: () => ({
            select: () => ({
              single: async () => {
                callCount += 1;
                if (callCount === 1) return { data: { id: "ag-ok" }, error: null };
                return {
                  data: null,
                  error: {
                    code: "23505",
                    message: 'duplicate key value violates unique constraint "agendamentos_unique_slot_active"',
                  },
                };
              },
            }),
          }),
        };
      }
      return originalFrom(table);
    };

    const [r1, r2] = await Promise.allSettled([
      createAppointment("A", "21999999991", "2026-06-01", "10:00:00", []),
      createAppointment("B", "21999999992", "2026-06-01", "10:00:00", []),
    ]);
    expect(r1.status).toBe("fulfilled");
    expect(r2.status).toBe("rejected");
    if (r2.status === "rejected") expect(r2.reason).toBeInstanceOf(SlotIndisponivelError);

    (supabase as any).from = originalFrom;
  });
});
