import { cn } from "@/lib/utils";
import { Clock } from "lucide-react";

interface Slot {
  time: string;
  available: boolean;
}

interface TimeSlotGridProps {
  slots: Slot[];
  selectedTime: string | null;
  onSelect: (time: string) => void;
}

export function TimeSlotGrid({ slots, selectedTime, onSelect }: TimeSlotGridProps) {
  if (slots.length === 0) {
    return (
      <div className="text-center py-10 bg-muted/20 rounded-xl border border-dashed border-border/60">
        <Clock className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
        <p className="text-muted-foreground font-body text-sm">Nenhum horário disponível para as opções selecionadas.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 animate-fade-in">
      {slots.map((slot) => {
        const display = slot.time.slice(0, 5);
        const isSelected = selectedTime === slot.time;
        return (
          <button
            key={slot.time}
            disabled={!slot.available}
            onClick={() => onSelect(slot.time)}
            className={cn(
              "py-3 px-2 rounded-xl text-center font-heading tracking-wider transition-all duration-300 border focus:outline-none focus:ring-2 focus:ring-primary/20",
              slot.available && !isSelected &&
                "border-border bg-card text-foreground hover:border-primary hover:bg-primary/5 hover:shadow-sm hover:-translate-y-0.5",
              isSelected &&
                "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/20 scale-105",
              !slot.available &&
                "border-border/30 bg-muted/30 text-muted-foreground/30 cursor-not-allowed opacity-60 line-through"
            )}
          >
            {display}
          </button>
        );
      })}
    </div>
  );
}
