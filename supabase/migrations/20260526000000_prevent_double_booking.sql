-- Pré-check: aborta se houver duplicatas ativas existentes.
DO $$
DECLARE
  v_dup_count int;
BEGIN
  SELECT COUNT(*) INTO v_dup_count FROM (
    SELECT data, horario
    FROM agendamentos
    WHERE status = 'ativo'
    GROUP BY data, horario
    HAVING COUNT(*) > 1
  ) d;
  IF v_dup_count > 0 THEN
    RAISE EXCEPTION 'Existem % pares (data,horario) duplicados ativos. Resolva antes de aplicar a constraint.', v_dup_count;
  END IF;
END $$;

CREATE UNIQUE INDEX agendamentos_slot_unico_ativo
  ON agendamentos (data, horario)
  WHERE status = 'ativo';

COMMENT ON INDEX agendamentos_slot_unico_ativo IS
  'Garante 1 agendamento ativo por (data,horario). Parcial: status cancelado/concluido nao bloqueia re-reserva.';
