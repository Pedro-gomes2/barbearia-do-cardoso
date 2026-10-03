# Plano Mensal (Corte / Barba / Corte e Barba)

## Problema

A barbearia quer oferecer planos de assinatura mensal (ex: "Corte e Barba" por R$174,99/mês, com 4 atendimentos, agendáveis só de terça a quinta). Hoje o sistema só suporta agendamentos avulsos cobrados por serviço; não existe conceito de assinatura, crédito de uso, nem fluxo de pagamento Pix com aprovação manual (o componente `PixQR` e os campos `pix_chave`/`pix_nome_titular`/`pix_cidade` em `configuracoes_app` já existem, mas não são usados em lugar nenhum).

## Objetivo

1. Admin cadastra até 3 planos (nome, preço, serviços que o plano libera).
2. Cliente solicita um plano pelo site, vê o QR code Pix e fica pendente.
3. Admin aprova (ativa o plano com 4 créditos por 30 dias e lança a receita no Financeiro) ou rejeita.
4. Cliente com plano ativo pode usar 1 crédito por agendamento, só às terças/quartas/quintas, no(s) serviço(s) cobertos pelo plano, sem cobrança adicional.

## Regras

- Um cliente (por `cliente_id`) só pode ter **uma assinatura** com status `pendente_pagamento` ou `ativo` por vez. Para contratar outro plano precisa esperar a atual expirar/ser rejeitada.
- Validade: 30 dias corridos a partir da aprovação (`aprovado_em + interval '30 days'`). Créditos não usados são perdidos ao expirar — sem renovação automática.
- Uso do crédito exige **todos** os três:
  1. Dia da semana do agendamento é terça (2), quarta (3) ou quinta (4) — `extract(dow from _data)`.
  2. Serviço(s) selecionados no agendamento são exatamente o conjunto de serviços associado ao plano (`plano_servicos`).
  3. `creditos_restantes > 0` e assinatura com `status = 'ativo'` e `expira_em >= now()`.
- Agendamento feito com crédito tem valor R$0 no Financeiro (a receita do plano já foi lançada na aprovação).
- Rejeitar uma assinatura pendente não afeta nenhum agendamento existente (não há nenhum ainda, já que ela nunca esteve ativa).

## Mudanças

### 1. Migration — schema

Novo arquivo `supabase/migrations/20261003000000_planos_mensais.sql`:

```sql
-- Tipos de plano cadastrados pelo admin
CREATE TABLE public.planos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  preco numeric(10,2) NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

-- Quais serviços cada plano libera (N:N)
CREATE TABLE public.plano_servicos (
  plano_id uuid NOT NULL REFERENCES public.planos(id) ON DELETE CASCADE,
  servico_id uuid NOT NULL REFERENCES public.servicos(id) ON DELETE CASCADE,
  PRIMARY KEY (plano_id, servico_id)
);

-- Status possíveis de uma assinatura
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

-- Marca o agendamento como pago via plano
ALTER TABLE public.agendamentos
  ADD COLUMN assinatura_id uuid REFERENCES public.assinaturas_planos(id);

-- RLS: leitura/escrita direta só para authenticated (admin); público usa RPCs abaixo
ALTER TABLE public.planos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plano_servicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assinaturas_planos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin gerencia planos" ON public.planos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Qualquer um le planos ativos" ON public.planos FOR SELECT TO anon, authenticated USING (ativo);

CREATE POLICY "Admin gerencia plano_servicos" ON public.plano_servicos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Qualquer um le plano_servicos" ON public.plano_servicos FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Admin gerencia assinaturas" ON public.assinaturas_planos FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- Sem policy de SELECT/INSERT pra anon: acesso público só via RPC SECURITY DEFINER.
```

### 2. RPCs (mesmo arquivo de migration)

- **`solicitar_plano(_nome text, _telefone text, _plano_id uuid) RETURNS uuid`** (`SECURITY DEFINER`, grant `anon, authenticated`)
  - Reaproveita o padrão de `criar_agendamento`: busca `usuarios` por `telefone_normalizado`, cria se não existir.
  - Se já existe assinatura pendente/ativa para esse cliente → `RAISE EXCEPTION 'ASSINATURA_EXISTENTE'`.
  - Insere em `assinaturas_planos` com `status='pendente_pagamento'`, `creditos_restantes=0`. Retorna o `id` da assinatura (usado pra resgatar o valor do plano e montar o Pix na tela).

- **`aprovar_plano(_assinatura_id uuid) RETURNS void`** (`SECURITY DEFINER`, grant só `authenticated`)
  - Valida `status = 'pendente_pagamento'`.
  - `UPDATE assinaturas_planos SET status='ativo', creditos_restantes=4, aprovado_em=now(), expira_em=now()+interval '30 days'`.
  - Lança receita: ver seção Financeiro abaixo.

- **`rejeitar_plano(_assinatura_id uuid) RETURNS void`** (`SECURITY DEFINER`, grant só `authenticated`)
  - `UPDATE ... SET status='rejeitado'` (só se `pendente_pagamento`).

- **`get_plano_ativo_por_telefone(_telefone text) RETURNS TABLE(assinatura_id uuid, plano_nome text, creditos_restantes int, expira_em timestamptz, servico_ids uuid[])`** (`SECURITY DEFINER`, grant `anon, authenticated`)
  - Busca assinatura `ativo` e não expirada do cliente pelo telefone normalizado; agrega `plano_servicos.servico_id` em array. Usada pela tela de agendamento pra decidir se mostra o toggle "usar meu plano".

- **`criar_agendamento`**: adicionar parâmetro opcional `_assinatura_id uuid DEFAULT NULL`. Quando informado, dentro da mesma transação:
  1. `SELECT ... FOR UPDATE` da assinatura; valida `cliente_id` bate com o cliente resolvido pelo telefone, `status='ativo'`, `expira_em >= now()`, `creditos_restantes > 0`.
  2. Valida `extract(dow from _data) IN (2,3,4)`.
  3. Valida que o conjunto de `_servico_ids` é exatamente igual ao conjunto em `plano_servicos` daquele plano.
  4. Qualquer falha → `RAISE EXCEPTION 'PLANO_INVALIDO'`.
  5. Grava `assinatura_id` no insert de `agendamentos` e `UPDATE assinaturas_planos SET creditos_restantes = creditos_restantes - 1 WHERE id = _assinatura_id`.

### 3. Financeiro — lançar receita na aprovação

`AdminFinanceiro.tsx` hoje deriva receita só de `agendamentos` × `servicos.preco`. Duas peças:

- Nova tabela simples `receitas_avulsas` (`id`, `descricao`, `valor`, `data`, `criado_em`) — mesma forma de `despesas`, só que do lado da receita.
- `aprovar_plano` insere uma linha ali: `descricao = 'Plano ' || planos.nome || ' - ' || usuarios.nome`, `valor = planos.preco`, `data = current_date`.
- `AdminFinanceiro.tsx`: somar `receitas_avulsas` do período ao total de receita (query adicional, mesmo padrão da query de `agendamentos`), e listar essas linhas junto no extrato/histórico marcadas como "Plano".
- Agendamentos com `assinatura_id IS NOT NULL` continuam aparecendo no histórico de atendimentos, mas com valor R$0 no cálculo de receita (filtrar/zerar esse caso na query de soma, igual ao tratamento de serviço deletado com `servico_id NULL`).

### 4. Página pública `/planos` (`src/pages/Planos.tsx`)

- Busca `planos` ativos + `plano_servicos` + `servicos` (nomes/preços) via `useQuery`.
- 3 cards no estilo das imagens de referência (nome, preço, "4 atendimentos/mês, terça a quinta").
- Botão "Quero esse plano" abre formulário (nome, telefone) reaproveitando os mesmos componentes/validação de `AgendamentoDados.tsx`.
- Ao confirmar, chama `solicitar_plano`; em caso de `ASSINATURA_EXISTENTE`, mostra toast explicando que já existe uma solicitação em andamento.
- Sucesso → mostra `<PixQR chave={...} nome={...} cidade={...} valor={plano.preco} />` (dados vindos de `configuracoes_app`) com texto "Após pagar, aguarde a confirmação do administrador. Você pode fechar esta página."
- Link para essa página a partir da `Index.tsx` (ex: botão/seção "Planos" no menu, ao lado de "Agendar" e "Produtos").

### 5. Agendamento com crédito (`src/pages/AgendamentoDados.tsx`)

- Ao digitar o telefone (debounce ~500ms, igual padrão de outros lookups no projeto), chama `get_plano_ativo_por_telefone`.
- Se retornar assinatura com `creditos_restantes > 0` **e** `servico_ids` bate exatamente com os `servicos` já selecionados (recebidos via `location.state`) **e** `date` cai em terça/quarta/quinta → mostra um `Checkbox` "Usar meu plano {nome} (restam {creditos_restantes}/4 cortes)".
- Quando marcado: total exibido vira "R$ 0,00 (plano)"; submit chama `createAppointment(..., assinatura_id)`.
- Quando os serviços não batem ou o dia não é terça-quinta, simplesmente não mostra o toggle (sem mensagem de erro — evita ruído pra quem não tem plano).

### 6. Admin — nova página `/admin/planos` (`src/pages/AdminPlanos.tsx`)

Três seções (tabs ou accordion, seguindo o padrão visual de `AdminClientes.tsx`):

- **Pendentes**: lista `assinaturas_planos` com `status='pendente_pagamento'` (join `usuarios`, `planos`) — nome, telefone, plano, data da solicitação, botões Aprovar/Rejeitar (chamam as RPCs, invalidam a query).
- **Ativos**: `status='ativo'` — nome, plano, créditos restantes, validade (`expira_em`).
- **Configuração de planos**: CRUD simples sobre `planos` (nome, preço, ativo) + seleção multi-checkbox dos `servicos` que o plano libera (grava em `plano_servicos`), no mesmo estilo do seletor de "serviços favoritos" já existente em `AdminClientes.tsx`.

Adicionar rota em `App.tsx` e item no `AdminSidebar.tsx`.

## Testes

- **RPC `criar_agendamento` com plano**: crédito decrementado atomicamente mesmo sob concorrência (igual ao teste já existente de double-booking); falha com `PLANO_INVALIDO` se dia não é terça-quinta, se serviço não bate, ou se `creditos_restantes = 0`.
- **`solicitar_plano`**: segunda chamada do mesmo telefone com assinatura pendente/ativa falha com `ASSINATURA_EXISTENTE`.
- **`aprovar_plano`**: idempotência — chamar duas vezes não duplica receita nem dá +4 créditos de novo (segunda chamada deve falhar silenciosamente ou lançar erro, pois `status` já não é mais `pendente_pagamento`).
- **Expiração**: assinatura com `expira_em < now()` não é retornada por `get_plano_ativo_por_telefone` e não pode ser usada em `criar_agendamento` (tratar como crédito inválido mesmo que `status` ainda esteja `ativo` — não há job de expiração automática no v1, a checagem é sempre por data).
- **Financeiro**: soma do período bate com `receitas_avulsas + agendamentos sem assinatura_id`; agendamentos com `assinatura_id` não entram na soma de receita.
- **UI**: toggle "usar meu plano" só aparece quando serviço + dia batem; agendamento com plano grava `assinatura_id` e desconta crédito visível na próxima consulta.

## Riscos

- **Sem job de expiração automática**: `status` permanece `'ativo'` mesmo depois de `expira_em` passar; toda checagem de uso depende de comparar `expira_em >= now()` em tempo de leitura. Aceitável pro v1 (não há necessidade de um status `expirado` fidedigno em lote), mas a tela "Ativos" do admin deve deixar claro quando um plano já venceu (badge "Expirado" calculado no client).
- **Mudança de preço/serviços de um plano não afeta assinaturas já ativas** (elas guardam só `plano_id`, não uma cópia do preço/serviços no momento da contratação) — se o admin editar o plano no meio do ciclo de alguém, a próxima tentativa de uso passa a validar contra a configuração nova. Risco baixo dado o uso esperado (poucas edições), mas vale documentar no admin.
- **`receitas_avulsas` é uma tabela nova e simples**: se no futuro houver outras origens de receita avulsa (ex: venda de produto), ela já serve de base, mas por ora só é populada por `aprovar_plano`.
