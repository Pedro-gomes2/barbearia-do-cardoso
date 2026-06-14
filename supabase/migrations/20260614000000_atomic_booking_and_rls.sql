-- Auditoria de segurança/corretude (2026-06-14):
-- 1) Criação de agendamento passa a ser atômica via RPC (evita agendamento
--    "fantasma" sem serviços vinculados se uma das etapas falhar).
-- 2) Confirmação do agendamento (pendente -> ativo) passa a usar RPC com
--    cancel_token, em vez de UPDATE direto (que já era bloqueado pela RLS
--    para usuários anônimos e falhava silenciosamente).
-- 3) Busca de agendamentos para cancelamento passa a usar RPC, sem expor a
--    tabela usuarios.
-- 4) Verificação de horários ocupados passa a usar RPC que retorna apenas
--    horário + duração (sem telefone/cliente_id), permitindo restringir a
--    leitura pública das tabelas agendamentos/agendamento_servicos.
-- 5) RLS de agendamentos/agendamento_servicos deixa de permitir leitura e
--    escrita públicas (que expunham telefone_cliente, cancel_token e
--    cliente_id de todos os clientes via API REST).

-- ============================================================
-- 1) Criação atômica de agendamento (cliente -> agendamento -> serviços)
-- ============================================================
CREATE OR REPLACE FUNCTION public.criar_agendamento(
  _nome text,
  _telefone text,
  _data date,
  _horario time,
  _servico_ids uuid[]
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

  IF _servico_ids IS NOT NULL AND array_length(_servico_ids, 1) > 0 THEN
    v_first_servico := _servico_ids[1];
  END IF;

  BEGIN
    INSERT INTO public.agendamentos (cliente_id, data, horario, telefone_cliente, status, expira_em, servico_id)
    VALUES (
      v_cliente_id,
      _data,
      _horario,
      regexp_replace(_telefone, '\D', '', 'g'),
      'pendente',
      now() + interval '10 minutes',
      v_first_servico
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

GRANT EXECUTE ON FUNCTION public.criar_agendamento(text, text, date, time, uuid[]) TO anon, authenticated;

-- ============================================================
-- 2) Confirmação do agendamento (pendente -> ativo) via cancel_token
-- ============================================================
CREATE OR REPLACE FUNCTION public.confirmar_agendamento(_agendamento_id uuid, _cancel_token uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.agendamentos
  SET status = 'ativo', expira_em = NULL
  WHERE id = _agendamento_id
    AND cancel_token = _cancel_token
    AND status = 'pendente';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirmar_agendamento(uuid, uuid) TO anon, authenticated;

-- ============================================================
-- 3) Busca de agendamentos ativos por telefone (tela de cancelamento)
-- ============================================================
CREATE OR REPLACE FUNCTION public.buscar_agendamentos_por_telefone(_telefone text)
RETURNS TABLE(id uuid, data date, horario time, status text, nome text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.data, a.horario, a.status::text, u.nome
  FROM public.agendamentos a
  LEFT JOIN public.usuarios u ON u.id = a.cliente_id
  WHERE a.telefone_cliente = regexp_replace(_telefone, '\D', '', 'g')
    AND a.status = 'ativo'
    AND a.data >= CURRENT_DATE
  ORDER BY a.data, a.horario;
$$;

GRANT EXECUTE ON FUNCTION public.buscar_agendamentos_por_telefone(text) TO anon, authenticated;

-- ============================================================
-- 4) Intervalos ocupados por data, sem expor dados de clientes
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_occupied_intervals(_date date)
RETURNS TABLE(horario time, duracao_minutos int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.horario,
    CASE WHEN COALESCE(SUM(s.duracao_minutos), 0) = 0 THEN 15 ELSE SUM(s.duracao_minutos) END::int AS duracao_minutos
  FROM public.agendamentos a
  LEFT JOIN public.agendamento_servicos asv ON asv.agendamento_id = a.id
  LEFT JOIN public.servicos s ON s.id = asv.servico_id
  WHERE a.data = _date AND a.status IN ('pendente', 'ativo')
  GROUP BY a.id, a.horario;
$$;

GRANT EXECUTE ON FUNCTION public.get_occupied_intervals(date) TO anon, authenticated;

-- ============================================================
-- 5) RLS: remover leitura/escrita pública de agendamentos e
--    agendamento_servicos (expunham telefone_cliente, cancel_token e
--    cliente_id de todos os clientes). Acesso direto às tabelas passa a
--    ser exclusivo do admin (authenticated); o fluxo público usa as RPCs
--    acima (SECURITY DEFINER).
-- ============================================================
DROP POLICY IF EXISTS "Anyone can read agendamentos" ON public.agendamentos;
DROP POLICY IF EXISTS "Anyone can insert agendamentos" ON public.agendamentos;

CREATE POLICY "Authenticated can read agendamentos" ON public.agendamentos
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert agendamentos" ON public.agendamentos
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can read agendamento_servicos" ON public.agendamento_servicos;
DROP POLICY IF EXISTS "Anyone can insert agendamento_servicos" ON public.agendamento_servicos;

CREATE POLICY "Authenticated can read agendamento_servicos" ON public.agendamento_servicos
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert agendamento_servicos" ON public.agendamento_servicos
  FOR INSERT TO authenticated WITH CHECK (true);
