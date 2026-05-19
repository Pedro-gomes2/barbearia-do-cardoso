import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Check, Clock } from "lucide-react";

export interface Servico {
  id: string;
  nome: string;
  duracao_minutos: number;
  preco: number;
  ativo: boolean;
  tipo: 'corte_barba' | 'extra';
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
          <div key={i} className="h-14 w-full bg-muted animate-pulse rounded-xl" />
        ))}
      </div>
    );
  }

  const corteBarba = servicos.filter(s => s.tipo === 'corte_barba' || !s.tipo);
  const extras = servicos.filter(s => s.tipo === 'extra');

  const renderGroup = (list: Servico[], label: string) => {
    if (list.length === 0) return null;
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-heading tracking-widest uppercase text-primary border-b border-border/60 pb-1">
          {label}
        </h3>
        <div className="grid grid-cols-1 gap-2">
          {list.map((s) => {
            const selected = selectedIds.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onToggle(s)}
                className={`group relative w-full flex items-end justify-between py-3 px-2 rounded-xl border-2 transition-all duration-200 ${
                  selected
                    ? "border-primary bg-primary/5"
                    : "border-transparent hover:border-primary/20 hover:bg-muted/40"
                }`}
              >
                {selected && (
                  <div className="absolute -top-2 -right-2 bg-primary text-primary-foreground rounded-full p-0.5 shadow">
                    <Check className="h-3 w-3" />
                  </div>
                )}
                <div className="flex-1 flex items-end overflow-hidden">
                  <span className={`font-heading text-lg tracking-wide whitespace-nowrap transition-colors ${selected ? "text-primary" : "text-foreground group-hover:text-primary"}`}>
                    {s.nome.toUpperCase()}
                  </span>
                  <div className={`mx-3 mb-1 flex-1 border-b border-dashed transition-colors ${selected ? "border-primary/40" : "border-muted-foreground/20 group-hover:border-primary/30"}`} />
                </div>
                <div className="text-right flex flex-col items-end gap-1 shrink-0">
                  <span className={`font-heading text-2xl tabular-nums transition-colors ${selected ? "text-primary" : "text-foreground group-hover:text-primary"}`}>
                    R$ {Number(s.preco).toFixed(0)}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] uppercase font-body font-bold text-muted-foreground">
                    <Clock className="h-3 w-3" /> {s.duracao_minutos} min
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {renderGroup(corteBarba, "✂️ Corte / Barba")}
      {renderGroup(extras, "✨ Serviços Extras")}
    </div>
  );
}
