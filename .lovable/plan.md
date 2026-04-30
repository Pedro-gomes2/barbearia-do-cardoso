
## Plano de implementação

### 1. Tabela de serviços + seleção no fluxo do cliente

**Banco de dados:**
- Criar tabela `servicos` (id, nome, duracao_minutos, preco, ativo) com dados iniciais: Barba, Cabelo, Barba e Cabelo, Pé, Pé e Barba
- Adicionar coluna `servico_id` (uuid, nullable) na tabela `agendamentos` referenciando `servicos`
- RLS: leitura pública, escrita apenas autenticados

**Frontend:**
- Nova etapa no fluxo de agendamento: antes de escolher data/horário, cliente seleciona o serviço
- Cards visuais com nome, duração e preço de cada serviço
- Passar `servico_id` ao criar agendamento
- Mostrar o serviço escolhido no resumo (página de dados e sucesso)
- No admin dashboard, mostrar o serviço em cada agendamento

### 2. Horários flexíveis (intervalos configuráveis)

**Banco de dados:**
- Adicionar coluna `intervalo_minutos` (smallint, default 60) na tabela `configuracoes_agenda`

**Frontend:**
- Na página AdminAgenda, campo para configurar o intervalo (ex: 20min, 30min, 40min)
- Alterar `getAvailableSlots` para gerar slots baseados no `intervalo_minutos` em vez de 1h fixa
- Slots como 09:00, 09:20, 09:40, 10:00...

### 3. Dashboard de analytics no admin

**Frontend (nova página ou seção no dashboard existente):**
- Contadores: agendamentos do dia, da semana e do mês
- Gráfico simples de barras mostrando agendamentos por dia (últimos 30 dias)
- Queries diretas no Supabase com filtros de data
- Usar recharts (já disponível) para os gráficos

### 4. Notificação WhatsApp (link direto)

- Após criar agendamento, abrir link `https://wa.me/5521995323454?text=...` com mensagem pré-formatada contendo nome, data, horário e serviço
- Botão "Enviar WhatsApp" na página de sucesso
- Sem custo, sem API externa

### Detalhes técnicos

- 2 migrações SQL: (1) criar tabela `servicos` + seed + alter `agendamentos`, (2) alter `configuracoes_agenda`
- Arquivos modificados: `Agendamento.tsx`, `AgendamentoDados.tsx`, `AgendamentoSucesso.tsx`, `AdminDashboard.tsx`, `AdminAgenda.tsx`, `supabase-helpers.ts`
- Novo componente: `ServiceSelector.tsx`
