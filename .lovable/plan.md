
# Plano de melhorias — Barbearia Cardoso

## 1. Banco de dados (migration)

Novas tabelas e colunas:

- **`configuracoes_app`** (chave-valor única): guarda
  - `pix_chave` (texto), `pix_nome_titular`, `pix_cidade` — para gerar QR Pix copia-e-cola
  - `whatsapp_admin` (já existe hardcoded, passa pra cá)
- **`fila_atendimento`**: `id`, `data`, `cliente_id`, `servico_id`, `posicao`, `status` (`aguardando` | `atendendo` | `finalizado` | `cancelado`), `criado_em`
- **`fila_config`**: `id`, `data`, `aberta` (bool), `hora_abertura`, `hora_fechamento`
- **`agendamentos`**: adicionar `telefone_cliente` desnormalizado (busca rápida de cancelamento) e `cancel_token` (uuid) opcional
- **Remover** uso de `intervalo_minutos` (não mexe na coluna, só some da UI — todos os horários passam a ser manuais via `horarios_customizados`)

RLS: leitura pública nas configs e fila; escrita pública só em `fila_atendimento` (insert) e cancelamento de `agendamentos` (update status="cancelado" usando cancel_token via função SECURITY DEFINER).

## 2. Cliente — fluxo de agendamento

- **`Agendamento.tsx`**: trocar `<Calendar>` mensal por **agenda semanal horizontal** (7 dias visíveis, botões ‹ › para semana anterior/próxima, dia destacado)
- **QR Pix na confirmação** (`AgendamentoSucesso.tsx`):
  - gerar payload Pix BR Code com a chave do admin + valor total + nome + cidade
  - renderizar QR via `qrcode.react`
  - botão "Copiar código Pix"
- **Página `/cancelar`** (nova):
  - input telefone → lista agendamentos ativos do cliente
  - botão "Cancelar" → atualiza status, abre WhatsApp do admin com mensagem pré-pronta
- **Página `/fila`** (nova):
  - se fila do dia aberta: form (nome, telefone, serviço) → entra na fila
  - mostra posição em tempo real (Realtime) e tempo estimado
  - se fechada: mensagem informativa

## 3. Admin — dashboard

- **`AdminDashboard.tsx`** reformulado com **3 abas**: Dia / Semana / Mês
  - **Dia**: lista cronológica + slot livre/ocupado
  - **Semana**: grid 7 colunas tipo Google Calendar
  - **Mês**: calendário com contagem de agendamentos por dia
  - Filtros: busca por nome do cliente, filtro por status (ativo/cancelado/finalizado)
  - Navegação ‹ › entre períodos
- **Botão Cancelar** em cada agendamento:
  - confirma → marca cancelado → abre WhatsApp do cliente com mensagem "Olá [nome], seu horário de [data] [hora] foi cancelado. Entre em contato para reagendar."

## 4. Admin — modo fila

- Nova página **`/admin/fila`** no sidebar:
  - toggle "Abrir fila hoje" + horário abertura/fechamento
  - lista ordenada por posição com nome, telefone, serviço, tempo de espera
  - botões: **Iniciar atendimento** / **Finalizar** / **Remover**
  - ao finalizar, posições recalculam automaticamente (Realtime para o cliente ver)

## 5. Admin — Pix e configurações

- Nova página **`/admin/configuracoes`** no sidebar:
  - chave Pix, nome titular, cidade, WhatsApp admin
  - preview do QR gerado

## 6. Admin — agenda (limpeza)

- **`AdminAgenda.tsx`**: remover seletor "Intervalo entre horários"; manter apenas horários manuais por dia da semana

## 7. Detalhes técnicos

- Adicionar dependências: `qrcode.react`, biblioteca de payload Pix (ou função utilitária local — gera string EMV BR Code)
- Realtime habilitado em `fila_atendimento` (publication)
- `cancel_token` enviado no link WhatsApp da confirmação para futuro deep-link de cancelamento
- Validação com `zod` em todos os novos forms
- Mobile-first mantido (viewport 630px do user)

## Arquivos previstos

**Novos:** `src/pages/Cancelar.tsx`, `src/pages/Fila.tsx`, `src/pages/AdminFila.tsx`, `src/pages/AdminConfiguracoes.tsx`, `src/components/WeekPicker.tsx`, `src/components/PixQR.tsx`, `src/lib/pix.ts`, migration SQL.

**Modificados:** `src/App.tsx` (rotas), `src/components/AdminSidebar.tsx`, `src/pages/Agendamento.tsx`, `src/pages/AgendamentoSucesso.tsx`, `src/pages/AgendamentoDados.tsx`, `src/pages/AdminDashboard.tsx`, `src/pages/AdminAgenda.tsx`, `src/lib/supabase-helpers.ts`.

Posso iniciar a migration assim que aprovar.
