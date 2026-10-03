-- ============================================================
-- Planos mensais: tabelas base
-- ============================================================

CREATE TABLE public.planos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  preco numeric(10,2) NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.plano_servicos (
  plano_id uuid NOT NULL REFERENCES public.planos(id) ON DELETE CASCADE,
  servico_id uuid NOT NULL REFERENCES public.servicos(id) ON DELETE CASCADE,
  PRIMARY KEY (plano_id, servico_id)
);

CREATE TYPE public.assinatura_status AS ENUM ('pendente_pagamento', 'ativo', 'rejeitado', 'expirado');

CREATE TABLE public.assinaturas_planos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.usuarios(id),
  plano_id uuid NOT NULL REFERENCES public.planos(id),
  status public.assinatura_status NOT NULL DEFAULT 'pendente_pagamento',
  creditos_restantes int NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now(),
  aprovado_em timestamptz,
  expira_em timestamptz
);

-- Só uma assinatura pendente/ativa por cliente
CREATE UNIQUE INDEX assinaturas_planos_cliente_unica
  ON public.assinaturas_planos (cliente_id)
  WHERE status IN ('pendente_pagamento', 'ativo');

-- Marca o agendamento como pago via crédito de plano
ALTER TABLE public.agendamentos
  ADD COLUMN assinatura_id uuid REFERENCES public.assinaturas_planos(id);

-- Receita avulsa (hoje só alimentada pela aprovação de plano)
CREATE TABLE public.receitas_avulsas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  descricao text NOT NULL,
  valor numeric(10,2) NOT NULL,
  data date NOT NULL DEFAULT current_date,
  criado_em timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- RLS: acesso direto só para admin (authenticated); público usa RPCs
-- ============================================================
ALTER TABLE public.planos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plano_servicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assinaturas_planos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receitas_avulsas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin gerencia planos" ON public.planos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Qualquer um le planos ativos" ON public.planos FOR SELECT TO anon, authenticated USING (ativo);

CREATE POLICY "Admin gerencia plano_servicos" ON public.plano_servicos FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Qualquer um le plano_servicos" ON public.plano_servicos FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Admin gerencia assinaturas" ON public.assinaturas_planos FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Admin gerencia receitas avulsas" ON public.receitas_avulsas FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- Solicitação de plano (cliente): cria/acha usuario + assinatura pendente
-- ============================================================
CREATE OR REPLACE FUNCTION public.solicitar_plano(
  _nome text,
  _telefone text,
  _plano_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tel_norm text;
  v_cliente_id uuid;
  v_assinatura_id uuid;
BEGIN
  v_tel_norm := public.normalizar_telefone(_telefone);

  SELECT id INTO v_cliente_id
  FROM public.usuarios
  WHERE telefone_normalizado = v_tel_norm AND tipo = 'cliente'
  LIMIT 1;

  IF v_cliente_id IS NULL THEN
    BEGIN
      INSERT INTO public.usuarios (nome, telefone, tipo)
      VALUES (_nome, _telefone, 'cliente')
      RETURNING id INTO v_cliente_id;
    EXCEPTION WHEN unique_violation THEN
      SELECT id INTO v_cliente_id
      FROM public.usuarios
      WHERE telefone_normalizado = v_tel_norm AND tipo = 'cliente'
      LIMIT 1;
    END;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.assinaturas_planos
    WHERE cliente_id = v_cliente_id AND status IN ('pendente_pagamento', 'ativo')
  ) THEN
    RAISE EXCEPTION 'ASSINATURA_EXISTENTE';
  END IF;

  INSERT INTO public.assinaturas_planos (cliente_id, plano_id, status, creditos_restantes)
  VALUES (v_cliente_id, _plano_id, 'pendente_pagamento', 0)
  RETURNING id INTO v_assinatura_id;

  RETURN v_assinatura_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.solicitar_plano(text, text, uuid) TO anon, authenticated;

-- ============================================================
-- Consulta pública: plano ativo com créditos de um telefone
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_plano_ativo_por_telefone(_telefone text)
RETURNS TABLE(
  assinatura_id uuid,
  plano_nome text,
  creditos_restantes int,
  expira_em timestamptz,
  servico_ids uuid[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ap.id,
    p.nome,
    ap.creditos_restantes,
    ap.expira_em,
    COALESCE(array_agg(ps.servico_id) FILTER (WHERE ps.servico_id IS NOT NULL), '{}')
  FROM public.assinaturas_planos ap
  JOIN public.usuarios u ON u.id = ap.cliente_id
  JOIN public.planos p ON p.id = ap.plano_id
  LEFT JOIN public.plano_servicos ps ON ps.plano_id = ap.plano_id
  WHERE u.telefone_normalizado = public.normalizar_telefone(_telefone)
    AND ap.status = 'ativo'
    AND ap.expira_em >= now()
    AND ap.creditos_restantes > 0
  GROUP BY ap.id, p.nome, ap.creditos_restantes, ap.expira_em
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_plano_ativo_por_telefone(text) TO anon, authenticated;

-- ============================================================
-- Aprovação do plano pelo admin: ativa, dá 4 créditos, lança receita
-- ============================================================
CREATE OR REPLACE FUNCTION public.aprovar_plano(_assinatura_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plano_nome text;
  v_plano_preco numeric;
  v_cliente_nome text;
BEGIN
  SELECT p.nome, p.preco, u.nome
    INTO v_plano_nome, v_plano_preco, v_cliente_nome
  FROM public.assinaturas_planos ap
  JOIN public.planos p ON p.id = ap.plano_id
  JOIN public.usuarios u ON u.id = ap.cliente_id
  WHERE ap.id = _assinatura_id AND ap.status = 'pendente_pagamento'
  FOR UPDATE OF ap;

  IF v_plano_nome IS NULL THEN
    RAISE EXCEPTION 'ASSINATURA_NAO_PENDENTE';
  END IF;

  UPDATE public.assinaturas_planos
    SET status = 'ativo',
        creditos_restantes = 4,
        aprovado_em = now(),
        expira_em = now() + interval '30 days'
    WHERE id = _assinatura_id;

  INSERT INTO public.receitas_avulsas (descricao, valor, data)
  VALUES ('Plano ' || v_plano_nome || ' - ' || v_cliente_nome, v_plano_preco, current_date);
END;
$$;

GRANT EXECUTE ON FUNCTION public.aprovar_plano(uuid) TO authenticated;

-- ============================================================
-- Rejeição do plano pelo admin
-- ============================================================
CREATE OR REPLACE FUNCTION public.rejeitar_plano(_assinatura_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.assinaturas_planos
    SET status = 'rejeitado'
    WHERE id = _assinatura_id AND status = 'pendente_pagamento';
$$;

GRANT EXECUTE ON FUNCTION public.rejeitar_plano(uuid) TO authenticated;

-- ============================================================
-- criar_agendamento: novo parâmetro opcional _assinatura_id
-- Precisa DROP antes, senão o Postgres cria uma função sobrecarregada
-- nova e deixa a de 5 argumentos viva (quebra a resolução do PostgREST).
-- ============================================================
DROP FUNCTION IF EXISTS public.criar_agendamento(text, text, date, time, uuid[]);

CREATE OR REPLACE FUNCTION public.criar_agendamento(
  _nome text,
  _telefone text,
  _data date,
  _horario time,
  _servico_ids uuid[],
  _assinatura_id uuid DEFAULT NULL
)
RETURNS TABLE(agendamento_id uuid, cancel_token uuid, cliente_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tel_norm text;
  v_cliente_id uuid;
  v_agendamento_id uuid;
  v_cancel_token uuid;
  v_servico_id uuid;
  v_first_servico uuid;
  v_plano_servico_ids uuid[];
  v_dow int;
BEGIN
  v_tel_norm := public.normalizar_telefone(_telefone);

  SELECT id INTO v_cliente_id
  FROM public.usuarios
  WHERE telefone_normalizado = v_tel_norm AND tipo = 'cliente'
  LIMIT 1;

  IF v_cliente_id IS NULL THEN
    BEGIN
      INSERT INTO public.usuarios (nome, telefone, tipo)
      VALUES (_nome, _telefone, 'cliente')
      RETURNING id INTO v_cliente_id;
    EXCEPTION WHEN unique_violation THEN
      SELECT id INTO v_cliente_id
      FROM public.usuarios
      WHERE telefone_normalizado = v_tel_norm AND tipo = 'cliente'
      LIMIT 1;
    END;
  END IF;

  IF _assinatura_id IS NOT NULL THEN
    v_dow := extract(dow FROM _data);
    IF v_dow NOT IN (2, 3, 4) THEN
      RAISE EXCEPTION 'PLANO_INVALIDO';
    END IF;

    SELECT array_agg(ps.servico_id ORDER BY ps.servico_id) INTO v_plano_servico_ids
    FROM public.assinaturas_planos ap
    JOIN public.plano_servicos ps ON ps.plano_id = ap.plano_id
    WHERE ap.id = _assinatura_id
      AND ap.cliente_id = v_cliente_id
      AND ap.status = 'ativo'
      AND ap.expira_em >= now()
      AND ap.creditos_restantes > 0
    GROUP BY ap.id
    FOR UPDATE OF ap;

    IF v_plano_servico_ids IS NULL
       OR v_plano_servico_ids <> (SELECT array_agg(s ORDER BY s) FROM unnest(_servico_ids) s) THEN
      RAISE EXCEPTION 'PLANO_INVALIDO';
    END IF;

    UPDATE public.assinaturas_planos
      SET creditos_restantes = creditos_restantes - 1
      WHERE id = _assinatura_id;
  END IF;

  IF _servico_ids IS NOT NULL AND array_length(_servico_ids, 1) > 0 THEN
    v_first_servico := _servico_ids[1];
  END IF;

  BEGIN
    INSERT INTO public.agendamentos (cliente_id, data, horario, telefone_cliente, status, expira_em, servico_id, assinatura_id)
    VALUES (
      v_cliente_id,
      _data,
      _horario,
      regexp_replace(_telefone, '\D', '', 'g'),
      'pendente',
      now() + interval '10 minutes',
      v_first_servico,
      _assinatura_id
    )
    RETURNING id, agendamentos.cancel_token INTO v_agendamento_id, v_cancel_token;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'SLOT_INDISPONIVEL';
  END;

  IF _servico_ids IS NOT NULL THEN
    FOREACH v_servico_id IN ARRAY _servico_ids LOOP
      INSERT INTO public.agendamento_servicos (agendamento_id, servico_id)
      VALUES (v_agendamento_id, v_servico_id);
    END LOOP;
  END IF;

  RETURN QUERY SELECT v_agendamento_id, v_cancel_token, v_cliente_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.criar_agendamento(text, text, date, time, uuid[], uuid) TO anon, authenticated;

-- ============================================================
-- Estorna o crédito do plano se o agendamento for cancelado
-- (cobre tanto cancelamento manual do admin quanto o auto-cancelamento
-- de pendentes expirados em expire_pending_agendamentos).
-- ============================================================
CREATE OR REPLACE FUNCTION public.estornar_credito_plano()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.assinaturas_planos
    SET creditos_restantes = creditos_restantes + 1
    WHERE id = NEW.assinatura_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER agendamentos_estorna_credito_plano
  AFTER UPDATE ON public.agendamentos
  FOR EACH ROW
  WHEN (NEW.status = 'cancelado' AND OLD.status IN ('pendente', 'ativo') AND NEW.assinatura_id IS NOT NULL)
  EXECUTE FUNCTION public.estornar_credito_plano();
