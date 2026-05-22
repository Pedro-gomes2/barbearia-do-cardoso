-- Adiciona coluna para forçar agenda aberta/fechada manualmente
ALTER TABLE configuracoes_app
  ADD COLUMN IF NOT EXISTS agenda_aberta_manual BOOLEAN DEFAULT FALSE;
