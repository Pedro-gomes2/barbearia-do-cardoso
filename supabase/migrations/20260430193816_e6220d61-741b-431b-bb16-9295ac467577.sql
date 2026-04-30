
CREATE TABLE public.agendamento_servicos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agendamento_id UUID NOT NULL REFERENCES public.agendamentos(id) ON DELETE CASCADE,
  servico_id UUID NOT NULL REFERENCES public.servicos(id) ON DELETE CASCADE,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.agendamento_servicos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read agendamento_servicos"
  ON public.agendamento_servicos FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert agendamento_servicos"
  ON public.agendamento_servicos FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Authenticated can delete agendamento_servicos"
  ON public.agendamento_servicos FOR DELETE
  TO authenticated
  USING (true);
