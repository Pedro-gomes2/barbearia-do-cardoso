import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle, Calendar, Clock, Tag, MessageCircle, AlertCircle, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { Servico } from "@/components/ServiceSelector";
import { buildWhatsappConfirmMessage, buildWhatsappConfirmUrl } from "@/lib/confirmacao-helpers";

const FALLBACK_WHATSAPP = "5521995323454";

export default function AgendamentoSucesso() {
  const location = useLocation();
  const navigate = useNavigate();

  const { nome, date, time, servicos } = (location.state as {
    nome: string;
    date: string;
    time: string;
    servicos?: Servico[];
  }) || {};

  const [cfg, setCfg] = useState<any>(null);
  const [whatsappEnviado, setWhatsappEnviado] = useState(false);

  useEffect(() => {
    supabase
      .from("configuracoes_app")
      .select("*")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setCfg(data));
  }, []);

  // Prevent navigation away before WhatsApp confirmation
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!whatsappEnviado) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => {
      window.removeEventListener("beforeunload", handler);
    };
  }, [whatsappEnviado]);

  // Countdown timer for WhatsApp confirmation (30 minutes)
  const [secondsLeft, setSecondsLeft] = useState(30 * 60);
  useEffect(() => {
    if (whatsappEnviado) return;
    const interval = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [whatsappEnviado]);

  if (!date || !time) {
    navigate("/agendamento");
    return null;
  }

  const dateDisplay = format(parse(date, "yyyy-MM-dd", new Date()), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  const timeDisplay = time.slice(0, 5);
  const totalPrice = (servicos || []).reduce((sum, s) => sum + s.preco, 0);
  const totalMinutos = (servicos || []).reduce((sum, s) => sum + s.duracao_minutos, 0);
  const whatsappNumber = cfg?.whatsapp_admin || FALLBACK_WHATSAPP;

  const servicosNomes = (servicos || []).map((s) => s.nome);
  const messageText = buildWhatsappConfirmMessage({
    nome,
    data: date,
    horario: time,
    servicos: servicosNomes,
  });

  const whatsappUrl = buildWhatsappConfirmUrl(whatsappNumber, messageText);

  const handleWhatsapp = () => {
    window.open(whatsappUrl, "_blank");
    setWhatsappEnviado(true);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="container flex items-center gap-2 py-4">
          <Scissors className="h-6 w-6 text-primary" />
          <h1 className="text-2xl tracking-wider">BARBEARIA</h1>
        </div>
      </header>

      <main className="container max-w-lg flex-1 py-12 space-y-6 animate-fade-in">
        <div className="text-center space-y-3">
          <CheckCircle className="h-16 w-16 text-primary mx-auto" />
          <h2 className="text-4xl">AGENDADO!</h2>
          <p className="text-muted-foreground font-body text-sm">
            Atendimento ainda <strong>NÃO confirmado</strong>. Envie a mensagem ao barbeiro pelo WhatsApp em até <strong>30 minutos</strong> para garantir seu horário.
          </p>
        </div>

        <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-4 flex gap-3 items-start">
          <AlertCircle className="h-5 w-5 text-yellow-700 flex-shrink-0 mt-0.5" />
          <p className="font-body text-sm text-yellow-900">
            Seu horário está <strong>pendente</strong> e expira em 30 minutos se não houver confirmação pelo WhatsApp.
          </p>
        </div>

        {/* Resumo */}
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
                <span className="font-body text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {totalMinutos} min
                </span>
                {(servicos || []).length > 1 && (
                  <span className="text-primary font-heading text-lg">Total: R$ {totalPrice.toFixed(2).replace(".", ",")}</span>
                )}
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

        {/* Aviso obrigatório */}
        {!whatsappEnviado && (
          <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 shrink-0" />
            <p className="font-body text-sm text-yellow-800">
              <strong>Atenção:</strong> Você precisa enviar a mensagem no WhatsApp para confirmar seu agendamento. Sem a confirmação o horário não será garantido.
            </p>
          </div>
        )}
        
        {/* Countdown timer */}
        {!whatsappEnviado && secondsLeft > 0 && (
          <p className="text-sm text-muted-foreground mt-2 text-center">
            Tempo restante para confirmar: {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
          </p>
        )}

        {/* Botão WhatsApp — obrigatório */}
        <Button
          onClick={handleWhatsapp}
          className="w-full py-6 text-lg font-heading tracking-widest bg-[#25D366] hover:bg-[#1da851] text-white"
          size="lg"
        >
          <MessageCircle className="mr-2 h-5 w-5" />
          {whatsappEnviado ? "ENVIAR NOVAMENTE" : "CONFIRMAR PELO WHATSAPP"}
        </Button>

        {/* Só aparece após enviar */}
        {whatsappEnviado && (
          <div className="space-y-3 animate-fade-in">
            <div className="bg-green-50 border border-green-300 rounded-xl p-4 text-center">
              <p className="font-body text-sm text-green-800 font-semibold">
                ✅ Mensagem enviada! Aguarde a confirmação do administrador.
              </p>
            </div>
            <Button
              onClick={() => navigate("/")}
              variant="ghost"
              className="w-full py-4 font-heading tracking-widest"
            >
              VOLTAR AO INÍCIO
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
