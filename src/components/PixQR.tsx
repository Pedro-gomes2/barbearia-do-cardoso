import { QRCodeSVG } from "qrcode.react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { gerarPixPayload, type PixParams } from "@/lib/pix";

interface PixQRProps extends PixParams {
  size?: number;
}

export function PixQR(props: PixQRProps) {
  const { toast } = useToast();
  const payload = gerarPixPayload(props);

  if (!payload) {
    return (
      <div className="text-center text-muted-foreground font-body text-sm py-4">
        Pagamento via Pix indisponível no momento.
      </div>
    );
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(payload);
      toast({ title: "Código Pix copiado!", description: "Cole no app do seu banco." });
    } catch {
      toast({ title: "Erro ao copiar", variant: "destructive" });
    }
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="bg-white p-3 rounded-lg">
        <QRCodeSVG value={payload} size={props.size ?? 180} level="M" />
      </div>
      {props.valor ? (
        <p className="font-heading text-xl text-primary">
          R$ {props.valor.toFixed(2).replace(".", ",")}
        </p>
      ) : null}
      <Button variant="outline" size="sm" onClick={handleCopy} className="font-heading tracking-wider">
        <Copy className="mr-2 h-4 w-4" /> COPIAR CÓDIGO PIX
      </Button>
    </div>
  );
}
