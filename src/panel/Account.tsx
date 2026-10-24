import { useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import type { Lang } from "../i18n";
import { changePassword, type ServerError } from "../auth";
import { date, tr, type Tr } from "./format";

const C = {
  eyebrow: ["Tu cuenta", "Your account"] as Tr,
  title: ["Mi cuenta", "My account"] as Tr,
  intro: ["Tus datos de acceso y tu contraseña.", "Your sign-in details and your password."] as Tr,
  email: ["Correo", "Email"] as Tr,
  role: ["Rol", "Role"] as Tr,
  admin: ["Administrador", "Administrator"] as Tr,
  member: ["Equipo", "Team"] as Tr,
  since: ["Cuenta creada", "Account created"] as Tr,
  pwTitle: ["Cambiar contraseña", "Change password"] as Tr,
  pwSub: ["Elige una contraseña nueva de al menos 8 caracteres.", "Choose a new password of at least 8 characters."] as Tr,
  newPw: ["Contraseña nueva", "New password"] as Tr,
  repeatPw: ["Repite la contraseña", "Repeat password"] as Tr,
  show: ["Ver", "Show"] as Tr,
  hide: ["Ocultar", "Hide"] as Tr,
  save: ["Actualizar contraseña", "Update password"] as Tr,
  saving: ["Guardando…", "Saving…"] as Tr,
  okMsg: ["Contraseña actualizada. La próxima vez entrarás con la nueva.", "Password updated. Next time use the new one."] as Tr,
  errShort: ["La contraseña tiene al menos 8 caracteres.", "Passwords are at least 8 characters."] as Tr,
  errMismatch: ["Las dos contraseñas no coinciden.", "The two passwords do not match."] as Tr,
  errEmpty: ["Escribe la contraseña nueva dos veces.", "Type the new password twice."] as Tr,
};

const SERVER_ERR: Record<ServerError, Tr> = {
  credentials: ["Algo ha fallado. Inténtalo de nuevo.", "Something went wrong. Try again."],
  banned: ["Tu cuenta está desactivada.", "Your account is deactivated."],
  rate: ["Demasiados intentos. Espera unos minutos.", "Too many attempts. Wait a few minutes."],
  network: ["No se pudo conectar. Inténtalo de nuevo.", "Could not connect. Try again."],
  weak: ["Esa contraseña es demasiado débil. Prueba con una más larga.", "That password is too weak. Try a longer one."],
  same: ["La contraseña nueva tiene que ser distinta de la anterior.", "The new password must be different from the old one."],
  mismatch: ["Las dos contraseñas no coinciden.", "The two passwords do not match."],
  link: ["Algo ha fallado. Inténtalo de nuevo.", "Something went wrong. Try again."],
  sso: ["Algo ha fallado. Inténtalo de nuevo.", "Something went wrong. Try again."],
  unknown: ["Algo ha fallado. Inténtalo de nuevo.", "Something went wrong. Try again."],
};

type Local = "short" | "mismatch" | "empty";

export default function Account({ lang, session }: { lang: Lang; session: Session }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Local | ServerError | null>(null);
  const [okShown, setOkShown] = useState(false);

  const email = session.user.email ?? "";
  const isAdmin = (session.user.app_metadata as { role?: string } | undefined)?.role === "admin";
  const created = session.user.created_at;

  const errText =
    error === "short" ? tr(C.errShort, lang)
    : error === "mismatch" ? tr(C.errMismatch, lang)
    : error === "empty" ? tr(C.errEmpty, lang)
    : error ? tr(SERVER_ERR[error], lang)
    : "";

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setOkShown(false);
    if (!pw || !pw2) return setError("empty");
    if (pw.length < 8) return setError("short");
    if (pw !== pw2) return setError("mismatch");
    setError(null);
    setBusy(true);
    const res = await changePassword(pw);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setPw("");
    setPw2("");
    setShow(false);
    setOkShown(true);
  }

  return (
    <section className="page-sec page-sec--narrow">
      <header className="sec-head">
        <div className="sec-head__text">
          <span className="sec-eyebrow"><span className="sec-eyebrow__code">··</span>{tr(C.eyebrow, lang)}</span>
          <h1 className="sec-title">{tr(C.title, lang)}</h1>
          <p className="sec-intro">{tr(C.intro, lang)}</p>
        </div>
      </header>

      <div className="card">
        <dl className="meta meta--col">
          <div><dt>{tr(C.email, lang)}</dt><dd className="is-mono">{email}</dd></div>
          <div><dt>{tr(C.role, lang)}</dt><dd><span className={"pill pill--" + (isAdmin ? "accent" : "muted")}>{tr(isAdmin ? C.admin : C.member, lang)}</span></dd></div>
          <div><dt>{tr(C.since, lang)}</dt><dd>{date(created, lang)}</dd></div>
        </dl>
      </div>

      <form className="card" onSubmit={submit} noValidate>
        <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />
        <div className="card__head">
          <h2 className="board__title">{tr(C.pwTitle, lang)}</h2>
          <p className="fhint">{tr(C.pwSub, lang)}</p>
        </div>
        <div className="fgrid">
          <div className="fcell">
            <label className="field__label" htmlFor="acc-pw">{tr(C.newPw, lang)}</label>
            <div className="pw">
              <input id="acc-pw" type={show ? "text" : "password"} autoComplete="new-password" value={pw}
                onChange={(e) => { setPw(e.target.value); setError(null); }} placeholder="••••••••••"
                className={"input input--sm" + (error === "short" || error === "empty" || error === "weak" || error === "same" ? " input--error" : "")} />
              <button type="button" className="pw__toggle" onClick={() => setShow((v) => !v)} aria-pressed={show}>{tr(show ? C.hide : C.show, lang)}</button>
            </div>
          </div>
          <div className="fcell">
            <label className="field__label" htmlFor="acc-pw2">{tr(C.repeatPw, lang)}</label>
            <input id="acc-pw2" type={show ? "text" : "password"} autoComplete="new-password" value={pw2}
              onChange={(e) => { setPw2(e.target.value); setError(null); }} placeholder="••••••••••"
              className={"input input--sm" + (error === "mismatch" || error === "empty" ? " input--error" : "")} />
          </div>
        </div>

        {okShown && (
          <div className="note note--ok" role="status">
            <span className="note__tag">OK</span>
            <span className="note__text">{tr(C.okMsg, lang)}</span>
          </div>
        )}
        {error && (
          <div className="note note--error" role="alert">
            <span className="note__tag">ERR</span>
            <span className="note__text">{errText}</span>
          </div>
        )}

        <div className="card__foot">
          <button type="submit" className={"btn btn--primary btn--sm" + (busy ? " btn--busy" : "")} aria-busy={busy}>
            {busy && <span className="spinner" aria-hidden="true" />}
            {tr(busy ? C.saving : C.save, lang)}
          </button>
        </div>
      </form>
    </section>
  );
}
