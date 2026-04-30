import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Scissors, ArrowLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const DAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

interface DayConfig {
  id?: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fim: string;
  ativo: boolean;
}

export default function AdminAgenda() {
  const [configs, setConfigs] = useState<DayConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    supabase.from("configuracoes_agenda").select("*").order("dia_semana").then(({ data }) => {
      if (data) setConfigs(data);
    });
  }, []);

  const updateConfig = (idx: number, field: keyof DayConfig, value: any) => {
    setConfigs((prev) => prev.map((c, i) => (i === idx ? { ...c, [field]: value } : c)));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      for (const c of configs) {
        if (c.id) {
          await supabase
            .from("configuracoes_agenda")
            .update({ hora_inicio: c.hora_inicio, hora_fim: c.hora_fim, ativo: c.ativo })
            .eq("id", c.id);
        }
      }
      toast({ title: "Configurações salvas!" });
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container flex items-center gap-4 py-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/admin/dashboard"><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <Scissors className="h-6 w-6 text-primary" />
          <h1 className="text-2xl tracking-wider">CONFIGURAR AGENDA</h1>
        </div>
      </header>

      <main className="container max-w-lg py-8 space-y-6 animate-fade-in">
        {configs.map((config, idx) => (
          <div key={config.dia_semana} className="bg-card rounded-xl p-4 border border-border space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-heading text-xl">{DAYS[config.dia_semana]}</span>
              <Switch checked={config.ativo} onCheckedChange={(v) => updateConfig(idx, "ativo", v)} />
            </div>
            {config.ativo && (
              <div className="flex gap-4">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-muted-foreground">Início</Label>
                  <Input
                    type="time"
                    value={config.hora_inicio?.slice(0, 5)}
                    onChange={(e) => updateConfig(idx, "hora_inicio", e.target.value + ":00")}
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs text-muted-foreground">Fim</Label>
                  <Input
                    type="time"
                    value={config.hora_fim?.slice(0, 5)}
                    onChange={(e) => updateConfig(idx, "hora_fim", e.target.value + ":00")}
                  />
                </div>
              </div>
            )}
          </div>
        ))}

        <Button onClick={handleSave} disabled={loading} className="w-full py-6 font-heading tracking-widest text-lg" size="lg">
          <Save className="mr-2 h-5 w-5" />
          {loading ? "SALVANDO..." : "SALVAR CONFIGURAÇÕES"}
        </Button>
      </main>
    </div>
  );
}
