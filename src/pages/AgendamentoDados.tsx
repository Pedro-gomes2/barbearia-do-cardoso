import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Scissors, Calendar, Clock, User, Phone, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createAppointment } from "@/lib/supabase-helpers";
import { useToast } from "@/hooks/use-toast";
import type { Servico } from "@/components/ServiceSelector";

interface LocationState {
  date: string;
  time: string;
  servicos: Servico[];
}

export default function AgendamentoDados() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { date, time, servicos } = (location.state as LocationState) || {};

  const [nome, setNome] = useState("");
  const [sobrenome, setSobrenome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [loading, setLoading] = useState(false);

  if (!date || !time || !servicos || servicos.length === 0) {
    navigate("/agendamento");
    return null;
  }

  const dateDisplay = format(parse(date, "yyyy-MM-dd", new Date()), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  const timeDisplay = time.slice(0, 5);
  const totalPrice = servicos.reduce((sum, s) => sum + s.preco, 0);
  const totalMinutos = servicos.reduce((sum, s) => sum + s.duracao_minutos, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nome.trim().length < 2) {
      toast({ title: "Nome inválido", description: "Informe pelo menos 2 caracteres.", variant: "destructive" });
      return;
    }
    if (sobrenome.trim().length < 2) {
      toast({ title: "Sobrenome inválido", description: "Informe pelo menos 2 caracteres.", variant: "destructive" });
      return;
    }
    if (!/^\d{10,11}$/.test(telefone.replace(/\D/g, ""))) {
      toast({ title: "Telefone inválido", description: "Informe DDD + número.", variant: "destructive" });
      return;
    }

    const nomeCompleto = `${nome.trim()} ${sobrenome.trim()}`;
    setLoading(true);
    try {
      await createAppointment(nomeCompleto, telefone, date, time, servicos.map((s) => s.id));
      navigate("/agendamento/sucesso", { state: { nome: nomeCompleto, date, time, servicos } });
    } catch (err: any) {
      toast({ title: "Erro ao agendar", description: err.message || "Tente novamente.", variant: "destructive" });
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

      <main className="container max-w-lg py-8 space-y-8 animate-fade-in">
        <div className="text-center space-y-2">
          <h2 className="text-4xl">SEUS DADOS</h2>
          <p className="text-muted-foreground">Confirme seus dados para finalizar</p>
        </div>

        {/* Summary */}
        <div className="bg-card rounded-xl p-4 border border-border space-y-3">
          {servicos.map((s) => (
            <div key={s.id} className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-primary">
                <Tag className="h-4 w-4" />
                <span className="font-body text-sm">{s.nome}</span>
              </div>
              <span className="font-heading text-lg text-primary">R$ {s.preco.toFixed(2).replace(".", ",")}</span>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-border pt-2">
            <span className="font-body text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> {totalMinutos} min
            </span>
            {servicos.length > 1 && (
              <span className="font-heading text-lg text-primary">Total: R$ {totalPrice.toFixed(2).replace(".", ",")}</span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-primary">
              <Calendar className="h-5 w-5" />
              <span className="font-body text-sm">{dateDisplay}</span>
            </div>
            <div className="flex items-center gap-2 text-primary">
              <Clock className="h-5 w-5" />
              <span className="font-body text-sm">{timeDisplay}</span>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="nome" className="flex items-center gap-2">
              <User className="h-4 w-4 text-primary" /> Nome
            </Label>
            <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" required minLength={2} maxLength={60} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sobrenome" className="flex items-center gap-2">
              <User className="h-4 w-4 text-primary" /> Sobrenome
            </Label>
            <Input id="sobrenome" value={sobrenome} onChange={(e) => setSobrenome(e.target.value)} placeholder="Seu sobrenome" required minLength={2} maxLength={60} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="telefone" className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-primary" /> Telefone
            </Label>
            <Input id="telefone" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(21) 99999-9999" required maxLength={20} />
          </div>
          <Button type="submit" disabled={loading} className="w-full py-6 text-lg font-heading tracking-widest" size="lg">
            {loading ? "AGENDANDO..." : "CONFIRMAR AGENDAMENTO"}
          </Button>
        </form>
      </main>
    </div>
  );
}
