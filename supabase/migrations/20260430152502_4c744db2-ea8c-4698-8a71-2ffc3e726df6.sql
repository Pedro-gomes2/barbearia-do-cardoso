
-- Enums
CREATE TYPE public.user_tipo AS ENUM ('cliente', 'admin');
CREATE TYPE public.agendamento_status AS ENUM ('ativo', 'cancelado');

-- Usuarios
CREATE TABLE public.usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo user_tipo NOT NULL DEFAULT 'cliente',
  nome VARCHAR(100) NOT NULL,
  telefone VARCHAR(20) NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Agendamentos
CREATE TABLE public.agendamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  horario TIME NOT NULL,
  status agendamento_status NOT NULL DEFAULT 'ativo',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(data, horario, status)
);

-- Configuracoes de agenda
CREATE TABLE public.configuracoes_agenda (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dia_semana SMALLINT NOT NULL CHECK (dia_semana >= 0 AND dia_semana <= 6),
  hora_inicio TIME NOT NULL DEFAULT '08:00',
  hora_fim TIME NOT NULL DEFAULT '20:00',
  ativo BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(dia_semana)
);

-- Bloqueios
CREATE TABLE public.bloqueios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data DATE NOT NULL,
  horario TIME NOT NULL,
  motivo VARCHAR(255),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(data, horario)
);

-- Enable RLS
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracoes_agenda ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bloqueios ENABLE ROW LEVEL SECURITY;

-- Public read policies (clients need to see available slots)
CREATE POLICY "Anyone can read configuracoes" ON public.configuracoes_agenda FOR SELECT USING (true);
CREATE POLICY "Anyone can read bloqueios" ON public.bloqueios FOR SELECT USING (true);
CREATE POLICY "Anyone can read agendamentos" ON public.agendamentos FOR SELECT USING (true);
CREATE POLICY "Anyone can insert usuarios" ON public.usuarios FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can insert agendamentos" ON public.agendamentos FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can read usuarios" ON public.usuarios FOR SELECT USING (true);

-- Admin policies (authenticated users can manage everything)
CREATE POLICY "Authenticated can update agendamentos" ON public.agendamentos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete agendamentos" ON public.agendamentos FOR DELETE TO authenticated USING (true);
CREATE POLICY "Authenticated can insert configuracoes" ON public.configuracoes_agenda FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update configuracoes" ON public.configuracoes_agenda FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete configuracoes" ON public.configuracoes_agenda FOR DELETE TO authenticated USING (true);
CREATE POLICY "Authenticated can insert bloqueios" ON public.bloqueios FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update bloqueios" ON public.bloqueios FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete bloqueios" ON public.bloqueios FOR DELETE TO authenticated USING (true);

-- Seed default schedule (Mon-Sat, 08:00-20:00)
INSERT INTO public.configuracoes_agenda (dia_semana, hora_inicio, hora_fim, ativo) VALUES
  (1, '08:00', '20:00', true),
  (2, '08:00', '20:00', true),
  (3, '08:00', '20:00', true),
  (4, '08:00', '20:00', true),
  (5, '08:00', '20:00', true),
  (6, '08:00', '18:00', true),
  (0, '00:00', '00:00', false);
