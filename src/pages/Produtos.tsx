import { useNavigate } from "react-router-dom";
import { ShoppingBag, ArrowLeft, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import type { Produto } from "@/lib/produto-types";

export default function Produtos() {
  const navigate = useNavigate();

  const { data: produtos = [], isLoading } = useQuery({
    queryKey: ["produtos-publico"],
    queryFn: async () => {
      const { data } = await supabase
        .from("produtos")
        .select("*")
        .eq("ativo", true)
        .order("ordem", { ascending: true });
      return (data || []) as Produto[];
    },
  });

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="container max-w-2xl py-12 space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="font-heading tracking-widest text-xs">
          <ArrowLeft className="h-4 w-4 mr-2" /> VOLTAR
        </Button>
        <div className="flex items-center gap-3">
          <ShoppingBag className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-heading tracking-wider">PRODUTOS</h1>
        </div>
        <Home className="h-5 w-5 text-muted-foreground cursor-pointer" onClick={() => navigate("/")} />
      </div>

        {isLoading && (
          <p className="text-muted-foreground font-body text-center py-16">Carregando produtos...</p>
        )}

        {!isLoading && produtos.length === 0 && (
          <div className="text-center py-16 space-y-3">
            <ShoppingBag className="h-12 w-12 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground font-body">Nenhum produto disponível no momento.</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {produtos.map((p) => (
            <div key={p.id} className="bg-card rounded-xl border border-border overflow-hidden flex flex-col">
              <div className="p-4 space-y-2 flex-1 flex flex-col justify-between">
                <div className="space-y-1">
                  <h3 className="font-heading text-xl tracking-wide">{p.nome.toUpperCase()}</h3>
                  {p.descricao && (
                    <p className="text-muted-foreground font-body text-sm">{p.descricao}</p>
                  )}
                </div>
                {p.preco > 0 && (
                  <span className="font-heading text-2xl text-primary">
                    R$ {Number(p.preco).toFixed(2).replace(".", ",")}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
