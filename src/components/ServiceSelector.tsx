import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
    return <div className="text-center py-4 text-muted-foreground font-body">Carregando serviços...</div>;
  }

  return (
    <Select
      value={selectedId || undefined}
      onValueChange={(val) => {
        const s = servicos.find((sv) => sv.id === val);
        if (s) onSelect(s);
      }}
    >
      <SelectTrigger className="w-full h-12 font-body">
        <SelectValue placeholder="Selecione um serviço" />
      </SelectTrigger>
      <SelectContent>
        {servicos.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            <span className="flex items-center justify-between gap-4 w-full">
              <span>{s.nome}</span>
              <span className="text-primary font-semibold">
                R$ {s.preco.toFixed(2).replace(".", ",")} · {s.duracao_minutos}min
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
