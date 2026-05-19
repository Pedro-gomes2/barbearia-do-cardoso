import { Users, Phone, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

interface Cliente {
  id: string;
  nome: string;
  telefone: string;
  criado_em: string;
  total_agendamentos: number;
}

export default function AdminClientes() {
  const { data: clientes = [], isLoading } = useQuery({
    queryKey: ["admin-clientes"],
    queryFn: async () => {
      const { data: usuarios } = await supabase
        .from("usuarios")
        .select("id, nome, telefone, criado_em")
        .eq("tipo", "cliente")
        .order("criado_em", { ascending: false });

      if (!usuarios || usuarios.length === 0) return [];

      const clientesComTotal = await Promise.all(
        usuarios.map(async (u) => {
          const { count } = await supabase
            .from("agendamentos")
            .select("id", { count: "exact", head: true })
            .eq("cliente_id", u.id);
          return { ...u, total_agendamentos: count ?? 0 } as Cliente;
        })
      );

      return clientesComTotal;
    },
  });

  return (
    <div className="container max-w-5xl py-8 space-y-6 animate-fade-in">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-heading tracking-wider">CLIENTES</h2>
        <p className="text-muted-foreground font-body text-sm">Lista de clientes cadastrados</p>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      )}

      {!isLoading && clientes.length === 0 && (
        <div className="text-center py-16 space-y-3">
          <Users className="h-12 w-12 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground font-body">Nenhum cliente cadastrado ainda.</p>
        </div>
      )}

      <div className="space-y-3">
        {clientes.map((c) => (
          <div key={c.id} className="bg-card rounded-xl p-4 border border-border flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2 rounded-xl">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-heading text-lg tracking-wide">{c.nome.toUpperCase()}</p>
                <div className="flex items-center gap-1 text-xs text-muted-foreground font-body">
                  <Phone className="h-3 w-3" /> {c.telefone}
                </div>
              </div>
            </div>
            <div className="text-right space-y-1">
              <div className="flex items-center gap-1 text-xs text-muted-foreground font-body justify-end">
                <Calendar className="h-3 w-3" />
                {c.total_agendamentos} agendamento{c.total_agendamentos !== 1 ? "s" : ""}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Desde {new Date(c.criado_em).toLocaleDateString("pt-BR")}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
