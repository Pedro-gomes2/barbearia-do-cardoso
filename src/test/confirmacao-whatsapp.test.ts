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
