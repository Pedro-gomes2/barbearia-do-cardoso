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
