import { useState } from "react";
import { Plus, Trash2, Scissors, Upload, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function AdminPortfolio() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [legenda, setLegenda] = useState("");

  const { data: fotos = [], isLoading } = useQuery({
    queryKey: ["admin-portfolio"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portfolio")
        .select("*")
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const uploadFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true);
      if (!e.target.files || e.target.files.length === 0) return;
      const file = e.target.files[0];
      const fileExt = file.name.split(".").pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("portfolio")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("portfolio")
        .getPublicUrl(filePath);

      const { error: dbError } = await supabase.from("portfolio").insert({
        imagem_url: publicUrl,
        legenda: legenda.trim() || null,
      });

      if (dbError) throw dbError;

      toast({ title: "Foto enviada com sucesso!" });
      setLegenda("");
      queryClient.invalidateQueries({ queryKey: ["admin-portfolio"] });
    } catch (error: any) {
      toast({ title: "Erro no upload", description: error.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (foto: any) => {
      // Extrair o nome do arquivo da URL
      const path = foto.imagem_url.split("/").pop();
      await supabase.storage.from("portfolio").remove([path]);
      const { error } = await supabase.from("portfolio").delete().eq("id", foto.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-portfolio"] });
      toast({ title: "Foto removida!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="container max-w-5xl py-8 space-y-6 animate-fade-in">
      <div className="text-center space-y-2">
        <Scissors className="h-10 w-10 text-primary mx-auto" />
        <h2 className="text-3xl font-heading tracking-wider">PORTFÓLIO DE TRABALHOS</h2>
        <p className="text-muted-foreground font-body text-sm">Suba fotos dos seus melhores cortes para os clientes verem</p>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <div className="space-y-2">
          <Label>Legenda da Foto (Opcional)</Label>
          <Input 
            value={legenda} 
            onChange={(e) => setLegenda(e.target.value)} 
            placeholder="Ex: Corte Degradê com Barba..." 
          />
        </div>
        <div className="flex items-center justify-center w-full">
          <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-xl cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <Upload className="w-8 h-8 mb-2 text-primary" />
              <p className="mb-1 text-sm text-muted-foreground font-body">
                {uploading ? "Enviando..." : "Clique para subir uma foto"}
              </p>
              <p className="text-xs text-muted-foreground">PNG, JPG ou WEBP</p>
            </div>
            <input type="file" className="hidden" accept="image/*" onChange={uploadFoto} disabled={uploading} />
          </label>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="font-heading text-sm tracking-widest text-muted-foreground border-b border-border pb-2">SUAS FOTOS</h3>
        {isLoading ? (
          <p className="text-center py-10 text-muted-foreground animate-pulse">Carregando fotos...</p>
        ) : fotos.length === 0 ? (
          <div className="text-center py-20 bg-muted/20 rounded-2xl border border-dashed border-border">
            <ImageIcon className="h-12 w-12 text-muted-foreground mx-auto mb-2 opacity-20" />
            <p className="text-muted-foreground font-body">Nenhuma foto no portfólio ainda.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {fotos.map((f) => (
              <div key={f.id} className="relative group aspect-square rounded-xl overflow-hidden border border-border bg-muted">
                <img src={f.imagem_url} alt={f.legenda} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-2 text-center">
                  <p className="text-[10px] text-white font-body mb-2">{f.legenda || "Sem legenda"}</p>
                  <Button 
                    variant="destructive" 
                    size="icon" 
                    className="h-8 w-8" 
                    onClick={() => deleteMutation.mutate(f)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
