
CREATE TABLE public.horarios_customizados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dia_semana smallint NOT NULL,
  horario time without time zone NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dia_semana, horario)
);

ALTER TABLE public.horarios_customizados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read horarios_customizados" ON public.horarios_customizados FOR SELECT TO public USING (true);
CREATE POLICY "Authenticated can insert horarios_customizados" ON public.horarios_customizados FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update horarios_customizados" ON public.horarios_customizados FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete horarios_customizados" ON public.horarios_customizados FOR DELETE TO authenticated USING (true);
