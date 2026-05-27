import { describe, it, expect } from "vitest";
import { mapAgendamentoToSlot } from "@/lib/admin-horarios-helpers";

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
