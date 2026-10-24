import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { T, type Lang } from "./i18n";
import { PHOTOS, SUPPORT_EMAIL, readLayout } from "./config";
import { requestPasswordReset, signIn, signInWithMicrosoft, validateLogin, type LoginError } from "./auth";

type View = "login" | "forgot" | "done";

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

export default function App() {
  const layout = useMemo(readLayout, []);
  const [lang, setLangState] = useState<Lang>(initialLang);
  const [view, setView] = useState<View>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<LoginError | null>(null);
  const [loading, setLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const alive = useRef(true);

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

  const setLang = (code: Lang) => {
    try {
      localStorage.setItem(LANG_KEY, code);
    } catch {
      /* almacenamiento bloqueado */
    }
    setLangState(code);
  };

  const errorText = error === "empty" ? t.errEmpty : error === "domain" ? t.errDomain : error === "short" ? t.errShort : "";
  const emailBad = error === "empty" || error === "domain";
  const pwBad = error === "empty" || error === "short";

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
      await signIn(email.trim().toLowerCase(), password, remember);
      if (alive.current) setView("done");
    } finally {
      if (alive.current) setLoading(false);
    }
  }

  async function sso() {
    setLoading(false);
    setError(null);
    await signInWithMicrosoft();
    setView("done");
  }

  function goForgot(e: MouseEvent) {
    e.preventDefault();
    setView("forgot");
    setError(null);
    setForgotSent(false);
  }

  function goLogin() {
    setView("login");
    setError(null);
    setPassword("");
    setForgotSent(false);
  }

  async function sendReset() {
    await requestPasswordReset(email.trim());
    setForgotSent(true);
  }

  const title = view === "forgot" ? t.forgotTitle : view === "done" ? t.doneTitle : t.loginTitle;
  const subtitle = view === "forgot" ? t.forgotSub : view === "done" ? t.doneSub : t.loginSub;

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
          <div className="panel">
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

                {error && (
                  <div className="note note--error" id="login-error" role="alert">
                    <span className="note__tag">ERR</span>
                    <span className="note__text">{errorText}</span>
                  </div>
                )}

                <div className="note">
                  <span className="note__tag">INT</span>
                  <span className="note__text">{t.notice}</span>
                </div>

                <button
                  type="submit"
                  className={"btn btn--primary btn--submit" + (loading ? " btn--busy" : "")}
                  aria-busy={loading}
                >
                  {loading && <span className="spinner" aria-hidden="true" />}
                  {loading ? t.entering : t.enter}
                </button>

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
              </form>
            )}

            {view === "forgot" && (
              <div className="stack">
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
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nombre@chipsfinder.es"
                    className="input"
                  />
                </label>
                <button type="button" className="btn btn--primary" onClick={sendReset}>
                  {t.sendLink}
                </button>
                <button type="button" className="btn btn--ghost" onClick={goLogin}>
                  ← {t.backLogin}
                </button>
              </div>
            )}

            {view === "done" && (
              <div className="stack">
                <div className="checks">
                  {t.checks.map((c) => (
                    <div className="check" key={c.l}>
                      <span className="check__mark" aria-hidden="true">
                        ✓
                      </span>
                      <span className="check__label">{c.l}</span>
                      <span className="check__val">{c.v}</span>
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
