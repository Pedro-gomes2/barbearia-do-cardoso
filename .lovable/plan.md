
## Plano de Ajustes — Barbearia Cardoso

### 1. Admin Serviços — Adicionar novos serviços
Botão "Novo Serviço" em `AdminServicos.tsx` com formulário inline (nome, preço, duração). Insere na tabela `servicos`.

### 2. Remover página Clientes do admin
Remover rota `/admin/clientes`, link no sidebar e arquivo `AdminClientes.tsx`.

### 3. Agenda — Horários manuais dentro do intervalo fixo
Remover a aba "Horários Manuais" separada. Dentro de cada dia, adicionar campo para inserir horários extras (ex: 9:20, 9:40) que complementam os slots do intervalo fixo. Listados abaixo da config do dia com opção de remover.

### 4. Dashboard — Melhorar layout
Melhorar visibilidade do filtro por dia e lista de reservas, colocando lado a lado em desktop.

### 5. WhatsApp — Simplificar
Remover auto-open do WhatsApp. Manter apenas botão manual "Enviar WhatsApp" na tela de sucesso.

### 6. Seletor de serviço — Ajustes visuais
- Remover duração (minutos) do dropdown
- Preço mais à direita e com melhor destaque

### 7. Multi-serviço no agendamento
Permitir selecionar múltiplos serviços. Criar tabela `agendamento_servicos` (agendamento_id, servico_id) com RLS. Ajustar `ServiceSelector` para multi-select, `createAppointment` para salvar múltiplos, e telas de resumo/sucesso.

### 8. Estrutura do banco de dados
Manter todas as tabelas atuais (`servicos`, `agendamentos`, `usuarios`, `configuracoes_agenda`, `horarios_customizados`, `bloqueios`). Adicionar apenas a tabela de junção `agendamento_servicos`. Garantir RLS em todas as tabelas.

### Arquivos afetados
- **Criados:** nenhum novo componente (ajustes nos existentes)
- **Migração SQL:** tabela `agendamento_servicos`
- **Modificados:** `AdminServicos.tsx`, `AdminSidebar.tsx`, `App.tsx`, `AdminAgenda.tsx`, `AdminDashboard.tsx`, `AgendamentoSucesso.tsx`, `ServiceSelector.tsx`, `Agendamento.tsx`, `AgendamentoDados.tsx`, `supabase-helpers.ts`
- **Removidos:** `AdminClientes.tsx`
