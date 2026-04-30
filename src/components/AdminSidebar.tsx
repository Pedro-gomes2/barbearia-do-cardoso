import { BarChart3, CalendarDays, Ban, Settings, LogOut, Scissors } from "lucide-react";
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

const items = [
  { title: "Dashboard", url: "/admin/dashboard", icon: BarChart3 },
  { title: "Agenda", url: "/admin/agenda", icon: CalendarDays },
  { title: "Bloqueios", url: "/admin/bloqueios", icon: Ban },
  { title: "Serviços", url: "/admin/servicos", icon: Settings },
];

export function AdminSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const isActive = (path: string) => pathname === path;
  

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
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
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
