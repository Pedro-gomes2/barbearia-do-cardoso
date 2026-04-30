import { cn } from "@/lib/utils";
import { Scissors } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Servico {
  id: string;
  nome: string;
  duracao_minutos: number;
  preco: number;
  ativo: boolean;
}

interface ServiceSelectorProps {
  selectedId: string | null;
  onSelect: (servico: Servico) => void;
}

export function ServiceSelector({ selectedId, onSelect }: ServiceSelectorProps) {
  const { data: servicos = [], isLoading } = useQuery({
    queryKey: ["servicos"],
    queryFn: async () => {
      const { data } = await supabase
        .from("servicos")
        .select("*")
        .eq("ativo", true)
        .order("nome");
      return (data || []) as Servico[];
    },
  });

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Carregando serviços...</div>;
  }

  return (
    <div className="grid grid-cols-1 gap-3">
      {servicos.map((s) => {
        const isSelected = selectedId === s.id;
        return (
          <button
            key={s.id}
            onClick={() => onSelect(s)}
            className={cn(
              "w-full p-4 rounded-xl border text-left transition-all duration-200 flex items-center gap-4",
              isSelected
                ? "border-primary bg-primary/10 shadow-lg shadow-primary/20"
                : "border-border bg-card hover:border-primary/50 hover:bg-primary/5"
            )}
          >
            <Scissors className={cn("h-5 w-5 shrink-0", isSelected ? "text-primary" : "text-muted-foreground")} />
            <div className="flex-1 min-w-0">
              <p className="font-heading text-lg tracking-wide">{s.nome.toUpperCase()}</p>
              <p className="text-sm text-muted-foreground font-body">{s.duracao_minutos} min</p>
            </div>
            <span className="font-heading text-xl text-primary">
              R$ {s.preco.toFixed(2).replace(".", ",")}
            </span>
          </button>
        );
      })}
    </div>
  );
}
