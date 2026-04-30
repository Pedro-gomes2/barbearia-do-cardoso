import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Scissors } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { TimeSlotGrid } from "@/components/TimeSlotGrid";
import { ServiceSelector, type Servico } from "@/components/ServiceSelector";
import { getAvailableSlots } from "@/lib/supabase-helpers";
import { useQuery } from "@tanstack/react-query";

export default function Agendamento() {
  const navigate = useNavigate();
  const [servico, setServico] = useState<Servico | null>(null);
  const [date, setDate] = useState<Date>();
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  const dateStr = date ? format(date, "yyyy-MM-dd") : null;

  const { data: slots = [], isLoading } = useQuery({
    queryKey: ["slots", dateStr],
    queryFn: () => getAvailableSlots(dateStr!),
    enabled: !!dateStr,
  });

  const handleContinue = () => {
    if (dateStr && selectedTime && servico) {
      navigate("/agendamento/dados", {
        state: { date: dateStr, time: selectedTime, servico },
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container flex items-center justify-between py-4">
          <div className="flex items-center gap-2">
            <Scissors className="h-6 w-6 text-primary" />
            <h1 className="text-2xl tracking-wider">BARBEARIA CARDOSO</h1>
          </div>
        </div>
      </header>

      <main className="container max-w-lg py-8 space-y-8 animate-fade-in">
        <div className="text-center space-y-2">
          <h2 className="text-4xl">AGENDE SEU HORÁRIO</h2>
          <p className="text-muted-foreground">Escolha o serviço, data e horário</p>
        </div>

        {/* Service selection */}
        <div className="bg-card rounded-xl p-4 border border-border">
          <div className="flex items-center gap-2 mb-4 text-primary">
            <Scissors className="h-5 w-5" />
            <span className="font-semibold text-sm uppercase tracking-wide font-body">Escolha o serviço</span>
          </div>
          <ServiceSelector selectedId={servico?.id || null} onSelect={setServico} />
        </div>

        {/* Calendar */}
        {servico && (
          <div className="bg-card rounded-xl p-4 border border-border animate-fade-in">
            <div className="flex items-center gap-2 mb-4 text-primary">
              <CalendarIcon className="h-5 w-5" />
              <span className="font-semibold text-sm uppercase tracking-wide font-body">Selecione a data</span>
            </div>
            <Calendar
              mode="single"
              selected={date}
              onSelect={(d) => {
                setDate(d);
                setSelectedTime(null);
              }}
              disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
              locale={ptBR}
              className="pointer-events-auto mx-auto"
            />
          </div>
        )}

        {/* Time slots */}
        {dateStr && servico && (
          <div className="bg-card rounded-xl p-4 border border-border animate-fade-in">
            <div className="flex items-center gap-2 mb-4 text-primary">
              <span className="font-semibold text-sm uppercase tracking-wide font-body">
                Horários — {date && format(date, "dd 'de' MMMM", { locale: ptBR })}
              </span>
            </div>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Carregando...</div>
            ) : (
              <TimeSlotGrid slots={slots} selectedTime={selectedTime} onSelect={setSelectedTime} />
            )}
          </div>
        )}

        {/* Continue */}
        {selectedTime && servico && (
          <Button
            onClick={handleContinue}
            className="w-full py-6 text-lg font-heading tracking-widest animate-fade-in"
            size="lg"
          >
            CONTINUAR
          </Button>
        )}
      </main>
    </div>
  );
}
