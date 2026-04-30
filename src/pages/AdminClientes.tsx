import { Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

interface ClienteRanking {
  id: string;
  nome: string;
  telefone: string;
  total: number;
}

export default function AdminClientes() {
  const { data: clientes = [], isLoading } = useQuery({
    queryKey: ["admin-clientes-ranking"],
    queryFn: async () => {
      const { data: usuarios } = await supabase.from("usuarios").select("id, nome, telefone");
      if (!usuarios || usuarios.length === 0) return [];

      const { data: agendamentos } = await supabase
        .from("agendamentos")
        .select("cliente_id")
        .eq("status", "ativo");

      const counts: Record<string, number> = {};
      (agendamentos || []).forEach((a) => {
        counts[a.cliente_id] = (counts[a.cliente_id] || 0) + 1;
      });

      const ranked: ClienteRanking[] = usuarios.map((u) => ({
        id: u.id,
        nome: u.nome,
        telefone: u.telefone,
        total: counts[u.id] || 0,
      }));

      ranked.sort((a, b) => b.total - a.total);
      return ranked;
    },
  });

  return (
    <div className="container max-w-lg py-8 space-y-6 animate-fade-in">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-heading tracking-wider">CLIENTES</h2>
        <p className="text-muted-foreground font-body text-sm">Ranking por número de agendamentos</p>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground font-body">Carregando...</div>
      ) : clientes.length === 0 ? (
        <p className="text-center text-muted-foreground font-body py-8">Nenhum cliente encontrado.</p>
      ) : (
        <div className="space-y-2">
          {clientes.map((c, idx) => (
            <div key={c.id} className="bg-card rounded-xl p-4 border border-border flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                {idx < 3 ? (
                  <Trophy className={`h-5 w-5 ${idx === 0 ? "text-yellow-500" : idx === 1 ? "text-gray-400" : "text-amber-700"}`} />
                ) : (
                  <span className="text-sm font-heading text-muted-foreground">{idx + 1}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-heading text-lg truncate">{c.nome}</p>
                <p className="text-sm text-muted-foreground font-body">{c.telefone}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-heading text-primary">{c.total}</p>
                <p className="text-xs text-muted-foreground font-body">agendamentos</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
