# Exibir e Escolher Serviço nos Horários (Admin)

**Data:** 2026-05-26
**Status:** Aprovado, pronto para implementação

## Problema

Na tela `AdminHorarios.tsx`, horários ocupados mostram apenas o nome do cliente. O admin não consegue ver qual serviço foi agendado, e quando faz encaixe ou substituição, nem captura o serviço — o agendamento é criado sem vínculo na junction `agendamento_servicos`.

## Objetivo

1. Exibir os serviços de cada agendamento ativo na lista de horários.
2. Permitir que o admin selecione um ou mais serviços ao criar encaixe ou substituir cliente, persistindo em `agendamento_servicos`.

## Escopo

Em escopo:
- Query expandida em `AdminHorarios` para trazer serviços via junction
- Exibição CSV ("Corte, Barba") sob o nome do cliente em slots ocupados
- Seletor multi-select de serviços nos dialogs de Encaixe e Substituição
- Helpers extraídos com rollback de agendamento se a inserção da junction falhar
- Testes unitários cobrindo mapeamento, encaixe com rollback e substituição

Fora de escopo:
- Confirmação obrigatória via WhatsApp (próximo spec)
- Lembrete em massa
- Migrations (todas as tabelas e foreign keys já existem)

## Design

### 1. Query expandida

Em `src/pages/AdminHorarios.tsx`, substituir o select dos agendamentos por:

```ts
supabase
  .from("agendamentos")
  .select("id, horario, status, usuarios(nome), agendamento_servicos(servicos(nome))")
  .eq("data", data)
  .in("status", ["pendente", "ativo"])
```

Mapear cada agendamento para `{ nome: string, servicos: string[], status: "pendente" | "ativo" }`. Slots livres/bloqueados continuam sem essas chaves.

**Nota de dependência:** Esta feature assume o status `pendente` introduzido pela [spec de confirmação WhatsApp](2026-05-26-confirmacao-whatsapp-design.md). Se for implementada antes daquela, usar apenas `.eq("status", "ativo")` e remover o destaque visual de pendente.

### 2. UI — exibir serviço

No render dos slots, abaixo do `<p>` do nome do cliente:

```tsx
{s.servicos && s.servicos.length > 0 && (
  <p className="font-body text-xs text-primary mt-0.5">{s.servicos.join(", ")}</p>
)}
```

Slots com `status === "pendente"` usam borda/fundo amarelo + badge "AGUARDANDO CONFIRMAÇÃO" em vez do vermelho de ocupado. Agendamentos legados (sem linhas na junction) renderizam só o nome — sem regressão visual.

### 3. UI — escolher serviço no Encaixe e Substituição

- Adicionar query `useQuery(["servicos-ativos"])` buscando `id, nome` de `servicos` ativos, ordenados por nome.
- Estado novo `selectedServicoIds: string[]` (reset ao abrir/fechar os dialogs).
- Lista com checkboxes nos dois dialogs (Encaixe e Substituir Cliente), abaixo do seletor de cliente.
- Validação: pelo menos 1 serviço selecionado, senão toast "Selecione ao menos um serviço".

### 4. Helpers em `src/lib/admin-horarios-helpers.ts` (novo arquivo)

```ts
export type AgendamentoRow = {
  id: string;
  horario: string;
  usuarios: { nome: string } | null;
  agendamento_servicos: { servicos: { nome: string } | null }[] | null;
};

export type SlotInfo = { nome: string; servicos: string[] };

export function mapAgendamentoToSlot(ag: AgendamentoRow): SlotInfo {
  return {
    nome: ag.usuarios?.nome ?? "Cliente",
    servicos: (ag.agendamento_servicos ?? [])
      .map((j) => j.servicos?.nome)
      .filter((n): n is string => !!n),
  };
}

export async function createEncaixe(
  clienteId: string,
  data: string,
  horario: string,
  servicoIds: string[]
): Promise<void>;

export async function replaceAgendamentoServicos(
  agendamentoId: string,
  novoClienteId: string,
  servicoIds: string[]
): Promise<void>;
```

**`createEncaixe`**:
1. Insere em `agendamentos` (`{ cliente_id, data, horario, status: "ativo" }`).
2. Insere as linhas correspondentes em `agendamento_servicos`.
3. Se passo 2 falhar, faz `delete` do agendamento criado e propaga o erro.
4. Se passo 1 violar o índice único (slot ocupado), lança `SlotIndisponivelError` (mesmo padrão do `createAppointment`).

**`replaceAgendamentoServicos`**:
1. `update` no `agendamentos` setando `cliente_id`.
2. `delete` em `agendamento_servicos` por `agendamento_id`.
3. `insert` das novas linhas em `agendamento_servicos`.
4. Qualquer falha propaga (admin pode reabrir o dialog e tentar de novo).

### 5. Integração no componente

- Substituir as mutations inline `encaixeMutation` e `replaceAgendamento` por chamadas a `createEncaixe` e `replaceAgendamentoServicos`.
- Tratar `SlotIndisponivelError` no `onError` da encaixe mutation: toast claro + invalidate da query pra recarregar slots.

### 6. Testes (`src/test/admin-horarios-helpers.test.ts`)

1. `mapAgendamentoToSlot` com 2 serviços → `servicos: ["Corte", "Barba"]`.
2. `mapAgendamentoToSlot` sem junction (legado) → `servicos: []`, `nome` preservado.
3. `createEncaixe` happy path: insere agendamento, insere junction com N linhas, sem rollback.
4. `createEncaixe` falha na junction → `delete` do agendamento é chamado e o erro original propaga.
5. `createEncaixe` slot ocupado (erro 23505 com `SLOT_UNIQUE_INDEX`) → lança `SlotIndisponivelError`.
6. `replaceAgendamentoServicos` happy path: update + delete + insert chamados na ordem correta.

Mocks seguem o padrão de `double-booking.test.ts`.

## Critérios de Aceitação

- [ ] Slots ocupados exibem serviços em CSV
- [ ] Agendamentos legados sem junction continuam renderizando o nome
- [ ] Dialogs de Encaixe e Substituir Cliente têm seletor multi-select de serviço com validação
- [ ] Encaixe persiste serviços e faz rollback se a junction falhar
- [ ] Substituição substitui também os serviços
- [ ] Slot ocupado durante encaixe → `SlotIndisponivelError` com toast + reload
- [ ] 6 testes do helper passam

## Riscos

- **Performance da query**: o join via PostgREST é um SELECT extra por linha de junction; para dias com muitos agendamentos é trivial. Sem ação necessária.
- **Agendamentos legados sem serviços**: cobertos pelo teste 2; fallback grácil.
