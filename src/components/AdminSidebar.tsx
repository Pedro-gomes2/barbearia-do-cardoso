import { BarChart3, CalendarDays, Ban, Settings, LogOut, Scissors, Wrench, Clock, ShoppingBag, Wallet, Moon, Sun, Users } from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { usePendentesCount } from "@/lib/confirmacao-helpers";

const items = [
  { title: "Dashboard", url: "/admin/dashboard", icon: BarChart3 },
  { title: "Agenda", url: "/admin/agenda", icon: CalendarDays },
  { title: "Bloqueios", url: "/admin/bloqueios", icon: Ban },
  { title: "Serviços", url: "/admin/servicos", icon: Wrench },
  { title: "Horários", url: "/admin/horarios", icon: Clock },
  { title: "Produtos", url: "/admin/produtos", icon: ShoppingBag },
  { title: "Financeiro", url: "/admin/financeiro", icon: Wallet },
  { title: "Despesas", url: "/admin/despesas", icon: Wallet },
  { title: "Portfólio", url: "/admin/portfolio", icon: Scissors },
  { title: "Clientes", url: "/admin/clientes", icon: Users },
  { title: "Configurações", url: "/admin/configuracoes", icon: Settings },
  { title: "Ver Site", url: "/", icon: Scissors },
];

export function AdminSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { count: pendentesCount } = usePendentesCount();

  const isActive = (path: string) => pathname === path;

  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== "undefined") {
      return document.documentElement.classList.contains("dark");
    }
    return false;
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDark]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/admin");
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <Scissors className="h-6 w-6 text-primary shrink-0" />
          {!collapsed && <span className="font-heading text-lg tracking-wider">ADMIN</span>}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navegação</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink to={item.url} className="flex items-center gap-2 hover:bg-muted/50">
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                      {item.title === "Agenda" && pendentesCount > 0 && (
                        <span className="ml-auto inline-flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xs font-bold px-1.5 py-0.5 min-w-[1.25rem]">
                          {pendentesCount}
                        </span>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 space-y-2">
        <Button
          variant="ghost"
          size={collapsed ? "icon" : "default"}
          onClick={() => setIsDark(!isDark)}
          className="w-full justify-start text-muted-foreground"
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {!collapsed && <span className="ml-2">{isDark ? "Modo Claro" : "Modo Escuro"}</span>}
        </Button>
        <Button
          variant="ghost"
          size={collapsed ? "icon" : "default"}
          onClick={handleLogout}
          className="w-full justify-start text-muted-foreground hover:text-destructive"
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span className="ml-2">Sair</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
