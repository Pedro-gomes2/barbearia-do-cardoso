import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Check, Clock } from "lucide-react";

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
    return <div className="text-center py-4 text-muted-foreground font-body">Carregando serviços...</div>;
  }

  return (
    <div className="space-y-2">
      {servicos.map((s) => {
        const selected = selectedIds.includes(s.id);
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onToggle(s)}
            className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all ${
              selected
                ? "border-primary bg-primary/10"
                : "border-border bg-card hover:border-primary/50"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${
                selected ? "bg-primary border-primary" : "border-muted-foreground/40"
              }`}>
                {selected && <Check className="h-3 w-3 text-primary-foreground" />}
              </div>
              <div className="text-left">
                <p className="font-body text-sm">{s.nome}</p>
                <p className="font-body text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {s.duracao_minutos} min
                </p>
              </div>
            </div>
            <span className="text-primary font-heading text-lg">
              R$ {s.preco.toFixed(2).replace(".", ",")}
            </span>
          </button>
        );
      })}
    </div>
  );
}
