-- Remove a funcionalidade de fila de atendimento (não utilizada)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'fila_atendimento') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.fila_atendimento;
  END IF;
END $$;

DROP TABLE IF EXISTS public.fila_atendimento;
DROP TABLE IF EXISTS public.fila_config;
DROP TYPE IF EXISTS public.fila_status;
