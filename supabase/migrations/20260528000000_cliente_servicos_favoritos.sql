CREATE TABLE IF NOT EXISTS public.cliente_servicos_favoritos (
  cliente_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  servico_id uuid NOT NULL REFERENCES public.servicos(id) ON DELETE CASCADE,
  PRIMARY KEY (cliente_id, servico_id)
);

CREATE INDEX IF NOT EXISTS cliente_servicos_favoritos_cliente_idx
  ON public.cliente_servicos_favoritos (cliente_id);

ALTER TABLE public.cliente_servicos_favoritos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cliente_servicos_favoritos_all" ON public.cliente_servicos_favoritos
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
