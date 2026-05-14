
-- 1. Tabela de Despesas
CREATE TABLE IF NOT EXISTS public.despesas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    descricao VARCHAR(255) NOT NULL,
    valor DECIMAL(10,2) NOT NULL DEFAULT 0,
    data DATE NOT NULL DEFAULT CURRENT_DATE,
    categoria VARCHAR(50) DEFAULT 'Outros', -- Aluguel, Luz, Produtos, etc
    criado_em TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabela de Portfólio (Trabalhos Realizados)
CREATE TABLE IF NOT EXISTS public.portfolio (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    imagem_url TEXT NOT NULL,
    legenda VARCHAR(255),
    ordem INTEGER DEFAULT 0,
    criado_em TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.despesas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio ENABLE ROW LEVEL SECURITY;

-- Políticas
CREATE POLICY "Authenticated users can manage despesas" ON public.despesas FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can read portfolio" ON public.portfolio FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage portfolio" ON public.portfolio FOR ALL TO authenticated USING (true) WITH CHECK (true);
