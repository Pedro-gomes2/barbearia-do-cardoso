import { useNavigate } from "react-router-dom";
import { Scissors, Clock, CalendarCheck, Tag, MapPin, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import heroImage from "@/assets/hero-barbershop.jpg";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

export default function Index() {
  const navigate = useNavigate();

  const { data: servicos = [] } = useQuery({
    queryKey: ["servicos-landing"],
    queryFn: async () => {
      const { data } = await supabase
        .from("servicos")
        .select("id, nome, preco")
        .eq("ativo", true)
        .order("nome");
      return data || [];
    },
  });

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Hero */}
      <div className="relative h-[60vh] min-h-[400px] overflow-hidden">
        <img
          src={heroImage}
          alt="Interior da Barbearia Cardoso"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/40 to-background" />
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-4 animate-fade-in">
          <Scissors className="h-12 w-12 text-primary mb-4" />
          <h1 className="text-6xl md:text-8xl tracking-wider mb-2">BARBEARIA</h1>
          <h1 className="text-6xl md:text-8xl tracking-wider text-primary">CARDOSO</h1>
          <p className="mt-4 text-muted-foreground font-body text-lg max-w-md">
            Estilo e tradição em cada corte. Agende seu horário online.
          </p>
        </div>
      </div>

      {/* Features */}
      <section className="container max-w-3xl py-16 space-y-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-card rounded-xl p-6 border border-border space-y-3">
            <CalendarCheck className="h-8 w-8 text-primary" />
            <h3 className="text-2xl">AGENDAMENTO ONLINE</h3>
            <p className="text-muted-foreground font-body text-sm">
              Escolha data e horário em poucos cliques. Sem filas, sem espera.
            </p>
          </div>
          <div className="bg-card rounded-xl p-6 border border-border space-y-3">
            <Clock className="h-8 w-8 text-primary" />
            <h3 className="text-2xl">HORÁRIOS FLEXÍVEIS</h3>
            <p className="text-muted-foreground font-body text-sm">
              Segunda a sábado, com horários atualizados em tempo real.
            </p>
          </div>
        </div>

        {/* Services & Prices */}
        {servicos.length > 0 && (
          <div className="bg-card rounded-xl p-6 border border-border space-y-4">
            <div className="flex items-center gap-2 text-primary">
              <Tag className="h-6 w-6" />
              <h3 className="text-2xl">NOSSOS SERVIÇOS</h3>
            </div>
            <div className="divide-y divide-border">
              {servicos.map((s: any) => (
                <div key={s.id} className="flex items-center justify-between py-3">
                  <span className="font-body">{s.nome}</span>
                  <span className="font-heading text-primary text-xl">
                    R$ {Number(s.preco).toFixed(2).replace(".", ",")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <Button
          onClick={() => navigate("/agendamento")}
          className="w-full py-8 text-2xl font-heading tracking-[0.2em]"
          size="lg"
        >
          AGENDAR AGORA
        </Button>

        <div className="grid grid-cols-2 gap-3">
          <Button onClick={() => navigate("/fila")} variant="outline" className="py-5 font-heading tracking-widest" size="lg">
            ENTRAR NA FILA
          </Button>
          <Button onClick={() => navigate("/cancelar")} variant="outline" className="py-5 font-heading tracking-widest" size="lg">
            CANCELAR
          </Button>
        </div>

        {/* Contact */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-center">
          <div className="bg-card rounded-xl p-4 border border-border flex items-center justify-center gap-3">
            <Phone className="h-5 w-5 text-primary" />
            <span className="font-body text-sm">(21) 99532-3454</span>
          </div>
          <div className="bg-card rounded-xl p-4 border border-border flex items-center justify-center gap-3">
            <MapPin className="h-5 w-5 text-primary" />
            <span className="font-body text-sm">Rio de Janeiro, RJ</span>
          </div>
        </div>
      </section>
    </div>
  );
}
