import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { Scissors, Users, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ServiceSelector, type Servico } from "@/components/ServiceSelector";

export default function Fila() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const today = format(new Date(), "yyyy-MM-dd");

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [servico, setServico] = useState<Servico | null>(null);
  const [loading, setLoading] = useState(false);
  const [meuId, setMeuId] = useState<string | null>(localStorage.getItem(`fila_${today}`));

  const { data: cfg } = useQuery({
    queryKey: ["fila-config", today],
    queryFn: async () => {
      const { data } = await supabase.from("fila_config").select("*").eq("data", today).maybeSingle();
      return data;
    },
  });

  const { data: fila = [] } = useQuery({
    queryKey: ["fila-publica", today],
    queryFn: async () => {
      const { data } = await supabase
        .from("fila_atendimento")
        .select("id, posicao, status, usuarios(nome)")
        .eq("data", today)
        .in("status", ["aguardando", "atendendo"])
        .order("posicao");
      return data || [];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("fila-public")
      .on("postgres_changes", { event: "*", schema: "public", table: "fila_atendimento" }, () => {
        queryClient.invalidateQueries({ queryKey: ["fila-publica", today] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [queryClient, today]);

  const minhaPos = fila.find((f: any) => f.id === meuId);

  const handleEntrar = async (e: React.FormEvent) => {
    e.preventDefault();
    const tel = telefone.replace(/\D/g, "");
    if (nome.length < 2 || tel.length < 10 || !servico) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { data: usuario, error: uErr } = await supabase
        .from("usuarios")
        .insert({ nome, telefone: tel, tipo: "cliente" })
        .select()
        .single();
      if (uErr) throw uErr;

      const proximaPos =
        (await supabase
          .from("fila_atendimento")
          .select("posicao")
          .eq("data", today)
          .order("posicao", { ascending: false })
          .limit(1)
          .maybeSingle()).data?.posicao ?? 0;

      const { data: f, error: fErr } = await supabase
        .from("fila_atendimento")
        .insert({ data: today, cliente_id: usuario.id, servico_id: servico.id, posicao: proximaPos + 1 })
        .select()
        .single();
      if (fErr) throw fErr;

      localStorage.setItem(`fila_${today}`, f.id);
      setMeuId(f.id);
      toast({ title: "Você entrou na fila!" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const aguardando = fila.filter((f: any) => f.status === "aguardando").length;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container flex items-center gap-2 py-4">
          <Scissors className="h-6 w-6 text-primary" />
          <h1 className="text-2xl tracking-wider">BARBEARIA</h1>
        </div>
      </header>

      <main className="container max-w-lg py-8 space-y-6 animate-fade-in">
        <Button variant="ghost" onClick={() => navigate("/")} className="font-heading">
          <ArrowLeft className="mr-2 h-4 w-4" /> VOLTAR
        </Button>

        <div className="text-center space-y-2">
          <Users className="h-10 w-10 text-primary mx-auto" />
          <h2 className="text-4xl">FILA DE ATENDIMENTO</h2>
          <p className="text-muted-foreground font-body">Por ordem de chegada</p>
        </div>

        {!cfg?.aberta ? (
          <div className="bg-card border border-border rounded-xl p-6 text-center space-y-2">
            <p className="font-heading text-2xl text-muted-foreground">FILA FECHADA</p>
            <p className="font-body text-sm text-muted-foreground">
              A fila ainda não foi aberta hoje. Você pode agendar um horário fixo.
            </p>
            <Button onClick={() => navigate("/agendamento")} className="mt-3 font-heading tracking-widest">
              IR PARA AGENDAMENTO
            </Button>
          </div>
        ) : minhaPos ? (
          <div className="bg-card border border-primary rounded-xl p-6 text-center space-y-3">
            <p className="font-body text-sm text-muted-foreground">SUA POSIÇÃO</p>
            <p className="font-heading text-7xl text-primary">{minhaPos.posicao}</p>
            {minhaPos.status === "atendendo" ? (
              <p className="font-heading text-xl text-primary animate-pulse">É A SUA VEZ!</p>
            ) : (
              <p className="font-body text-sm">
                {aguardando > 1 ? `${aguardando - 1} pessoa(s) na sua frente` : "Você é o próximo!"}
              </p>
            )}
          </div>
        ) : (
          <form onSubmit={handleEntrar} className="space-y-4 bg-card border border-border rounded-xl p-4">
            <p className="font-heading text-lg text-center">ENTRAR NA FILA</p>
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={100} required />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(21) 99999-9999" maxLength={20} required />
            </div>
            <div className="space-y-2">
              <Label>Serviço</Label>
              <ServiceSelector
                selectedIds={servico ? [servico.id] : []}
                onToggle={(s) => setServico((prev) => (prev?.id === s.id ? null : s))}
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full py-6 font-heading tracking-widest" size="lg">
              {loading ? "ENTRANDO..." : "ENTRAR NA FILA"}
            </Button>
          </form>
        )}

        {fila.length > 0 && (
          <div className="space-y-2">
            <p className="font-heading text-sm text-muted-foreground tracking-wider">FILA ATUAL</p>
            {fila.map((f: any) => (
              <div
                key={f.id}
                className={`flex items-center gap-3 p-3 rounded-lg border ${
                  f.id === meuId ? "border-primary bg-primary/5" : "border-border bg-card"
                }`}
              >
                <span className="font-heading text-2xl text-primary w-8 text-center">{f.posicao}</span>
                <span className="font-body flex-1">{f.usuarios?.nome}</span>
                {f.status === "atendendo" && (
                  <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded font-body">EM ATENDIMENTO</span>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
