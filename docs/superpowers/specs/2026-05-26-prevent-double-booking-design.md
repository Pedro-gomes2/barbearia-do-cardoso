# Prevenção de Double-Booking em Agendamentos

**Data:** 2026-05-26
**Status:** Aprovado, pronto para implementação

## Problema

`createAppointment` em [src/lib/supabase-helpers.ts:49](../../../src/lib/supabase-helpers.ts) faz um `INSERT` direto em `agendamentos` sem nenhuma proteção de concorrência. Dois clientes confirmando o mesmo horário ao mesmo tempo conseguem ambos criar registros ativos — um cliente "substitui" (na prática, duplica) o horário do outro.

## Objetivo

Garantir, com nível de banco de dados, que no máximo um agendamento com `status='ativo'` exista por par `(data, horario)`. Cliente perdedor vê mensagem clara e volta automaticamente para a tela de seleção de horário.

## Escopo

Em escopo:
- Constraint única parcial no Postgres
- Erro customizado `SlotIndisponivelError` mapeado a partir do erro `23505`
- Rollback do `usuarios` quando o INSERT do agendamento falha por slot ocupado
- Tratamento de UI no fluxo `/agendamento/dados`
- Testes unitários cobrindo concorrência e mapeamento de erro

Fora de escopo (próximos specs):
- Lembrete em massa via WhatsApp
- Exibir serviço na tela de gerenciar horários
- Confirmação obrigatória via WhatsApp pelo cliente (vai exigir status `pendente` e revisão da constraint)

## Design

### 1. Migração de banco

Nova migration `supabase/migrations/<timestamp>_prevent_double_booking.sql`:

```sql
-- Pré-check: aborta se já houver duplicatas ativas
DO $$
DECLARE
  v_dup_count int;
BEGIN
  SELECT COUNT(*) INTO v_dup_count FROM (
    SELECT data, horario FROM agendamentos
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

### 2. Helper `createAppointment`

Em [src/lib/supabase-helpers.ts](../../../src/lib/supabase-helpers.ts):

- Exportar nova classe:
  ```ts
  export class SlotIndisponivelError extends Error {
    constructor() {
      super("Esse horário acabou de ser reservado por outra pessoa.");
      this.name = "SlotIndisponivelError";
    }
  }
  ```
- No `catch` do INSERT de `agendamentos`:
  - Se `agError.code === '23505'` e a mensagem/constraint referenciar `agendamentos_slot_unico_ativo`:
    - `await supabase.from("usuarios").delete().eq("id", usuario.id)` (rollback do usuário recém-criado)
    - `throw new SlotIndisponivelError()`
  - Caso contrário, propaga o erro original.

### 3. UI — `AgendamentoDados.tsx`

Em [src/pages/AgendamentoDados.tsx:60](../../../src/pages/AgendamentoDados.tsx):

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

A página de seleção (`Agendamento.tsx`) já busca slots no mount, então o horário ocupado aparece como tal ao retornar.

### 4. Testes

Novo arquivo `src/test/double-booking.test.ts` (vitest):

1. **Mapeamento de erro 23505 com constraint correta** → `SlotIndisponivelError`.
2. **Erro 23505 com outra constraint** → propaga o erro original (não vira SlotIndisponivel).
3. **Outro código de erro (ex: 23503)** → propaga.
4. **Rollback de `usuarios`** quando slot está ocupado: `delete` é chamado com o id criado.
5. **Concorrência (duas chamadas paralelas)** com mock retornando 23505 na segunda: primeira retorna sucesso, segunda lança `SlotIndisponivelError`.

Mock do supabase client via `vi.mock("@/integrations/supabase/client")`.

## Critérios de Aceitação

- [ ] Migration aplica em banco sem duplicatas; falha clara se houver duplicatas
- [ ] Tentar inserir agendamento ativo duplicado retorna erro 23505 (validado no SQL)
- [ ] `createAppointment` lança `SlotIndisponivelError` no caso de slot ocupado
- [ ] `usuarios` órfão não permanece após falha de slot ocupado
- [ ] Cliente perdedor é redirecionado para `/agendamento` com toast claro
- [ ] Cancelar um agendamento permite re-reserva do mesmo slot
- [ ] Todos os 5 testes passam

## Riscos

- **Duplicatas pré-existentes:** migration aborta com mensagem clara; admin precisa limpar antes.
- **Constraint name acoplado no app:** se renomearem o índice, o mapeamento de erro quebra. Mitigado por: nome do índice é uma constante no helper, e há teste cobrindo o caso "outra constraint" para garantir que não viramos `SlotIndisponivel` em outros 23505.
