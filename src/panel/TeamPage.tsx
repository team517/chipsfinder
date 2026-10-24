import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Lang } from "../i18n";
import { isTeamEmail } from "../auth";
import {
  createAccess,
  deleteAccess,
  listUsers,
  setActive,
  setRole,
  type Role,
  type TeamErr,
  type TeamUser,
} from "./team";
import { date, tr, type Tr } from "./format";

const C = {
  eyebrow: ["Gestión de accesos", "Access management"] as Tr,
  title: ["Equipo", "Team"] as Tr,
  intro: [
    "Quién puede entrar al panel. Da de alta accesos, cambia el rol o desactiva una cuenta.",
    "Who can enter the dashboard. Create accesses, change roles or deactivate accounts.",
  ] as Tr,
  newAccess: ["Nuevo acceso", "New access"] as Tr,
  search: ["Buscar…", "Search…"] as Tr,
  count: (n: number): Tr => [n === 1 ? "1 cuenta" : n + " cuentas", n === 1 ? "1 account" : n + " accounts"],
  loading: ["Cargando…", "Loading…"] as Tr,
  loadErr: ["No se pudieron cargar las cuentas.", "Could not load the accounts."] as Tr,
  retry: ["Reintentar", "Retry"] as Tr,
  colEmail: ["Correo", "Email"] as Tr,
  colRole: ["Rol", "Role"] as Tr,
  colState: ["Estado", "State"] as Tr,
  colLast: ["Último acceso", "Last sign-in"] as Tr,
  admin: ["Administrador", "Administrator"] as Tr,
  member: ["Equipo", "Team"] as Tr,
  active: ["Activa", "Active"] as Tr,
  inactive: ["Desactivada", "Deactivated"] as Tr,
  fresh: ["Sin estrenar", "Never signed in"] as Tr,
  you: ["Tú", "You"] as Tr,
  never: ["—", "—"] as Tr,
  // Alta
  createTitle: ["Nuevo acceso", "New access"] as Tr,
  createSub: [
    "Crea una cuenta para alguien del equipo. El correo tiene que ser @chipsfinder.es.",
    "Create an account for a team member. The email must be @chipsfinder.es.",
  ] as Tr,
  email: ["Correo corporativo", "Corporate email"] as Tr,
  role: ["Rol", "Role"] as Tr,
  roleMember: ["Equipo — ver y editar", "Team — view and edit"] as Tr,
  roleAdmin: ["Administrador — también borra y gestiona accesos", "Administrator — also deletes and manages access"] as Tr,
  how: ["Cómo le damos la contraseña", "How they get the password"] as Tr,
  howTemp: ["Contraseña temporal (se la pasas tú)", "Temporary password (you share it)"] as Tr,
  howInvite: ["Enviar invitación por correo", "Send an email invitation"] as Tr,
  howTempHint: [
    "Se crea la cuenta al momento y te damos una contraseña temporal para pasársela.",
    "The account is created now and you get a temporary password to share.",
  ] as Tr,
  howInviteHint: [
    "Recibe un correo para poner su propia contraseña. Necesita el correo del servidor configurado.",
    "They get an email to set their own password. Requires the mail server to be configured.",
  ] as Tr,
  create: ["Crear acceso", "Create access"] as Tr,
  creating: ["Creando…", "Creating…"] as Tr,
  cancel: ["Cancelar", "Cancel"] as Tr,
  close: ["Cerrar", "Close"] as Tr,
  done: ["Listo", "Done"] as Tr,
  createdTemp: ["Cuenta creada", "Account created"] as Tr,
  createdInvite: ["Invitación enviada", "Invitation sent"] as Tr,
  tempFor: (e: string): Tr => ["Contraseña temporal de " + e + ":", "Temporary password for " + e + ":"],
  copy: ["Copiar", "Copy"] as Tr,
  copied: ["Copiado", "Copied"] as Tr,
  tempNote: [
    "Pásasela por un canal seguro. Podrá cambiarla desde «Mi cuenta» o con «¿La olvidaste?».",
    "Share it over a secure channel. They can change it in “My account” or via “Forgot it?”.",
  ] as Tr,
  inviteNote: (e: string): Tr => [
    "Le hemos enviado un correo a " + e + " para crear su contraseña.",
    "We sent an email to " + e + " to create their password.",
  ],
  another: ["Crear otro", "Create another"] as Tr,
  // Ficha de una cuenta
  manageTitle: ["Gestionar acceso", "Manage access"] as Tr,
  roleLabel: ["Rol", "Role"] as Tr,
  makeAdmin: ["Hacer administrador", "Make administrator"] as Tr,
  makeMember: ["Quitar administrador", "Remove administrator"] as Tr,
  deactivate: ["Desactivar acceso", "Deactivate access"] as Tr,
  activate: ["Reactivar acceso", "Reactivate access"] as Tr,
  deactivateHint: ["No podrá entrar; la cuenta y sus datos se conservan.", "They cannot sign in; the account is kept."] as Tr,
  del: ["Borrar cuenta", "Delete account"] as Tr,
  delConfirm: ["¿Borrar esta cuenta definitivamente?", "Delete this account permanently?"] as Tr,
  delYes: ["Sí, borrar", "Yes, delete"] as Tr,
  selfNote: ["Esta es tu cuenta: no puedes desactivarla, borrarla ni quitarte el rol de administrador.", "This is your account: you cannot deactivate, delete or demote yourself."] as Tr,
  saving: ["Guardando…", "Saving…"] as Tr,
};

const ERR: Record<TeamErr, Tr> = {
  forbidden: ["Solo un administrador puede gestionar accesos.", "Only an administrator can manage access."],
  auth: ["Tu sesión ha caducado. Vuelve a entrar.", "Your session expired. Sign in again."],
  self: ["No puedes hacer eso con tu propia cuenta.", "You cannot do that to your own account."],
  domain: ["Solo se admiten cuentas @chipsfinder.es.", "Only @chipsfinder.es accounts are allowed."],
  bademail: ["Ese correo no es válido.", "That email is not valid."],
  empty: ["Falta el correo.", "The email is missing."],
  exists: ["Ya existe una cuenta con ese correo.", "An account with that email already exists."],
  rate: ["Demasiados intentos. Espera unos minutos.", "Too many attempts. Wait a few minutes."],
  network: ["No se pudo conectar. Inténtalo de nuevo.", "Could not connect. Try again."],
  unknown: ["Algo ha fallado. Inténtalo de nuevo.", "Something went wrong. Try again."],
};

function roleTone(role: Role) {
  return role === "admin" ? "accent" : "muted";
}

export default function Team({ lang, openId, onOpen }: { lang: Lang; openId: string | null; onOpen: (id: string | null) => void }) {
  const [users, setUsers] = useState<TeamUser[] | null>(null);
  const [meId, setMeId] = useState("");
  const [loadErr, setLoadErr] = useState(false);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoadErr(false);
    const res = await listUsers();
    if (!res.ok) {
      setLoadErr(true);
      setUsers([]);
      return;
    }
    setUsers(res.users);
    setMeId(res.me);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (users ?? []).filter((u) => !n || u.email.toLowerCase().includes(n));
  }, [users, q]);

  const open = openId === "nuevo" ? null : (users ?? []).find((u) => u.id === openId) ?? null;
  const drawer = creating || openId === "nuevo" || !!open;

  return (
    <section className="page-sec">
      <header className="sec-head">
        <div className="sec-head__text">
          <span className="sec-eyebrow">
            <span className="sec-eyebrow__code">05</span>
            {tr(C.eyebrow, lang)}
          </span>
          <h1 className="sec-title">{tr(C.title, lang)}</h1>
          <p className="sec-intro">{tr(C.intro, lang)}</p>
        </div>
        <button type="button" className="btn btn--primary btn--new" onClick={() => { onOpen(null); setCreating(true); }}>
          <span aria-hidden="true">+</span> {tr(C.newAccess, lang)}
        </button>
      </header>

      <div className="toolbar">
        <label className="search">
          <span className="sr-only">{tr(C.search, lang)}</span>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr(C.search, lang)} className="search__input" />
        </label>
        <span className="toolbar__count">{tr(C.count(filtered.length), lang)}</span>
      </div>

      <div className="table-wrap">
        {users === null ? (
          <div className="state">{tr(C.loading, lang)}</div>
        ) : loadErr ? (
          <div className="state">
            <span className="note__tag">ERR</span> {tr(C.loadErr, lang)}{" "}
            <button type="button" className="linkbtn" onClick={load}>{tr(C.retry, lang)}</button>
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>{tr(C.colEmail, lang)}</th>
                <th>{tr(C.colRole, lang)}</th>
                <th>{tr(C.colState, lang)}</th>
                <th className="is-optional">{tr(C.colLast, lang)}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className={openId === u.id ? "is-open" : ""} tabIndex={0}
                  onClick={() => { setCreating(false); onOpen(u.id); }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setCreating(false); onOpen(u.id); } }}>
                  <td data-label={tr(C.colEmail, lang)} className="is-strong">
                    {u.email}
                    {u.id === meId && <span className="tag-you">{tr(C.you, lang)}</span>}
                  </td>
                  <td data-label={tr(C.colRole, lang)}>
                    <span className={"pill pill--" + roleTone(u.role)}>{tr(u.role === "admin" ? C.admin : C.member, lang)}</span>
                  </td>
                  <td data-label={tr(C.colState, lang)}>
                    <span className={"pill pill--" + (!u.active ? "bad" : u.lastSignIn ? "ok" : "warn")}>
                      {tr(!u.active ? C.inactive : u.lastSignIn ? C.active : C.fresh, lang)}
                    </span>
                  </td>
                  <td data-label={tr(C.colLast, lang)} className="is-mono is-optional">
                    {u.lastSignIn ? date(u.lastSignIn, lang) : tr(C.never, lang)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {drawer && (creating || openId === "nuevo" ? (
        <CreateDrawer key="new" lang={lang} onClose={() => { setCreating(false); onOpen(null); }} onCreated={load} />
      ) : open ? (
        <ManageDrawer key={open.id} lang={lang} user={open} isSelf={open.id === meId}
          onClose={() => onOpen(null)} onChanged={async () => { await load(); }}
          onDeleted={async () => { onOpen(null); await load(); }} />
      ) : null)}
    </section>
  );
}

function errText(e: TeamErr, lang: Lang) {
  return tr(ERR[e], lang);
}

function CreateDrawer({ lang, onClose, onCreated }: { lang: Lang; onClose: () => void; onCreated: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("team");
  const [mode, setMode] = useState<"password" | "invite">("password");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TeamErr | null>(null);
  const [result, setResult] = useState<{ email: string; password?: string; mode: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const first = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const em = email.trim().toLowerCase();
    if (!em) return setError("empty");
    if (!isTeamEmail(em)) return setError("domain");
    setError(null);
    setBusy(true);
    const res = await createAccess(em, role, mode);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setResult({ email: res.email, password: res.password, mode: res.mode });
    onCreated();
  }

  function reset() {
    setResult(null);
    setEmail("");
    setRole("team");
    setCopied(false);
    first.current?.focus();
  }

  return (
    <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="team-create">
      <div className="drawer__scrim" onClick={onClose} />
      <form className="drawer__panel" onSubmit={submit} noValidate>
        <div className="drawer__head">
          <div>
            <span className="sec-eyebrow"><span className="sec-eyebrow__code">05</span>{tr(C.createTitle, lang)}</span>
            <h2 className="drawer__title" id="team-create">{result ? tr(result.mode === "invite" ? C.createdInvite : C.createdTemp, lang) : tr(C.createTitle, lang)}</h2>
          </div>
          <button type="button" className="iconbtn" onClick={onClose} aria-label={tr(C.close, lang)}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div className="drawer__body">
          {result ? (
            <>
              {result.password ? (
                <>
                  <div className="temp">
                    <span className="temp__label">{tr(C.tempFor(result.email), lang)}</span>
                    <div className="temp__row">
                      <code className="temp__value">{result.password}</code>
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => { navigator.clipboard?.writeText(result.password ?? ""); setCopied(true); }}>
                        {tr(copied ? C.copied : C.copy, lang)}
                      </button>
                    </div>
                  </div>
                  <p className="fhint">{tr(C.tempNote, lang)}</p>
                </>
              ) : (
                <div className="note note--ok">
                  <span className="note__tag">OK</span>
                  <span className="note__text">{tr(C.inviteNote(result.email), lang)}</span>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="sec-intro" style={{ fontSize: 14 }}>{tr(C.createSub, lang)}</p>
              <div className="fgrid">
                <div className="fcell fcell--wide">
                  <label className="field__label" htmlFor="new-email">{tr(C.email, lang)}<span className="req"> *</span></label>
                  <input ref={first} id="new-email" type="email" autoComplete="off" value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(null); }}
                    placeholder="nombre@chipsfinder.es"
                    className={"input input--sm" + (error === "empty" || error === "domain" || error === "bademail" || error === "exists" ? " input--error" : "")} />
                </div>
                <div className="fcell fcell--wide">
                  <span className="field__label">{tr(C.role, lang)}</span>
                  <div className="choices">
                    <label className={"choice" + (role === "team" ? " is-on" : "")}>
                      <input type="radio" name="role" checked={role === "team"} onChange={() => setRole("team")} />
                      <span>{tr(C.roleMember, lang)}</span>
                    </label>
                    <label className={"choice" + (role === "admin" ? " is-on" : "")}>
                      <input type="radio" name="role" checked={role === "admin"} onChange={() => setRole("admin")} />
                      <span>{tr(C.roleAdmin, lang)}</span>
                    </label>
                  </div>
                </div>
                <div className="fcell fcell--wide">
                  <span className="field__label">{tr(C.how, lang)}</span>
                  <div className="choices">
                    <label className={"choice" + (mode === "password" ? " is-on" : "")}>
                      <input type="radio" name="mode" checked={mode === "password"} onChange={() => setMode("password")} />
                      <span>{tr(C.howTemp, lang)}</span>
                    </label>
                    <label className={"choice" + (mode === "invite" ? " is-on" : "")}>
                      <input type="radio" name="mode" checked={mode === "invite"} onChange={() => setMode("invite")} />
                      <span>{tr(C.howInvite, lang)}</span>
                    </label>
                  </div>
                  <span className="fhint">{tr(mode === "password" ? C.howTempHint : C.howInviteHint, lang)}</span>
                </div>
              </div>
            </>
          )}

          {error && (
            <div className="note note--error" role="alert">
              <span className="note__tag">ERR</span>
              <span className="note__text">{errText(error, lang)}</span>
            </div>
          )}
        </div>

        <div className="drawer__foot">
          <span className="drawer__spacer" />
          {result ? (
            <>
              <button type="button" className="btn btn--ghost btn--sm" onClick={reset}>{tr(C.another, lang)}</button>
              <button type="button" className="btn btn--primary btn--sm" onClick={onClose}>{tr(C.done, lang)}</button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>{tr(C.cancel, lang)}</button>
              <button type="submit" className={"btn btn--primary btn--sm" + (busy ? " btn--busy" : "")} aria-busy={busy}>
                {busy && <span className="spinner" aria-hidden="true" />}
                {tr(busy ? C.creating : C.create, lang)}
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}

function ManageDrawer({ lang, user, isSelf, onClose, onChanged, onDeleted }: {
  lang: Lang; user: TeamUser; isSelf: boolean; onClose: () => void; onChanged: () => Promise<void>; onDeleted: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TeamErr | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function run(fn: () => Promise<{ ok: boolean; error?: TeamErr }>, after: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await fn();
    if (!res.ok) {
      setError(res.error ?? "unknown");
      setBusy(false);
      return;
    }
    await after();
    setBusy(false);
  }

  return (
    <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="team-manage">
      <div className="drawer__scrim" onClick={onClose} />
      <div className="drawer__panel">
        <div className="drawer__head">
          <div>
            <span className="sec-eyebrow"><span className="sec-eyebrow__code">05</span>{tr(C.manageTitle, lang)}</span>
            <h2 className="drawer__title" id="team-manage">{user.email}</h2>
          </div>
          <button type="button" className="iconbtn" onClick={onClose} aria-label={tr(C.close, lang)}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div className="drawer__body">
          <dl className="meta meta--col">
            <div><dt>{tr(C.roleLabel, lang)}</dt><dd><span className={"pill pill--" + roleTone(user.role)}>{tr(user.role === "admin" ? C.admin : C.member, lang)}</span></dd></div>
            <div><dt>{tr(C.colState, lang)}</dt><dd><span className={"pill pill--" + (!user.active ? "bad" : user.lastSignIn ? "ok" : "warn")}>{tr(!user.active ? C.inactive : user.lastSignIn ? C.active : C.fresh, lang)}</span></dd></div>
            <div><dt>{tr(C.colLast, lang)}</dt><dd>{user.lastSignIn ? date(user.lastSignIn, lang) : tr(C.never, lang)}</dd></div>
          </dl>

          {isSelf ? (
            <div className="note">
              <span className="note__tag">INT</span>
              <span className="note__text">{tr(C.selfNote, lang)}</span>
            </div>
          ) : (
            <div className="useractions">
              <button type="button" className="btn btn--ghost btn--sm" disabled={busy}
                onClick={() => run(() => setRole(user.id, user.role === "admin" ? "team" : "admin"), onChanged)}>
                {tr(user.role === "admin" ? C.makeMember : C.makeAdmin, lang)}
              </button>
              <div className="useractions__row">
                <button type="button" className="btn btn--ghost btn--sm" disabled={busy}
                  onClick={() => run(() => setActive(user.id, !user.active), onChanged)}>
                  {tr(user.active ? C.deactivate : C.activate, lang)}
                </button>
                {user.active && <span className="fhint">{tr(C.deactivateHint, lang)}</span>}
              </div>
            </div>
          )}

          {error && (
            <div className="note note--error" role="alert">
              <span className="note__tag">ERR</span>
              <span className="note__text">{errText(error, lang)}</span>
            </div>
          )}
        </div>

        {!isSelf && (
          <div className="drawer__foot">
            {confirmDel ? (
              <div className="delconfirm">
                <span>{tr(C.delConfirm, lang)}</span>
                <button type="button" className="btn btn--danger btn--sm" disabled={busy} onClick={() => run(() => deleteAccess(user.id), onDeleted)}>{tr(C.delYes, lang)}</button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirmDel(false)}>{tr(C.cancel, lang)}</button>
              </div>
            ) : (
              <button type="button" className="btn btn--ghost btn--sm btn--del" onClick={() => setConfirmDel(true)}>{tr(C.del, lang)}</button>
            )}
            <span className="drawer__spacer" />
            <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>{tr(C.close, lang)}</button>
          </div>
        )}
      </div>
    </div>
  );
}
