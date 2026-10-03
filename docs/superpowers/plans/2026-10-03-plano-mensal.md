# Plano Mensal (Corte / Barba / Corte e Barba) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que clientes contratem um plano mensal (Corte, Barba ou Corte e Barba — 4 atendimentos/mês, só terça a quinta), paguem via Pix, e o admin aprove manualmente; clientes com plano ativo podem agendar sem custo usando um crédito do plano.

**Architecture:** Novas tabelas Postgres (`planos`, `plano_servicos`, `assinaturas_planos`, `receitas_avulsas`) + RPCs `SECURITY DEFINER` (mesmo padrão de `criar_agendamento`) para o fluxo público (solicitar/consultar plano) e privado (aprovar/rejeitar). `criar_agendamento` ganha um parâmetro opcional `_assinatura_id` que valida e debita o crédito atomicamente. Um trigger estorna o crédito se o agendamento for cancelado. No front, uma página pública `/planos`, um toggle "usar meu plano" em `AgendamentoDados`, e uma página admin `/admin/planos`.

**Tech Stack:** React + TypeScript + Vite, Supabase (Postgres + RLS + RPC), `@tanstack/react-query`, Vitest (mock de `@/integrations/supabase/client`), shadcn/ui (Dialog, Tabs, Checkbox, Card).

---

## Decisões que fixam ambiguidades do spec

- **`types.ts` não é tocado.** O arquivo já está desatualizado (não lista `despesas` nem `produtos`, tabelas que o código usa normalmente via `supabase.from("tabela")` com casts `as any` nos resultados). As novas tabelas seguem o mesmo padrão — sem regenerar types.
- **Estorno de crédito ao cancelar.** O spec não cobria o que acontece se um agendamento pago com crédito for cancelado (manualmente pelo admin, ou automaticamente por `expire_pending_agendamentos` depois de 10 min sem confirmação). Sem isso, o cliente perderia um corte sem usar. Este plano adiciona um trigger (`agendamentos_estorna_credito_plano`) que devolve o crédito sempre que um agendamento com `assinatura_id` muda de `pendente`/`ativo` para `cancelado`.
- **Alterar a assinatura de `criar_agendamento`.** Adicionar um parâmetro precisa de `DROP FUNCTION` antes do `CREATE OR REPLACE` — do contrário o Postgres cria uma função sobrecarregada (overload) nova e mantém a antiga de 5 argumentos viva, o que quebra a resolução de overload do PostgREST quando o front chama a RPC.

---

### Task 1: Migration — schema (tabelas, enum, índices, RLS)

**Files:**
- Create: `supabase/migrations/20261003000000_planos_mensais.sql`

- [ ] **Step 1: Escrever a primeira parte da migration (schema + RLS)**

```sql
-- ============================================================
-- Planos mensais: tabelas base
-- ============================================================

CREATE TABLE public.planos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  preco numeric(10,2) NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.plano_servicos (
  plano_id uuid NOT NULL REFERENCES public.planos(id) ON DELETE CASCADE,
  servico_id uuid NOT NULL REFERENCES public.servicos(id) ON DELETE CASCADE,
  PRIMARY KEY (plano_id, servico_id)
);

CREATE TYPE public.assinatura_status AS ENUM ('pendente_pagamento', 'ativo', 'rejeitado', 'expirado');

CREATE TABLE public.assinaturas_planos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.usuarios(id),
  plano_id uuid NOT NULL REFERENCES public.planos(id),
  status public.assinatura_status NOT NULL DEFAULT 'pendente_pagamento',
  creditos_restantes int NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now(),
  aprovado_em timestamptz,
  expira_em timestamptz
);

-- Só uma assinatura pendente/ativa por cliente
CREATE UNIQUE INDEX assinaturas_planos_cliente_unica
  ON public.assinaturas_planos (cliente_id)
  WHERE status IN ('pendente_pagamento', 'ativo');

-- Marca o agendamento como pago via crédito de plano
ALTER TABLE public.agendamentos
  ADD COLUMN assinatura_id uuid REFERENCES public.assinaturas_planos(id);

-- Receita avulsa (hoje só alimentada pela aprovação de plano)
CREATE TABLE public.receitas_avulsas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  descricao text NOT NULL,
  valor numeric(10,2) NOT NULL,
  data date NOT NULL DEFAULT current_date,
  criado_em timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- RLS: acesso direto só para admin (authenticated); público usa RPCs
-- ============================================================
ALTER TABLE public.planos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plano_servicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assinaturas_planos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receitas_avulsas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin gerencia planos" ON public.planos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Qualquer um le planos ativos" ON public.planos FOR SELECT TO anon, authenticated USING (ativo);

CREATE POLICY "Admin gerencia plano_servicos" ON public.plano_servicos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Qualquer um le plano_servicos" ON public.plano_servicos FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Admin gerencia assinaturas" ON public.assinaturas_planos FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Admin gerencia receitas avulsas" ON public.receitas_avulsas FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

Não existe policy de `SELECT`/`INSERT` para `anon` em `assinaturas_planos` nem `receitas_avulsas` — propositalmente, o acesso público só passa pelas RPCs `SECURITY DEFINER` das próximas tasks.

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20261003000000_planos_mensais.sql
git commit -m "feat(db): schema de planos mensais (planos, assinaturas, receitas avulsas)"
```

---

### Task 2: Migration — RPCs públicas (`solicitar_plano`, `get_plano_ativo_por_telefone`)

**Files:**
- Modify: `supabase/migrations/20261003000000_planos_mensais.sql`

- [ ] **Step 1: Apensar as RPCs públicas ao final do arquivo**

```sql
-- ============================================================
-- Solicitação de plano (cliente): cria/acha usuario + assinatura pendente
-- ============================================================
CREATE OR REPLACE FUNCTION public.solicitar_plano(
  _nome text,
  _telefone text,
  _plano_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tel_norm text;
  v_cliente_id uuid;
  v_assinatura_id uuid;
BEGIN
  v_tel_norm := public.normalizar_telefone(_telefone);

  SELECT id INTO v_cliente_id
  FROM public.usuarios
  WHERE telefone_normalizado = v_tel_norm AND tipo = 'cliente'
  LIMIT 1;

  IF v_cliente_id IS NULL THEN
    BEGIN
      INSERT INTO public.usuarios (nome, telefone, tipo)
      VALUES (_nome, _telefone, 'cliente')
      RETURNING id INTO v_cliente_id;
    EXCEPTION WHEN unique_violation THEN
      SELECT id INTO v_cliente_id
      FROM public.usuarios
      WHERE telefone_normalizado = v_tel_norm AND tipo = 'cliente'
      LIMIT 1;
    END;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.assinaturas_planos
    WHERE cliente_id = v_cliente_id AND status IN ('pendente_pagamento', 'ativo')
  ) THEN
    RAISE EXCEPTION 'ASSINATURA_EXISTENTE';
  END IF;

  INSERT INTO public.assinaturas_planos (cliente_id, plano_id, status, creditos_restantes)
  VALUES (v_cliente_id, _plano_id, 'pendente_pagamento', 0)
  RETURNING id INTO v_assinatura_id;

  RETURN v_assinatura_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.solicitar_plano(text, text, uuid) TO anon, authenticated;

-- ============================================================
-- Consulta pública: plano ativo com créditos de um telefone
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_plano_ativo_por_telefone(_telefone text)
RETURNS TABLE(
  assinatura_id uuid,
  plano_nome text,
  creditos_restantes int,
  expira_em timestamptz,
  servico_ids uuid[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ap.id,
    p.nome,
    ap.creditos_restantes,
    ap.expira_em,
    COALESCE(array_agg(ps.servico_id) FILTER (WHERE ps.servico_id IS NOT NULL), '{}')
  FROM public.assinaturas_planos ap
  JOIN public.usuarios u ON u.id = ap.cliente_id
  JOIN public.planos p ON p.id = ap.plano_id
  LEFT JOIN public.plano_servicos ps ON ps.plano_id = ap.plano_id
  WHERE u.telefone_normalizado = public.normalizar_telefone(_telefone)
    AND ap.status = 'ativo'
    AND ap.expira_em >= now()
    AND ap.creditos_restantes > 0
  GROUP BY ap.id, p.nome, ap.creditos_restantes, ap.expira_em
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_plano_ativo_por_telefone(text) TO anon, authenticated;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20261003000000_planos_mensais.sql
git commit -m "feat(db): RPCs publicas solicitar_plano e get_plano_ativo_por_telefone"
```

---

### Task 3: Migration — RPCs de admin (`aprovar_plano`, `rejeitar_plano`)

**Files:**
- Modify: `supabase/migrations/20261003000000_planos_mensais.sql`

- [ ] **Step 1: Apensar as RPCs de admin**

```sql
-- ============================================================
-- Aprovação do plano pelo admin: ativa, dá 4 créditos, lança receita
-- ============================================================
CREATE OR REPLACE FUNCTION public.aprovar_plano(_assinatura_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plano_nome text;
  v_plano_preco numeric;
  v_cliente_nome text;
BEGIN
  SELECT p.nome, p.preco, u.nome
    INTO v_plano_nome, v_plano_preco, v_cliente_nome
  FROM public.assinaturas_planos ap
  JOIN public.planos p ON p.id = ap.plano_id
  JOIN public.usuarios u ON u.id = ap.cliente_id
  WHERE ap.id = _assinatura_id AND ap.status = 'pendente_pagamento'
  FOR UPDATE OF ap;

  IF v_plano_nome IS NULL THEN
    RAISE EXCEPTION 'ASSINATURA_NAO_PENDENTE';
  END IF;

  UPDATE public.assinaturas_planos
    SET status = 'ativo',
        creditos_restantes = 4,
        aprovado_em = now(),
        expira_em = now() + interval '30 days'
    WHERE id = _assinatura_id;

  INSERT INTO public.receitas_avulsas (descricao, valor, data)
  VALUES ('Plano ' || v_plano_nome || ' - ' || v_cliente_nome, v_plano_preco, current_date);
END;
$$;

GRANT EXECUTE ON FUNCTION public.aprovar_plano(uuid) TO authenticated;

-- ============================================================
-- Rejeição do plano pelo admin
-- ============================================================
CREATE OR REPLACE FUNCTION public.rejeitar_plano(_assinatura_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.assinaturas_planos
    SET status = 'rejeitado'
    WHERE id = _assinatura_id AND status = 'pendente_pagamento';
$$;

GRANT EXECUTE ON FUNCTION public.rejeitar_plano(uuid) TO authenticated;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20261003000000_planos_mensais.sql
git commit -m "feat(db): RPCs de admin aprovar_plano e rejeitar_plano"
```

---

### Task 4: Migration — `criar_agendamento` com crédito de plano + trigger de estorno

**Files:**
- Modify: `supabase/migrations/20261003000000_planos_mensais.sql`

- [ ] **Step 1: Apensar o `DROP` + nova versão de `criar_agendamento`**

```sql
-- ============================================================
-- criar_agendamento: novo parâmetro opcional _assinatura_id
-- Precisa DROP antes, senão o Postgres cria uma função sobrecarregada
-- nova e deixa a de 5 argumentos viva (quebra a resolução do PostgREST).
-- ============================================================
DROP FUNCTION IF EXISTS public.criar_agendamento(text, text, date, time, uuid[]);

CREATE OR REPLACE FUNCTION public.criar_agendamento(
  _nome text,
  _telefone text,
  _data date,
  _horario time,
  _servico_ids uuid[],
  _assinatura_id uuid DEFAULT NULL
)
RETURNS TABLE(agendamento_id uuid, cancel_token uuid, cliente_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tel_norm text;
  v_cliente_id uuid;
  v_agendamento_id uuid;
  v_cancel_token uuid;
  v_servico_id uuid;
  v_first_servico uuid;
  v_plano_servico_ids uuid[];
  v_dow int;
BEGIN
  v_tel_norm := public.normalizar_telefone(_telefone);

  SELECT id INTO v_cliente_id
  FROM public.usuarios
  WHERE telefone_normalizado = v_tel_norm AND tipo = 'cliente'
  LIMIT 1;

  IF v_cliente_id IS NULL THEN
    BEGIN
      INSERT INTO public.usuarios (nome, telefone, tipo)
      VALUES (_nome, _telefone, 'cliente')
      RETURNING id INTO v_cliente_id;
    EXCEPTION WHEN unique_violation THEN
      SELECT id INTO v_cliente_id
      FROM public.usuarios
      WHERE telefone_normalizado = v_tel_norm AND tipo = 'cliente'
      LIMIT 1;
    END;
  END IF;

  IF _assinatura_id IS NOT NULL THEN
    v_dow := extract(dow FROM _data);
    IF v_dow NOT IN (2, 3, 4) THEN
      RAISE EXCEPTION 'PLANO_INVALIDO';
    END IF;

    SELECT array_agg(ps.servico_id ORDER BY ps.servico_id) INTO v_plano_servico_ids
    FROM public.assinaturas_planos ap
    JOIN public.plano_servicos ps ON ps.plano_id = ap.plano_id
    WHERE ap.id = _assinatura_id
      AND ap.cliente_id = v_cliente_id
      AND ap.status = 'ativo'
      AND ap.expira_em >= now()
      AND ap.creditos_restantes > 0
    GROUP BY ap.id
    FOR UPDATE OF ap;

    IF v_plano_servico_ids IS NULL
       OR v_plano_servico_ids <> (SELECT array_agg(s ORDER BY s) FROM unnest(_servico_ids) s) THEN
      RAISE EXCEPTION 'PLANO_INVALIDO';
    END IF;

    UPDATE public.assinaturas_planos
      SET creditos_restantes = creditos_restantes - 1
      WHERE id = _assinatura_id;
  END IF;

  IF _servico_ids IS NOT NULL AND array_length(_servico_ids, 1) > 0 THEN
    v_first_servico := _servico_ids[1];
  END IF;

  BEGIN
    INSERT INTO public.agendamentos (cliente_id, data, horario, telefone_cliente, status, expira_em, servico_id, assinatura_id)
    VALUES (
      v_cliente_id,
      _data,
      _horario,
      regexp_replace(_telefone, '\D', '', 'g'),
      'pendente',
      now() + interval '10 minutes',
      v_first_servico,
      _assinatura_id
    )
    RETURNING id, agendamentos.cancel_token INTO v_agendamento_id, v_cancel_token;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'SLOT_INDISPONIVEL';
  END;

  IF _servico_ids IS NOT NULL THEN
    FOREACH v_servico_id IN ARRAY _servico_ids LOOP
      INSERT INTO public.agendamento_servicos (agendamento_id, servico_id)
      VALUES (v_agendamento_id, v_servico_id);
    END LOOP;
  END IF;

  RETURN QUERY SELECT v_agendamento_id, v_cancel_token, v_cliente_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.criar_agendamento(text, text, date, time, uuid[], uuid) TO anon, authenticated;
```

Observação importante: a validação do `FOR UPDATE` já lida com `SLOT_INDISPONIVEL` por trás do índice único existente (`agendamentos_unique_slot_active`); `PLANO_INVALIDO` é um erro novo e distinto — o front deve tratar os dois separadamente (feito na Task 8).

- [ ] **Step 2: Apensar o trigger de estorno de crédito**

```sql
-- ============================================================
-- Estorna o crédito do plano se o agendamento for cancelado
-- (cobre tanto cancelamento manual do admin quanto o auto-cancelamento
-- de pendentes expirados em expire_pending_agendamentos).
-- ============================================================
CREATE OR REPLACE FUNCTION public.estornar_credito_plano()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.assinaturas_planos
    SET creditos_restantes = creditos_restantes + 1
    WHERE id = NEW.assinatura_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER agendamentos_estorna_credito_plano
  AFTER UPDATE ON public.agendamentos
  FOR EACH ROW
  WHEN (NEW.status = 'cancelado' AND OLD.status IN ('pendente', 'ativo') AND NEW.assinatura_id IS NOT NULL)
  EXECUTE FUNCTION public.estornar_credito_plano();
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20261003000000_planos_mensais.sql
git commit -m "feat(db): criar_agendamento aceita credito de plano + trigger de estorno"
```

---

### Task 5: Aplicar a migration no Supabase

- [ ] **Step 1: Rodar a migration**

Se o projeto tiver o Supabase CLI linkado (`supabase link --project-ref lcdwpkxunggievzchtay`):

```bash
supabase db push
```

Se não tiver CLI configurado localmente, abra o SQL Editor do projeto no painel do Supabase (https://supabase.com/dashboard/project/lcdwpkxunggievzchtay/sql/new) e cole o conteúdo de `supabase/migrations/20261003000000_planos_mensais.sql`, executando uma vez.

- [ ] **Step 2: Conferir que as tabelas e funções existem**

No SQL Editor, rodar:

```sql
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('planos', 'plano_servicos', 'assinaturas_planos', 'receitas_avulsas');
SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name IN ('solicitar_plano', 'get_plano_ativo_por_telefone', 'aprovar_plano', 'rejeitar_plano');
```

Esperado: 4 linhas na primeira query, 4 linhas na segunda.

---

### Task 6: `src/lib/planos-helpers.ts` — funções públicas + testes

**Files:**
- Create: `src/lib/planos-helpers.ts`
- Create: `src/test/planos-helpers.test.ts`

- [ ] **Step 1: Escrever os testes das funções públicas (falhando)**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/integrations/supabase/client", () => {
  const state: any = {
    rpcError: null,
    rpcData: null,
    lastRpcCall: null,
    planosData: [] as any[],
    planoServicosData: [] as any[],
  };
  const client = {
    rpc: (name: string, params: any) => {
      state.lastRpcCall = { name, params };
      if (state.rpcError) return Promise.resolve({ data: null, error: state.rpcError });
      return Promise.resolve({ data: state.rpcData, error: null });
    },
    from: (table: string) => {
      if (table === "planos") {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({ data: state.planosData, error: null }),
            }),
          }),
        };
      }
      if (table === "plano_servicos") {
        return {
          select: () => ({
            in: async () => ({ data: state.planoServicosData, error: null }),
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
import {
  solicitarPlano,
  AssinaturaExistenteError,
  getPlanoAtivoPorTelefone,
  listPlanosPublicos,
} from "@/lib/planos-helpers";

const getState = () => (supabase as any).__state;

beforeEach(() => {
  const s = getState();
  s.rpcError = null;
  s.rpcData = null;
  s.lastRpcCall = null;
  s.planosData = [];
  s.planoServicosData = [];
});

describe("solicitarPlano", () => {
  it("chama a RPC solicitar_plano com os parametros corretos e retorna o id", async () => {
    getState().rpcData = "assinatura-1";
    const id = await solicitarPlano("Joao", "21999999999", "plano-1");
    expect(getState().lastRpcCall).toEqual({
      name: "solicitar_plano",
      params: { _nome: "Joao", _telefone: "21999999999", _plano_id: "plano-1" },
    });
    expect(id).toBe("assinatura-1");
  });

  it("mapeia erro ASSINATURA_EXISTENTE para AssinaturaExistenteError", async () => {
    getState().rpcError = { message: "ASSINATURA_EXISTENTE" };
    await expect(solicitarPlano("Joao", "21999999999", "plano-1")).rejects.toBeInstanceOf(
      AssinaturaExistenteError
    );
  });
});

describe("getPlanoAtivoPorTelefone", () => {
  it("retorna null quando a RPC nao retorna linha", async () => {
    getState().rpcData = [];
    const result = await getPlanoAtivoPorTelefone("21999999999");
    expect(result).toBeNull();
  });

  it("mapeia a linha retornada para o formato camelCase", async () => {
    getState().rpcData = [
      {
        assinatura_id: "ass-1",
        plano_nome: "Corte e Barba",
        creditos_restantes: 3,
        expira_em: "2026-11-01T00:00:00Z",
        servico_ids: ["s1", "s2"],
      },
    ];
    const result = await getPlanoAtivoPorTelefone("21999999999");
    expect(result).toEqual({
      assinaturaId: "ass-1",
      planoNome: "Corte e Barba",
      creditosRestantes: 3,
      expiraEm: "2026-11-01T00:00:00Z",
      servicoIds: ["s1", "s2"],
    });
  });
});

describe("listPlanosPublicos", () => {
  it("junta planos ativos com seus servico_ids", async () => {
    getState().planosData = [{ id: "p1", nome: "Corte", preco: "94.99" }];
    getState().planoServicosData = [{ plano_id: "p1", servico_id: "srv-corte" }];
    const result = await listPlanosPublicos();
    expect(result).toEqual([
      { id: "p1", nome: "Corte", preco: 94.99, servico_ids: ["srv-corte"] },
    ]);
  });

  it("retorna array vazio sem chamar plano_servicos quando nao ha planos", async () => {
    getState().planosData = [];
    const result = await listPlanosPublicos();
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar os testes para confirmar que falham (módulo não existe)**

Run: `npx vitest run src/test/planos-helpers.test.ts`
Expected: FAIL — `Cannot find module '@/lib/planos-helpers'`

- [ ] **Step 3: Implementar `src/lib/planos-helpers.ts`**

```ts
import { supabase } from "@/integrations/supabase/client";

export class AssinaturaExistenteError extends Error {
  constructor() {
    super("Já existe uma solicitação de plano em andamento para esse telefone.");
    this.name = "AssinaturaExistenteError";
  }
}

export interface PlanoPublico {
  id: string;
  nome: string;
  preco: number;
  servico_ids: string[];
}

export async function listPlanosPublicos(): Promise<PlanoPublico[]> {
  const { data: planos, error } = await supabase
    .from("planos")
    .select("id, nome, preco")
    .eq("ativo", true)
    .order("preco", { ascending: false });
  if (error) throw error;
  if (!planos || planos.length === 0) return [];

  const { data: vinculos, error: vinculosError } = await supabase
    .from("plano_servicos")
    .select("plano_id, servico_id")
    .in("plano_id", planos.map((p: any) => p.id));
  if (vinculosError) throw vinculosError;

  return planos.map((p: any) => ({
    id: p.id,
    nome: p.nome,
    preco: Number(p.preco),
    servico_ids: (vinculos || [])
      .filter((v: any) => v.plano_id === p.id)
      .map((v: any) => v.servico_id),
  }));
}

export async function solicitarPlano(
  nome: string,
  telefone: string,
  planoId: string
): Promise<string> {
  const { data, error } = await supabase.rpc("solicitar_plano", {
    _nome: nome,
    _telefone: telefone,
    _plano_id: planoId,
  });
  if (error) {
    if (error.message?.includes("ASSINATURA_EXISTENTE")) {
      throw new AssinaturaExistenteError();
    }
    throw error;
  }
  return data as string;
}

export interface PlanoAtivoInfo {
  assinaturaId: string;
  planoNome: string;
  creditosRestantes: number;
  expiraEm: string;
  servicoIds: string[];
}

export async function getPlanoAtivoPorTelefone(telefone: string): Promise<PlanoAtivoInfo | null> {
  const { data, error } = await supabase.rpc("get_plano_ativo_por_telefone", {
    _telefone: telefone,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    assinaturaId: row.assinatura_id,
    planoNome: row.plano_nome,
    creditosRestantes: row.creditos_restantes,
    expiraEm: row.expira_em,
    servicoIds: row.servico_ids || [],
  };
}
```

- [ ] **Step 4: Rodar os testes de novo**

Run: `npx vitest run src/test/planos-helpers.test.ts`
Expected: PASS (6 testes)

- [ ] **Step 5: Commit**

```bash
git add src/lib/planos-helpers.ts src/test/planos-helpers.test.ts
git commit -m "feat: helpers publicos de planos (solicitar, consultar, listar)"
```

---

### Task 7: `src/lib/planos-helpers.ts` — funções de admin + teste de `setPlanoServicos`

**Files:**
- Modify: `src/lib/planos-helpers.ts`
- Modify: `src/test/planos-helpers.test.ts`

- [ ] **Step 1: Apensar teste de `setPlanoServicos` (delete + insert, mesmo padrão de `saveFavoritosCliente`)**

Adicionar ao mock do `from` em `src/test/planos-helpers.test.ts` (dentro do `vi.mock`, no `switch`/`if` de tabelas):

```ts
      if (table === "plano_servicos") {
        return {
          select: () => ({
            in: async () => ({ data: state.planoServicosData, error: null }),
          }),
          delete: () => ({
            eq: (_col: string, planoId: string) => {
              state.deletedPlanoServicosIds = state.deletedPlanoServicosIds || [];
              state.deletedPlanoServicosIds.push(planoId);
              return Promise.resolve({ error: null });
            },
          }),
          insert: async (rows: any[]) => {
            state.insertedPlanoServicosRows = state.insertedPlanoServicosRows || [];
            state.insertedPlanoServicosRows.push(...rows);
            return { error: null };
          },
        };
      }
```

(Isso substitui o bloco `if (table === "plano_servicos") { ... }` já escrito na Task 6 — ele ganha `delete`/`insert` além do `select`.)

E ao final do arquivo de teste:

```ts
import { setPlanoServicos, aprovarPlano, rejeitarPlano } from "@/lib/planos-helpers";

describe("setPlanoServicos", () => {
  it("deleta vinculos antigos e insere os novos", async () => {
    await setPlanoServicos("plano-1", ["s1", "s2"]);
    const s = getState();
    expect(s.deletedPlanoServicosIds).toEqual(["plano-1"]);
    expect(s.insertedPlanoServicosRows).toEqual([
      { plano_id: "plano-1", servico_id: "s1" },
      { plano_id: "plano-1", servico_id: "s2" },
    ]);
  });

  it("array vazio so deleta, nao insere", async () => {
    await setPlanoServicos("plano-1", []);
    const s = getState();
    expect(s.deletedPlanoServicosIds).toEqual(["plano-1"]);
    expect(s.insertedPlanoServicosRows).toBeUndefined();
  });
});

describe("aprovarPlano / rejeitarPlano", () => {
  it("aprovarPlano chama a RPC aprovar_plano com o id certo", async () => {
    await aprovarPlano("ass-1");
    expect(getState().lastRpcCall).toEqual({ name: "aprovar_plano", params: { _assinatura_id: "ass-1" } });
  });

  it("rejeitarPlano chama a RPC rejeitar_plano com o id certo", async () => {
    await rejeitarPlano("ass-1");
    expect(getState().lastRpcCall).toEqual({ name: "rejeitar_plano", params: { _assinatura_id: "ass-1" } });
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx vitest run src/test/planos-helpers.test.ts`
Expected: FAIL — `setPlanoServicos`/`aprovarPlano`/`rejeitarPlano` não exportados ainda.

- [ ] **Step 3: Apensar as funções de admin em `src/lib/planos-helpers.ts`**

```ts
export interface AssinaturaAdmin {
  id: string;
  clienteNome: string;
  clienteTelefone: string;
  planoNome: string;
  criadoEm: string;
  creditosRestantes?: number;
  expiraEm?: string;
}

export async function listAssinaturasPendentes(): Promise<AssinaturaAdmin[]> {
  const { data, error } = await supabase
    .from("assinaturas_planos")
    .select("id, criado_em, usuarios(nome, telefone), planos(nome)")
    .eq("status", "pendente_pagamento")
    .order("criado_em", { ascending: true });
  if (error) throw error;
  return (data || []).map((a: any) => ({
    id: a.id,
    clienteNome: a.usuarios?.nome || "Cliente",
    clienteTelefone: a.usuarios?.telefone || "",
    planoNome: a.planos?.nome || "",
    criadoEm: a.criado_em,
  }));
}

export async function listAssinaturasAtivas(): Promise<AssinaturaAdmin[]> {
  const { data, error } = await supabase
    .from("assinaturas_planos")
    .select("id, criado_em, expira_em, creditos_restantes, usuarios(nome, telefone), planos(nome)")
    .eq("status", "ativo")
    .order("expira_em", { ascending: true });
  if (error) throw error;
  return (data || []).map((a: any) => ({
    id: a.id,
    clienteNome: a.usuarios?.nome || "Cliente",
    clienteTelefone: a.usuarios?.telefone || "",
    planoNome: a.planos?.nome || "",
    criadoEm: a.criado_em,
    creditosRestantes: a.creditos_restantes,
    expiraEm: a.expira_em,
  }));
}

export async function aprovarPlano(assinaturaId: string): Promise<void> {
  const { error } = await supabase.rpc("aprovar_plano", { _assinatura_id: assinaturaId });
  if (error) throw error;
}

export async function rejeitarPlano(assinaturaId: string): Promise<void> {
  const { error } = await supabase.rpc("rejeitar_plano", { _assinatura_id: assinaturaId });
  if (error) throw error;
}

export interface PlanoAdmin {
  id: string;
  nome: string;
  preco: number;
  ativo: boolean;
  servico_ids: string[];
}

export async function listPlanosAdmin(): Promise<PlanoAdmin[]> {
  const { data: planos, error } = await supabase
    .from("planos")
    .select("id, nome, preco, ativo")
    .order("preco", { ascending: false });
  if (error) throw error;
  if (!planos || planos.length === 0) return [];

  const { data: vinculos, error: vinculosError } = await supabase
    .from("plano_servicos")
    .select("plano_id, servico_id")
    .in("plano_id", planos.map((p: any) => p.id));
  if (vinculosError) throw vinculosError;

  return planos.map((p: any) => ({
    id: p.id,
    nome: p.nome,
    preco: Number(p.preco),
    ativo: p.ativo,
    servico_ids: (vinculos || [])
      .filter((v: any) => v.plano_id === p.id)
      .map((v: any) => v.servico_id),
  }));
}

export async function upsertPlano(plano: {
  id?: string;
  nome: string;
  preco: number;
  ativo: boolean;
}): Promise<string> {
  if (plano.id) {
    const { error } = await supabase
      .from("planos")
      .update({ nome: plano.nome, preco: plano.preco, ativo: plano.ativo })
      .eq("id", plano.id);
    if (error) throw error;
    return plano.id;
  }
  const { data, error } = await supabase
    .from("planos")
    .insert({ nome: plano.nome, preco: plano.preco, ativo: plano.ativo })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function setPlanoServicos(planoId: string, servicoIds: string[]): Promise<void> {
  const { error: deleteError } = await supabase
    .from("plano_servicos")
    .delete()
    .eq("plano_id", planoId);
  if (deleteError) throw deleteError;

  if (servicoIds.length === 0) return;

  const rows = servicoIds.map((sid) => ({ plano_id: planoId, servico_id: sid }));
  const { error: insertError } = await supabase.from("plano_servicos").insert(rows);
  if (insertError) throw insertError;
}
```

- [ ] **Step 4: Rodar os testes de novo**

Run: `npx vitest run src/test/planos-helpers.test.ts`
Expected: PASS (10 testes)

- [ ] **Step 5: Commit**

```bash
git add src/lib/planos-helpers.ts src/test/planos-helpers.test.ts
git commit -m "feat: helpers de admin de planos (listar, aprovar, rejeitar, configurar)"
```

---

### Task 8: `createAppointment` aceita crédito de plano

**Files:**
- Modify: `src/lib/supabase-helpers.ts`
- Modify: `src/test/double-booking.test.ts`

- [ ] **Step 1: Apensar teste em `src/test/double-booking.test.ts`**

```ts
describe("createAppointment com plano", () => {
  it("inclui _assinatura_id na chamada da RPC quando informado", async () => {
    await createAppointment("Joao", "21999999999", "2026-06-02", "10:00:00", ["s1"], "ass-1");
    expect(getState().lastRpcCall).toEqual({
      name: "criar_agendamento",
      params: {
        _nome: "Joao",
        _telefone: "21999999999",
        _data: "2026-06-02",
        _horario: "10:00:00",
        _servico_ids: ["s1"],
        _assinatura_id: "ass-1",
      },
    });
  });

  it("manda _assinatura_id null quando nao informado", async () => {
    await createAppointment("Joao", "21999999999", "2026-06-02", "10:00:00", ["s1"]);
    expect(getState().lastRpcCall.params._assinatura_id).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npx vitest run src/test/double-booking.test.ts`
Expected: FAIL — `_assinatura_id` ausente do objeto de params (o `toEqual` não bate).

- [ ] **Step 3: Modificar `createAppointment` em `src/lib/supabase-helpers.ts`**

Localizar a função (próximo ao final do arquivo, linhas ~117-144 no estado atual) e substituir:

```ts
export async function createAppointment(
  nome: string,
  telefone: string,
  data: string,
  horario: string,
  servicoIds: string[]
) {
  const { data: rows, error } = await supabase.rpc("criar_agendamento", {
    _nome: nome,
    _telefone: telefone,
    _data: data,
    _horario: horario,
    _servico_ids: servicoIds,
  });
```

por:

```ts
export async function createAppointment(
  nome: string,
  telefone: string,
  data: string,
  horario: string,
  servicoIds: string[],
  assinaturaId?: string
) {
  const { data: rows, error } = await supabase.rpc("criar_agendamento", {
    _nome: nome,
    _telefone: telefone,
    _data: data,
    _horario: horario,
    _servico_ids: servicoIds,
    _assinatura_id: assinaturaId ?? null,
  });
```

O resto da função (tratamento de `SLOT_INDISPONIVEL` e o `return`) permanece igual. Adicionar logo abaixo, no mesmo arquivo, a classe de erro usada pela UI:

```ts
export class PlanoInvalidoError extends Error {
  constructor() {
    super("Não foi possível usar o plano para este agendamento.");
    this.name = "PlanoInvalidoError";
  }
}
```

E no bloco de tratamento de erro da RPC, logo acima do `throw error;` existente:

```ts
  if (error) {
    if (error.message?.includes("SLOT_INDISPONIVEL")) {
      throw new SlotIndisponivelError();
    }
    if (error.message?.includes("PLANO_INVALIDO")) {
      throw new PlanoInvalidoError();
    }
    throw error;
  }
```

- [ ] **Step 4: Rodar os testes de novo**

Run: `npx vitest run src/test/double-booking.test.ts`
Expected: PASS (todos os testes do arquivo, incluindo os 2 novos)

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase-helpers.ts src/test/double-booking.test.ts
git commit -m "feat: createAppointment aceita credito de plano (assinatura_id)"
```

---

### Task 9: Página pública `/planos`

**Files:**
- Create: `src/pages/Planos.tsx`
- Modify: `src/App.tsx`
- Modify: `src/pages/Index.tsx`

- [ ] **Step 1: Criar `src/pages/Planos.tsx`**

```tsx
import { useState } from "react";
import { Scissors, Check, Phone, User } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PixQR } from "@/components/PixQR";
import { supabase } from "@/integrations/supabase/client";
import { listPlanosPublicos, solicitarPlano, AssinaturaExistenteError, type PlanoPublico } from "@/lib/planos-helpers";
import { useToast } from "@/hooks/use-toast";

type Etapa = "lista" | "form" | "pix";

export default function Planos() {
  const { toast } = useToast();
  const [etapa, setEtapa] = useState<Etapa>("lista");
  const [planoSelecionado, setPlanoSelecionado] = useState<PlanoPublico | null>(null);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: planos = [], isLoading } = useQuery({
    queryKey: ["planos-publicos"],
    queryFn: listPlanosPublicos,
  });

  const { data: config } = useQuery({
    queryKey: ["configuracoes-app-pix"],
    queryFn: async () => {
      const { data } = await supabase
        .from("configuracoes_app")
        .select("pix_chave, pix_nome_titular, pix_cidade")
        .limit(1)
        .maybeSingle();
      return data as { pix_chave: string | null; pix_nome_titular: string | null; pix_cidade: string | null } | null;
    },
  });

  const handleSelecionar = (plano: PlanoPublico) => {
    setPlanoSelecionado(plano);
    setEtapa("form");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planoSelecionado) return;
    if (nome.trim().length < 2) {
      toast({ title: "Nome inválido", description: "Informe pelo menos 2 caracteres.", variant: "destructive" });
      return;
    }
    if (!/^\d{10,11}$/.test(telefone.replace(/\D/g, ""))) {
      toast({ title: "Telefone inválido", description: "Informe DDD + número.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await solicitarPlano(nome.trim(), telefone, planoSelecionado.id);
      setEtapa("pix");
    } catch (err) {
      if (err instanceof AssinaturaExistenteError) {
        toast({ title: "Solicitação já existe", description: err.message, variant: "destructive" });
      } else {
        toast({ title: "Erro ao solicitar plano", description: (err as Error).message, variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container flex items-center gap-2 py-4">
          <Scissors className="h-6 w-6 text-primary" />
          <h1 className="text-2xl tracking-wider">BARBEARIA</h1>
        </div>
      </header>

      <main className="container max-w-3xl py-8 space-y-8 animate-fade-in">
        {etapa === "lista" && (
          <>
            <div className="text-center space-y-2">
              <h2 className="text-4xl">PLANO MENSAL</h2>
              <p className="text-muted-foreground">4 atendimentos por mês, agendáveis de terça a quinta</p>
            </div>

            {isLoading && <p className="text-center text-muted-foreground">Carregando planos...</p>}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {planos.map((plano) => (
                <div key={plano.id} className="bg-card rounded-2xl p-6 border border-border flex flex-col gap-4 items-center text-center">
                  <h3 className="font-heading text-xl tracking-wide">{plano.nome.toUpperCase()}</h3>
                  <p className="font-heading text-3xl text-primary">
                    R$ {plano.preco.toFixed(2).replace(".", ",")}
                  </p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check className="h-4 w-4 text-primary" /> 4 atendimentos/mês
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check className="h-4 w-4 text-primary" /> Terça a quinta
                  </div>
                  <Button onClick={() => handleSelecionar(plano)} className="w-full font-heading tracking-widest">
                    QUERO ESSE PLANO
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}

        {etapa === "form" && planoSelecionado && (
          <form onSubmit={handleSubmit} className="space-y-6 max-w-md mx-auto">
            <div className="text-center space-y-2">
              <h2 className="text-3xl">{planoSelecionado.nome.toUpperCase()}</h2>
              <p className="font-heading text-2xl text-primary">
                R$ {planoSelecionado.preco.toFixed(2).replace(".", ",")}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="nome" className="flex items-center gap-2">
                <User className="h-4 w-4 text-primary" /> Nome
              </Label>
              <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome completo" required minLength={2} maxLength={60} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="telefone" className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-primary" /> Telefone
              </Label>
              <Input id="telefone" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(21) 99999-9999" required maxLength={20} />
            </div>
            <Button type="submit" disabled={loading} className="w-full py-6 text-lg font-heading tracking-widest" size="lg">
              {loading ? "ENVIANDO..." : "CONTINUAR PARA O PAGAMENTO"}
            </Button>
          </form>
        )}

        {etapa === "pix" && planoSelecionado && (
          <div className="max-w-md mx-auto text-center space-y-6">
            <h2 className="text-2xl">PAGUE VIA PIX PARA ATIVAR</h2>
            <PixQR
              chave={config?.pix_chave || ""}
              nome={config?.pix_nome_titular || ""}
              cidade={config?.pix_cidade || ""}
              valor={planoSelecionado.preco}
            />
            <p className="text-sm text-muted-foreground">
              Após o pagamento, aguarde a confirmação do administrador. Você pode fechar esta página.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Registrar a rota em `src/App.tsx`**

No bloco de imports estáticos (perto de `import Produtos from "./pages/Produtos";`):

```tsx
import Produtos from "./pages/Produtos";
import Planos from "./pages/Planos";
```

E na lista de `<Routes>`, logo após a rota de produtos:

```tsx
            <Route path="/produtos" element={<Produtos />} />
            <Route path="/planos" element={<Planos />} />
```

- [ ] **Step 3: Adicionar botão "PLANOS" na home (`src/pages/Index.tsx`)**

Localizar o bloco dos dois botões do hero (linhas ~68-86) e trocar:

```tsx
          <div className="mt-10 flex flex-col sm:flex-row gap-4 w-full max-w-md">
```

por:

```tsx
          <div className="mt-10 flex flex-col sm:flex-row flex-wrap justify-center gap-4 w-full max-w-xl">
```

E apensar um terceiro botão, logo após o de "PRODUTOS":

```tsx
            <Button
              onClick={() => navigate("/planos")}
              variant="outline"
              className="flex-1 py-8 text-xl font-heading tracking-[0.2em] border-primary/40 bg-black/40 text-white hover:bg-black/60 hover:border-primary transition-all backdrop-blur-md"
              size="lg"
            >
              PLANOS
            </Button>
```

- [ ] **Step 4: Testar manualmente no navegador**

Rodar `npm run dev`, abrir `/planos`. Se já houver pelo menos um plano cadastrado (ver Task 11 para cadastrar), confirmar que os cards aparecem, o formulário valida nome/telefone, e o QR Pix é exibido após enviar (mesmo que `pix_chave` esteja vazio — nesse caso o `PixQR` já mostra "Pagamento via Pix indisponível no momento.", comportamento existente do componente).

- [ ] **Step 5: Commit**

```bash
git add src/pages/Planos.tsx src/App.tsx src/pages/Index.tsx
git commit -m "feat: pagina publica /planos para solicitar plano mensal"
```

---

### Task 10: Toggle "usar meu plano" em `AgendamentoDados`

**Files:**
- Modify: `src/pages/AgendamentoDados.tsx`

- [ ] **Step 1: Adicionar imports e estado de plano**

No topo do arquivo, junto aos imports existentes:

```tsx
import { useEffect, useState } from "react";
```

(troca a linha `import { useState } from "react";` por essa). Depois, junto aos outros imports de `@/lib`:

```tsx
import { getPlanoAtivoPorTelefone, type PlanoAtivoInfo } from "@/lib/planos-helpers";
import { getDayOfWeek } from "@/lib/time-utils";
import { Checkbox } from "@/components/ui/checkbox";
```

Dentro do componente, junto aos outros `useState`:

```tsx
  const [planoInfo, setPlanoInfo] = useState<PlanoAtivoInfo | null>(null);
  const [usarPlano, setUsarPlano] = useState(false);
```

- [ ] **Step 2: Buscar o plano ativo com debounce ao digitar o telefone**

Logo após os `useState`, antes do `if (!date || ...)`:

```tsx
  useEffect(() => {
    const digits = telefone.replace(/\D/g, "");
    if (digits.length < 10) {
      setPlanoInfo(null);
      setUsarPlano(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const info = await getPlanoAtivoPorTelefone(telefone);
        setPlanoInfo(info);
      } catch {
        setPlanoInfo(null);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [telefone]);
```

- [ ] **Step 3: Calcular elegibilidade do plano (dia + serviços batendo)**

Logo abaixo de `const totalMinutos = ...`:

```tsx
  const diaSemana = getDayOfWeek(date);
  const isTercaAQuinta = [2, 3, 4].includes(diaSemana);
  const servicoIdsSelecionados = [...servicos.map((s) => s.id)].sort();
  const planoElegivel =
    !!planoInfo &&
    isTercaAQuinta &&
    JSON.stringify(planoInfo.servicoIds.slice().sort()) === JSON.stringify(servicoIdsSelecionados);

  useEffect(() => {
    if (!planoElegivel) setUsarPlano(false);
  }, [planoElegivel]);

  const totalExibido = usarPlano && planoElegivel ? 0 : totalPrice;
```

- [ ] **Step 4: Mostrar o checkbox na UI (logo abaixo do resumo, antes do `<form>`)**

Substituir:

```tsx
        <form onSubmit={handleSubmit} className="space-y-6">
```

por:

```tsx
        {planoElegivel && (
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-center gap-3">
            <Checkbox
              id="usar-plano"
              checked={usarPlano}
              onCheckedChange={(checked) => setUsarPlano(checked === true)}
            />
            <Label htmlFor="usar-plano" className="font-body text-sm cursor-pointer">
              Usar meu plano {planoInfo?.planoNome} (restam {planoInfo?.creditosRestantes}/4 cortes)
            </Label>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
```

E trocar o total exibido no resumo — localizar:

```tsx
            {servicos.length > 1 && (
              <span className="font-heading text-lg text-primary">Total: R$ {totalPrice.toFixed(2).replace(".", ",")}</span>
            )}
```

por:

```tsx
            {(servicos.length > 1 || (usarPlano && planoElegivel)) && (
              <span className="font-heading text-lg text-primary">
                Total: {usarPlano && planoElegivel ? "R$ 0,00 (plano)" : `R$ ${totalPrice.toFixed(2).replace(".", ",")}`}
              </span>
            )}
```

- [ ] **Step 5: Passar `assinatura_id` no submit e tratar `PlanoInvalidoError`**

No `handleSubmit`, trocar:

```tsx
      const { agendamento } = await createAppointment(nomeCompleto, telefone, date, time, servicos.map((s) => s.id));
```

por:

```tsx
      const assinaturaId = usarPlano && planoElegivel ? planoInfo?.assinaturaId : undefined;
      const { agendamento } = await createAppointment(
        nomeCompleto,
        telefone,
        date,
        time,
        servicos.map((s) => s.id),
        assinaturaId
      );
```

E no `catch`, importar `PlanoInvalidoError` de `@/lib/supabase-helpers` (adicionar ao import já existente `import { createAppointment, SlotIndisponivelError } from "@/lib/supabase-helpers";` → `import { createAppointment, SlotIndisponivelError, PlanoInvalidoError } from "@/lib/supabase-helpers";`) e adicionar um bloco antes do `catch` genérico:

```tsx
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
      if (err instanceof PlanoInvalidoError) {
        toast({ title: "Plano não pôde ser usado", description: err.message, variant: "destructive" });
        setUsarPlano(false);
        return;
      }
      toast({ title: "Erro ao agendar", description: err.message || "Tente novamente.", variant: "destructive" });
    } finally {
```

- [ ] **Step 6: Testar manualmente no navegador**

Pré-requisito: ter um plano ativo de teste (criar manualmente uma linha em `assinaturas_planos` com `status='ativo'`, `creditos_restantes=4`, `expira_em` no futuro, e vincular o serviço certo em `plano_servicos`, ou usar o fluxo completo das Tasks 9+11).

1. Rodar `npm run dev`, ir em `/agendamento`, escolher o serviço vinculado ao plano, escolher uma terça/quarta/quinta e um horário.
2. Em `/agendamento/dados`, digitar o telefone do cliente com plano ativo → o checkbox "Usar meu plano" deve aparecer depois de ~500ms.
3. Marcar o checkbox, confirmar que o total exibido vira "R$ 0,00 (plano)", e enviar — o agendamento deve ser criado.
4. Conferir no banco que `creditos_restantes` da assinatura caiu em 1 e que o `agendamentos.assinatura_id` foi preenchido.
5. Repetir escolhendo uma segunda/sexta/sábado/domingo → o checkbox não deve aparecer.

- [ ] **Step 7: Commit**

```bash
git add src/pages/AgendamentoDados.tsx
git commit -m "feat: permite usar credito de plano no agendamento"
```

---

### Task 11: Página admin `/admin/planos`

**Files:**
- Create: `src/pages/AdminPlanos.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/AdminSidebar.tsx`

- [ ] **Step 1: Criar `src/pages/AdminPlanos.tsx`**

```tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, X, Users, Settings as SettingsIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  listAssinaturasPendentes,
  listAssinaturasAtivas,
  aprovarPlano,
  rejeitarPlano,
  listPlanosAdmin,
  upsertPlano,
  setPlanoServicos,
  type PlanoAdmin,
} from "@/lib/planos-helpers";

export default function AdminPlanos() {
  const queryClient = useQueryClient();

  const { data: pendentes = [] } = useQuery({ queryKey: ["planos-pendentes"], queryFn: listAssinaturasPendentes });
  const { data: ativos = [] } = useQuery({ queryKey: ["planos-ativos"], queryFn: listAssinaturasAtivas });
  const { data: planos = [] } = useQuery({ queryKey: ["planos-admin"], queryFn: listPlanosAdmin });
  const { data: servicosAtivos = [] } = useQuery({
    queryKey: ["servicos-ativos-planos"],
    queryFn: async () => {
      const { data } = await supabase.from("servicos").select("id, nome").eq("ativo", true).order("nome");
      return data || [];
    },
  });

  const aprovarMutation = useMutation({
    mutationFn: aprovarPlano,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planos-pendentes"] });
      queryClient.invalidateQueries({ queryKey: ["planos-ativos"] });
      toast({ title: "Plano aprovado", description: "O cliente já pode usar os créditos." });
    },
    onError: (err: any) => toast({ title: "Erro ao aprovar", description: err.message, variant: "destructive" }),
  });

  const rejeitarMutation = useMutation({
    mutationFn: rejeitarPlano,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planos-pendentes"] });
      toast({ title: "Plano rejeitado" });
    },
    onError: (err: any) => toast({ title: "Erro ao rejeitar", description: err.message, variant: "destructive" }),
  });

  const [editando, setEditando] = useState<PlanoAdmin | null>(null);
  const [formNome, setFormNome] = useState("");
  const [formPreco, setFormPreco] = useState("0");
  const [formAtivo, setFormAtivo] = useState(true);
  const [formServicoIds, setFormServicoIds] = useState<string[]>([]);

  const salvarPlanoMutation = useMutation({
    mutationFn: async () => {
      const id = await upsertPlano({
        id: editando?.id,
        nome: formNome,
        preco: Number(formPreco.replace(",", ".")) || 0,
        ativo: formAtivo,
      });
      await setPlanoServicos(id, formServicoIds);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planos-admin"] });
      queryClient.invalidateQueries({ queryKey: ["planos-publicos"] });
      setEditando(null);
      setFormNome("");
      setFormPreco("0");
      setFormAtivo(true);
      setFormServicoIds([]);
      toast({ title: "Plano salvo" });
    },
    onError: (err: any) => toast({ title: "Erro ao salvar plano", description: err.message, variant: "destructive" }),
  });

  const handleEditar = (plano: PlanoAdmin) => {
    setEditando(plano);
    setFormNome(plano.nome);
    setFormPreco(String(plano.preco));
    setFormAtivo(plano.ativo);
    setFormServicoIds(plano.servico_ids);
  };

  return (
    <div className="container max-w-5xl py-8 space-y-6 animate-fade-in">
      <div>
        <h2 className="text-3xl font-heading tracking-wider">PLANOS</h2>
        <p className="text-muted-foreground font-body text-sm">Solicitações, assinaturas ativas e configuração dos planos</p>
      </div>

      <Tabs defaultValue="pendentes">
        <TabsList>
          <TabsTrigger value="pendentes">Pendentes ({pendentes.length})</TabsTrigger>
          <TabsTrigger value="ativos">Ativos ({ativos.length})</TabsTrigger>
          <TabsTrigger value="config">Configuração</TabsTrigger>
        </TabsList>

        <TabsContent value="pendentes" className="space-y-3 pt-4">
          {pendentes.length === 0 && <p className="text-muted-foreground text-sm">Nenhuma solicitação pendente.</p>}
          {pendentes.map((a) => (
            <div key={a.id} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="font-heading">{a.clienteNome} — {a.planoNome}</p>
                <p className="text-xs text-muted-foreground">{a.clienteTelefone} · {new Date(a.criadoEm).toLocaleString("pt-BR")}</p>
              </div>
              <div className="flex gap-2">
                <Button size="icon" variant="outline" onClick={() => aprovarMutation.mutate(a.id)} disabled={aprovarMutation.isPending}>
                  <Check className="h-4 w-4 text-green-600" />
                </Button>
                <Button size="icon" variant="outline" onClick={() => rejeitarMutation.mutate(a.id)} disabled={rejeitarMutation.isPending}>
                  <X className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="ativos" className="space-y-3 pt-4">
          {ativos.length === 0 && <p className="text-muted-foreground text-sm">Nenhum plano ativo.</p>}
          {ativos.map((a) => (
            <div key={a.id} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="font-heading">{a.clienteNome} — {a.planoNome}</p>
                <p className="text-xs text-muted-foreground">{a.clienteTelefone}</p>
              </div>
              <div className="text-right text-sm">
                <p>{a.creditosRestantes}/4 créditos</p>
                <p className="text-xs text-muted-foreground">
                  {a.expiraEm && new Date(a.expiraEm) < new Date() ? "Expirado" : `Válido até ${new Date(a.expiraEm!).toLocaleDateString("pt-BR")}`}
                </p>
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="config" className="space-y-6 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {planos.map((p) => (
              <button
                key={p.id}
                onClick={() => handleEditar(p)}
                className="bg-card border border-border rounded-xl p-4 text-left hover:border-primary/50"
              >
                <p className="font-heading">{p.nome} {!p.ativo && "(inativo)"}</p>
                <p className="text-primary">R$ {p.preco.toFixed(2).replace(".", ",")}</p>
              </button>
            ))}
            <button
              onClick={() => { setEditando(null); setFormNome(""); setFormPreco("0"); setFormAtivo(true); setFormServicoIds([]); }}
              className="border border-dashed border-border rounded-xl p-4 text-muted-foreground hover:border-primary/50"
            >
              + Novo plano
            </button>
          </div>

          <div className="bg-card border border-border rounded-xl p-4 space-y-4 max-w-md">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={formNome} onChange={(e) => setFormNome(e.target.value)} placeholder="Corte e Barba" />
            </div>
            <div className="space-y-2">
              <Label>Preço (R$)</Label>
              <Input value={formPreco} onChange={(e) => setFormPreco(e.target.value)} placeholder="174,99" />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={formAtivo} onCheckedChange={setFormAtivo} />
              <Label>Ativo</Label>
            </div>
            <div className="space-y-2">
              <Label>Serviços liberados pelo plano</Label>
              <div className="max-h-32 overflow-auto space-y-1 border rounded-md p-2 bg-muted/20">
                {servicosAtivos.map((sv: any) => (
                  <label key={sv.id} className="flex items-center gap-2 p-1 cursor-pointer hover:bg-muted rounded-sm">
                    <input
                      type="checkbox"
                      checked={formServicoIds.includes(sv.id)}
                      onChange={(e) =>
                        setFormServicoIds((prev) =>
                          e.target.checked ? [...prev, sv.id] : prev.filter((id) => id !== sv.id)
                        )
                      }
                      className="accent-primary"
                    />
                    <span className="text-sm font-body">{sv.nome}</span>
                  </label>
                ))}
              </div>
            </div>
            <Button onClick={() => salvarPlanoMutation.mutate()} disabled={!formNome || salvarPlanoMutation.isPending}>
              Salvar plano
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 2: Verificar se `Switch` existe em `src/components/ui`**

Run: `ls src/components/ui | grep switch`
Expected: `switch.tsx` listado (componente shadcn padrão já presente no projeto — usado em `AdminServicos.tsx`/`AdminConfiguracoes.tsx`). Se não existir, trocar o uso de `Switch`/`onCheckedChange` por um `<input type="checkbox">` simples como os já usados mais abaixo no mesmo arquivo.

- [ ] **Step 3: Registrar a rota em `src/App.tsx`**

Junto aos outros lazy imports de admin:

```tsx
const AdminAnaliseServicos = lazy(() => import("./pages/AdminAnaliseServicos"));
const AdminPlanos = lazy(() => import("./pages/AdminPlanos"));
```

E na lista de rotas protegidas, logo após `/admin/analise-servicos`:

```tsx
              <Route path="/admin/analise-servicos" element={<AdminAnaliseServicos />} />
              <Route path="/admin/planos" element={<AdminPlanos />} />
```

- [ ] **Step 4: Adicionar item no `src/components/AdminSidebar.tsx`**

No array `items`, importar o ícone `CreditCard` junto aos demais (`import { ..., PieChart } from "lucide-react";` → adicionar `CreditCard`) e apensar ao array, logo após "Análise de Serviços":

```tsx
  { title: "Análise de Serviços", url: "/admin/analise-servicos", icon: PieChart },
  { title: "Planos", url: "/admin/planos", icon: CreditCard },
```

- [ ] **Step 5: Testar manualmente no navegador**

1. `npm run dev`, logar como admin, abrir `/admin/planos`.
2. Na aba "Configuração", criar os 3 planos (Corte, Barba, Corte e Barba) com preço e serviço(s) vinculado(s); salvar cada um.
3. Ir em `/planos` (público) e confirmar que os 3 cards aparecem com os preços certos.
4. Solicitar um plano pelo formulário público; voltar ao admin em "Pendentes" e confirmar que a solicitação aparece.
5. Clicar em aprovar; confirmar que ela some de "Pendentes" e aparece em "Ativos" com 4/4 créditos.
6. Conferir em `/admin/financeiro` que uma receita no valor do plano foi lançada na data de hoje (Task 12 cobre essa integração — se ainda não implementada, a tabela `receitas_avulsas` já deve ter a linha, só não aparece na tela ainda).

- [ ] **Step 6: Commit**

```bash
git add src/pages/AdminPlanos.tsx src/App.tsx src/components/AdminSidebar.tsx
git commit -m "feat(admin): pagina de gerenciamento de planos (pendentes, ativos, configuracao)"
```

---

### Task 12: Financeiro — somar `receitas_avulsas` e zerar agendamentos pagos por plano

**Files:**
- Modify: `src/pages/AdminFinanceiro.tsx`

- [ ] **Step 1: Buscar `receitas_avulsas` do período junto com despesas**

Localizar o bloco (por volta da linha 117 no arquivo atual):

```tsx
        // 2) Despesas (sempre no range do período)
        const despesasQuery = supabase
          .from("despesas")
          .select("valor")
          .gte("data", startStr)
          .lte("data", endStr)
          .abortSignal(controller.signal);

        const [resAgendamentos, resDespesas] = await Promise.all([query, despesasQuery]);
        if (resAgendamentos.error) throw resAgendamentos.error;
        if (resDespesas.error) throw resDespesas.error;

        const agendamentos = resAgendamentos.data || [];
        const despesasData = resDespesas.data || [];
```

Substituir por:

```tsx
        // 2) Despesas (sempre no range do período)
        const despesasQuery = supabase
          .from("despesas")
          .select("valor")
          .gte("data", startStr)
          .lte("data", endStr)
          .abortSignal(controller.signal);

        // 2b) Receitas avulsas (planos aprovados no período)
        const receitasAvulsasQuery = supabase
          .from("receitas_avulsas")
          .select("id, descricao, valor, data")
          .gte("data", startStr)
          .lte("data", endStr)
          .abortSignal(controller.signal);

        const [resAgendamentos, resDespesas, resReceitasAvulsas] = await Promise.all([
          query,
          despesasQuery,
          receitasAvulsasQuery,
        ]);
        if (resAgendamentos.error) throw resAgendamentos.error;
        if (resDespesas.error) throw resDespesas.error;
        if (resReceitasAvulsas.error) throw resReceitasAvulsas.error;

        const agendamentos = resAgendamentos.data || [];
        const despesasData = resDespesas.data || [];
        const receitasAvulsasData = resReceitasAvulsas.data || [];
```

- [ ] **Step 2: Zerar o valor de agendamentos pagos por plano e somar as receitas avulsas ao total**

Localizar o `.map` que monta `items` (bloco "4) Monta items") e, dentro dele, trocar:

```tsx
        const items: any[] = agendamentos.map((a: any) => {
          const fromJunction = priceMap[a.id];
          const price = fromJunction
            ? fromJunction.total
            : Number(a.servicos?.preco || 0);
```

por:

```tsx
        const items: any[] = agendamentos.map((a: any) => {
          const fromJunction = priceMap[a.id];
          const price = a.assinatura_id
            ? 0
            : fromJunction
            ? fromJunction.total
            : Number(a.servicos?.preco || 0);
```

(isso exige que o `select` da query de agendamentos, no topo da função, inclua `assinatura_id` — localizar `.select("*, usuarios(nome, telefone), servicos(nome, preco))")` → como já usa `"*"`, `assinatura_id` já vem incluído automaticamente, nenhuma mudança necessária ali).

Depois, no cálculo do total (logo abaixo do `.map`):

```tsx
        // Faturamento bruto = soma de TUDO que aparece no detalhamento do período.
        // (Para dia/semana/mes a query já filtrou só status=finalizado;
        //  para historico segue o statusFilter escolhido.)
        const total = items.reduce((sum, it) => sum + Number(it.valor || 0), 0);
        const count = items.length;

        return { total, count, items, totalDespesas };
```

trocar por:

```tsx
        // Faturamento bruto = soma de TUDO que aparece no detalhamento do período,
        // mais as receitas avulsas (planos aprovados) do mesmo período.
        const totalReceitasAvulsas = receitasAvulsasData.reduce(
          (sum: number, r: any) => sum + Number(r.valor || 0),
          0
        );
        const total = items.reduce((sum, it) => sum + Number(it.valor || 0), 0) + totalReceitasAvulsas;
        const count = items.length;

        return { total, count, items, totalDespesas, receitasAvulsas: receitasAvulsasData };
```

- [ ] **Step 3: Atualizar o valor default do `useQuery` e exibir as receitas avulsas na lista**

Localizar:

```tsx
  const { data: report = { total: 0, count: 0, items: [], totalDespesas: 0 }, isLoading, isFetching, refetch } = useQuery({
```

trocar por:

```tsx
  const { data: report = { total: 0, count: 0, items: [], totalDespesas: 0, receitasAvulsas: [] }, isLoading, isFetching, refetch } = useQuery({
```

Depois, encontrar onde `report.items` é renderizado na lista/tabela do histórico (procurar por `report.items.map`) e, logo após esse bloco de renderização, apensar a lista de receitas avulsas como linhas extras marcadas como "Plano":

```tsx
            {report.receitasAvulsas.map((r: any) => (
              <div key={r.id} className="bg-card border border-border rounded-xl p-3 flex justify-between items-center">
                <div>
                  <p className="font-body text-sm font-medium">{r.descricao}</p>
                  <p className="text-xs text-muted-foreground">{new Date(r.data).toLocaleDateString("pt-BR")}</p>
                </div>
                <div className="text-right">
                  <p className="font-heading text-sm">R$ {Number(r.valor).toFixed(2).replace(".", ",")}</p>
                  <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-md bg-primary/10 text-primary">
                    Plano
                  </span>
                </div>
              </div>
            ))}
```

(O local exato de inserção depende do JSX de listagem já existente no arquivo — inserir dentro do mesmo container/grid que lista `report.items`, como itens irmãos.)

- [ ] **Step 4: Testar manualmente no navegador**

1. Com o plano aprovado do teste da Task 11 (que já gerou uma linha em `receitas_avulsas` hoje), abrir `/admin/financeiro`, período "Mês".
2. Confirmar que o total de faturamento inclui o valor do plano, e que a linha "Plano {nome} - {cliente}" aparece na listagem.
3. Se algum agendamento já tiver sido feito com crédito de plano (Task 10), confirmar que ele aparece no histórico com valor R$ 0,00 e não é somado duas vezes ao total.

- [ ] **Step 5: Commit**

```bash
git add src/pages/AdminFinanceiro.tsx
git commit -m "feat(financeiro): soma receitas avulsas de planos e zera agendamentos pagos por plano"
```

---

## Resumo de cobertura do spec

| Requisito do spec | Task(s) |
|---|---|
| Tabelas `planos`, `plano_servicos`, `assinaturas_planos`, `agendamentos.assinatura_id` | 1 |
| `solicitar_plano`, `get_plano_ativo_por_telefone` | 2 |
| `aprovar_plano` (+ receita), `rejeitar_plano` | 3 |
| `criar_agendamento` com crédito + regra terça-quinta + validação de serviço | 4 |
| Estorno de crédito ao cancelar (gap do spec, coberto no plano) | 4 |
| Página pública `/planos` com cards + Pix | 9 |
| Toggle "usar meu plano" no agendamento | 10 |
| Página admin de aprovação/configuração | 11 |
| Integração com Financeiro | 12 |
