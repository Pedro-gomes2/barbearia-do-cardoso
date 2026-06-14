import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Scissors, Phone, Calendar, Clock, X, ArrowLeft, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Agendamento {
  id: string;
  data: string;
  horario: string;
  status: string;
  nome?: string;
}

export default function Cancelar() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [telefone, setTelefone] = useState("");
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [whatsappAdmin, setWhatsappAdmin] = useState("5521995323454");

  const handleBuscar = async (e: React.FormEvent) => {
    e.preventDefault();
    const tel = telefone.replace(/\D/g, "");
    if (tel.length < 10) {
      toast({ title: "Telefone inválido", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const [{ data }, { data: cfg }] = await Promise.all([
        supabase.rpc("buscar_agendamentos_por_telefone", { _telefone: tel }),
        supabase.from("configuracoes_app").select("whatsapp_admin").limit(1).maybeSingle(),
      ]);
      setAgendamentos((data as any) || []);
      if (cfg?.whatsapp_admin) setWhatsappAdmin(cfg.whatsapp_admin);
      setSearched(true);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleCancelar = async (apt: Agendamento) => {
    const tel = telefone.replace(/\D/g, "");
    const { data: ok, error } = await supabase.rpc("cancelar_agendamento_por_telefone", {
      _telefone: tel,
      _agendamento_id: apt.id,
    });
    if (error || !ok) {
      toast({ title: "Não foi possível cancelar", variant: "destructive" });
      return;
    }
    setAgendamentos((prev) => prev.filter((a) => a.id !== apt.id));

    const dateDisplay = format(parse(apt.data, "yyyy-MM-dd", new Date()), "dd/MM/yyyy", { locale: ptBR });
    const msg = encodeURIComponent(
      `Olá! Preciso cancelar meu agendamento:\n` +
        `👤 ${apt.nome || "Cliente"}\n` +
        `📅 ${dateDisplay}\n` +
        `🕐 ${apt.horario.slice(0, 5)}`
    );
    window.open(`https://wa.me/${whatsappAdmin}?text=${msg}`, "_blank");
    toast({ title: "Agendamento cancelado", description: "Aviso enviado via WhatsApp." });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container flex items-center gap-2 py-4">
          <Scissors className="h-6 w-6 text-primary" />
          <h1 className="text-2xl tracking-wider">BARBEARIA</h1>
        </div>
      </header>

      <main className="container max-w-lg py-8 space-y-6 animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="font-heading tracking-widest text-xs">
            <ArrowLeft className="h-4 w-4 mr-2" /> VOLTAR
          </Button>
          <Home className="h-5 w-5 text-muted-foreground cursor-pointer" onClick={() => navigate("/")} />
        </div>

        <div className="text-center space-y-2">
          <h2 className="text-4xl">CANCELAR AGENDAMENTO</h2>
          <p className="text-muted-foreground font-body">Informe o telefone usado no agendamento</p>
        </div>

        <form onSubmit={handleBuscar} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="telefone" className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-primary" /> Telefone
            </Label>
            <Input
              id="telefone"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="(21) 99999-9999"
              maxLength={20}
              required
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full py-6 font-heading tracking-widest" size="lg">
            {loading ? "BUSCANDO..." : "BUSCAR AGENDAMENTOS"}
          </Button>
        </form>

        {searched && agendamentos.length === 0 && (
          <p className="text-center text-muted-foreground font-body py-8">
            Nenhum agendamento ativo encontrado para este telefone.
          </p>
        )}

        {agendamentos.length > 0 && (
          <div className="space-y-3">
            {agendamentos.map((apt) => (
              <div key={apt.id} className="bg-card rounded-xl p-4 border border-border space-y-3">
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-primary" />
                  <span className="font-body">
                    {format(parse(apt.data, "yyyy-MM-dd", new Date()), "dd 'de' MMMM", { locale: ptBR })}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-primary" />
                  <span className="font-body">{apt.horario.slice(0, 5)}</span>
                </div>
                <Button onClick={() => handleCancelar(apt)} variant="destructive" className="w-full font-heading tracking-wider">
                  <X className="mr-2 h-4 w-4" /> CANCELAR ESTE HORÁRIO
                </Button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
