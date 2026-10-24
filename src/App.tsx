import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { T, type Copy, type Lang } from "./i18n";
import { PHOTOS, SUPPORT_EMAIL, readLayout } from "./config";
import {
  clearEmailLink,
  getSession,
  isTeamEmail,
  readEmailLink,
  requestPasswordReset,
  roleOf,
  setNewPassword,
  signIn,
  signInWithMicrosoft,
  signOut,
  ssoEnabled,
  supabase,
  validateLogin,
  verifyEmailLink,
  type LinkType,
  type LoginError,
  type ServerError,
} from "./auth";

type View = "checking" | "login" | "forgot" | "setPassword" | "done";
type ErrorKey = LoginError | ServerError;

const LANG_KEY = "chf-lang";

function initialLang(): Lang {
  try {
    const l = localStorage.getItem(LANG_KEY);
    if (l === "es" || l === "en") return l;
  } catch {
    /* almacenamiento bloqueado */
  }
  return "es";
}

function errorMessage(t: Copy, e: ErrorKey | null): string {
  switch (e) {
    case null:
      return "";
    case "empty":
      return t.errEmpty;
    case "domain":
      return t.errDomain;
    case "short":
      return t.errShort;
    case "credentials":
      return t.errCredentials;
    case "banned":
      return t.errBanned;
    case "rate":
      return t.errRate;
    case "network":
      return t.errNetwork;
    case "weak":
      return t.errWeak;
    case "same":
      return t.errSame;
    case "mismatch":
      return t.errMismatch;
    case "link":
      return t.errLink;
    case "sso":
      return t.errSso;
    default:
      return t.errUnknown;
  }
}

type Boot = { view: View; session: Session | null; linkType: LinkType; error: ServerError | null };

// Se ejecuta una sola vez por carga de página (el enlace del correo solo sirve una vez).
let bootPromise: Promise<Boot> | null = null;

function boot(): Promise<Boot> {
  bootPromise ??= (async (): Promise<Boot> => {
    let linkError: ServerError | null = null;
    const link = readEmailLink();
    if (link) {
      clearEmailLink();
      const res = await verifyEmailLink(link.tokenHash, link.type);
      if (res.ok) return { view: "setPassword", session: await getSession(), linkType: link.type, error: null };
      linkError = res.error;
    }
    // Si el enlace no vale pero ya había sesión abierta, se sigue dentro.
    const s = await getSession();
    if (!s) return { view: "login", session: null, linkType: "recovery", error: linkError };
    // Confirma con el servidor que la cuenta sigue activa.
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      await signOut();
      return { view: "login", session: null, linkType: "recovery", error: linkError };
    }
    return { view: "done", session: s, linkType: "recovery", error: null };
  })();
  return bootPromise;
}

function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

function ErrorNote({ id, text }: { id: string; text: string }) {
  if (!text) return null;
  return (
    <div className="note note--error" id={id} role="alert">
      <span className="note__tag">ERR</span>
      <span className="note__text">{text}</span>
    </div>
  );
}

export default function App() {
  const layout = useMemo(readLayout, []);
  const [lang, setLangState] = useState<Lang>(initialLang);
  const [view, setView] = useState<View>("checking");
  const [linkType, setLinkType] = useState<LinkType>("recovery");
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<ErrorKey | null>(null);
  const [loading, setLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const alive = useRef(true);
  const viewRef = useRef<View>(view);
  viewRef.current = view;

  const t = T[lang];

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = "ChipsFinder · " + T[lang].back;
  }, [lang]);

  // Arranque: enlace de correo (invitación / recuperación) o sesión guardada.
  useEffect(() => {
    let cancelled = false;
    boot().then((b) => {
      if (cancelled) return;
      setSession(b.session);
      if (b.view === "setPassword") {
        setEmail(b.session?.user.email ?? "");
        setLinkType(b.linkType);
      }
      if (b.error) setError(b.error);
      setView(b.view);
    });

    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "SIGNED_OUT" && viewRef.current === "done") {
        setSession(null);
        setView("login");
      } else if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        setSession(s);
      }
    });
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  const setLang = (code: Lang) => {
    try {
      localStorage.setItem(LANG_KEY, code);
    } catch {
      /* almacenamiento bloqueado */
    }
    setLangState(code);
  };

  const errorText = errorMessage(t, error);
  const emailBad = error === "empty" || error === "domain";
  const pwBad = error === "empty" || error === "short" || error === "credentials";

  async function enterDone() {
    const s = await getSession();
    if (!alive.current) return;
    setSession(s);
    setPassword("");
    setPassword2("");
    setShowPw(false);
    setView("done");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    const err = validateLogin(email, password);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await signIn(email, password, remember);
      if (!alive.current) return;
      if (res.ok) await enterDone();
      else setError(res.error);
    } finally {
      if (alive.current) setLoading(false);
    }
  }

  async function sso() {
    setError(null);
    const res = await signInWithMicrosoft();
    if (!res.ok && alive.current) setError(res.error);
  }

  function goForgot(e: MouseEvent) {
    e.preventDefault();
    setView("forgot");
    setError(null);
    setForgotSent(false);
  }

  async function goLogin() {
    // Desde "crear contraseña" o "sesión iniciada" se cierra la sesión.
    if (view === "done" || view === "setPassword") await signOut();
    if (!alive.current) return;
    setSession(null);
    setView("login");
    setError(null);
    setPassword("");
    setPassword2("");
    setShowPw(false);
    setForgotSent(false);
  }

  async function sendReset(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    const em = email.trim();
    if (!em) {
      setError("empty");
      return;
    }
    if (!isTeamEmail(em)) {
      setError("domain");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await requestPasswordReset(em);
      if (!alive.current) return;
      if (res.ok) setForgotSent(true);
      else setError(res.error);
    } finally {
      if (alive.current) setLoading(false);
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (!password || !password2) {
      setError("empty");
      return;
    }
    if (password.length < 8) {
      setError("short");
      return;
    }
    if (password !== password2) {
      setError("mismatch");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await setNewPassword(password, remember);
      if (!alive.current) return;
      if (res.ok) await enterDone();
      else setError(res.error);
    } finally {
      if (alive.current) setLoading(false);
    }
  }

  const signedEmail = session?.user.email ?? "";
  const role = roleOf(session) || t.roleTeam;

  const title =
    view === "checking"
      ? t.checkingTitle
      : view === "forgot"
        ? t.forgotTitle
        : view === "setPassword"
          ? linkType === "invite"
            ? t.inviteTitle
            : t.setTitle
          : view === "done"
            ? t.doneTitle
            : t.loginTitle;
  const subtitle =
    view === "checking"
      ? t.checkingSub
      : view === "forgot"
        ? t.forgotSub
        : view === "setPassword"
          ? linkType === "invite"
            ? t.inviteSub
            : t.setSub
          : view === "done"
            ? t.doneSub(signedEmail)
            : t.loginSub;

  const rememberToggle = (
    <button
      type="button"
      className="remember"
      role="checkbox"
      aria-checked={remember}
      onClick={() => setRemember((v) => !v)}
    >
      <span className="remember__box" aria-hidden="true">
        {remember ? "✓" : ""}
      </span>
      {t.remember}
    </button>
  );

  return (
    <div className={"page" + (layout.lado === "derecha" ? " page--reverse" : "")}>
      {/* ---------- Foto ---------- */}
      <aside className="hero">
        <div className="hero__photo" style={{ backgroundImage: `url(${PHOTOS[layout.foto]})` }} aria-hidden="true" />
        <div className="hero__shade" aria-hidden="true" />
        <div className="hero__rule" aria-hidden="true" />

        <div className="hero__inner">
          <div className="hero__top">
            <img src="/logo-chf-white.png" alt="CHF Finder" className="hero__logo" />
            <div className="badge">
              <span className="dot dot--pulse" aria-hidden="true" />
              <span className="badge__text">{t.badge}</span>
            </div>
          </div>

          <div className="hero__copy">
            <span className="hero__eyebrow">{t.eyebrow}</span>
            <h1 className="hero__title">{t.heroTitle}</h1>
            <p className="hero__body">{t.heroBody}</p>
            <div className="stats">
              {t.stats.map((s) => (
                <div className="stat" key={s.v}>
                  <span className="stat__v">{s.v}</span>
                  <span className="stat__l">{s.l}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="hero__meta">
            <span>CHF/INT · v2.6</span>
            <span>TLS 1.3</span>
          </div>
        </div>
      </aside>

      {/* ---------- Formulario ---------- */}
      <main className="side">
        <div className="side__bar">
          <span className="side__label">
            <span className="dot" aria-hidden="true" />
            {t.back}
          </span>
          <div className="langs" role="group" aria-label={t.langLabel}>
            {(["es", "en"] as const).map((code) => (
              <button
                key={code}
                type="button"
                className="langs__btn"
                aria-pressed={lang === code}
                lang={code}
                onClick={() => setLang(code)}
              >
                {code}
              </button>
            ))}
          </div>
        </div>

        <div className="side__main">
          <div className="panel" aria-busy={view === "checking"}>
            <div className="bracket">
              <div className="bracket__edge bracket__edge--top" />
              <span className="bracket__text">{t.formEyebrow}</span>
              <div className="bracket__edge bracket__edge--bottom" />
            </div>

            <div className="heading">
              <h2 className="heading__title">{title}</h2>
              <p className="heading__sub">{subtitle}</p>
            </div>

            {view === "login" && (
              <form className="form" onSubmit={submit} noValidate>
                <label className="field">
                  <span className="field__label">{t.email}</span>
                  <input
                    type="email"
                    name="email"
                    autoComplete="username"
                    inputMode="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError(null);
                    }}
                    placeholder="nombre@chipsfinder.es"
                    className={"input" + (emailBad ? " input--error" : "")}
                    aria-invalid={emailBad || undefined}
                    aria-describedby={emailBad ? "login-error" : undefined}
                  />
                </label>

                <div className="field">
                  <span className="field__label field__label--row">
                    <label htmlFor="login-password">{t.password}</label>
                    <a href="#" onClick={goForgot} className="field__forgot">
                      {t.forgot}
                    </a>
                  </span>
                  <div className="pw">
                    <input
                      id="login-password"
                      type={showPw ? "text" : "password"}
                      name="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setError(null);
                      }}
                      placeholder="••••••••••"
                      className={"input" + (pwBad ? " input--error" : "")}
                      aria-invalid={pwBad || undefined}
                      aria-describedby={pwBad ? "login-error" : undefined}
                    />
                    <button
                      type="button"
                      className="pw__toggle"
                      onClick={() => setShowPw((v) => !v)}
                      aria-controls="login-password"
                      aria-pressed={showPw}
                    >
                      {showPw ? t.hide : t.show}
                    </button>
                  </div>
                </div>

                {rememberToggle}

                <ErrorNote id="login-error" text={errorText} />

                <div className="note">
                  <span className="note__tag">INT</span>
                  <span className="note__text">{t.notice}</span>
                </div>

                <button
                  type="submit"
                  className={"btn btn--primary btn--submit" + (loading ? " btn--busy" : "")}
                  aria-busy={loading}
                >
                  {loading && <Spinner />}
                  {loading ? t.entering : t.enter}
                </button>

                {ssoEnabled && (
                  <>
                    <div className="divider">
                      <span className="divider__line" />
                      <span className="divider__text">{t.or}</span>
                      <span className="divider__line" />
                    </div>

                    <button type="button" className="btn btn--sso" onClick={sso}>
                      <span className="ms" aria-hidden="true">
                        <span style={{ background: "#f25022" }} />
                        <span style={{ background: "#7fba00" }} />
                        <span style={{ background: "#00a4ef" }} />
                        <span style={{ background: "#ffb900" }} />
                      </span>
                      {t.sso}
                    </button>
                  </>
                )}
              </form>
            )}

            {view === "forgot" && (
              <form className="stack" onSubmit={sendReset} noValidate>
                {forgotSent && (
                  <div className="note note--ok" role="status">
                    <span className="note__tag">OK</span>
                    <span className="note__text">{t.forgotMsg(email.trim() || t.yourEmail)}</span>
                  </div>
                )}
                <label className="field">
                  <span className="field__label">{t.email}</span>
                  <input
                    type="email"
                    name="email"
                    autoComplete="username"
                    inputMode="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError(null);
                    }}
                    placeholder="nombre@chipsfinder.es"
                    className={"input" + (emailBad ? " input--error" : "")}
                    aria-invalid={emailBad || undefined}
                    aria-describedby={error ? "forgot-error" : undefined}
                  />
                </label>
                <ErrorNote id="forgot-error" text={errorText} />
                <button
                  type="submit"
                  className={"btn btn--primary" + (loading ? " btn--busy" : "")}
                  aria-busy={loading}
                >
                  {loading && <Spinner />}
                  {loading ? t.sending : t.sendLink}
                </button>
                <button type="button" className="btn btn--ghost" onClick={goLogin}>
                  ← {t.backLogin}
                </button>
              </form>
            )}

            {view === "setPassword" && (
              <form className="form" onSubmit={savePassword} noValidate>
                {/* Para que el gestor de contraseñas asocie la nueva contraseña a la cuenta */}
                <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />
                <div className="field">
                  <label className="field__label" htmlFor="new-password">
                    {t.newPassword}
                  </label>
                  <div className="pw">
                    <input
                      id="new-password"
                      type={showPw ? "text" : "password"}
                      name="new-password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setError(null);
                      }}
                      placeholder="••••••••••"
                      className={"input" + (error === "empty" || error === "short" || error === "weak" || error === "same" ? " input--error" : "")}
                      aria-describedby={error ? "set-error" : undefined}
                    />
                    <button
                      type="button"
                      className="pw__toggle"
                      onClick={() => setShowPw((v) => !v)}
                      aria-controls="new-password repeat-password"
                      aria-pressed={showPw}
                    >
                      {showPw ? t.hide : t.show}
                    </button>
                  </div>
                </div>
                <label className="field">
                  <span className="field__label">{t.repeatPassword}</span>
                  <input
                    id="repeat-password"
                    type={showPw ? "text" : "password"}
                    name="repeat-password"
                    autoComplete="new-password"
                    value={password2}
                    onChange={(e) => {
                      setPassword2(e.target.value);
                      setError(null);
                    }}
                    placeholder="••••••••••"
                    className={"input" + (error === "empty" || error === "mismatch" ? " input--error" : "")}
                    aria-describedby={error ? "set-error" : undefined}
                  />
                </label>

                {rememberToggle}

                <ErrorNote id="set-error" text={errorText} />

                <button
                  type="submit"
                  className={"btn btn--primary btn--submit" + (loading ? " btn--busy" : "")}
                  aria-busy={loading}
                >
                  {loading && <Spinner />}
                  {loading ? t.saving : t.savePassword}
                </button>
                <button type="button" className="btn btn--ghost" onClick={goLogin}>
                  ← {t.backLogin}
                </button>
              </form>
            )}

            {view === "done" && (
              <div className="stack">
                <div className="checks">
                  {t.checks.map((c, i) => (
                    <div className="check" key={c.l}>
                      <span className="check__mark" aria-hidden="true">
                        ✓
                      </span>
                      <span className="check__label">{c.l}</span>
                      <span className="check__val">{i === t.checks.length - 1 ? role : c.v}</span>
                    </div>
                  ))}
                </div>
                <button type="button" className="btn btn--ghost" onClick={goLogin}>
                  {t.logout}
                </button>
              </div>
            )}

            <p className="help">
              {t.help} <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
            </p>
          </div>
        </div>

        <div className="side__foot">
          <span>© 2026 ChipsFinder</span>
          <span>{t.privacy}</span>
        </div>
      </main>
    </div>
  );
}
