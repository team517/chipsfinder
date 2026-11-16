// Pulso Studio (edición y programación de vídeos) dentro del panel. Solo administradores.
// Se sirve en /studio/ desde el mismo dominio (nginx lo pasa al servicio de Pulso Studio en EasyPanel)
// y usa la sesión del panel para entrar.
import { useEffect, useRef, useState } from "react";
import type { Lang } from "../i18n";

export default function StudioFrame({ lang }: { lang: Lang }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [state, setState] = useState<"loading" | "ok" | "down">("loading");

  useEffect(() => {
    // ¿Está el servicio encendido? (si no, se explica en vez de enseñar un error de nginx)
    let alive = true;
    fetch("/studio/", { method: "HEAD", cache: "no-store" })
      .then((r) => alive && setState(r.ok ? "ok" : "down"))
      .catch(() => alive && setState("down"));
    return () => { alive = false; };
  }, []);

  const es = lang === "es";
  if (state === "down") {
    return (
      <div className="studio-down">
        <h2>Pulso Studio</h2>
        <p>{es ? "El servicio de Pulso Studio no responde ahora mismo. Comprueba en EasyPanel que el servicio «pulso-studio» está en marcha." : "Pulso Studio is not responding. Check in EasyPanel that the “pulso-studio” service is running."}</p>
      </div>
    );
  }
  return (
    <iframe
      ref={ref}
      className="studio-frame"
      src="/studio/"
      title="Pulso Studio"
      allow="clipboard-write; fullscreen; autoplay"
      style={{ opacity: state === "ok" ? 1 : 0 }}
    />
  );
}
