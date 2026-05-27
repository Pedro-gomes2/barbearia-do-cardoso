import { describe, it, expect } from "vitest";
import { normalizarTelefone } from "./telefone";

describe("normalizarTelefone", () => {
  it("remove máscara comum", () => {
    expect(normalizarTelefone("(21) 99999-8888")).toBe("21999998888");
  });

  it("aceita só dígitos", () => {
    expect(normalizarTelefone("21999998888")).toBe("21999998888");
  });

  it("remove DDI 55 com 13 dígitos (celular)", () => {
    expect(normalizarTelefone("+55 21 99999-8888")).toBe("21999998888");
    expect(normalizarTelefone("5521999998888")).toBe("21999998888");
  });

  it("remove DDI 55 com 12 dígitos (fixo)", () => {
    expect(normalizarTelefone("552133334444")).toBe("2133334444");
  });

  it("não remove 55 quando o número tem 10 ou 11 dígitos (DDD 55)", () => {
    expect(normalizarTelefone("55999998888")).toBe("55999998888");
    expect(normalizarTelefone("5533334444")).toBe("5533334444");
  });

  it("vazio/nulo retorna string vazia", () => {
    expect(normalizarTelefone("")).toBe("");
    expect(normalizarTelefone(null)).toBe("");
    expect(normalizarTelefone(undefined)).toBe("");
  });
});
