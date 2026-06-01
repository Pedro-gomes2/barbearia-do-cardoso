import { addDays, addWeeks, format, isSameDay, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getDayOfWeek } from "@/lib/time-utils";

interface WeekPickerProps {
  selected?: Date;
  onSelect: (d: Date) => void;
  disablePast?: boolean;
}

export function WeekPicker({ selected, onSelect, disablePast = true }: WeekPickerProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [weekStart, setWeekStart] = useState<Date>(startOfWeek(selected ?? today, { weekStartsOn: 0 }));
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const { data: config = [] } = useQuery({
    queryKey: ["agenda-config"],
    queryFn: async () => {
      const { data } = await supabase.from("configuracoes_agenda").select("dia_semana, ativo");
      return data || [];
    }
  });

  const { data: horariosDisponibilidade = {} } = useQuery({
    queryKey: ["horarios-disponibilidade"],
    queryFn: async () => {
      const { data: template } = await supabase
        .from("horarios_customizados")
        .select("dia_semana")
        .eq("ativo", true);

      const daysWithHours = new Set((template || []).map((h: any) => h.dia_semana));
      const result: Record<number, boolean> = {};
      for (let i = 0; i < 7; i++) {
        result[i] = daysWithHours.has(i);
      }
      return result;
    }
  });

  const inactiveDays = new Set(config.filter(c => !c.ativo).map(c => c.dia_semana));
  const daysWithoutHours = new Set(
    Object.entries(horariosDisponibilidade)
      .filter(([_, hasHours]) => !hasHours)
      .map(([day]) => Number(day))
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => setWeekStart(addWeeks(weekStart, -1))}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <span className="font-heading text-sm tracking-wider text-muted-foreground">
          {format(weekStart, "dd MMM", { locale: ptBR })} — {format(addDays(weekStart, 6), "dd MMM", { locale: ptBR })}
        </span>
        <Button variant="ghost" size="icon" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((d) => {
          const dayOfWeek = d.getDay();
          const isInactive = inactiveDays.has(dayOfWeek);
          const noHours = daysWithoutHours.has(dayOfWeek);
          const isPast = disablePast && d < today;
          const isSelected = selected && isSameDay(d, selected);
          const isToday = isSameDay(d, today);
          const isDisabled = isPast || isInactive || noHours;

          return (
            <button
              key={d.toISOString()}
              type="button"
              disabled={isDisabled}
              onClick={() => onSelect(d)}
              className={`flex flex-col items-center gap-0.5 p-2 rounded-lg border transition-all ${
                isSelected
                  ? "bg-primary text-primary-foreground border-primary"
                  : isDisabled
                  ? "border-border/50 opacity-30 cursor-not-allowed bg-muted/20"
                  : "border-border bg-card hover:border-primary/60"
              }`}
            >
              <span className="text-[10px] font-body uppercase tracking-wider opacity-80">
                {format(d, "EEEEEE", { locale: ptBR })}
              </span>
              <span className={`font-heading text-lg ${isToday && !isSelected ? "text-primary" : ""}`}>
                {format(d, "dd")}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
