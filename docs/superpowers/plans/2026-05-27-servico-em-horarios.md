# Exibir e Escolher Serviço nos Horários (Admin) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exibir serviços de cada agendamento nos slots do `AdminHorarios` e permitir que o admin escolha múltiplos serviços ao criar encaixe ou substituir cliente, persistindo na junction `agendamento_servicos`.

**Architecture:** Extrair lógica de encaixe/substituição num helper isolado (`admin-horarios-helpers.ts`) com rollback transacional manual. Query da página expandida pra trazer junction. UI ganha checkboxes de serviço e badge "AGUARDANDO CONFIRMAÇÃO" para `status === "pendente"`. Junction já existe — sem migration.

**Tech Stack:** React + TanStack Query + Supabase + Vitest. Sem mudanças de schema.

---

### Task 1: Criar helper `admin-horarios-helpers.ts` com tipos e `mapAgendamentoToSlot`

**Files:**
- Create: `src/lib/admin-horarios-helpers.ts`
- Create: `src/test/admin-horarios-helpers.test.ts`

- [ ] **Step 1: Escrever o teste falhando para `mapAgendamentoToSlot`**

Em `src/test/admin-horarios-helpers.test.ts`:

```ts
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
```

- [ ] **Step 2: Rodar teste para verificar que falha**

Run: `npx vitest run src/test/admin-horarios-helpers.test.ts`
Expected: FAIL — `Cannot find module '@/lib/admin-horarios-helpers'`.

- [ ] **Step 3: Implementar tipos e `mapAgendamentoToSlot`**

Em `src/lib/admin-horarios-helpers.ts`:

```ts
import { supabase } from "@/integrations/supabase/client";
import { SLOT_UNIQUE_INDEX, SlotIndisponivelError } from "@/lib/supabase-helpers";

export type AgendamentoStatus = "pendente" | "ativo";

export type AgendamentoRow = {
  id: string;
  horario: string;
  status: AgendamentoStatus;
  usuarios: { nome: string } | null;
  agendamento_servicos: { servicos: { nome: string } | null }[] | null;
};

export type SlotInfo = {
  nome: string;
  servicos: string[];
  status: AgendamentoStatus;
};

export function mapAgendamentoToSlot(ag: AgendamentoRow): SlotInfo {
  return {
    nome: ag.usuarios?.nome ?? "Cliente",
    servicos: (ag.agendamento_servicos ?? [])
      .map((j) => j.servicos?.nome)
      .filter((n): n is string => !!n),
    status: ag.status,
  };
}
```

- [ ] **Step 4: Rodar testes para confirmar verde**

Run: `npx vitest run src/test/admin-horarios-helpers.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin-horarios-helpers.ts src/test/admin-horarios-helpers.test.ts
git commit -m "feat(admin-horarios): adiciona mapAgendamentoToSlot e tipos"
```

---

### Task 2: Implementar `createEncaixe` com rollback

**Files:**
- Modify: `src/lib/admin-horarios-helpers.ts` (adicionar função)
- Modify: `src/test/admin-horarios-helpers.test.ts` (adicionar suite)

- [ ] **Step 1: Adicionar mock do supabase no topo do arquivo de teste**

Após os imports existentes em `src/test/admin-horarios-helpers.test.ts`, **antes** do primeiro `describe`, adicionar:

```ts
import { vi, beforeEach } from "vitest";

vi.mock("@/integrations/supabase/client", () => {
  const state: any = {
    agendamentoInsertError: null,
    junctionInsertError: null,
    junctionDeleteError: null,
    agendamentoUpdateError: null,
    insertedAgendamentoId: "ag-novo",
    deletedAgendamentoIds: [] as string[],
    insertedJunctionRows: [] as any[],
    deletedJunctionAgendamentoIds: [] as string[],
    updatedAgendamentos: [] as any[],
  };
  const client = {
    from: (table: string) => {
      if (table === "agendamentos") {
        return {
          insert: (payload: any) => ({
            select: () => ({
              single: async () =>
                state.agendamentoInsertError
                  ? { data: null, error: state.agendamentoInsertError }
                  : { data: { id: state.insertedAgendamentoId, ...payload }, error: null },
            }),
          }),
          delete: () => ({
            eq: (_col: string, id: string) => {
              state.deletedAgendamentoIds.push(id);
              return Promise.resolve({ error: null });
            },
          }),
          update: (payload: any) => ({
            eq: (_col: string, id: string) => {
              state.updatedAgendamentos.push({ id, payload });
              return Promise.resolve({ error: state.agendamentoUpdateError });
            },
          }),
        };
      }
      if (table === "agendamento_servicos") {
        return {
          insert: async (rows: any[]) => {
            if (state.junctionInsertError) return { error: state.junctionInsertError };
            state.insertedJunctionRows.push(...rows);
            return { error: null };
          },
          delete: () => ({
            eq: (_col: string, id: string) => {
              state.deletedJunctionAgendamentoIds.push(id);
              return Promise.resolve({ error: state.junctionDeleteError });
            },
          }),
        };
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
  s.agendamentoInsertError = null;
  s.junctionInsertError = null;
  s.junctionDeleteError = null;
  s.agendamentoUpdateError = null;
  s.insertedAgendamentoId = "ag-novo";
  s.deletedAgendamentoIds = [];
  s.insertedJunctionRows = [];
  s.deletedJunctionAgendamentoIds = [];
  s.updatedAgendamentos = [];
});
```

- [ ] **Step 2: Escrever os testes falhando para `createEncaixe`**

No final de `src/test/admin-horarios-helpers.test.ts`:

```ts
import { createEncaixe } from "@/lib/admin-horarios-helpers";
import { SlotIndisponivelError } from "@/lib/supabase-helpers";

describe("createEncaixe", () => {
  it("happy path: insere agendamento e junction sem rollback", async () => {
    await createEncaixe("cliente-1", "2026-06-01", "10:00:00", ["s1", "s2"]);
    const s = getState();
    expect(s.insertedJunctionRows).toEqual([
      { agendamento_id: "ag-novo", servico_id: "s1" },
      { agendamento_id: "ag-novo", servico_id: "s2" },
    ]);
    expect(s.deletedAgendamentoIds).toEqual([]);
  });

  it("rollback: se junction falha, deleta agendamento e propaga erro", async () => {
    const s = getState();
    s.junctionInsertError = { message: "fk violation" };
    await expect(
      createEncaixe("cliente-1", "2026-06-01", "10:00:00", ["s1"])
    ).rejects.toMatchObject({ message: "fk violation" });
    expect(s.deletedAgendamentoIds).toContain("ag-novo");
  });

  it("slot ocupado: lança SlotIndisponivelError quando erro 23505 do índice", async () => {
    getState().agendamentoInsertError = {
      code: "23505",
      message: 'duplicate key value violates unique constraint "agendamentos_unique_slot_active"',
    };
    await expect(
      createEncaixe("cliente-1", "2026-06-01", "10:00:00", ["s1"])
    ).rejects.toBeInstanceOf(SlotIndisponivelError);
  });
});
```

- [ ] **Step 3: Rodar testes para verificar que falham**

Run: `npx vitest run src/test/admin-horarios-helpers.test.ts`
Expected: FAIL — `createEncaixe is not a function`.

- [ ] **Step 4: Implementar `createEncaixe`**

Em `src/lib/admin-horarios-helpers.ts`, adicionar ao final:

```ts
export async function createEncaixe(
  clienteId: string,
  data: string,
  horario: string,
  servicoIds: string[]
): Promise<void> {
  const { data: agendamento, error: insertError } = await supabase
    .from("agendamentos")
    .insert({ cliente_id: clienteId, data, horario, status: "ativo" })
    .select()
    .single();

  if (insertError) {
    if (
      insertError.code === "23505" &&
      typeof insertError.message === "string" &&
      insertError.message.includes(SLOT_UNIQUE_INDEX)
    ) {
      throw new SlotIndisponivelError();
    }
    throw insertError;
  }

  if (servicoIds.length === 0) return;

  const rows = servicoIds.map((sid) => ({
    agendamento_id: agendamento.id,
    servico_id: sid,
  }));
  const { error: junctionError } = await supabase
    .from("agendamento_servicos")
    .insert(rows);

  if (junctionError) {
    await supabase.from("agendamentos").delete().eq("id", agendamento.id);
    throw junctionError;
  }
}
```

- [ ] **Step 5: Rodar testes**

Run: `npx vitest run src/test/admin-horarios-helpers.test.ts`
Expected: PASS (6 tests total).

- [ ] **Step 6: Commit**

```bash
git add src/lib/admin-horarios-helpers.ts src/test/admin-horarios-helpers.test.ts
git commit -m "feat(admin-horarios): adiciona createEncaixe com rollback"
```

---

### Task 3: Implementar `replaceAgendamentoServicos`

**Files:**
- Modify: `src/lib/admin-horarios-helpers.ts`
- Modify: `src/test/admin-horarios-helpers.test.ts`

- [ ] **Step 1: Escrever os testes falhando**

No final de `src/test/admin-horarios-helpers.test.ts`:

```ts
import { replaceAgendamentoServicos } from "@/lib/admin-horarios-helpers";

describe("replaceAgendamentoServicos", () => {
  it("happy path: update cliente, delete junction antigo, insert novo", async () => {
    await replaceAgendamentoServicos("ag-existente", "cliente-novo", ["s1", "s2"]);
    const s = getState();
    expect(s.updatedAgendamentos).toEqual([
      { id: "ag-existente", payload: { cliente_id: "cliente-novo" } },
    ]);
    expect(s.deletedJunctionAgendamentoIds).toEqual(["ag-existente"]);
    expect(s.insertedJunctionRows).toEqual([
      { agendamento_id: "ag-existente", servico_id: "s1" },
      { agendamento_id: "ag-existente", servico_id: "s2" },
    ]);
  });

  it("propaga erro do update", async () => {
    getState().agendamentoUpdateError = { message: "update falhou" };
    await expect(
      replaceAgendamentoServicos("ag-x", "cli-x", ["s1"])
    ).rejects.toMatchObject({ message: "update falhou" });
  });
});
```

- [ ] **Step 2: Rodar testes para verificar que falham**

Run: `npx vitest run src/test/admin-horarios-helpers.test.ts`
Expected: FAIL — `replaceAgendamentoServicos is not a function`.

- [ ] **Step 3: Implementar `replaceAgendamentoServicos`**

Em `src/lib/admin-horarios-helpers.ts`, adicionar ao final:

```ts
export async function replaceAgendamentoServicos(
  agendamentoId: string,
  novoClienteId: string,
  servicoIds: string[]
): Promise<void> {
  const { error: updateError } = await supabase
    .from("agendamentos")
    .update({ cliente_id: novoClienteId })
    .eq("id", agendamentoId);
  if (updateError) throw updateError;

  const { error: deleteError } = await supabase
    .from("agendamento_servicos")
    .delete()
    .eq("agendamento_id", agendamentoId);
  if (deleteError) throw deleteError;

  if (servicoIds.length === 0) return;

  const rows = servicoIds.map((sid) => ({
    agendamento_id: agendamentoId,
    servico_id: sid,
  }));
  const { error: insertError } = await supabase
    .from("agendamento_servicos")
    .insert(rows);
  if (insertError) throw insertError;
}
```

- [ ] **Step 4: Rodar testes**

Run: `npx vitest run src/test/admin-horarios-helpers.test.ts`
Expected: PASS (8 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin-horarios-helpers.ts src/test/admin-horarios-helpers.test.ts
git commit -m "feat(admin-horarios): adiciona replaceAgendamentoServicos"
```

---

### Task 4: Expandir query do `AdminHorarios` para trazer serviços + status pendente

**Files:**
- Modify: `src/pages/AdminHorarios.tsx` (linhas 37-73 e 173-175)

- [ ] **Step 1: Substituir o `useQuery` de slots**

Em `src/pages/AdminHorarios.tsx`, trocar o bloco `const { data: slots = [], isLoading } = useQuery({...})` (linhas 37-73) por:

```tsx
  const { data: slots = [], isLoading } = useQuery({
    queryKey: ["admin-horarios", data],
    queryFn: async () => {
      const [{ data: customSlots }, { data: agendados }, { data: bloqueados }] = await Promise.all([
        supabase
          .from("horarios_customizados")
          .select("horario")
          .eq("dia_semana", dayOfWeek)
          .eq("ativo", true)
          .order("horario"),
        supabase
          .from("agendamentos")
          .select("id, horario, status, usuarios(nome), agendamento_servicos(servicos(nome))")
          .eq("data", data)
          .in("status", ["pendente", "ativo"]),
        supabase
          .from("bloqueios")
          .select("horario, motivo")
          .eq("data", data),
      ]);

      const agendadosMap: Record<string, { nome: string; servicos: string[]; status: "pendente" | "ativo"; id: string }> = {};
      for (const a of (agendados || []) as any[]) {
        agendadosMap[a.horario] = {
          id: a.id,
          nome: a.usuarios?.nome ?? "Cliente",
          servicos: (a.agendamento_servicos ?? [])
            .map((j: any) => j.servicos?.nome)
            .filter((n: any): n is string => !!n),
          status: a.status,
        };
      }
      const bloqueadosMap = Object.fromEntries(
        (bloqueados || []).map((b: any) => [b.horario, b.motivo || "Bloqueado"])
      );

      return (customSlots || []).map((s) => {
        const h = s.horario;
        if (agendadosMap[h]) {
          const a = agendadosMap[h];
          return {
            horario: h,
            status: "ocupado" as const,
            info: a.nome,
            servicos: a.servicos,
            agendamentoStatus: a.status,
            agendamentoId: a.id,
          };
        }
        if (bloqueadosMap[h]) return { horario: h, status: "bloqueado" as const, info: bloqueadosMap[h], servicos: [], agendamentoStatus: null, agendamentoId: null };
        return { horario: h, status: "livre" as const, info: "", servicos: [], agendamentoStatus: null, agendamentoId: null };
      });
    },
  });
```

- [ ] **Step 2: Build/typecheck para confirmar que não quebrou nada**

Run: `npx tsc --noEmit`
Expected: 0 erros relacionados a `AdminHorarios.tsx`.

- [ ] **Step 3: Rodar suite completa**

Run: `npx vitest run`
Expected: todos os testes existentes verdes.

- [ ] **Step 4: Commit**

```bash
git add src/pages/AdminHorarios.tsx
git commit -m "feat(admin-horarios): expande query para trazer servicos e status"
```

---

### Task 5: Exibir serviços e badge "AGUARDANDO CONFIRMAÇÃO" no render dos slots

**Files:**
- Modify: `src/pages/AdminHorarios.tsx` (bloco de render dos slots, linhas ~395-461)

- [ ] **Step 1: Atualizar JSX do slot ocupado**

Localizar o `slots.map((s) => (...))` na seção "Lista de horários". Substituir todo o `<div key={s.horario} ...>` (do `key={s.horario}` até o `</div>` que fecha o item) por:

```tsx
            <div
              key={s.horario}
              className={`flex items-center justify-between px-4 py-3 rounded-xl border ${
                s.status === "livre"
                  ? "bg-green-50 border-green-200"
                  : s.status === "ocupado" && s.agendamentoStatus === "pendente"
                  ? "bg-yellow-50 border-yellow-300"
                  : s.status === "ocupado"
                  ? "bg-red-50 border-red-200"
                  : "bg-muted border-border opacity-60"
              }`}
            >
              <div className="flex items-center gap-3">
                {s.status === "livre" ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : (
                  <XCircle className={`h-5 w-5 ${s.agendamentoStatus === "pendente" ? "text-yellow-600" : "text-red-500"}`} />
                )}
                <span className="font-heading text-xl">{s.horario.slice(0, 5)}</span>
              </div>
              <div className="text-right">
                <span className={`font-body text-xs px-2 py-0.5 rounded-full ${
                  s.status === "livre"
                    ? "bg-green-100 text-green-700"
                    : s.status === "ocupado" && s.agendamentoStatus === "pendente"
                    ? "bg-yellow-100 text-yellow-800"
                    : s.status === "ocupado"
                    ? "bg-red-100 text-red-700"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {s.status === "livre"
                    ? "VAGO"
                    : s.status === "ocupado" && s.agendamentoStatus === "pendente"
                    ? "AGUARDANDO CONFIRMAÇÃO"
                    : s.status === "ocupado"
                    ? "OCUPADO"
                    : "BLOQUEADO"}
                </span>
                {s.status === "livre" && (
                  <div className="mt-2 flex justify-end">
                    <Button size="sm" onClick={() => { setSelectedSlot(s); setOpenEncaixeDialog(true); }}>
                      Encaixe
                    </Button>
                  </div>
                )}
                {s.info && (
                  <p className="font-body text-xs text-muted-foreground mt-0.5">{s.info}</p>
                )}
                {s.servicos && s.servicos.length > 0 && (
                  <p className="font-body text-xs text-primary mt-0.5">{s.servicos.join(", ")}</p>
                )}
                {s.status === "ocupado" && (
                  <div className="mt-2 flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => {
                      if (!s.agendamentoId) return toast({ title: 'Erro', description: 'Agendamento não encontrado', variant: 'destructive' });
                      setSelectedAgendamentoId(s.agendamentoId);
                      setSelectedSlot(s);
                      setOpenRemoveDialog(true);
                    }}>
                      Remover
                    </Button>
                    <Button size="sm" onClick={() => {
                      if (!s.agendamentoId) return toast({ title: 'Erro', description: 'Agendamento não encontrado', variant: 'destructive' });
                      setSelectedAgendamentoId(s.agendamentoId);
                      setSelectedSlot(s);
                      setSelectedCliente(null);
                      setSelectedServicoIds([]);
                      setOpenReplaceDialog(true);
                    }}>
                      Substituir
                    </Button>
                  </div>
                )}
              </div>
            </div>
```

Nota: este step introduz uso de `setSelectedServicoIds` que será criado na Task 6 — o build vai quebrar até a Task 6 ser feita. Não faça commit ainda.

- [ ] **Step 2: NÃO commitar ainda (continua na Task 6)**

---

### Task 6: Adicionar query de serviços ativos + state `selectedServicoIds`

**Files:**
- Modify: `src/pages/AdminHorarios.tsx` (área de hooks, ~linha 24-35)

- [ ] **Step 1: Adicionar state e query de serviços**

Após o `const [selectedAgendamentoId, setSelectedAgendamentoId] = useState<string | null>(null);` (linha 31), adicionar:

```tsx
  const [selectedServicoIds, setSelectedServicoIds] = useState<string[]>([]);
```

E após o `useQuery` de `admin-clientes` (depois do bloco linhas 76-90), adicionar:

```tsx
  const { data: servicosAtivos = [] } = useQuery({
    queryKey: ["servicos-ativos"],
    queryFn: async () => {
      const { data } = await supabase
        .from("servicos")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome", { ascending: true });
      return data || [];
    },
  });
```

- [ ] **Step 2: Build/typecheck**

Run: `npx tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 3: Commit (juntando Task 5 + 6)**

```bash
git add src/pages/AdminHorarios.tsx
git commit -m "feat(admin-horarios): exibe servicos, badge pendente e prepara state"
```

---

### Task 7: Adicionar seletor de serviço no dialog de Encaixe + integrar `createEncaixe`

**Files:**
- Modify: `src/pages/AdminHorarios.tsx`

- [ ] **Step 1: Substituir a mutation `encaixeMutation`**

Localizar `const encaixeMutation = useMutation({...})` (linhas ~131-142). Trocar por:

```tsx
  const encaixeMutation = useMutation({
    mutationFn: async (payload: { cliente_id: string; data: string; horario: string; servicoIds: string[] }) => {
      await createEncaixe(payload.cliente_id, payload.data, payload.horario, payload.servicoIds);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-horarios", data] });
      toast({ title: "Agendamento criado", description: "Encaixe criado com sucesso" });
      setOpenEncaixeDialog(false);
      setSelectedSlot(null);
      setSelectedCliente(null);
      setSelectedServicoIds([]);
    },
    onError: (err: any) => {
      if (err instanceof SlotIndisponivelError) {
        toast({ title: "Slot indisponível", description: err.message, variant: "destructive" });
        queryClient.invalidateQueries({ queryKey: ["admin-horarios", data] });
        setOpenEncaixeDialog(false);
        setSelectedSlot(null);
        setSelectedCliente(null);
        setSelectedServicoIds([]);
        return;
      }
      toast({ title: "Erro", description: err?.message ?? "Erro ao criar encaixe", variant: "destructive" });
    },
  });
```

E adicionar os imports no topo do arquivo:

```tsx
import { createEncaixe, replaceAgendamentoServicos } from "@/lib/admin-horarios-helpers";
import { SlotIndisponivelError } from "@/lib/supabase-helpers";
```

- [ ] **Step 2: Adicionar checkboxes de serviço no dialog de Encaixe**

No dialog `Dialog open={openEncaixeDialog}` (linhas ~282-318), dentro do `<div className="space-y-4">`, **após** o bloco `<div className="space-y-2"><Label>Escolha o cliente</Label>...</div>`, adicionar:

```tsx
            <div className="space-y-2">
              <Label>Serviços</Label>
              <div className="max-h-32 overflow-auto space-y-1 border rounded-md p-2">
                {servicosAtivos.map((sv: any) => (
                  <label key={sv.id} className="flex items-center gap-2 p-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedServicoIds.includes(sv.id)}
                      onChange={(e) => {
                        setSelectedServicoIds((prev) =>
                          e.target.checked ? [...prev, sv.id] : prev.filter((id) => id !== sv.id)
                        );
                      }}
                    />
                    <span className="text-sm">{sv.nome}</span>
                  </label>
                ))}
              </div>
            </div>
```

E substituir o `onClick` do botão "Confirmar Encaixe":

```tsx
            <Button onClick={() => {
              if (!selectedCliente || !selectedSlot) return toast({ title: "Aviso", description: "Selecione um cliente", variant: "destructive" });
              if (selectedServicoIds.length === 0) return toast({ title: "Aviso", description: "Selecione ao menos um serviço", variant: "destructive" });
              encaixeMutation.mutate({ cliente_id: selectedCliente.id, data, horario: selectedSlot.horario, servicoIds: selectedServicoIds });
            }} disabled={encaixeMutation.isLoading}>
              Confirmar Encaixe
            </Button>
```

No `onClick` do botão "Cancelar" do mesmo dialog (e no `onOpenChange` se houver reset), adicionar `setSelectedServicoIds([]);`:

```tsx
            <Button variant="outline" onClick={() => { setOpenEncaixeDialog(false); setSelectedCliente(null); setSelectedSlot(null); setSelectedServicoIds([]); }}>
              Cancelar
            </Button>
```

- [ ] **Step 3: Reset de `selectedServicoIds` ao abrir o dialog**

No clique do botão "Encaixe" (no item do slot livre), garantir reset. Já existe `setSelectedSlot(s); setOpenEncaixeDialog(true);` — adicionar antes: `setSelectedCliente(null); setSelectedServicoIds([]);`

Localizar o `<Button size="sm" onClick={() => { setSelectedSlot(s); setOpenEncaixeDialog(true); }}>Encaixe</Button>` e trocar por:

```tsx
                    <Button size="sm" onClick={() => { setSelectedCliente(null); setSelectedServicoIds([]); setSelectedSlot(s); setOpenEncaixeDialog(true); }}>
                      Encaixe
                    </Button>
```

- [ ] **Step 4: Build/typecheck e testes**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 0 erros TS, todos os testes verdes.

- [ ] **Step 5: Commit**

```bash
git add src/pages/AdminHorarios.tsx
git commit -m "feat(admin-horarios): integra encaixe com servicos e rollback"
```

---

### Task 8: Adicionar seletor de serviço no dialog de Substituir + integrar `replaceAgendamentoServicos`

**Files:**
- Modify: `src/pages/AdminHorarios.tsx`

- [ ] **Step 1: Substituir a mutation `replaceAgendamento`**

Localizar `const replaceAgendamento = useMutation({...})` (linhas ~158-171). Trocar por:

```tsx
  const replaceAgendamento = useMutation({
    mutationFn: async (payload: { agendamentoId: string; clienteId: string; servicoIds: string[] }) => {
      await replaceAgendamentoServicos(payload.agendamentoId, payload.clienteId, payload.servicoIds);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-horarios", data] });
      toast({ title: "Substituição realizada", description: "Cliente substituído com sucesso" });
      setOpenReplaceDialog(false);
      setSelectedAgendamentoId(null);
      setSelectedSlot(null);
      setSelectedCliente(null);
      setSelectedServicoIds([]);
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err?.message ?? "Erro ao substituir cliente", variant: "destructive" });
    },
  });
```

- [ ] **Step 2: Adicionar checkboxes no dialog Substituir**

No `Dialog open={openReplaceDialog}` (linhas ~345-381), dentro do `<div className="space-y-4">`, após o bloco "Escolha o cliente substituto", adicionar o mesmo bloco de checkboxes:

```tsx
            <div className="space-y-2">
              <Label>Serviços</Label>
              <div className="max-h-32 overflow-auto space-y-1 border rounded-md p-2">
                {servicosAtivos.map((sv: any) => (
                  <label key={sv.id} className="flex items-center gap-2 p-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedServicoIds.includes(sv.id)}
                      onChange={(e) => {
                        setSelectedServicoIds((prev) =>
                          e.target.checked ? [...prev, sv.id] : prev.filter((id) => id !== sv.id)
                        );
                      }}
                    />
                    <span className="text-sm">{sv.nome}</span>
                  </label>
                ))}
              </div>
            </div>
```

E trocar o `onClick` do botão "Confirmar Substituição":

```tsx
            <Button onClick={() => {
              if (!selectedAgendamentoId || !selectedCliente?.id) return toast({ title: 'Aviso', description: 'Selecione um cliente', variant: 'destructive' });
              if (selectedServicoIds.length === 0) return toast({ title: "Aviso", description: "Selecione ao menos um serviço", variant: "destructive" });
              replaceAgendamento.mutate({ agendamentoId: selectedAgendamentoId, clienteId: selectedCliente.id, servicoIds: selectedServicoIds });
            }} disabled={replaceAgendamento.isLoading}>
              Confirmar Substituição
            </Button>
```

E no botão "Cancelar" do dialog Substituir, adicionar `setSelectedServicoIds([]);`:

```tsx
            <Button variant="outline" onClick={() => { setOpenReplaceDialog(false); setSelectedCliente(null); setSelectedAgendamentoId(null); setSelectedSlot(null); setSelectedServicoIds([]); }}>
              Cancelar
            </Button>
```

- [ ] **Step 3: Build/typecheck e testes**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 0 erros, todos os testes verdes.

- [ ] **Step 4: Commit**

```bash
git add src/pages/AdminHorarios.tsx
git commit -m "feat(admin-horarios): integra substituicao com servicos"
```

---

### Task 9: Verificação final (todos os critérios de aceitação)

**Files:** nenhum

- [ ] **Step 1: Rodar suite de testes completa**

Run: `npx vitest run`
Expected: PASS — todos os testes (15 anteriores + 8 novos = 23).

- [ ] **Step 2: Rodar build de produção**

Run: `npm run build`
Expected: build sem erros.

- [ ] **Step 3: Smoke test manual (descrever no commit/PR)**

Checklist manual:
- Abrir `/admin/horarios`, selecionar uma data com agendamento ativo já existente — confirmar que o nome aparece e os serviços (se já houver junction) aparecem em CSV abaixo.
- Slot livre → botão "Encaixe" → escolher cliente + 2 serviços → confirmar → slot aparece como OCUPADO com os 2 serviços.
- Slot ocupado → "Substituir" → escolher outro cliente + serviços diferentes → confirmar → serviços atualizados.
- Slot pendente (de um cliente público) → exibe badge "AGUARDANDO CONFIRMAÇÃO" amarelo.

- [ ] **Step 4: Resumo no PR/handoff**

Documentar no merge: "Implementa exibição de serviços no AdminHorarios e seleção multi-serviço para encaixe/substituição com rollback transacional."

---

## Self-Review

**Spec coverage:**
- Query expandida ✓ Task 4
- Exibição CSV ✓ Task 5
- Badge AGUARDANDO CONFIRMAÇÃO ✓ Task 5
- Multi-select Encaixe ✓ Task 7
- Multi-select Substituir ✓ Task 8
- `mapAgendamentoToSlot` ✓ Task 1
- `createEncaixe` com rollback ✓ Task 2
- `replaceAgendamentoServicos` ✓ Task 3
- Tratar `SlotIndisponivelError` no encaixe ✓ Task 7
- 6 testes mínimos do spec → 8 testes (3 map + 3 encaixe + 2 replace) ≥ 6 ✓

**Placeholders:** Nenhum.

**Consistência de tipos:** `SlotInfo`, `AgendamentoRow`, `createEncaixe`, `replaceAgendamentoServicos`, `selectedServicoIds`, `servicosAtivos` — todos consistentes entre tasks.
