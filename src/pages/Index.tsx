import { useNavigate } from "react-router-dom";
import { Scissors, Clock, CalendarCheck, Tag, MapPin, Phone, Star, Quote, Users, ChevronRight } from "lucide-react";
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
        .order("ordem", { ascending: true });
      return data || [];
    },
  });

  const { data: portfolio = [] } = useQuery({
    queryKey: ["portfolio-landing"],
    queryFn: async () => {
      const { data } = await supabase
        .from("portfolio")
        .select("*")
        .order("criado_em", { ascending: false })
        .limit(6);
      return data || [];
    },
  });

  return (
    <div className="min-h-screen bg-background flex flex-col font-body">
      {/* Hero */}
      <div className="relative h-[85vh] min-h-[600px] overflow-hidden">
        <img
          src={heroImage}
          alt="Interior da Barbearia"
          className="absolute inset-0 w-full h-full object-cover scale-105 animate-slow-zoom"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/40 to-background" />
        
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-4">
          <div className="mb-6 animate-fade-in flex flex-col items-center">
            <div className="bg-primary/20 backdrop-blur-md border border-primary/30 px-4 py-1 rounded-full mb-4">
              <p className="text-primary text-[10px] tracking-[0.3em] font-bold uppercase flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                </span>
                Aberta Agora
              </p>
            </div>
            <Scissors className="h-16 w-16 text-primary mb-6 animate-bounce-slow" />
            <h1 className="text-7xl md:text-9xl tracking-[0.1em] font-heading text-white leading-tight">
              BARBEARIA <br/> <span className="text-primary"></span>
            </h1>
            <div className="h-1 w-32 bg-primary mt-4 rounded-full" />
            <p className="mt-8 text-gray-300 font-light text-xl max-w-xl leading-relaxed italic">
              "Onde a tradição encontra a excelência. Mais que um corte, uma experiência de estilo e bem-estar."
            </p>
          </div>
          
          <div className="mt-10 flex flex-col sm:flex-row gap-4 w-full max-w-md">
            <Button
              onClick={() => navigate("/agendamento")}
              className="flex-1 py-8 text-xl font-heading tracking-[0.2em] shadow-[0_0_30px_rgba(var(--primary),0.3)] hover:shadow-[0_0_50px_rgba(var(--primary),0.5)] transition-all group"
              size="lg"
            >
              AGENDAR AGORA
              <ChevronRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Button>
            
            <Button
              onClick={() => navigate("/produtos")}
              variant="outline"
              className="flex-1 py-8 text-xl font-heading tracking-[0.2em] border-primary/40 bg-black/40 text-white hover:bg-black/60 hover:border-primary transition-all backdrop-blur-md"
              size="lg"
            >
              PRODUTOS
            </Button>
          </div>
        </div>
        
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 animate-bounce">
          <div className="w-1 h-12 bg-gradient-to-b from-primary to-transparent rounded-full opacity-50" />
        </div>
      </div>

      <section className="container max-w-5xl py-24 space-y-32">
        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            { icon: Users, title: "EXPERTS", desc: "Profissionais qualificados com anos de tradição." },
            { icon: CalendarCheck, title: "PRATICIDADE", desc: "Agendamento online, Aberto de terça a sábado." },
            { icon: Tag, title: "QUALIDADE", desc: "Produtos premium e técnicas modernas." }
          ].map((f, i) => (
            <div key={i} className="bg-card border border-border/50 p-8 rounded-3xl hover:border-primary/40 transition-all hover:-translate-y-2 group text-center space-y-4">
              <div className="bg-primary/10 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto group-hover:bg-primary group-hover:text-white transition-colors">
                <f.icon className="h-8 w-8 text-primary group-hover:text-white" />
              </div>
              <h3 className="text-2xl font-heading tracking-widest">{f.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Portfolio Section */}
        {portfolio.length > 0 && (
          <div className="space-y-12">
            <div className="text-center space-y-3">
              <h2 className="text-5xl md:text-6xl tracking-widest uppercase font-heading">Nossa Arte</h2>
              <p className="text-muted-foreground font-body text-sm uppercase tracking-[0.3em]">Transformações que elevam a autoestima</p>
              <div className="h-1 w-24 bg-primary mx-auto" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {portfolio.map((item: any) => (
                <div key={item.id} className="aspect-square rounded-3xl overflow-hidden border border-border group relative cursor-pointer shadow-lg">
                  <img src={item.imagem_url} alt={item.legenda} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-6">
                    <p className="text-white font-heading text-lg uppercase tracking-wider">{item.legenda || "Estilo Cardoso"}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Services & Prices */}
        {servicos.length > 0 && (
          <div className="space-y-12 py-12 relative">
            <div className="absolute -left-20 top-0 opacity-5 pointer-events-none select-none">
              <Scissors className="h-64 w-64 rotate-45" />
            </div>
            <div className="text-center space-y-3">
              <h2 className="text-5xl md:text-6xl tracking-widest uppercase font-heading">Menu de Preços</h2>
              <p className="text-muted-foreground font-body text-sm uppercase tracking-[0.3em]">Serviços de excelência para o homem moderno</p>
              <div className="h-1 w-24 bg-primary mx-auto" />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-20 gap-y-6">
              {servicos.map((s: any) => (
                <div 
                  key={s.id} 
                  className="flex items-end justify-between py-4 group hover:text-primary transition-all cursor-default border-b border-border/30"
                >
                  <div className="flex-1 flex items-end overflow-hidden">
                    <span className="font-heading text-xl tracking-wide whitespace-nowrap group-hover:translate-x-1 transition-transform">{s.nome.toUpperCase()}</span>
                    <div className="mx-4 mb-2 flex-1 border-b border-dashed border-muted-foreground/20 group-hover:border-primary/40 transition-colors" />
                  </div>
                  <span className="font-heading text-primary text-3xl tabular-nums">
                    R$ {Number(s.preco).toFixed(0)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Testimonials */}
        <div className="space-y-12">
          <div className="text-center space-y-3">
            <h2 className="text-5xl md:text-6xl tracking-widest uppercase font-heading">Depoimentos</h2>
            <p className="text-muted-foreground font-body text-sm uppercase tracking-[0.3em]">O que nossos clientes dizem</p>
            <div className="h-1 w-24 bg-primary mx-auto" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { name: "Carlos Silva", text: "O melhor corte da Trindade. Ambiente sensacional e atendimento nota 10." },
              { name: "João Pedro", text: "Minha barba nunca ficou tão bem feita. O atendimento deles é diferenciado." },
              { name: "Rafael Costa", text: "Praticidade no agendamento e pontualidade. Sou cliente fiel há anos." }
            ].map((t, i) => (
              <div key={i} className="bg-card/50 backdrop-blur-sm border border-border p-8 rounded-3xl relative">
                <Quote className="h-10 w-10 text-primary/20 absolute top-4 left-4" />
                <div className="flex gap-1 mb-4">
                  {[1,2,3,4,5].map(s => <Star key={s} className="h-3 w-3 fill-primary text-primary" />)}
                </div>
                <p className="font-body text-muted-foreground leading-relaxed italic mb-6">"{t.text}"</p>
                <p className="font-heading tracking-widest text-lg">{t.name.toUpperCase()}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer Contact */}
        <div className="pt-20 border-t border-border flex flex-col md:flex-row justify-between items-center gap-12 text-center md:text-left">
          <div className="space-y-4">
            <h1 className="text-5xl tracking-widest font-heading">BARBEARIA <span className="text-primary"></span></h1>
            <p className="text-muted-foreground max-w-xs font-light">Elegância e tradição no coração da Trindade. Agende seu momento.</p>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-card rounded-2xl p-6 border border-border flex items-center gap-4 group hover:border-primary transition-colors">
              <div className="bg-primary/10 p-3 rounded-xl group-hover:bg-primary group-hover:text-white transition-colors">
                <Phone className="h-5 w-5 text-primary group-hover:text-white" />
              </div>
              <div className="text-left">
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Contato</p>
                <p className="font-heading text-lg">(21) 99532-3454</p>
              </div>
            </div>
            <div className="bg-card rounded-2xl p-6 border border-border flex items-center gap-4 group hover:border-primary transition-colors">
              <div className="bg-primary/10 p-3 rounded-xl group-hover:bg-primary group-hover:text-white transition-colors">
                <MapPin className="h-5 w-5 text-primary group-hover:text-white" />
              </div>
              <div className="text-left">
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Localização</p>
                <p className="font-heading text-lg">São Gonçalo, RJ</p>
              </div>
            </div>
          </div>
        </div>
      </section>
      
      <footer className="bg-card py-6 border-t border-border mt-12">
        <p className="text-center text-xs text-muted-foreground font-body uppercase tracking-[0.2em]">
          &copy; {new Date().getFullYear()} Barbearia  — Todos os direitos reservados.
        </p>
      </footer>
    </div>
  );
}
