# Confirmação obrigatória de agendamento via WhatsApp

**Data:** 2026-05-26
**Status:** Aprovado, pronto para implementação

## Problema

Hoje, qualquer cliente pode reservar um horário e nunca mais aparecer — não há filtro de "comprometimento". O dono da barbearia quer obrigar o cliente a abrir uma conversa no WhatsApp do admin para confirmar o horário; sem essa confirmação, o slot expira em 30 minutos.

## Objetivo

1. Agendamentos novos nascem com status `pendente` e `expira_em = now + 30min`.
2. O slot do agendamento pendente fica bloqueado para outros clientes.
3. Após a reserva, o cliente vê um botão "Confirmar pelo WhatsApp" que abre `wa.me/<admin>?text=<msg>` com uma mensagem pronta.
4. O admin recebe a mensagem no celular dele e clica em "Confirmar" na tela `AdminAgenda`; o status vai para `ativo`.
5. Agendamentos pendentes que passam de 30 min são cancelados automaticamente (cleanup-on-read).
6. O admin é notificado por um badge contador na sidebar enquanto está logado.

## Escopo

Em escopo:
- Novo valor `pendente` no enum `agendamento_status`
- Coluna `expira_em timestamptz` em `agendamentos`
- Atualização do índice único para cobrir `pendente` + `ativo`
- Função SQL `expire_pending_agendamentos()` + chamadas via RPC (cleanup-on-read)
- `createAppointment` cria com `status='pendente'` e `expira_em`
- Página `AgendamentoSucesso` com banner amarelo + botão de WhatsApp
- `AdminAgenda` com destaque visual para pendentes + botão Confirmar
- `AdminSidebar` com badge contador (refetch 30s)
- Testes unitários

Fora de escopo:
- Lembrete em massa
- Integração real com WhatsApp Business API
- Notificação browser/push

## Design

### 1. Migration `supabase/migrations/<ts>_confirmacao_pendente.sql`

```sql
ALTER TYPE agendamento_status ADD VALUE IF NOT EXISTS 'pendente' BEFORE 'ativo';

ALTER TABLE agendamentos
  ADD COLUMN IF NOT EXISTS expira_em timestamptz;

DROP INDEX IF EXISTS agendamentos_unique_slot_active;
CREATE UNIQUE INDEX agendamentos_unique_slot_active
  ON agendamentos (data, horario)
  WHERE status IN ('pendente', 'ativo');

CREATE OR REPLACE FUNCTION expire_pending_agendamentos() RETURNS void AS $$
  UPDATE agendamentos
    SET status = 'cancelado'
    WHERE status = 'pendente' AND expira_em < now();
$$ LANGUAGE sql;

GRANT EXECUTE ON FUNCTION expire_pending_agendamentos() TO anon, authenticated;
```

### 2. `createAppointment`

Em `src/lib/supabase-helpers.ts`, no insert de `agendamentos`:

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

Demais comportamentos (rollback, 23505 → `SlotIndisponivelError`) permanecem.

### 3. Página `AgendamentoSucesso.tsx`

- Buscar `whatsapp_admin` de `configuracoes_app`.
- Mostrar banner amarelo: "**Atendimento ainda não confirmado** — envie a mensagem abaixo ao barbeiro. Você tem 30 minutos."
- Botão primário "Confirmar pelo WhatsApp" abrindo a URL retornada por `buildWhatsappConfirmUrl`.

### 4. Helpers `src/lib/confirmacao-helpers.ts`

```ts
export type WhatsappMsgInput = {
  nome: string;
  data: string;       // yyyy-MM-dd
  horario: string;    // HH:mm:ss
  servicos: string[];
};

export function buildWhatsappConfirmMessage(input: WhatsappMsgInput): string;
export function buildWhatsappConfirmUrl(adminPhone: string, msg: string): string;

export async function confirmAgendamento(id: string): Promise<void>; // update status=ativo, expira_em=null
export async function cancelAgendamentoAdmin(id: string): Promise<void>; // update status=cancelado
```

- `buildWhatsappConfirmMessage`: `"Olá! Acabei de agendar para {dataPtBR} às {HH:mm}. Nome: {nome}. Serviço(s): {csv}. Por favor confirme meu horário."` — se `servicos` vazio, omite o trecho de serviço.
- `buildWhatsappConfirmUrl`: limpa não-dígitos do telefone, garante prefixo `55`, retorna `https://wa.me/55XXXX?text=<encodeURIComponent(msg)>`.

### 5. Hook `usePendentesCount`

```ts
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

### 6. `AdminSidebar.tsx`

No item "Agenda", se `usePendentesCount().count > 0`, exibir badge vermelho com o número.

### 7. `AdminAgenda.tsx`

- Query passa a trazer `status, expira_em`, ordena `pendente` primeiro depois por horário.
- Pendentes: borda/badge amarela "AGUARDANDO CONFIRMAÇÃO" + tempo restante (`expira_em - now`).
- Botões "Confirmar" (chama `confirmAgendamento`) e "Cancelar" (chama `cancelAgendamentoAdmin`).
- Antes da query, chamar `supabase.rpc("expire_pending_agendamentos")` (cleanup-on-read).

### 8. `getAvailableSlots` (em `supabase-helpers.ts`)

Antes da consulta de `booked`, chamar `supabase.rpc("expire_pending_agendamentos")` para liberar slots cujo pendente já expirou. Filtro de `booked` muda para `.in("status", ["pendente", "ativo"])` — slots pendentes também bloqueiam.

### 9. Testes (`src/test/confirmacao-whatsapp.test.ts`)

1. `createAppointment` insere `status="pendente"` e `expira_em` ~30min (±5s).
2. `buildWhatsappConfirmMessage` produz texto correto para 0, 1 e N serviços.
3. `buildWhatsappConfirmUrl` URL-encoda corretamente e normaliza o telefone.
4. `confirmAgendamento` faz update `status=ativo, expira_em=null` por id.
5. `cancelAgendamentoAdmin` faz update `status=cancelado` por id.
6. `getAvailableSlots` chama `rpc("expire_pending_agendamentos")` antes do select.
7. `getAvailableSlots` considera `pendente` como ocupado (mock retorna 1 pendente → slot marcado indisponível).
8. `usePendentesCount` integra com mock: count=3 → expõe 3; count=0 → expõe 0.

## Critérios de Aceitação

- [ ] Migration aplica sem erro
- [ ] Cliente novo é criado como `pendente` com `expira_em`
- [ ] Slot pendente bloqueia outros clientes
- [ ] Página sucesso mostra botão WhatsApp com mensagem pronta
- [ ] Admin vê pendentes destacados + contagem na sidebar
- [ ] Botão "Confirmar" do admin promove para `ativo`
- [ ] Pendente passa de 30 min → auto-cancelado na próxima consulta
- [ ] 8 testes passam

## Riscos

- **Migração de `ALTER TYPE`**: adicionar valor a enum exige fora de transação em algumas versões do PG. Supabase suporta. Se falhar, criar enum novo e migrar — improvável.
- **Cleanup-on-read não roda quando ninguém abre o app**: aceitável — slot expirado só precisa ser liberado quando alguém for ver/usar. Sem usuários ativos, não importa que esteja "pendente" no banco.
- **Race entre `expire` e novo INSERT**: o índice único + `WHERE expira_em < now()` garantem consistência — o pior caso é um cliente perdedor receber `SlotIndisponivelError` em vez de slot livre por uma fração de segundo. Aceitável.
