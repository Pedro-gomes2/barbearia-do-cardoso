-- Adiciona a coluna `tipo` na tabela servicos.
-- O código já trabalha com 'corte_barba' e 'extra' há tempos,
-- mas a coluna nunca foi criada no banco, fazendo UPDATEs falharem.

ALTER TABLE public.servicos
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'corte_barba';

-- Garante valores válidos
ALTER TABLE public.servicos
  DROP CONSTRAINT IF EXISTS servicos_tipo_check;
ALTER TABLE public.servicos
  ADD CONSTRAINT servicos_tipo_check
  CHECK (tipo IN ('corte_barba', 'extra'));
