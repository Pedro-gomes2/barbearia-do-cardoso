import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TimeSlotGrid } from "@/components/TimeSlotGrid";
import { ServiceSelector, type Servico } from "@/components/ServiceSelector";
import { WeekPicker } from "@/components/WeekPicker";
import { getAvailableSlots } from "@/lib/supabase-helpers";
import { useQuery } from "@tanstack/react-query";

export default function Agendamento() {
  const navigate = useNavigate();
  const [date, setDate] = useState<Date>();
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  const dateStr = date ? format(date, "yyyy-MM-dd") : null;

  const { data: slots = [], isLoading } = useQuery({
    queryKey: ["slots", dateStr],
    queryFn: () => getAvailableSlots(dateStr!),
    enabled: !!dateStr,
  });

  const toggleServico = (s: Servico) => {
    setServicos((prev) =>
      prev.find((x) => x.id === s.id)
        ? prev.filter((x) => x.id !== s.id)
        : [...prev, s]
    );
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
          <p className="text-muted-foreground">Escolha a data, serviço e horário</p>
        </div>

        {/* 1. Calendar */}
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
            }}
          />
        </div>

        {/* 2. Service selection — multi */}
        {date && (
          <div className="bg-card rounded-xl p-4 border border-border animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-primary">
                <Scissors className="h-5 w-5" />
                <span className="font-semibold text-sm uppercase tracking-wide font-body">Escolha os serviços</span>
              </div>
              {servicos.length > 0 && (
                <span className="text-primary font-heading text-lg">
                  R$ {totalPrice.toFixed(2).replace(".", ",")}
                </span>
              )}
            </div>
            <ServiceSelector selectedIds={servicos.map((s) => s.id)} onToggle={toggleServico} />
          </div>
        )}

        {/* 3. Time slots */}
        {dateStr && servicos.length > 0 && (
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
        {selectedTime && servicos.length > 0 && (
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
