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
      <div className="text-center py-8 text-muted-foreground">
        <Clock className="mx-auto mb-2 h-8 w-8 opacity-50" />
        <p>Nenhum horário disponível nesta data.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-3">
      {slots.map((slot) => {
        const display = slot.time.slice(0, 5);
        const isSelected = selectedTime === slot.time;
        return (
          <button
            key={slot.time}
            disabled={!slot.available}
            onClick={() => onSelect(slot.time)}
            className={cn(
              "py-3 px-4 rounded-lg text-center font-medium transition-all duration-200 border",
              slot.available && !isSelected &&
                "border-border bg-surface text-foreground hover:border-primary hover:bg-primary/10",
              isSelected &&
                "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/20",
              !slot.available &&
                "border-border/50 bg-muted/30 text-muted-foreground/40 cursor-not-allowed line-through"
            )}
          >
            {display}
          </button>
        );
      })}
    </div>
  );
}
