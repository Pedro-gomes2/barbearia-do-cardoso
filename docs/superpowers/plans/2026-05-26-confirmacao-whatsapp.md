# Confirmação obrigatória via WhatsApp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agendamentos novos nascem `pendente` com expiração de 30 min, bloqueiam o slot, exigem que o cliente abra o WhatsApp do admin, e o admin confirma na agenda; slot expirado é liberado automaticamente.

**Architecture:** Novo valor `pendente` no enum `agendamento_status` + coluna `expira_em`; índice único existente passa a cobrir pendente+ativo; função SQL `expire_pending_agendamentos()` é chamada via RPC antes de consultas críticas (cleanup-on-read). Helpers TS encapsulam o WhatsApp URL/mensagem e a confirmação/cancelamento. UI: banner na página de sucesso, destaque na AdminAgenda e badge contador na sidebar.

**Tech Stack:** Supabase Postgres + RPC, TypeScript, React, @tanstack/react-query, Vitest + jsdom.

**Spec:** [docs/superpowers/specs/2026-05-26-confirmacao-whatsapp-design.md](../specs/2026-05-26-confirmacao-whatsapp-design.md)

---

## File Structure

- **Create:** `supabase/migrations/20260527000000_confirmacao_pendente.sql`
- **Create:** `src/lib/confirmacao-helpers.ts` (helpers + hook)
- **Create:** `src/test/confirmacao-whatsapp.test.ts`
- **Modify:** `src/lib/supabase-helpers.ts` (createAppointment + getAvailableSlots)
- **Modify:** `src/pages/AgendamentoSucesso.tsx` (banner pendente + texto da mensagem)
- **Modify:** `src/pages/AdminAgenda.tsx` (destaque pendentes + botão Confirmar)
- **Modify:** `src/components/AdminSidebar.tsx` (badge contador)

---

## Task 1: Migration — status pendente + expira_em + função expirar

**Files:**
- Create: `supabase/migrations/20260527000000_confirmacao_pendente.sql`

- [ ] **Step 1: Criar a migration**

Criar `supabase/migrations/20260527000000_confirmacao_pendente.sql` com:

```sql
-- 1) Adiciona valor pendente ao enum
ALTER TYPE agendamento_status ADD VALUE IF NOT EXISTS 'pendente' BEFORE 'ativo';

-- 2) Coluna de expiração
ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS expira_em timestamptz;

-- 3) Atualiza o indice unico para cobrir pendente + ativo (mesmos slots bloqueiam)
DROP INDEX IF EXISTS public.agendamentos_unique_slot_active;
CREATE UNIQUE INDEX agendamentos_unique_slot_active
  ON public.agendamentos (data, horario)
  WHERE status IN ('pendente', 'ativo');

-- 4) Funcao que expira pendentes vencidos
CREATE OR REPLACE FUNCTION public.expire_pending_agendamentos() RETURNS void AS $$
  UPDATE public.agendamentos
    SET status = 'cancelado'
    WHERE status = 'pendente' AND expira_em < now();
$$ LANGUAGE sql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.expire_pending_agendamentos() TO anon, authenticated;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260527000000_confirmacao_pendente.sql
git commit -m "feat(db): adicionar status pendente, expira_em e funcao de expirar"
```

---

## Task 2: Helpers + hook `confirmacao-helpers.ts`

**Files:**
- Create: `src/lib/confirmacao-helpers.ts`
- Create: `src/test/confirmacao-whatsapp.test.ts`

- [ ] **Step 1: Criar arquivo de testes inicial**

Criar `src/test/confirmacao-whatsapp.test.ts` com:

```ts
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/test/confirmacao-whatsapp.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Criar `src/lib/confirmacao-helpers.ts`**

```ts
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type WhatsappMsgInput = {
  nome: string;
  data: string;
  horario: string;
  servicos: string[];
};

export function buildWhatsappConfirmMessage(input: WhatsappMsgInput): string {
  const dataDisplay = format(parse(input.data, "yyyy-MM-dd", new Date()), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  const horarioDisplay = input.horario.slice(0, 5);
  const lines = [
    `Olá! Acabei de agendar para ${dataDisplay} às ${horarioDisplay}.`,
    `Nome: ${input.nome}.`,
  ];
  if (input.servicos.length > 0) {
    lines.push(`Serviço(s): ${input.servicos.join(", ")}.`);
  }
  lines.push("Por favor confirme meu horário.");
  return lines.join(" ");
}

export function buildWhatsappConfirmUrl(adminPhone: string, msg: string): string {
  const digits = adminPhone.replace(/\D/g, "");
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(msg)}`;
}

export async function confirmAgendamento(id: string): Promise<void> {
  const { error } = await supabase
    .from("agendamentos")
    .update({ status: "ativo", expira_em: null })
    .eq("id", id);
  if (error) throw error;
}

export async function cancelAgendamentoAdmin(id: string): Promise<void> {
  const { error } = await supabase
    .from("agendamentos")
    .update({ status: "cancelado" })
    .eq("id", id);
  if (error) throw error;
}

export function usePendentesCount(): { count: number; loading: boolean } {
  const { data = 0, isLoading } = useQuery({
    queryKey: ["pendentes-count"],
    queryFn: async () => {
      await supabase.rpc("expire_pending_agendamentos");
      const { count } = await supabase
        .from("agendamentos")
        .select("id", { count: "exact", head: true })
        .eq("status", "pendente");
      return count ?? 0;
    },
    refetchInterval: 30_000,
  });
  return { count: data, loading: isLoading };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/test/confirmacao-whatsapp.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/confirmacao-helpers.ts src/test/confirmacao-whatsapp.test.ts
git commit -m "feat: helpers de mensagem/URL whatsapp e usePendentesCount"
```

---

## Task 3: `createAppointment` cria pendente com `expira_em`

**Files:**
- Modify: `src/lib/supabase-helpers.ts` (função `createAppointment`)
- Modify: `src/test/confirmacao-whatsapp.test.ts`

- [ ] **Step 1: Append teste falhando ao arquivo de testes**

Adicionar ao final de `src/test/confirmacao-whatsapp.test.ts`:

```ts
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/test/confirmacao-whatsapp.test.ts`
Expected: FAIL nos 2 novos testes.

- [ ] **Step 3: Modificar `createAppointment` em `src/lib/supabase-helpers.ts`**

Localizar o objeto `insertData` dentro de `createAppointment` (atualmente algo como):

```ts
  const insertData: any = {
    cliente_id: usuario.id,
    data,
    horario,
    telefone_cliente: telefone.replace(/\D/g, ""),
  };
```

Substituir por:

```ts
  const insertData: any = {
    cliente_id: usuario.id,
    data,
    horario,
    telefone_cliente: telefone.replace(/\D/g, ""),
    status: "pendente",
    expira_em: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run`
Expected: tudo verde (incluindo testes antigos de double-booking).

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase-helpers.ts src/test/confirmacao-whatsapp.test.ts
git commit -m "feat: agendamento nasce como pendente com expira_em em 30 min"
```

---

## Task 4: `getAvailableSlots` chama expire RPC + considera pendente

**Files:**
- Modify: `src/lib/supabase-helpers.ts` (função `getAvailableSlots`)
- Modify: `src/test/confirmacao-whatsapp.test.ts`

- [ ] **Step 1: Append testes falhando**

Append ao `src/test/confirmacao-whatsapp.test.ts`:

```ts
describe("getAvailableSlots - cleanup e pendente como ocupado", () => {
  it("chama RPC expire_pending_agendamentos antes da consulta", async () => {
    const rpcCalls: string[] = [];
    const originalFrom = supabase.from.bind(supabase);
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
    // Mock: 1 horario customizado as 10:00, 1 agendamento pendente as 10:00
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/test/confirmacao-whatsapp.test.ts`
Expected: FAIL nos 2 novos testes.

- [ ] **Step 3: Modificar `getAvailableSlots` em `src/lib/supabase-helpers.ts`**

Encontrar a função atual (começa em ~`export async function getAvailableSlots`). No início (antes de qualquer outra chamada), adicionar a chamada RPC. E mudar o filtro de status do select de `agendamentos` de `.eq("status", "ativo")` para `.in("status", ["pendente", "ativo"])`.

A função fica:

```ts
export async function getAvailableSlots(date: string) {
  await supabase.rpc("expire_pending_agendamentos");

  const dayOfWeek = new Date(date + "T12:00:00").getDay();

  const { data: config } = await supabase
    .from("configuracoes_agenda")
    .select("ativo")
    .eq("dia_semana", dayOfWeek)
    .single();

  if (config && !config.ativo) {
    return [];
  }

  const { data: customSlots } = await supabase
    .from("horarios_customizados")
    .select("horario")
    .eq("dia_semana", dayOfWeek)
    .eq("ativo", true)
    .order("horario");

  let slots: string[] = [];
  if (customSlots && customSlots.length > 0) {
    slots = customSlots.map((s) => s.horario);
  } else {
    return [];
  }

  const [{ data: booked }, { data: blocked }] = await Promise.all([
    supabase.from("agendamentos").select("horario").eq("data", date).in("status", ["pendente", "ativo"]),
    supabase.from("bloqueios").select("horario").eq("data", date),
  ]);

  const bookedSet = new Set((booked || []).map((b: any) => b.horario));
  const blockedSet = new Set((blocked || []).map((b: any) => b.horario));

  return slots.map((slot) => ({
    time: slot,
    available: !bookedSet.has(slot) && !blockedSet.has(slot),
  }));
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run`
Expected: tudo verde.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase-helpers.ts src/test/confirmacao-whatsapp.test.ts
git commit -m "feat: expirar pendentes e considerar pendente como slot ocupado"
```

---

## Task 5: `AgendamentoSucesso` — banner pendente + mensagem nova

**Files:**
- Modify: `src/pages/AgendamentoSucesso.tsx`

- [ ] **Step 1: Atualizar texto e banner**

No arquivo, localizar a linha do subtítulo (`"Confirme pelo WhatsApp para garantir seu horário"`) e o bloco que monta `messageText`. Fazer:

A) Substituir o subtítulo:

```tsx
<p className="text-muted-foreground font-body text-sm">
  Atendimento ainda <strong>NÃO confirmado</strong>. Envie a mensagem ao barbeiro pelo WhatsApp em até <strong>30 minutos</strong> para garantir seu horário.
</p>
```

B) Acima do "Resumo" (logo abaixo do bloco do CheckCircle/h2), adicionar um banner amarelo:

```tsx
<div className="bg-yellow-50 border border-yellow-300 rounded-xl p-4 flex gap-3 items-start">
  <AlertCircle className="h-5 w-5 text-yellow-700 flex-shrink-0 mt-0.5" />
  <p className="font-body text-sm text-yellow-900">
    Seu horário está <strong>pendente</strong> e expira em 30 minutos se não houver confirmação pelo WhatsApp.
  </p>
</div>
```

(O ícone `AlertCircle` já está nos imports.)

C) Trocar o import existente `import { createAppointment } ...` em `AgendamentoDados.tsx`? Não — não tocar nada lá nesta task.

D) Substituir a construção de `messageText`. Localizar o bloco:

```ts
  const servicosText = (servicos || []).map((s) => s.nome).join(", ");
  const messageText =
    `Olá! Novo agendamento na Barbearia:\n` +
    `👤 ${nome}\n` +
    `📅 ${dateDisplay}\n` +
    `🕐 ${timeDisplay}\n` +
    (servicosText ? `✂️ ${servicosText}\n` : "") +
    `Aguardo confirmação!`;
```

Substituir por (usando o helper):

```ts
  const servicosNomes = (servicos || []).map((s) => s.nome);
  const messageText = buildWhatsappConfirmMessage({
    nome,
    data: date,
    horario: time,
    servicos: servicosNomes,
  });
```

E adicionar o import no topo do arquivo:

```ts
import { buildWhatsappConfirmMessage, buildWhatsappConfirmUrl } from "@/lib/confirmacao-helpers";
```

E) Substituir a construção de `whatsappUrl`:

```ts
  const whatsappUrl = buildWhatsappConfirmUrl(whatsappNumber, messageText);
```

- [ ] **Step 2: Verificar build**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/pages/AgendamentoSucesso.tsx
git commit -m "feat(ui): banner de pendente e mensagem de confirmacao via helper"
```

---

## Task 6: `AdminAgenda` — pendentes destacados e botão Confirmar

**Files:**
- Modify: `src/pages/AdminAgenda.tsx`

- [ ] **Step 1: Adicionar imports e modificar query**

Adicionar no topo do arquivo:

```ts
import { confirmAgendamento, cancelAgendamentoAdmin } from "@/lib/confirmacao-helpers";
import { Clock as ClockIcon } from "lucide-react";
```

(Se o ícone `Clock` já estiver importado, pular esse alias.)

- [ ] **Step 2: Ajustar a query principal**

Localizar a query principal de agendamentos (busca por `data` e `status='ativo'`). Mudar para:

1. Antes da chamada `.from("agendamentos")`, adicionar: `await supabase.rpc("expire_pending_agendamentos");`
2. Mudar `.eq("status", "ativo")` para `.in("status", ["pendente", "ativo"])`
3. Garantir que o select inclui `status` e `expira_em` (adicionar à lista de campos selecionados).

Exemplo de como a query deve ficar:

```ts
const fetchAgendamentos = async () => {
  await supabase.rpc("expire_pending_agendamentos");
  const { data, error } = await supabase
    .from("agendamentos")
    .select("id, data, horario, status, expira_em, usuarios(nome, telefone)")
    .eq("data", dataSelecionada)
    .in("status", ["pendente", "ativo"])
    .order("horario");
  if (error) throw error;
  // Pendente primeiro
  return (data || []).sort((a: any, b: any) => {
    if (a.status === b.status) return a.horario.localeCompare(b.horario);
    return a.status === "pendente" ? -1 : 1;
  });
};
```

Adapte os nomes de variáveis ao código existente. Se a query já tiver outras colunas (ex.: `servico_id`), mantenha.

- [ ] **Step 3: Render — destacar pendentes**

No componente onde cada agendamento é renderizado, identificar a linha/card de agendamento e:

A) Adicionar classes condicionais quando `ag.status === "pendente"`: borda/fundo amarelo (ex.: `border-yellow-400 bg-yellow-50`).

B) Adicionar uma badge "AGUARDANDO CONFIRMAÇÃO" e o tempo restante:

```tsx
{ag.status === "pendente" && (
  <div className="flex items-center gap-2 text-xs text-yellow-700 font-body">
    <ClockIcon className="h-3 w-3" />
    <span>AGUARDANDO CONFIRMAÇÃO</span>
    {ag.expira_em && (
      <span>(expira em {Math.max(0, Math.round((new Date(ag.expira_em).getTime() - Date.now()) / 60000))} min)</span>
    )}
  </div>
)}
```

C) Adicionar dois botões para agendamentos pendentes (use a mutação correta do projeto — invalidate a queryKey existente):

```tsx
{ag.status === "pendente" && (
  <div className="flex gap-2 mt-2">
    <Button size="sm" onClick={async () => {
      try {
        await confirmAgendamento(ag.id);
        queryClient.invalidateQueries({ queryKey: ["admin-agenda"] }); // use a chave real do seu projeto
        queryClient.invalidateQueries({ queryKey: ["pendentes-count"] });
        toast({ title: "Confirmado", description: "Agendamento confirmado" });
      } catch (e: any) {
        toast({ title: "Erro", description: e.message, variant: "destructive" });
      }
    }}>Confirmar</Button>
    <Button size="sm" variant="outline" onClick={async () => {
      try {
        await cancelAgendamentoAdmin(ag.id);
        queryClient.invalidateQueries({ queryKey: ["admin-agenda"] });
        queryClient.invalidateQueries({ queryKey: ["pendentes-count"] });
        toast({ title: "Cancelado", description: "Agendamento cancelado" });
      } catch (e: any) {
        toast({ title: "Erro", description: e.message, variant: "destructive" });
      }
    }}>Cancelar</Button>
  </div>
)}
```

Onde lê `queryKey: ["admin-agenda"]`, **substitua pela chave real usada no `useQuery` da AdminAgenda** (descubra olhando o arquivo, geralmente segue padrão `["agenda", dataSelecionada]` ou similar).

- [ ] **Step 4: Verificar build**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/pages/AdminAgenda.tsx
git commit -m "feat(ui): destacar pendentes na agenda com botoes confirmar/cancelar"
```

---

## Task 7: `AdminSidebar` — badge de pendentes

**Files:**
- Modify: `src/components/AdminSidebar.tsx`

- [ ] **Step 1: Adicionar hook e badge**

Adicionar no topo do arquivo:

```ts
import { usePendentesCount } from "@/lib/confirmacao-helpers";
```

Dentro de `AdminSidebar`, adicionar:

```ts
const { count: pendentesCount } = usePendentesCount();
```

No render do item de menu "Agenda", adicionar um badge. Localizar o item em `items` (linha ~22: `{ title: "Agenda", url: "/admin/agenda", icon: CalendarDays }`).

No JSX onde cada item é renderizado (procure por `items.map`), adicionar um span condicional quando `item.title === "Agenda"` e `pendentesCount > 0`:

```tsx
{item.title === "Agenda" && pendentesCount > 0 && (
  <span className="ml-auto inline-flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xs font-bold px-1.5 py-0.5 min-w-[1.25rem]">
    {pendentesCount}
  </span>
)}
```

Posicione o span dentro do `<SidebarMenuButton>` (ou do `<NavLink>` filho), depois do título.

- [ ] **Step 2: Verificar build**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Rodar suite completa**

Run: `npx vitest run`
Expected: tudo verde.

- [ ] **Step 4: Commit**

```bash
git add src/components/AdminSidebar.tsx
git commit -m "feat(ui): badge contador de pendentes na sidebar"
```

---

## Self-Review

- **Spec coverage:**
  - Migration (enum + coluna + índice + função) → Task 1 ✓
  - createAppointment pendente + expira_em → Task 3 ✓
  - getAvailableSlots cleanup + pendente bloqueia → Task 4 ✓
  - AgendamentoSucesso banner + mensagem → Task 5 ✓
  - Helpers WhatsApp + confirm/cancel + usePendentesCount → Task 2 ✓
  - AdminAgenda destaque + botões → Task 6 ✓
  - AdminSidebar badge → Task 7 ✓
  - Testes 1-8 do spec → Tasks 2, 3, 4 cobrem (mensagem 0/1/N serviços = 2 testes da Task 2; URL normalização = 2; status pendente + expira_em = 2 na Task 3; RPC chamada + pendente como ocupado = 2 na Task 4; total = 8 ✓)
  - Confirmar/cancel: testes não cobertos diretamente — são wrappers de 3 linhas em torno de `update`, integrados na Task 6. Aceitável; se quiser cobertura, adicionar 2 testes triviais à Task 2 depois.

- **Placeholders:** o ponto que diz "substitua pela chave real" na Task 6 é dependente do código atual — incluí instrução clara pra olhar o arquivo. Aceitável.
- **Type consistency:** `SlotIndisponivelError` da spec anterior continua válido. Tipos novos (`WhatsappMsgInput`) consistentes entre tasks.

---

## Execution Handoff

Plano salvo em `docs/superpowers/plans/2026-05-26-confirmacao-whatsapp.md`. Duas opções:

1. **Subagent-Driven (recomendado)** — eu disparo um subagente novo por task, com revisões.
2. **Inline** — execução nesta sessão com checkpoints.

Qual?
