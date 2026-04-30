import { useEffect, useState, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export function RequireAuth({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (!session) {
        setAuthed(false);
        navigate("/admin");
      } else {
        setAuthed(true);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        setAuthed(false);
        navigate("/admin");
      } else {
        setAuthed(true);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  if (authed === null) return <div className="min-h-screen bg-background" />;
  if (!authed) return null;
  return <>{children}</>;
}
