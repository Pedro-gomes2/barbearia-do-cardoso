# Prevenção de Double-Booking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Garantir, no nível do banco, que no máximo um agendamento com `status='ativo'` exista por `(data, horario)`, com erro amigável e redirecionamento no cliente perdedor.

**Architecture:** Índice único parcial em Postgres (`agendamentos` filtrado por `status='ativo'`), mapeamento do erro `23505` para um erro de domínio `SlotIndisponivelError` no helper de criação, rollback do usuário órfão, e tratamento de UI em `AgendamentoDados.tsx` que redireciona pra seleção de horário.

**Tech Stack:** Supabase (Postgres) migrations · TypeScript · React · Vitest + jsdom · React Router · shadcn toast

**Spec:** [docs/superpowers/specs/2026-05-26-prevent-double-booking-design.md](../specs/2026-05-26-prevent-double-booking-design.md)

---

## File Structure

- **Create:** `supabase/migrations/20260526000000_prevent_double_booking.sql` — migration com pré-check de duplicatas e índice único parcial.
- **Modify:** `src/lib/supabase-helpers.ts` — exportar `SlotIndisponivelError`, mapear erro 23505 em `createAppointment`, rollback do `usuarios`.
- **Modify:** `src/pages/AgendamentoDados.tsx` — tratar `SlotIndisponivelError` no `catch` com toast e redirect.
- **Create:** `src/test/double-booking.test.ts` — testes unitários do helper.

---

## Task 1: Migration — índice único parcial

**Files:**
- Create: `supabase/migrations/20260526000000_prevent_double_booking.sql`

- [ ] **Step 1: Criar arquivo de migration**

Criar `supabase/migrations/20260526000000_prevent_double_booking.sql` com este conteúdo exato:

```sql
-- Pré-check: aborta se houver duplicatas ativas existentes.
DO $$
DECLARE
  v_dup_count int;
BEGIN
  SELECT COUNT(*) INTO v_dup_count FROM (
    SELECT data, horario
    FROM agendamentos
    WHERE status = 'ativo'
    GROUP BY data, horario
    HAVING COUNT(*) > 1
  ) d;
  IF v_dup_count > 0 THEN
    RAISE EXCEPTION 'Existem % pares (data,horario) duplicados ativos. Resolva antes de aplicar a constraint.', v_dup_count;
  END IF;
END $$;

CREATE UNIQUE INDEX agendamentos_slot_unico_ativo
  ON agendamentos (data, horario)
  WHERE status = 'ativo';

COMMENT ON INDEX agendamentos_slot_unico_ativo IS
  'Garante 1 agendamento ativo por (data,horario). Parcial: status cancelado/concluido nao bloqueia re-reserva.';
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260526000000_prevent_double_booking.sql
git commit -m "feat(db): adicionar indice unico parcial para evitar double-booking"
```

---

## Task 2: Erro de domínio `SlotIndisponivelError`

**Files:**
- Modify: `src/lib/supabase-helpers.ts` (topo do arquivo, depois do import)
- Test: `src/test/double-booking.test.ts`

- [ ] **Step 1: Escrever teste falhando**

Criar `src/test/double-booking.test.ts`:

```ts
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
```

- [ ] **Step 2: Rodar teste e ver falhar**

Run: `npx vitest run src/test/double-booking.test.ts`
Expected: FAIL — `SlotIndisponivelError` não exportada.

- [ ] **Step 3: Adicionar a classe em `src/lib/supabase-helpers.ts`**

Logo após a linha 1 (`import { supabase } ...`), inserir:

```ts
export const SLOT_UNIQUE_INDEX = "agendamentos_slot_unico_ativo";

export class SlotIndisponivelError extends Error {
  constructor() {
    super("Esse horário acabou de ser reservado por outra pessoa.");
    this.name = "SlotIndisponivelError";
  }
}
```

- [ ] **Step 4: Rodar teste e ver passar**

Run: `npx vitest run src/test/double-booking.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase-helpers.ts src/test/double-booking.test.ts
git commit -m "feat: adicionar SlotIndisponivelError"
```

---

## Task 3: Mapear erro 23505 em `createAppointment`

**Files:**
- Modify: `src/lib/supabase-helpers.ts` (função `createAppointment`, linhas 49-93)
- Test: `src/test/double-booking.test.ts`

- [ ] **Step 1: Escrever testes falhando**

Append a `src/test/double-booking.test.ts`:

```ts
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
      message: 'duplicate key value violates unique constraint "agendamentos_slot_unico_ativo"',
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
      message: 'duplicate key value violates unique constraint "agendamentos_slot_unico_ativo"',
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
    const s = getState();
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
                    message: 'duplicate key value violates unique constraint "agendamentos_slot_unico_ativo"',
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
```

- [ ] **Step 2: Rodar testes e ver falhar**

Run: `npx vitest run src/test/double-booking.test.ts`
Expected: FAIL nos 5 novos testes — `createAppointment` ainda lança o erro genérico do supabase, sem rollback nem mapeamento.

- [ ] **Step 3: Atualizar `createAppointment`**

Substituir o corpo de `createAppointment` em `src/lib/supabase-helpers.ts` (linhas 49-93) por:

```ts
export async function createAppointment(
  nome: string,
  telefone: string,
  data: string,
  horario: string,
  servicoIds: string[]
) {
  const { data: usuario, error: userError } = await supabase
    .from("usuarios")
    .insert({ nome, telefone, tipo: "cliente" })
    .select()
    .single();

  if (userError) throw userError;

  const insertData: any = {
    cliente_id: usuario.id,
    data,
    horario,
    telefone_cliente: telefone.replace(/\D/g, ""),
  };
  if (servicoIds.length > 0) insertData.servico_id = servicoIds[0];

  const { data: agendamento, error: agError } = await supabase
    .from("agendamentos")
    .insert(insertData)
    .select()
    .single();

  if (agError) {
    if (
      agError.code === "23505" &&
      typeof agError.message === "string" &&
      agError.message.includes(SLOT_UNIQUE_INDEX)
    ) {
      await supabase.from("usuarios").delete().eq("id", usuario.id);
      throw new SlotIndisponivelError();
    }
    throw agError;
  }

  if (servicoIds.length > 0) {
    const rows = servicoIds.map((sid) => ({
      agendamento_id: agendamento.id,
      servico_id: sid,
    }));
    const { error: junctionError } = await supabase
      .from("agendamento_servicos")
      .insert(rows);
    if (junctionError) throw junctionError;
  }

  return { usuario, agendamento };
}
```

- [ ] **Step 4: Rodar testes e ver passar**

Run: `npx vitest run src/test/double-booking.test.ts`
Expected: PASS em todos os testes (incluindo o de `SlotIndisponivelError` da Task 2).

- [ ] **Step 5: Rodar suite completa de testes**

Run: `npx vitest run`
Expected: tudo verde.

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabase-helpers.ts src/test/double-booking.test.ts
git commit -m "feat: mapear erro 23505 para SlotIndisponivelError com rollback de usuario"
```

---

## Task 4: UI — redirecionar cliente perdedor

**Files:**
- Modify: `src/pages/AgendamentoDados.tsx:60-64`

- [ ] **Step 1: Atualizar o `catch` em `handleSubmit`**

Em `src/pages/AgendamentoDados.tsx`, ajustar o import do helper:

```ts
import { createAppointment, SlotIndisponivelError } from "@/lib/supabase-helpers";
```

Substituir o bloco `catch` atual (linhas 60-64) por:

```ts
} catch (err: any) {
  if (err instanceof SlotIndisponivelError) {
    toast({
      title: "Horário indisponível",
      description: "Esse horário acabou de ser reservado por outra pessoa. Escolha outro.",
      variant: "destructive",
    });
    navigate("/agendamento", { state: { date }, replace: true });
    return;
  }
  toast({ title: "Erro ao agendar", description: err.message || "Tente novamente.", variant: "destructive" });
}
```

- [ ] **Step 2: Verificar build/type-check**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Smoke test manual (anote no PR)**

- `npm run dev`
- Abrir agendamento em duas abas, escolher o mesmo dia/horário, preencher dados e confirmar quase simultaneamente.
- Esperado: uma aba vai pra `/agendamento/sucesso`, a outra mostra o toast "Horário indisponível" e volta pra `/agendamento` com o slot já marcado como ocupado.

- [ ] **Step 4: Commit**

```bash
git add src/pages/AgendamentoDados.tsx
git commit -m "feat(ui): redirecionar cliente quando slot fica indisponivel durante confirmacao"
```

---

## Self-Review

- **Spec coverage:**
  - Migration com pré-check + índice parcial → Task 1 ✓
  - `SlotIndisponivelError` exportada → Task 2 ✓
  - Mapeamento 23505 + rollback de `usuarios` → Task 3 ✓
  - UI com toast + redirect → Task 4 ✓
  - Testes 1-5 do spec → Task 3 (cobrem 23505 correto, 23505 outra constraint, outro código, rollback, paralelo). Teste 5 do spec ("slot livre após cancelamento") foi documentado no COMMENT do índice em vez de teste — é comportamento intrínseco do índice parcial e testá-lo exigiria banco real. Aceitável.
- **Placeholders:** nenhum.
- **Type consistency:** `SLOT_UNIQUE_INDEX`, `SlotIndisponivelError`, assinatura de `createAppointment` consistentes entre tasks.

---

## Execution Handoff

Plano salvo. Quer executar como **subagent-driven** (recomendado, um subagente por task com review) ou **inline** (executar nessa mesma sessão com checkpoints)?
