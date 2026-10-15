import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  listAssinaturasPendentes,
  listAssinaturasAtivas,
  aprovarPlano,
  rejeitarPlano,
  listPlanosAdmin,
  upsertPlano,
  setPlanoServicos,
  type PlanoAdmin,
} from "@/lib/planos-helpers";

export default function AdminPlanos() {
  const queryClient = useQueryClient();

  const { data: pendentes = [] } = useQuery({ queryKey: ["planos-pendentes"], queryFn: listAssinaturasPendentes });
  const { data: ativos = [] } = useQuery({ queryKey: ["planos-ativos"], queryFn: listAssinaturasAtivas });
  const { data: planos = [] } = useQuery({ queryKey: ["planos-admin"], queryFn: listPlanosAdmin });
  const { data: servicosAtivos = [] } = useQuery({
    queryKey: ["servicos-ativos-planos"],
    queryFn: async () => {
      const { data } = await supabase.from("servicos").select("id, nome").eq("ativo", true).order("nome");
      return data || [];
    },
  });

  const aprovarMutation = useMutation({
    mutationFn: aprovarPlano,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planos-pendentes"] });
      queryClient.invalidateQueries({ queryKey: ["planos-ativos"] });
      toast({ title: "Plano aprovado", description: "O cliente já pode usar os créditos." });
    },
    onError: (err: any) => toast({ title: "Erro ao aprovar", description: err.message, variant: "destructive" }),
  });

  const rejeitarMutation = useMutation({
    mutationFn: rejeitarPlano,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planos-pendentes"] });
      toast({ title: "Plano rejeitado" });
    },
    onError: (err: any) => toast({ title: "Erro ao rejeitar", description: err.message, variant: "destructive" }),
  });

  const [editando, setEditando] = useState<PlanoAdmin | null>(null);
  const [formNome, setFormNome] = useState("");
  const [formPreco, setFormPreco] = useState("0");
  const [formAtivo, setFormAtivo] = useState(true);
  const [formServicoIds, setFormServicoIds] = useState<string[]>([]);

  const salvarPlanoMutation = useMutation({
    mutationFn: async () => {
      const id = await upsertPlano({
        id: editando?.id,
        nome: formNome,
        preco: Number(formPreco.replace(",", ".")),
        ativo: formAtivo,
      });
      await setPlanoServicos(id, formServicoIds);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["planos-admin"] });
      queryClient.invalidateQueries({ queryKey: ["planos-publicos"] });
      setEditando(null);
      setFormNome("");
      setFormPreco("0");
      setFormAtivo(true);
      setFormServicoIds([]);
      toast({ title: "Plano salvo" });
    },
    onError: (err: any) => toast({ title: "Erro ao salvar plano", description: err.message, variant: "destructive" }),
  });

  const handleSalvarPlano = () => {
    const preco = Number(formPreco.replace(",", "."));
    if (!Number.isFinite(preco) || preco <= 0) {
      toast({ title: "Preço inválido", description: "Informe um valor maior que zero.", variant: "destructive" });
      return;
    }
    salvarPlanoMutation.mutate();
  };

  const handleEditar = (plano: PlanoAdmin) => {
    setEditando(plano);
    setFormNome(plano.nome);
    setFormPreco(String(plano.preco));
    setFormAtivo(plano.ativo);
    setFormServicoIds(plano.servico_ids);
  };

  return (
    <div className="container max-w-5xl py-8 space-y-6 animate-fade-in">
      <div>
        <h2 className="text-3xl font-heading tracking-wider">PLANOS</h2>
        <p className="text-muted-foreground font-body text-sm">Solicitações, assinaturas ativas e configuração dos planos</p>
      </div>

      <Tabs defaultValue="pendentes">
        <TabsList>
          <TabsTrigger value="pendentes">Pendentes ({pendentes.length})</TabsTrigger>
          <TabsTrigger value="ativos">Ativos ({ativos.length})</TabsTrigger>
          <TabsTrigger value="config">Configuração</TabsTrigger>
        </TabsList>

        <TabsContent value="pendentes" className="space-y-3 pt-4">
          {pendentes.length === 0 && <p className="text-muted-foreground text-sm">Nenhuma solicitação pendente.</p>}
          {pendentes.map((a) => (
            <div key={a.id} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="font-heading">{a.clienteNome} — {a.planoNome}</p>
                <p className="text-xs text-muted-foreground">{a.clienteTelefone} · {new Date(a.criadoEm).toLocaleString("pt-BR")}</p>
              </div>
              <div className="flex gap-2">
                <Button size="icon" variant="outline" onClick={() => aprovarMutation.mutate(a.id)} disabled={aprovarMutation.isPending}>
                  <Check className="h-4 w-4 text-green-600" />
                </Button>
                <Button size="icon" variant="outline" onClick={() => rejeitarMutation.mutate(a.id)} disabled={rejeitarMutation.isPending}>
                  <X className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="ativos" className="space-y-3 pt-4">
          {ativos.length === 0 && <p className="text-muted-foreground text-sm">Nenhum plano ativo.</p>}
          {ativos.map((a) => (
            <div key={a.id} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="font-heading">{a.clienteNome} — {a.planoNome}</p>
                <p className="text-xs text-muted-foreground">{a.clienteTelefone}</p>
              </div>
              <div className="text-right text-sm">
                <p>{a.creditosRestantes}/4 créditos</p>
                <p className="text-xs text-muted-foreground">
                  {a.expiraEm && new Date(a.expiraEm) < new Date() ? "Expirado" : `Válido até ${new Date(a.expiraEm!).toLocaleDateString("pt-BR")}`}
                </p>
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="config" className="space-y-6 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {planos.map((p) => (
              <button
                key={p.id}
                onClick={() => handleEditar(p)}
                className="bg-card border border-border rounded-xl p-4 text-left hover:border-primary/50"
              >
                <p className="font-heading">{p.nome} {!p.ativo && "(inativo)"}</p>
                <p className="text-primary">R$ {p.preco.toFixed(2).replace(".", ",")}</p>
              </button>
            ))}
            <button
              onClick={() => { setEditando(null); setFormNome(""); setFormPreco("0"); setFormAtivo(true); setFormServicoIds([]); }}
              className="border border-dashed border-border rounded-xl p-4 text-muted-foreground hover:border-primary/50"
            >
              + Novo plano
            </button>
          </div>

          <div className="bg-card border border-border rounded-xl p-4 space-y-4 max-w-md">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={formNome} onChange={(e) => setFormNome(e.target.value)} placeholder="Corte e Barba" />
            </div>
            <div className="space-y-2">
              <Label>Preço (R$)</Label>
              <Input value={formPreco} onChange={(e) => setFormPreco(e.target.value)} placeholder="174,99" />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={formAtivo} onCheckedChange={setFormAtivo} />
              <Label>Ativo</Label>
            </div>
            <div className="space-y-2">
              <Label>Serviços liberados pelo plano</Label>
              <div className="max-h-32 overflow-auto space-y-1 border rounded-md p-2 bg-muted/20">
                {servicosAtivos.map((sv: any) => (
                  <label key={sv.id} className="flex items-center gap-2 p-1 cursor-pointer hover:bg-muted rounded-sm">
                    <input
                      type="checkbox"
                      checked={formServicoIds.includes(sv.id)}
                      onChange={(e) =>
                        setFormServicoIds((prev) =>
                          e.target.checked ? [...prev, sv.id] : prev.filter((id) => id !== sv.id)
                        )
                      }
                      className="accent-primary"
                    />
                    <span className="text-sm font-body">{sv.nome}</span>
                  </label>
                ))}
              </div>
            </div>
            <Button onClick={handleSalvarPlano} disabled={!formNome || salvarPlanoMutation.isPending}>
              Salvar plano
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
