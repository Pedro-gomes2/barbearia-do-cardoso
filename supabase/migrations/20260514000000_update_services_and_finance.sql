
-- 1. Adicionar status 'finalizado' ao agendamento (apenas se não existir)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'agendamento_status' AND e.enumlabel = 'finalizado') THEN
        ALTER TYPE public.agendamento_status ADD VALUE 'finalizado';
    END IF;
END
$$;

-- 2. Adicionar coluna de ordem aos serviços
ALTER TABLE public.servicos ADD COLUMN IF NOT EXISTS ordem INTEGER DEFAULT 0;

-- 3. Corrigir a constraint de exclusão de serviços em agendamentos
-- Isso permite excluir um serviço e manter o agendamento no histórico (com servico_id nulo)
ALTER TABLE public.agendamentos DROP CONSTRAINT IF EXISTS agendamentos_servico_id_fkey;
ALTER TABLE public.agendamentos 
  ADD CONSTRAINT agendamentos_servico_id_fkey 
  FOREIGN KEY (servico_id) 
  REFERENCES public.servicos(id) 
  ON DELETE SET NULL;

-- 4. Ajustar restrição de unicidade para permitir histórico
ALTER TABLE public.agendamentos DROP CONSTRAINT IF EXISTS agendamentos_data_horario_status_key;

-- Criamos um índice único parcial: apenas UM agendamento 'ativo' por horário
CREATE UNIQUE INDEX IF NOT EXISTS agendamentos_unique_slot_active 
ON public.agendamentos (data, horario) 
WHERE (status = 'ativo');

-- 5. Criar tabela de produtos
CREATE TABLE IF NOT EXISTS public.produtos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(255) NOT NULL,
    descricao TEXT,
    preco DECIMAL(10,2) DEFAULT 0,
    ativo BOOLEAN DEFAULT true,
    criado_em TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS e permissões para produtos
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read produtos" ON public.produtos FOR SELECT USING (true);
CREATE POLICY "Authenticated can manage produtos" ON public.produtos FOR ALL TO authenticated USING (true) WITH CHECK (true);
