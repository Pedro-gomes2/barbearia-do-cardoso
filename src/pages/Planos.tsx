import { useState } from "react";
import { Scissors, Check, Phone, User } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PixQR } from "@/components/PixQR";
import { supabase } from "@/integrations/supabase/client";
import { listPlanosPublicos, solicitarPlano, AssinaturaExistenteError, type PlanoPublico } from "@/lib/planos-helpers";
import { useToast } from "@/hooks/use-toast";

type Etapa = "lista" | "form" | "pix";

export default function Planos() {
  const { toast } = useToast();
  const [etapa, setEtapa] = useState<Etapa>("lista");
  const [planoSelecionado, setPlanoSelecionado] = useState<PlanoPublico | null>(null);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: planos = [], isLoading } = useQuery({
    queryKey: ["planos-publicos"],
    queryFn: listPlanosPublicos,
  });

  const { data: config } = useQuery({
    queryKey: ["configuracoes-app-pix"],
    queryFn: async () => {
      const { data } = await supabase
        .from("configuracoes_app")
        .select("pix_chave, pix_nome_titular, pix_cidade")
        .limit(1)
        .maybeSingle();
      return data as { pix_chave: string | null; pix_nome_titular: string | null; pix_cidade: string | null } | null;
    },
  });

  const handleSelecionar = (plano: PlanoPublico) => {
    setPlanoSelecionado(plano);
    setEtapa("form");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planoSelecionado) return;
    if (nome.trim().length < 2) {
      toast({ title: "Nome inválido", description: "Informe pelo menos 2 caracteres.", variant: "destructive" });
      return;
    }
    if (!/^\d{10,11}$/.test(telefone.replace(/\D/g, ""))) {
      toast({ title: "Telefone inválido", description: "Informe DDD + número.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await solicitarPlano(nome.trim(), telefone, planoSelecionado.id);
      setEtapa("pix");
    } catch (err) {
      if (err instanceof AssinaturaExistenteError) {
        toast({ title: "Solicitação já existe", description: err.message, variant: "destructive" });
      } else {
        toast({ title: "Erro ao solicitar plano", description: (err as Error).message, variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container flex items-center gap-2 py-4">
          <Scissors className="h-6 w-6 text-primary" />
          <h1 className="text-2xl tracking-wider">BARBEARIA</h1>
        </div>
      </header>

      <main className="container max-w-3xl py-8 space-y-8 animate-fade-in">
        {etapa === "lista" && (
          <>
            <div className="text-center space-y-2">
              <h2 className="text-4xl">PLANO MENSAL</h2>
              <p className="text-muted-foreground">4 atendimentos por mês, agendáveis de terça a quinta</p>
            </div>

            {isLoading && <p className="text-center text-muted-foreground">Carregando planos...</p>}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {planos.map((plano) => (
                <div key={plano.id} className="bg-card rounded-2xl p-6 border border-border flex flex-col gap-4 items-center text-center">
                  <h3 className="font-heading text-xl tracking-wide">{plano.nome.toUpperCase()}</h3>
                  <p className="font-heading text-3xl text-primary">
                    R$ {plano.preco.toFixed(2).replace(".", ",")}
                  </p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check className="h-4 w-4 text-primary" /> 4 atendimentos/mês
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check className="h-4 w-4 text-primary" /> Terça a quinta
                  </div>
                  <Button onClick={() => handleSelecionar(plano)} className="w-full font-heading tracking-widest">
                    QUERO ESSE PLANO
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}

        {etapa === "form" && planoSelecionado && (
          <form onSubmit={handleSubmit} className="space-y-6 max-w-md mx-auto">
            <div className="text-center space-y-2">
              <h2 className="text-3xl">{planoSelecionado.nome.toUpperCase()}</h2>
              <p className="font-heading text-2xl text-primary">
                R$ {planoSelecionado.preco.toFixed(2).replace(".", ",")}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="nome" className="flex items-center gap-2">
                <User className="h-4 w-4 text-primary" /> Nome
              </Label>
              <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome completo" required minLength={2} maxLength={60} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="telefone" className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-primary" /> Telefone
              </Label>
              <Input id="telefone" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(21) 99999-9999" required maxLength={20} />
            </div>
            <Button type="submit" disabled={loading} className="w-full py-6 text-lg font-heading tracking-widest" size="lg">
              {loading ? "ENVIANDO..." : "CONTINUAR PARA O PAGAMENTO"}
            </Button>
          </form>
        )}

        {etapa === "pix" && planoSelecionado && (
          <div className="max-w-md mx-auto text-center space-y-6">
            <h2 className="text-2xl">PAGUE VIA PIX PARA ATIVAR</h2>
            <PixQR
              chave={config?.pix_chave || ""}
              nome={config?.pix_nome_titular || ""}
              cidade={config?.pix_cidade || ""}
              valor={planoSelecionado.preco}
            />
            <p className="text-sm text-muted-foreground">
              Após o pagamento, aguarde a confirmação do administrador. Você pode fechar esta página.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
