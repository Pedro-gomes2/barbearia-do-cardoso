
# Plano de Implementação — Barbearia Cardoso (7 Tasks)

## 1. Sidebar Admin (TASK-UI-03)

Criar `AdminSidebar.tsx` e `AdminLayout.tsx` usando shadcn Sidebar com `collapsible="icon"`:
- Itens: Dashboard, Agenda, Bloqueios, Clientes, Serviços
- Botão de logout no footer
- Responsivo com mini-collapse em mobile
- Atualizar `App.tsx` para usar `AdminLayout` como wrapper das rotas `/admin/*` (exceto login)
- Remover headers individuais e navegação duplicada de cada página admin

## 2. Reordenar Fluxo + Dropdown (TASK-UI-01 + TASK-UI-02)

Em `Agendamento.tsx`:
- Mudar ordem para: **Data > Serviço > Horário**
- Data aparece primeiro, serviço só após selecionar data, horários só após selecionar serviço
- Converter `ServiceSelector.tsx` de lista de cards para um dropdown `Select` do shadcn com scroll, exibindo nome + preço

## 3. WhatsApp (TASK-BE-01)

- Manter link direto do WhatsApp (gratuito, sem API paga)
- Em `AgendamentoSucesso.tsx`, abrir automaticamente o link `wa.me` via `window.open()` ao montar o componente
- Manter botão manual como fallback

## 4. Horários Customizados (TASK-BE-02)

**Migração SQL:** Criar tabela `horarios_customizados`:
- `id`, `dia_semana`, `horario` (TIME), `ativo` (BOOLEAN), `criado_em`
- Constraint UNIQUE(dia_semana, horario)
- RLS: public SELECT, authenticated INSERT/UPDATE/DELETE

**Admin UI:** Em `AdminAgenda.tsx`, adicionar seção para:
- Toggle entre modo "intervalo fixo" e "horários manuais"
- Adicionar/remover horários individuais (ex: 08:00, 08:30, 09:15)

**Lógica:** Em `getAvailableSlots`:
- Primeiro buscar horários da tabela `horarios_customizados` para o dia
- Se existirem, usar esses; senão, usar intervalo fixo como fallback

## 5. Edição de Preços dos Serviços (novo)

**Nova página:** `/admin/servicos` com `AdminServicos.tsx`:
- Listar todos os serviços com nome, preço, duração
- Permitir editar preço e duração inline
- Permitir ativar/desativar serviço
- Usar mutations do react-query para atualizar na tabela `servicos`

## 6. Ranking de Clientes (TASK-FEAT-01)

**Nova página:** `/admin/clientes` com `AdminClientes.tsx`:
- Query: buscar `usuarios` com contagem de `agendamentos` via JOIN
- Tabela com: posição, nome, telefone, total de agendamentos
- Ordenação decrescente por total

## 7. QA (TASK-QA-01)

- Testar fluxo completo de agendamento com nova ordem
- Verificar sidebar em mobile
- Confirmar WhatsApp funciona
- Validar horários customizados

## Arquivos a criar
- `src/components/AdminSidebar.tsx`
- `src/components/AdminLayout.tsx`
- `src/pages/AdminClientes.tsx`
- `src/pages/AdminServicos.tsx`

## Arquivos a modificar
- `src/App.tsx` — layout admin com sidebar
- `src/pages/Agendamento.tsx` — reordenar fluxo
- `src/components/ServiceSelector.tsx` — converter para dropdown
- `src/pages/AgendamentoSucesso.tsx` — auto-open WhatsApp
- `src/pages/AdminAgenda.tsx` — horários customizados
- `src/pages/AdminDashboard.tsx` — remover header/nav (sidebar cuida)
- `src/pages/AdminBloqueios.tsx` — remover header/nav
- `src/lib/supabase-helpers.ts` — lógica de horários customizados

## Migração SQL necessária
- Tabela `horarios_customizados` com RLS
