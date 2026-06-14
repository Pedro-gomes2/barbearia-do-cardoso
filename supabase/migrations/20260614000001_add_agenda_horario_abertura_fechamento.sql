-- Adiciona horário (além da data) de abertura e fechamento do período de agendamento
ALTER TABLE configuracoes_app
  ADD COLUMN IF NOT EXISTS agenda_abertura_hora TIME,
  ADD COLUMN IF NOT EXISTS agenda_fechamento_hora TIME;
