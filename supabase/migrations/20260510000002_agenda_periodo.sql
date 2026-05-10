-- Substitui data única por período de abertura da agenda
ALTER TABLE configuracoes_app
  ADD COLUMN IF NOT EXISTS agenda_abertura_inicio DATE,
  ADD COLUMN IF NOT EXISTS agenda_abertura_fim DATE;
