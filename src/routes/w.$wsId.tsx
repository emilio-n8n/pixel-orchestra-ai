import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

function Gate() {
  const nav = useNavigate();
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const next =
      typeof window !== "undefined"
        ? window.location.pathname + window.location.search
        : "/";
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) nav({ to: "/auth", search: { next } });
      else setOk(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!s) nav({ to: "/auth", search: { next } });
      else setOk(true);
    });
    return () => sub.subscription.unsubscribe();
  }, [nav]);
  return ok ? <Outlet /> : null;
}

export const Route = createFileRoute("/w/$wsId")({
  ssr: false,
  component: Gate,
});