import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Check, Clock, Star } from "lucide-react";

export interface Servico {
  id: string;
  nome: string;
  duracao_minutos: number;
  preco: number;
  ativo: boolean;
}

interface ServiceSelectorProps {
  selectedIds: string[];
  onToggle: (servico: Servico) => void;
}

export function ServiceSelector({ selectedIds, onToggle }: ServiceSelectorProps) {
  const { data: servicos = [], isLoading } = useQuery({
    queryKey: ["servicos"],
    queryFn: async () => {
      const { data } = await supabase
        .from("servicos")
        .select("*")
        .eq("ativo", true)
        .order("ordem", { ascending: true });
      return (data || []) as Servico[];
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 w-full bg-muted animate-pulse rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3">
      {servicos.map((s) => {
        const selected = selectedIds.includes(s.id);
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onToggle(s)}
            className={`group relative w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-all duration-300 ${
              selected
                ? "border-primary bg-primary/5 shadow-md scale-[1.02]"
                : "border-border bg-card hover:border-primary/30"
            }`}
          >
            {selected && (
              <div className="absolute -top-2 -right-2 bg-primary text-primary-foreground rounded-full p-1 shadow-lg animate-in zoom-in-50 duration-300">
                <Check className="h-4 w-4" />
              </div>
            )}
            
            <div className="flex items-center gap-4 text-left">
              <div className={`p-3 rounded-xl transition-colors ${
                selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary"
              }`}>
                <Star className={`h-5 w-5 ${selected ? "fill-current" : ""}`} />
              </div>
              <div className="space-y-0.5">
                <p className={`font-heading tracking-wide text-lg transition-colors ${selected ? "text-primary" : "text-foreground"}`}>
                  {s.nome.toUpperCase()}
                </p>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 text-[10px] uppercase font-body font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    <Clock className="h-3 w-3" /> {s.duracao_minutos} MIN
                  </span>
                  {selected && (
                    <span className="text-[10px] uppercase font-bold text-primary animate-pulse">Selecionado</span>
                  )}
                </div>
              </div>
            </div>

            <div className="text-right">
              <p className={`font-heading text-2xl transition-colors ${selected ? "text-primary" : "text-foreground"}`}>
                R$ {Number(s.preco).toFixed(0)}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
