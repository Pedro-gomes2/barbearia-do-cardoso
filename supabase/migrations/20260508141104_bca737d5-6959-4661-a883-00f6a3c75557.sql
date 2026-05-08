
-- 1. Configurações globais do app (Pix, WhatsApp)
CREATE TABLE public.configuracoes_app (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pix_chave text,
  pix_nome_titular text,
  pix_cidade text,
  whatsapp_admin text,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.configuracoes_app ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read configuracoes_app" ON public.configuracoes_app FOR SELECT USING (true);
CREATE POLICY "Authenticated can insert configuracoes_app" ON public.configuracoes_app FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update configuracoes_app" ON public.configuracoes_app FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.configuracoes_app (pix_chave, pix_nome_titular, pix_cidade, whatsapp_admin)
VALUES (NULL, 'Barbearia Cardoso', 'Rio de Janeiro', '5521995323454');

-- 2. Configuração da fila por dia
CREATE TABLE public.fila_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL UNIQUE,
  aberta boolean NOT NULL DEFAULT false,
  hora_abertura time NOT NULL DEFAULT '09:00',
  hora_fechamento time NOT NULL DEFAULT '18:00',
  criado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fila_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read fila_config" ON public.fila_config FOR SELECT USING (true);
CREATE POLICY "Authenticated manages fila_config" ON public.fila_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3. Fila de atendimento
CREATE TYPE public.fila_status AS ENUM ('aguardando', 'atendendo', 'finalizado', 'cancelado');

CREATE TABLE public.fila_atendimento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL,
  cliente_id uuid NOT NULL,
  servico_id uuid,
  posicao integer NOT NULL,
  status public.fila_status NOT NULL DEFAULT 'aguardando',
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fila_data_status ON public.fila_atendimento(data, status, posicao);

ALTER TABLE public.fila_atendimento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read fila" ON public.fila_atendimento FOR SELECT USING (true);
CREATE POLICY "Anyone can insert fila" ON public.fila_atendimento FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated updates fila" ON public.fila_atendimento FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated deletes fila" ON public.fila_atendimento FOR DELETE TO authenticated USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.fila_atendimento;
ALTER TABLE public.fila_atendimento REPLICA IDENTITY FULL;

-- 4. Agendamentos: telefone desnormalizado + token de cancelamento
ALTER TABLE public.agendamentos
  ADD COLUMN telefone_cliente text,
  ADD COLUMN cancel_token uuid NOT NULL DEFAULT gen_random_uuid();

CREATE INDEX idx_agendamentos_telefone ON public.agendamentos(telefone_cliente);
CREATE INDEX idx_agendamentos_cancel_token ON public.agendamentos(cancel_token);

-- Backfill telefone existente
UPDATE public.agendamentos a
SET telefone_cliente = u.telefone
FROM public.usuarios u
WHERE a.cliente_id = u.id AND a.telefone_cliente IS NULL;

-- 5. Função para cancelar agendamento via token (cliente)
CREATE OR REPLACE FUNCTION public.cancelar_agendamento_por_telefone(_telefone text, _agendamento_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.agendamentos
  SET status = 'cancelado'
  WHERE id = _agendamento_id
    AND telefone_cliente = _telefone
    AND status = 'ativo';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$;
