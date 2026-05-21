-- Adiciona políticas para permitir que usuários autenticados atualizem e excluam registros em usuarios
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can update usuarios" ON public.usuarios
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated can delete usuarios" ON public.usuarios
  FOR DELETE TO authenticated
  USING (true);
