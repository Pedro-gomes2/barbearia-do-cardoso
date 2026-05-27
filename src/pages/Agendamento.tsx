import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, parse, isBefore, isAfter } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Scissors, Lock, Clock, ChevronDown, ChevronUp, ArrowLeft, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TimeSlotGrid } from "@/components/TimeSlotGrid";
import { ServiceSelector, type Servico } from "@/components/ServiceSelector";
import { WeekPicker } from "@/components/WeekPicker";
import { getAvailableSlots } from "@/lib/supabase-helpers";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

function isAgendaAberta(inicio: string | null, fim: string | null): boolean {
  if (!inicio || !fim) return false;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const d0 = parse(inicio, "yyyy-MM-dd", new Date());
  const d1 = parse(fim, "yyyy-MM-dd", new Date());
  d1.setHours(23, 59, 59);
  return !isBefore(hoje, d0) && !isAfter(hoje, d1);
}

export default function Agendamento() {
  const navigate = useNavigate();
  const [date, setDate] = useState<Date>();
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [slotsAberto, setSlotsAberto] = useState(false);

  const { data: cfg, isLoading: cfgLoading } = useQuery({
    queryKey: ["agenda-periodo"],
    queryFn: async () => {
      const { data } = await supabase
        .from("configuracoes_app")
        .select("agenda_abertura_inicio, agenda_abertura_fim, whatsapp_admin, agenda_aberta_manual")
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const agendaAberta = cfg?.agenda_aberta_manual || isAgendaAberta(
    cfg?.agenda_abertura_inicio ?? null,
    cfg?.agenda_abertura_fim ?? null,
  );

  const dateStr = date ? format(date, "yyyy-MM-dd") : null;

  // Calculate total duration from selected services
  const totalDuration = servicos.reduce((sum, s) => sum + s.duracao_minutos, 0);

  const { data: slots = [], isLoading: slotsLoading } = useQuery({
    queryKey: ["slots", dateStr, totalDuration],
    queryFn: () => getAvailableSlots(dateStr!, totalDuration),
    enabled: !!dateStr && agendaAberta && totalDuration > 0,
  });

  const toggleServico = (s: Servico) => {
    setServicos((prev) =>
      prev.find((x) => x.id === s.id)
        ? prev.filter((x) => x.id !== s.id)
        : [...prev, s]
    );
    // Reset selected time when services change (duration changes)
    setSelectedTime(null);
    setSlotsAberto(false);
  };

  const totalPrice = servicos.reduce((sum, s) => sum + s.preco, 0);

  const handleContinue = () => {
    if (dateStr && selectedTime && servicos.length > 0) {
      navigate("/agendamento/dados", {
        state: { date: dateStr, time: selectedTime, servicos },
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container flex items-center gap-2 py-4">
          <Scissors className="h-6 w-6 text-primary" />
          <h1 className="text-2xl tracking-wider">BARBEARIA</h1>
        </div>
      </header>

      <main className="container max-w-lg py-8 space-y-8 animate-fade-in">
        <div className="pt-4 pb-8 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="font-heading tracking-widest text-xs">
            <ArrowLeft className="h-4 w-4 mr-2" /> VOLTAR
          </Button>
          <Home className="h-5 w-5 text-muted-foreground cursor-pointer" onClick={() => navigate("/")} />
        </div>

        <div className="text-center space-y-2">
          <h2 className="text-4xl">AGENDE SEU HORÁRIO</h2>
          <p className="text-muted-foreground">Escolha a data, serviço e horário</p>
        </div>

        {cfgLoading ? (
          <div className="text-center py-12 text-muted-foreground font-body">Carregando...</div>
        ) : !agendaAberta ? (
          <div className="bg-card rounded-xl p-8 border border-border text-center space-y-4">
            <Lock className="h-12 w-12 text-muted-foreground mx-auto" />
            <h3 className="text-2xl font-heading">AGENDA FECHADA</h3>
            <p className="text-muted-foreground font-body text-sm">
              A agenda está fechada no momento. Aguarde a abertura pelo administrador.
            </p>
          </div>
        ) : (
          <>
            {/* 1. Calendário */}
            <div className="bg-card rounded-xl p-4 border border-border">
              <div className="flex items-center gap-2 mb-4 text-primary">
                <CalendarIcon className="h-5 w-5" />
                <span className="font-semibold text-sm uppercase tracking-wide font-body">Selecione a data</span>
              </div>
              <WeekPicker
                selected={date}
                onSelect={(d) => {
                  setDate(d);
                  setSelectedTime(null);
                  setSlotsAberto(false);
                }}
              />
            </div>

            {/* 2. Serviços */}
            {date && (
              <div className="bg-card rounded-xl p-4 border border-border animate-fade-in">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2 text-primary">
                    <Scissors className="h-5 w-5" />
                    <span className="font-semibold text-sm uppercase tracking-wide font-body">Escolha os serviços</span>
                  </div>
                  {servicos.length > 0 && (
                    <div className="text-right">
                      <span className="text-primary font-heading text-lg">
                        R$ {totalPrice.toFixed(2).replace(".", ",")}
                      </span>
                      <p className="text-[10px] text-muted-foreground font-body">
                        <Clock className="h-3 w-3 inline mr-1" />{totalDuration} min
                      </p>
                    </div>
                  )}
                </div>
                <ServiceSelector selectedIds={servicos.map((s) => s.id)} onToggle={toggleServico} />
              </div>
            )}

            {/* 3. Horários — caixa expansível */}
            {dateStr && servicos.length > 0 && (
              <div className="bg-card rounded-xl border border-border animate-fade-in overflow-hidden">
                {/* Botão para abrir/fechar */}
                <button
                  onClick={() => setSlotsAberto((v) => !v)}
                  className="w-full flex items-center justify-between p-4 text-left"
                >
                  <div className="flex items-center gap-2 text-primary">
                    <Clock className="h-5 w-5" />
                    <span className="font-semibold text-sm uppercase tracking-wide font-body">
                      {selectedTime
                        ? `Horário selecionado: ${selectedTime.slice(0, 5)}`
                        : `Horários — ${date && format(date, "dd 'de' MMMM", { locale: ptBR })}`}
                    </span>
                  </div>
                  {slotsAberto
                    ? <ChevronUp className="h-5 w-5 text-muted-foreground" />
                    : <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  }
                </button>

                {/* Lista de horários */}
                {slotsAberto && (
                  <div className="px-4 pb-4 border-t border-border">
                    <div className="pt-3">
                      {slotsLoading ? (
                        <div className="text-center py-8 text-muted-foreground">Carregando...</div>
                      ) : slots.length === 0 ? (
                        <p className="text-center py-6 text-muted-foreground font-body text-sm">
                          Nenhum horário disponível para este dia.
                        </p>
                      ) : (
                        <TimeSlotGrid
                          slots={slots}
                          selectedTime={selectedTime}
                          onSelect={(t) => {
                            setSelectedTime(t);
                            setSlotsAberto(false);
                          }}
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {selectedTime && servicos.length > 0 && (
              <Button
                onClick={handleContinue}
                className="w-full py-6 text-lg font-heading tracking-widest animate-fade-in"
                size="lg"
              >
                CONTINUAR
              </Button>
            )}
          </>
        )}
      </main>
    </div>
  );
}
