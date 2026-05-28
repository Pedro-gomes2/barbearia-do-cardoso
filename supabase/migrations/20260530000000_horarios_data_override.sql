-- Override de horários por data específica.
-- Quando existir pelo menos uma linha em horarios_data para uma data,
-- a leitura ignora o template semanal (horarios_customizados) e usa só estas.

CREATE TABLE IF NOT EXISTS public.horarios_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL,
  horario time NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (data, horario)
);

CREATE INDEX IF NOT EXISTS horarios_data_data_idx
  ON public.horarios_data (data);

ALTER TABLE public.horarios_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "horarios_data_all" ON public.horarios_data
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
