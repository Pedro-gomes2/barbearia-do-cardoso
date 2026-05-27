-- Deduplicação de clientes por telefone normalizado.
-- 1) Mescla duplicatas existentes (canônico = menor criado_em).
-- 2) Adiciona coluna gerada telefone_normalizado e UNIQUE INDEX parcial.

-- Função imutável para normalização (mesma regra usada no app).
CREATE OR REPLACE FUNCTION public.normalizar_telefone(tel TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT CASE
    WHEN tel IS NULL THEN NULL
    WHEN length(regexp_replace(tel, '\D', '', 'g')) IN (12, 13)
      AND left(regexp_replace(tel, '\D', '', 'g'), 2) = '55'
    THEN substr(regexp_replace(tel, '\D', '', 'g'), 3)
    ELSE regexp_replace(tel, '\D', '', 'g')
  END
$$;

-- Mesclagem one-shot dentro de um bloco PL/pgSQL (mesma sessão/transação).
DO $$
BEGIN
  -- Mapa duplicata -> canônico (em tabela temporária local ao bloco).
  CREATE TEMP TABLE _dedup_map ON COMMIT DROP AS
  WITH ranked AS (
    SELECT
      id,
      public.normalizar_telefone(telefone) AS tel_norm,
      ROW_NUMBER() OVER (
        PARTITION BY public.normalizar_telefone(telefone)
        ORDER BY criado_em ASC, id ASC
      ) AS rn,
      FIRST_VALUE(id) OVER (
        PARTITION BY public.normalizar_telefone(telefone)
        ORDER BY criado_em ASC, id ASC
      ) AS canonico_id
    FROM public.usuarios
    WHERE tipo = 'cliente'
      AND telefone IS NOT NULL
      AND length(regexp_replace(telefone, '\D', '', 'g')) > 0
  )
  SELECT id AS dup_id, canonico_id, tel_norm
  FROM ranked
  WHERE rn > 1;

  -- Remapeia agendamentos para o canônico.
  UPDATE public.agendamentos a
  SET cliente_id = m.canonico_id
  FROM _dedup_map m
  WHERE a.cliente_id = m.dup_id;

  -- Remove favoritos do duplicado que já existem no canônico (evita conflito na PK composta).
  DELETE FROM public.cliente_servicos_favoritos f
  USING _dedup_map m
  WHERE f.cliente_id = m.dup_id
    AND EXISTS (
      SELECT 1 FROM public.cliente_servicos_favoritos f2
      WHERE f2.cliente_id = m.canonico_id AND f2.servico_id = f.servico_id
    );

  -- Move favoritos remanescentes para o canônico.
  UPDATE public.cliente_servicos_favoritos f
  SET cliente_id = m.canonico_id
  FROM _dedup_map m
  WHERE f.cliente_id = m.dup_id;

  -- Remove as duplicatas.
  DELETE FROM public.usuarios u
  USING _dedup_map m
  WHERE u.id = m.dup_id;
END $$;

-- Coluna gerada com o telefone normalizado.
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS telefone_normalizado TEXT
  GENERATED ALWAYS AS (
    CASE
      WHEN telefone IS NULL THEN NULL
      WHEN length(regexp_replace(telefone, '\D', '', 'g')) IN (12, 13)
        AND left(regexp_replace(telefone, '\D', '', 'g'), 2) = '55'
      THEN substr(regexp_replace(telefone, '\D', '', 'g'), 3)
      ELSE regexp_replace(telefone, '\D', '', 'g')
    END
  ) STORED;

-- Unicidade por telefone normalizado entre clientes.
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_telefone_normalizado_uk
  ON public.usuarios (telefone_normalizado)
  WHERE tipo = 'cliente'
    AND telefone_normalizado IS NOT NULL
    AND telefone_normalizado <> '';
