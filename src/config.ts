// Ajustes del diseño (los "props" de Claude Design: foto y lado de la foto).
// Se pueden cambiar aquí o probar en vivo con ?foto=chip&lado=derecha

export type Foto = "laboratorio" | "chip" | "placa";
export type Lado = "izquierda" | "derecha";

export const PHOTOS: Record<Foto, string> = {
  laboratorio: "/img/lab.jpg",
  chip: "/img/chip.png",
  placa: "/img/placa.jpg",
};

const DEFAULTS = { foto: "laboratorio" as Foto, lado: "izquierda" as Lado };

export function readLayout(): { foto: Foto; lado: Lado } {
  let foto = DEFAULTS.foto;
  let lado = DEFAULTS.lado;
  try {
    const q = new URLSearchParams(window.location.search);
    const f = q.get("foto");
    const l = q.get("lado");
    if (f === "laboratorio" || f === "chip" || f === "placa") foto = f;
    if (l === "izquierda" || l === "derecha") lado = l;
  } catch {
    /* sin parámetros */
  }
  return { foto, lado };
}

export const SUPPORT_EMAIL = "team@chipsfinder.es";
export const ALLOWED_DOMAIN = "chipsfinder.es";
