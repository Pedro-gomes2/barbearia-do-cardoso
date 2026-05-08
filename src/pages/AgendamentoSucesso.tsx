import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle, Calendar, Clock, Tag, MessageCircle, Copy, X, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { PixQR } from "@/components/PixQR";
import type { Servico } from "@/components/ServiceSelector";

const FALLBACK_WHATSAPP = "5521995323454";

export default function AgendamentoSucesso() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();

  const { nome, date, time, servicos } = (location.state as {
    nome: string;
    date: string;
    time: string;
    servicos?: Servico[];
  }) || {};

  const [cfg, setCfg] = useState<any>(null);

  useEffect(() => {
    supabase.from("configuracoes_app").select("*").limit(1).maybeSingle().then(({ data }) => setCfg(data));
  }, []);

  if (!date || !time) {
    navigate("/agendamento");
    return null;
  }

  const dateDisplay = format(parse(date, "yyyy-MM-dd", new Date()), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  const timeDisplay = time.slice(0, 5);
  const totalPrice = (servicos || []).reduce((sum, s) => sum + s.preco, 0);
  const whatsappNumber = cfg?.whatsapp_admin || FALLBACK_WHATSAPP;

  const servicosText = (servicos || []).map((s) => s.nome).join(", ");
  const messageText =
    `Olá! Novo agendamento na Barbearia Cardoso:\n` +
    `👤 ${nome}\n` +
    `📅 ${dateDisplay}\n` +
    `🕐 ${timeDisplay}\n` +
    (servicosText ? `✂️ ${servicosText}\n` : "") +
    `Aguardo confirmação!`;

  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(messageText)}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(messageText);
      toast({ title: "Mensagem copiada!" });
    } catch {
      toast({ title: "Erro ao copiar", variant: "destructive" });
    }
  };

  const pixOk = cfg?.pix_chave && cfg?.pix_nome_titular && cfg?.pix_cidade && totalPrice > 0;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="container flex items-center gap-2 py-4">
          <Scissors className="h-6 w-6 text-primary" />
          <h1 className="text-2xl tracking-wider">BARBEARIA CARDOSO</h1>
        </div>
      </header>

      <main className="container max-w-lg flex-1 py-12 space-y-6 animate-fade-in">
        <div className="text-center space-y-3">
          <CheckCircle className="h-16 w-16 text-primary mx-auto" />
          <h2 className="text-4xl">CONFIRMADO!</h2>
        </div>

        <div className="bg-card rounded-xl p-5 border border-border w-full space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-primary font-semibold text-sm font-body">Nome:</span>
            <span className="font-body">{nome}</span>
          </div>
          {servicos && servicos.length > 0 && (
            <div className="space-y-1">
              {servicos.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-primary" />
                    <span className="font-body text-sm">{s.nome}</span>
                  </div>
                  <span className="text-primary font-heading">R$ {s.preco.toFixed(2).replace(".", ",")}</span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-border pt-2 mt-2">
                <span className="font-body text-sm font-semibold">Total</span>
                <span className="text-primary font-heading text-lg">R$ {totalPrice.toFixed(2).replace(".", ",")}</span>
              </div>
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

        {pixOk && (
          <div className="bg-card rounded-xl p-5 border border-primary/40 space-y-3">
            <p className="font-heading text-lg text-center tracking-wider">PAGAR COM PIX</p>
            <PixQR
              chave={cfg.pix_chave}
              nome={cfg.pix_nome_titular}
              cidade={cfg.pix_cidade}
              valor={totalPrice}
              descricao="Barbearia Cardoso"
            />
          </div>
        )}

        <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="block w-full">
          <Button className="w-full py-6 text-lg font-heading tracking-widest bg-[#25D366] hover:bg-[#1da851] text-white" size="lg">
            <MessageCircle className="mr-2 h-5 w-5" />
            ENVIAR WHATSAPP
          </Button>
        </a>

        <Button onClick={handleCopy} variant="outline" className="w-full py-5 font-heading tracking-widest" size="lg">
          <Copy className="mr-2 h-5 w-5" />
          COPIAR MENSAGEM
        </Button>

        <Button
          onClick={() => navigate("/cancelar")}
          variant="ghost"
          className="w-full py-4 font-heading tracking-widest text-destructive hover:text-destructive"
        >
          <X className="mr-2 h-4 w-4" />
          PRECISO CANCELAR
        </Button>

        <Button onClick={() => navigate("/agendamento")} variant="ghost" className="w-full py-4 font-heading tracking-widest">
          NOVO AGENDAMENTO
        </Button>
      </main>
    </div>
  );
}
