import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import App, { resetBoot } from "./App";
import Panel from "./panel/Panel";
import { signOut, supabase } from "./auth";

// Decide qué se ve: la pantalla de acceso o el panel interno.
export default function Root() {
  const [session, setSession] = useState<Session | null>(null);
  const [loginKey, setLoginKey] = useState(0);
  const inPanel = useRef(false);
  inPanel.current = session !== null;

  function backToLogin() {
    resetBoot();
    setSession(null);
    setLoginKey((k) => k + 1);
    window.history.replaceState(null, "", "/");
  }

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (!inPanel.current) return; // la pantalla de acceso gestiona sus propios eventos
      if (event === "SIGNED_OUT") backToLogin();
      else if (s && (event === "TOKEN_REFRESHED" || event === "USER_UPDATED")) setSession(s);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  function enter(s: Session) {
    if (!window.location.pathname.startsWith("/panel")) window.history.replaceState(null, "", "/panel");
    setSession(s);
  }

  async function leave() {
    inPanel.current = false;
    await signOut();
    backToLogin();
  }

  if (session) return <Panel session={session} onSignOut={leave} />;
  return <App key={loginKey} onEnter={enter} />;
}
