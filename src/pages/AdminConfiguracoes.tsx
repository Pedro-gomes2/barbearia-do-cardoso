import { useEffect, useState } from "react";
import { Save, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { PixQR } from "@/components/PixQR";

export default function AdminConfiguracoes() {
  const { toast } = useToast();
  const [chave, setChave] = useState("");
  const [nome, setNome] = useState("");
  const [cidade, setCidade] = useState("");
  const [whats, setWhats] = useState("");
  const [id, setId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { data: cfg, refetch } = useQuery({
    queryKey: ["admin-cfg-app"],
    queryFn: async () => {
      const { data } = await supabase.from("configuracoes_app").select("*").limit(1).maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (cfg) {
      setId(cfg.id);
      setChave(cfg.pix_chave || "");
      setNome(cfg.pix_nome_titular || "");
      setCidade(cfg.pix_cidade || "");
      setWhats(cfg.whatsapp_admin || "");
    }
  }, [cfg]);

  const handleSave = async () => {
    setLoading(true);
    try {
      const payload = { pix_chave: chave, pix_nome_titular: nome, pix_cidade: cidade, whatsapp_admin: whats.replace(/\D/g, "") };
      if (id) {
        const { error } = await supabase.from("configuracoes_app").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("configuracoes_app").insert(payload);
        if (error) throw error;
      }
      toast({ title: "Configurações salvas!" });
      refetch();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container max-w-lg py-8 space-y-6 animate-fade-in">
      <div className="text-center space-y-1">
        <Settings className="h-8 w-8 text-primary mx-auto" />
        <h2 className="text-3xl font-heading tracking-wider">CONFIGURAÇÕES</h2>
        <p className="font-body text-sm text-muted-foreground">Pix e WhatsApp</p>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 space-y-4">
        <div className="space-y-2">
          <Label>Chave Pix</Label>
          <Input value={chave} onChange={(e) => setChave(e.target.value)} placeholder="CPF, e-mail, telefone ou aleatória" />
        </div>
        <div className="space-y-2">
          <Label>Nome do titular</Label>
          <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={25} />
        </div>
        <div className="space-y-2">
          <Label>Cidade</Label>
          <Input value={cidade} onChange={(e) => setCidade(e.target.value)} maxLength={15} />
        </div>
        <div className="space-y-2">
          <Label>WhatsApp do admin (com DDI, ex: 5521995323454)</Label>
          <Input value={whats} onChange={(e) => setWhats(e.target.value)} maxLength={15} />
        </div>
        <Button onClick={handleSave} disabled={loading} className="w-full py-5 font-heading tracking-widest" size="lg">
          <Save className="mr-2 h-4 w-4" /> {loading ? "SALVANDO..." : "SALVAR"}
        </Button>
      </div>

      {chave && nome && cidade && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <p className="font-heading text-sm text-muted-foreground tracking-wider text-center">PRÉ-VISUALIZAÇÃO QR</p>
          <PixQR chave={chave} nome={nome} cidade={cidade} valor={50} />
          <p className="text-xs text-muted-foreground text-center font-body">Exemplo com R$ 50,00</p>
        </div>
      )}
    </div>
  );
}
