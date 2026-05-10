-- Adiciona coluna para controlar o dia aberto para agendamento pelo admin
ALTER TABLE configuracoes_app
  ADD COLUMN IF NOT EXISTS data_agenda_aberta DATE;
