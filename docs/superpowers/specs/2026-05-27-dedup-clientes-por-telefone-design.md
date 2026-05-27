# Deduplicação de clientes por telefone

## Problema

Hoje, em `src/lib/supabase-helpers.ts` (`createAppointment`), cada agendamento insere um novo registro em `usuarios` sem checar se já existe um cliente com o mesmo telefone. Resultado: o mesmo cliente vira N linhas distintas, dificultando histórico, relatórios e a tela de admin de clientes.

## Objetivo

1. Mesclar duplicatas existentes em um único cliente canônico por telefone.
2. Impedir criação de novos duplicados, no app e no banco.
3. Bloquear edição manual de telefone que cause colisão.

## Regras

- **Normalização do telefone:** apenas dígitos; se resultar em 12 ou 13 dígitos iniciando com `55`, remove o `55`. Comparação sempre pelo `telefone_normalizado`.
- **Canônico:** registro com menor `created_at` (desempate por `id`). Nome do canônico é mantido — nome novo informado em agendamentos posteriores é descartado.
- **Unicidade:** garantida no banco (UNIQUE INDEX parcial em `tipo = 'cliente'`) + lookup no app antes do insert.
- **Admin:** telefone é editável, mas salvar com telefone que já existe em outro `id` exibe erro e bloqueia.

## Mudanças

### 1. Migration (`supabase/migrations/20260527XXXXXX_dedup_clientes_telefone.sql`)

Ordem das operações:

1. CTE/temp com cálculo de `telefone_normalizado` para os `usuarios` existentes onde `tipo = 'cliente'`.
2. Identifica grupos com mais de um registro pelo telefone normalizado; elege canônico (menor `created_at`, desempate por `id`).
3. `UPDATE agendamentos SET cliente_id = canonico` para todas as duplicatas do grupo.
4. `UPDATE cliente_servicos_favoritos SET cliente_id = canonico` (deduplicando pares `cliente_id, servico_id` para evitar violação de PK/UK da junção — auditar a tabela antes para confirmar PK composto).
5. Auditar outras FKs que referenciem `usuarios.id` (financeiro, fila, etc.) e remapear igualmente.
6. `DELETE FROM usuarios WHERE id IN (<duplicatas não-canônicas>)`.
7. `ALTER TABLE usuarios ADD COLUMN telefone_normalizado TEXT GENERATED ALWAYS AS (...) STORED;` com a regra de normalização.
8. `CREATE UNIQUE INDEX usuarios_telefone_normalizado_uk ON usuarios (telefone_normalizado) WHERE tipo = 'cliente' AND telefone_normalizado IS NOT NULL;`

Expressão da coluna gerada:

```sql
CASE
  WHEN length(regexp_replace(telefone, '\D', '', 'g')) IN (12, 13)
    AND left(regexp_replace(telefone, '\D', '', 'g'), 2) = '55'
  THEN substr(regexp_replace(telefone, '\D', '', 'g'), 3)
  ELSE regexp_replace(telefone, '\D', '', 'g')
END
```

### 2. Helper de normalização no front

Criar `src/lib/telefone.ts` com `normalizarTelefone(s: string): string` aplicando a mesma regra. Compartilhado entre `createAppointment` e a validação do admin.

### 3. `createAppointment` (`src/lib/supabase-helpers.ts:146`)

Substituir o `insert` direto por lookup + insert-se-não-existe:

```ts
const telNorm = normalizarTelefone(telefone);
let { data: usuario } = await supabase
  .from("usuarios")
  .select("id, nome")
  .eq("telefone_normalizado", telNorm)
  .eq("tipo", "cliente")
  .maybeSingle();

if (!usuario) {
  const ins = await supabase.from("usuarios")
    .insert({ nome, telefone, tipo: "cliente" })
    .select("id, nome").single();
  if (ins.error) {
    // race: outro request inseriu — re-seleciona
    if (ins.error.code === "23505") {
      const retry = await supabase.from("usuarios")
        .select("id, nome")
        .eq("telefone_normalizado", telNorm)
        .eq("tipo", "cliente")
        .single();
      usuario = retry.data;
    } else throw ins.error;
  } else usuario = ins.data;
}
// nome antigo prevalece: NÃO atualiza usuarios.nome
```

O restante da função (criação de `agendamentos`, junção `agendamento_servicos`) permanece inalterado.

### 4. Admin de clientes (`src/pages/AdminClientes.tsx`)

Antes de salvar edição de telefone:

1. Calcula `telNorm` do valor novo.
2. `SELECT id FROM usuarios WHERE telefone_normalizado = telNorm AND tipo = 'cliente' AND id != <id atual>`.
3. Se retornar linha → erro: "Já existe um cliente cadastrado com este telefone."
4. Caso contrário, prossegue com o update. UNIQUE INDEX no banco é a rede de segurança contra race.

## Testes

- **Unit** (`src/lib/telefone.test.ts`): casos de máscara, `+55`, `55` ambíguo (DDD 55 com 10–11 dígitos não deve ser tratado como DDI), vazio, só dígitos.
- **Integração**: dois `createAppointment` com mesmo telefone formatado diferente → um único `usuarios`, dois `agendamentos` apontando pro mesmo `cliente_id`.
- **Admin**: tentar editar telefone para um já existente em outro cliente → erro exibido, banco não atualizado.
- **Migration**: rodar localmente contra dump de dev com duplicatas reais; conferir contagem antes/depois e integridade dos `agendamentos`.

## Riscos

- FKs esquecidas que apontam para `usuarios.id` ficariam órfãs após `DELETE`. Mitigação: auditar `information_schema.referential_constraints` antes de escrever a migration.
- Duplicatas com `cliente_servicos_favoritos` divergentes podem violar PK composta — deduplicar antes do `UPDATE`.
- Telefones inválidos/curtos pré-existentes podem colidir entre si após normalização. Aceitável: a regra de validação no front já exige 10–11 dígitos.
