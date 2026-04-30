import { useLocation, useNavigate } from "react-router-dom";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle, Calendar, Clock, Tag, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Scissors } from "lucide-react";
import type { Servico } from "@/components/ServiceSelector";

const WHATSAPP_NUMBER = "5521995323454";

export default function AgendamentoSucesso() {
  const location = useLocation();
  const navigate = useNavigate();

  const { nome, date, time, servicos } = (location.state as {
    nome: string;
    date: string;
    time: string;
    servicos?: Servico[];
  }) || {};

  if (!date || !time) {
    navigate("/agendamento");
    return null;
  }

  const dateDisplay = format(parse(date, "yyyy-MM-dd", new Date()), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  const timeDisplay = time.slice(0, 5);
  const totalPrice = (servicos || []).reduce((sum, s) => sum + s.preco, 0);

  const servicosText = (servicos || []).map((s) => s.nome).join(", ");
  const whatsappMsg = encodeURIComponent(
    `Olá! Novo agendamento na Barbearia Cardoso:\n` +
    `👤 ${nome}\n` +
    `📅 ${dateDisplay}\n` +
    `🕐 ${timeDisplay}\n` +
    (servicosText ? `✂️ ${servicosText}\n` : "") +
    `Aguardo confirmação!`
  );

  const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${whatsappMsg}`;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="container flex items-center gap-2 py-4">
          <Scissors className="h-6 w-6 text-primary" />
          <h1 className="text-2xl tracking-wider">BARBEARIA CARDOSO</h1>
        </div>
      </header>

      <main className="container max-w-lg flex-1 flex flex-col items-center justify-center py-12 space-y-8 animate-fade-in">
        <div className="text-center space-y-4">
          <CheckCircle className="h-20 w-20 text-primary mx-auto" />
          <h2 className="text-5xl">CONFIRMADO!</h2>
          <p className="text-muted-foreground">Seu agendamento foi realizado com sucesso</p>
        </div>

        <div className="bg-card rounded-xl p-6 border border-border w-full space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-primary font-semibold text-sm font-body">Nome:</span>
            <span className="font-body">{nome}</span>
          </div>
          {servicos && servicos.length > 0 && (
            <div className="space-y-2">
              {servicos.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-primary" />
                    <span className="font-body text-sm">{s.nome}</span>
                  </div>
                  <span className="text-primary font-heading">R$ {s.preco.toFixed(2).replace(".", ",")}</span>
                </div>
              ))}
              {servicos.length > 1 && (
                <div className="flex items-center justify-between border-t border-border pt-2 mt-2">
                  <span className="font-body text-sm font-semibold">Total</span>
                  <span className="text-primary font-heading text-lg">R$ {totalPrice.toFixed(2).replace(".", ",")}</span>
                </div>
              )}
            </div>
          )}
          <div className="flex items-center gap-3">
            <Calendar className="h-5 w-5 text-primary" />
            <span className="font-body">{dateDisplay}</span>
          </div>
          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-primary" />
            <span className="font-body">{timeDisplay}</span>
          </div>
        </div>

        <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="w-full">
          <Button className="w-full py-6 text-lg font-heading tracking-widest bg-[#25D366] hover:bg-[#1da851] text-white" size="lg">
            <MessageCircle className="mr-2 h-5 w-5" />
            ENVIAR WHATSAPP
          </Button>
        </a>

        <Button
          onClick={() => navigate("/agendamento")}
          variant="outline"
          className="w-full py-6 text-lg font-heading tracking-widest"
          size="lg"
        >
          NOVO AGENDAMENTO
        </Button>
      </main>
    </div>
  );
}
