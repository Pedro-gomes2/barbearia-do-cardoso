-- 1) Adiciona valor pendente ao enum
ALTER TYPE agendamento_status ADD VALUE IF NOT EXISTS 'pendente' BEFORE 'ativo';

-- 2) Coluna de expiração
ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS expira_em timestamptz;

-- 3) Atualiza o indice unico para cobrir pendente + ativo (mesmos slots bloqueiam)
DROP INDEX IF EXISTS public.agendamentos_unique_slot_active;
CREATE UNIQUE INDEX agendamentos_unique_slot_active
  ON public.agendamentos (data, horario)
  WHERE status IN ('pendente', 'ativo');

-- 4) Funcao que expira pendentes vencidos
CREATE OR REPLACE FUNCTION public.expire_pending_agendamentos() RETURNS void AS $$
  UPDATE public.agendamentos
    SET status = 'cancelado'
    WHERE status = 'pendente' AND expira_em < now();
$$ LANGUAGE sql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.expire_pending_agendamentos() TO anon, authenticated;
