
-- Create servicos table
CREATE TABLE public.servicos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome VARCHAR NOT NULL,
  duracao_minutos SMALLINT NOT NULL DEFAULT 60,
  preco NUMERIC(10,2) NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.servicos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read servicos" ON public.servicos FOR SELECT USING (true);
CREATE POLICY "Authenticated can insert servicos" ON public.servicos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update servicos" ON public.servicos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete servicos" ON public.servicos FOR DELETE TO authenticated USING (true);

-- Seed initial services
INSERT INTO public.servicos (nome, duracao_minutos, preco) VALUES
  ('Barba', 30, 25.00),
  ('Cabelo', 45, 35.00),
  ('Barba e Cabelo', 60, 50.00),
  ('Pé', 30, 20.00),
  ('Pé e Barba', 50, 40.00);

-- Add servico_id to agendamentos
ALTER TABLE public.agendamentos ADD COLUMN servico_id UUID REFERENCES public.servicos(id);

-- Add intervalo_minutos to configuracoes_agenda
ALTER TABLE public.configuracoes_agenda ADD COLUMN intervalo_minutos SMALLINT NOT NULL DEFAULT 60;
