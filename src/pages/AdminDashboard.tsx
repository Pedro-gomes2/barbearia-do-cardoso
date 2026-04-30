import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Scissors, LogOut, CalendarDays, Settings, Ban, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function AdminDashboard() {
  const [date, setDate] = useState<Date>(new Date());
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const dateStr = format(date, "yyyy-MM-dd");

  const { data: appointments = [] } = useQuery({
    queryKey: ["admin-appointments", dateStr],
    queryFn: async () => {
      const { data } = await supabase
        .from("agendamentos")
        .select("*, usuarios(nome, telefone)")
        .eq("data", dateStr)
        .order("horario");
      return data || [];
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("agendamentos")
        .update({ status: "cancelado" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-appointments"] });
      toast({ title: "Agendamento cancelado" });
    },
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/admin");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container flex items-center justify-between py-4">
          <div className="flex items-center gap-2">
            <Scissors className="h-6 w-6 text-primary" />
            <h1 className="text-2xl tracking-wider">PAINEL ADMIN</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/admin/agenda"><Settings className="h-4 w-4 mr-1" /> Agenda</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/admin/bloqueios"><Ban className="h-4 w-4 mr-1" /> Bloqueios</Link>
            </Button>
            <Button variant="ghost" size="icon" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container max-w-2xl py-8 space-y-8 animate-fade-in">
        <div className="bg-card rounded-xl p-4 border border-border">
          <Calendar
            mode="single"
            selected={date}
            onSelect={(d) => d && setDate(d)}
            locale={ptBR}
            className="pointer-events-auto mx-auto"
          />
        </div>

        <div>
          <div className="flex items-center gap-2 mb-4">
            <CalendarDays className="h-5 w-5 text-primary" />
            <h2 className="text-2xl">{format(date, "dd 'DE' MMMM", { locale: ptBR }).toUpperCase()}</h2>
          </div>

          {appointments.length === 0 ? (
            <p className="text-muted-foreground text-center py-8 font-body">Nenhum agendamento para esta data.</p>
          ) : (
            <div className="space-y-3">
              {appointments.map((apt: any) => (
                <div
                  key={apt.id}
                  className={`bg-card rounded-xl p-4 border border-border flex items-center justify-between ${
                    apt.status === "cancelado" ? "opacity-50" : ""
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-primary font-heading text-xl">{apt.horario?.slice(0, 5)}</span>
                      {apt.status === "cancelado" && (
                        <span className="text-xs bg-destructive/20 text-destructive px-2 py-0.5 rounded font-body">
                          Cancelado
                        </span>
                      )}
                    </div>
                    <p className="font-body text-sm">{apt.usuarios?.nome}</p>
                    <p className="font-body text-xs text-muted-foreground">{apt.usuarios?.telefone}</p>
                  </div>
                  {apt.status === "ativo" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => cancelMutation.mutate(apt.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <X className="h-5 w-5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
