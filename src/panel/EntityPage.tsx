import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Lang } from "../i18n";
import { supabase } from "../auth";
import { optionLabel, type Entity, type Field, type Option, type Row, type Tone } from "./entities";
import { pedidoCode, tr, type Tr } from "./format";

type Props = {
  entity: Entity;
  lang: Lang;
  isAdmin: boolean;
  openId: string | null;
  onOpen: (id: string | null) => void;
  onChanged: () => void;
};

const C = {
  search: ["Buscar…", "Search…"] as Tr,
  all: ["Todos", "All"] as Tr,
  records: ["registros", "records"] as Tr,
  record: ["registro", "record"] as Tr,
  loading: ["Cargando…", "Loading…"] as Tr,
  noMatch: ["Nada coincide con la búsqueda.", "Nothing matches your search."] as Tr,
  clear: ["Quitar filtros", "Clear filters"] as Tr,
  loadErr: ["No se pudieron cargar los datos.", "Could not load the data."] as Tr,
  retry: ["Reintentar", "Retry"] as Tr,
  editing: ["Editar", "Edit"] as Tr,
  creating: ["Nuevo", "New"] as Tr,
  save: ["Guardar", "Save"] as Tr,
  saving: ["Guardando…", "Saving…"] as Tr,
  cancel: ["Cancelar", "Cancel"] as Tr,
  close: ["Cerrar", "Close"] as Tr,
  del: ["Borrar", "Delete"] as Tr,
  delConfirm: ["¿Borrar definitivamente?", "Delete permanently?"] as Tr,
  delYes: ["Sí, borrar", "Yes, delete"] as Tr,
  required: ["Rellena los campos obligatorios.", "Fill in the required fields."] as Tr,
  dup: ["Ya existe un registro con ese código.", "A record with that code already exists."] as Tr,
  inUse: ["No se puede borrar: otros registros dependen de este.", "Cannot delete: other records depend on this one."] as Tr,
  noPerm: ["No tienes permiso para hacer esto.", "You are not allowed to do this."] as Tr,
  genericErr: ["No se pudo guardar. Inténtalo de nuevo.", "Could not save. Please try again."] as Tr,
  badNumber: ["Revisa los números: solo cifras, sin letras.", "Check the numbers: digits only."] as Tr,
  none: ["— Sin asignar —", "— Not set —"] as Tr,
  created: ["Creado", "Created"] as Tr,
  updated: ["Actualizado", "Updated"] as Tr,
  adminOnly: ["Solo un administrador puede borrar.", "Only an administrator can delete."] as Tr,
};

export function StatusPill({ options, value, lang }: { options?: Option[]; value: unknown; lang: Lang }) {
  const o = options?.find((x) => x.value === value);
  const tone: Tone = o?.tone ?? "muted";
  return <span className={"pill pill--" + tone}>{optionLabel(options, value, lang)}</span>;
}

function friendlyError(e: { code?: string; message?: string } | null, lang: Lang): string {
  if (!e) return tr(C.genericErr, lang);
  if (e.code === "23505") return tr(C.dup, lang);
  if (e.code === "23503") return tr(C.inUse, lang);
  if (e.code === "42501" || /row-level security|permission/i.test(e.message ?? "")) return tr(C.noPerm, lang);
  if (e.code === "22P02" || e.code === "22003") return tr(C.badNumber, lang);
  return tr(C.genericErr, lang);
}

// Valor del formulario → valor para la base de datos
function toDb(f: Field, raw: string): unknown {
  const v = raw.trim();
  if (v === "") return f.type === "select" ? null : null;
  if (f.type === "number" || f.type === "rating") return Number(v.replace(/\./g, "").replace(",", "."));
  if (f.type === "money") return Number(v.replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return v;
}

function toForm(f: Field, v: unknown): string {
  if (v === null || v === undefined) return "";
  if (f.type === "money") {
    const n = Number(v);
    const dec = (String(n).split(".")[1] ?? "").length;
    return n.toFixed(Math.max(2, Math.min(4, dec))).replace(".", ",");
  }
  return String(v);
}

type FkOption = { id: string; label: string };

export default function EntityPage({ entity, lang, isAdmin, openId, onOpen, onChanged }: Props) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    const { data, error } = await supabase
      .from(entity.table)
      .select(entity.select)
      .order(entity.order.column, { ascending: entity.order.ascending })
      .limit(2000);
    if (error) {
      setLoadError(true);
      setRows([]);
      return;
    }
    setRows((data ?? []) as unknown as Row[]);
  }, [entity]);

  useEffect(() => {
    setRows(null);
    setQ("");
    setStatus("");
    setCreating(false);
    load();
  }, [load]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    if (entity.statusKey) for (const r of rows ?? []) m[String(r[entity.statusKey])] = (m[String(r[entity.statusKey])] ?? 0) + 1;
    return m;
  }, [rows, entity]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => {
      if (status && entity.statusKey && r[entity.statusKey] !== status) return false;
      if (needle && !entity.searchText(r).toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [rows, q, status, entity]);

  const wantsNew = openId === "nuevo";
  const openRow = openId && !wantsNew ? (rows ?? []).find((r) => r.id === openId) ?? null : null;
  const drawerOpen = rows !== null && (creating || wantsNew || !!openRow);

  function closeDrawer() {
    setCreating(false);
    onOpen(null);
  }

  async function afterSave() {
    await load();
    onChanged();
  }

  return (
    <section className="page-sec">
      <header className="sec-head">
        <div className="sec-head__text">
          <span className="sec-eyebrow">
            <span className="sec-eyebrow__code">{entity.code}</span>
            {tr(entity.eyebrow, lang)}
          </span>
          <h1 className="sec-title">{tr(entity.title, lang)}</h1>
          <p className="sec-intro">{tr(entity.intro, lang)}</p>
        </div>
        <button
          type="button"
          className="btn btn--primary btn--new"
          onClick={() => {
            onOpen(null);
            setCreating(true);
          }}
        >
          <span aria-hidden="true">+</span> {tr(entity.newLabel, lang)}
        </button>
      </header>

      <div className="toolbar">
        <label className="search">
          <span className="sr-only">{tr(C.search, lang)}</span>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tr(C.search, lang)}
            className="search__input"
          />
        </label>
        {entity.statuses && (
          <div className="chips" role="group">
            <button type="button" className="chip" aria-pressed={status === ""} onClick={() => setStatus("")}>
              {tr(C.all, lang)} <span className="chip__n">{rows?.length ?? 0}</span>
            </button>
            {entity.statuses.map((s) => (
              <button
                key={s.value}
                type="button"
                className={"chip chip--" + (s.tone ?? "muted")}
                aria-pressed={status === s.value}
                onClick={() => setStatus(status === s.value ? "" : s.value)}
              >
                {tr(s.label, lang)} <span className="chip__n">{counts[s.value] ?? 0}</span>
              </button>
            ))}
          </div>
        )}
        <span className="toolbar__count">
          {filtered.length} {tr(filtered.length === 1 ? C.record : C.records, lang)}
        </span>
      </div>

      <div className="table-wrap">
        {rows === null ? (
          <div className="state">{tr(C.loading, lang)}</div>
        ) : loadError ? (
          <div className="state">
            <span className="note__tag">ERR</span> {tr(C.loadErr, lang)}{" "}
            <button type="button" className="linkbtn" onClick={load}>
              {tr(C.retry, lang)}
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className="state state--empty">
            <span className="state__code">{entity.code}</span>
            <p className="state__text">{tr(entity.empty, lang)}</p>
            <button type="button" className="btn btn--primary btn--new" onClick={() => setCreating(true)}>
              <span aria-hidden="true">+</span> {tr(entity.newLabel, lang)}
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="state">
            {tr(C.noMatch, lang)}{" "}
            <button
              type="button"
              className="linkbtn"
              onClick={() => {
                setQ("");
                setStatus("");
              }}
            >
              {tr(C.clear, lang)}
            </button>
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                {entity.columns.map((c) => (
                  <th
                    key={c.key}
                    className={(c.align === "right" ? "is-right " : "") + (c.hideOnMobile ? "is-optional" : "")}
                  >
                    {tr(c.label, lang)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className={openId === r.id ? "is-open" : ""}
                  tabIndex={0}
                  onClick={() => {
                    setCreating(false);
                    onOpen(r.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setCreating(false);
                      onOpen(r.id);
                    }
                  }}
                >
                  {entity.columns.map((c) => (
                    <td
                      key={c.key}
                      data-label={tr(c.label, lang)}
                      className={
                        (c.align === "right" ? "is-right " : "") +
                        (c.mono ? "is-mono " : "") +
                        (c.strong ? "is-strong " : "") +
                        (c.hideOnMobile ? "is-optional" : "")
                      }
                    >
                      {c.status ? (
                        <StatusPill options={entity.statuses} value={r[entity.statusKey ?? ""]} lang={lang} />
                      ) : (
                        c.value(r, lang)
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {drawerOpen && (
        <Drawer
          key={openRow?.id ?? "new"}
          entity={entity}
          lang={lang}
          isAdmin={isAdmin}
          row={openRow}
          onClose={closeDrawer}
          onSaved={async (id) => {
            await afterSave();
            setCreating(false);
            onOpen(id);
          }}
          onDeleted={async () => {
            closeDrawer();
            await afterSave();
          }}
        />
      )}
    </section>
  );
}

function Drawer({
  entity,
  lang,
  isAdmin,
  row,
  onClose,
  onSaved,
  onDeleted,
}: {
  entity: Entity;
  lang: Lang;
  isAdmin: boolean;
  row: Row | null;
  onClose: () => void;
  onSaved: (id: string) => void;
  onDeleted: () => void;
}) {
  const initial = useMemo(() => {
    const v: Record<string, string> = {};
    for (const f of entity.fields) {
      if (row) v[f.key] = toForm(f, row[f.key]);
      else if (f.type === "select" && f.options?.length) v[f.key] = f.options[0].value;
      else if (f.type === "date" && f.required) v[f.key] = new Date().toISOString().slice(0, 10);
      else v[f.key] = "";
    }
    return v;
  }, [entity, row]);

  const [values, setValues] = useState(initial);
  const [fk, setFk] = useState<Record<string, FkOption[]>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  const firstRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Opciones de los desplegables que apuntan a otras tablas
  useEffect(() => {
    let alive = true;
    for (const f of entity.fields) {
      if (f.type !== "fk" || !f.fk) continue;
      const cfg = f.fk;
      const cols = ["id", cfg.labelKey, cfg.extra].filter(Boolean).join(", ");
      supabase
        .from(cfg.table)
        .select(cols)
        .order(cfg.labelKey, { ascending: cfg.table !== "pedidos" })
        .limit(2000)
        .then(({ data }) => {
          if (!alive || !data) return;
          const list = (data as unknown as Record<string, unknown>[]).map((d) => {
            const main = cfg.table === "pedidos" ? pedidoCode(d[cfg.labelKey]) : String(d[cfg.labelKey] ?? "");
            const extra = cfg.extra && d[cfg.extra] ? " · " + String(d[cfg.extra]) : "";
            return { id: String(d.id), label: main + extra };
          });
          setFk((prev) => ({ ...prev, [f.key]: list }));
        });
    }
    return () => {
      alive = false;
    };
  }, [entity]);

  const set = (k: string, v: string) => {
    setValues((s) => ({ ...s, [k]: v }));
    setError("");
    setMissing((m) => m.filter((x) => x !== k));
  };

  async function save(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    const miss = entity.fields.filter((f) => f.required && !values[f.key]?.trim()).map((f) => f.key);
    if (miss.length) {
      setMissing(miss);
      setError(tr(C.required, lang));
      return;
    }
    const payload: Record<string, unknown> = {};
    for (const f of entity.fields) {
      const v = toDb(f, values[f.key] ?? "");
      if (typeof v === "number" && !Number.isFinite(v)) {
        setMissing([f.key]);
        setError(tr(C.badNumber, lang));
        return;
      }
      payload[f.key] = v;
    }
    setSaving(true);
    setError("");
    const q = row
      ? supabase.from(entity.table).update(payload).eq("id", row.id).select("id").single()
      : supabase.from(entity.table).insert(payload).select("id").single();
    const { data, error: err } = await q;
    setSaving(false);
    if (err || !data) {
      setError(friendlyError(err, lang));
      return;
    }
    onSaved((data as { id: string }).id);
  }

  async function remove() {
    if (!row) return;
    setSaving(true);
    const { error: err, count } = await supabase.from(entity.table).delete({ count: "exact" }).eq("id", row.id);
    setSaving(false);
    if (err) {
      setError(friendlyError(err, lang));
      setConfirmDel(false);
      return;
    }
    if (!count) {
      setError(tr(C.noPerm, lang));
      setConfirmDel(false);
      return;
    }
    onDeleted();
  }

  const title = row ? entity.titleOf(row) : tr(entity.newLabel, lang);

  return (
    <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
      <div className="drawer__scrim" onClick={onClose} />
      <form className="drawer__panel" onSubmit={save} noValidate>
        <div className="drawer__head">
          <div>
            <span className="sec-eyebrow">
              <span className="sec-eyebrow__code">{entity.code}</span>
              {tr(row ? C.editing : C.creating, lang)} · {tr(entity.singular, lang)}
            </span>
            <h2 className="drawer__title" id="drawer-title">
              {title}
            </h2>
          </div>
          <button type="button" className="iconbtn" onClick={onClose} aria-label={tr(C.close, lang)}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="drawer__body">
          <div className="fgrid">
            {entity.fields.map((f, i) => {
              const bad = missing.includes(f.key);
              const id = "f-" + f.key;
              const common = {
                id,
                name: f.key,
                value: values[f.key] ?? "",
                className: "input input--sm" + (f.mono ? " is-mono" : "") + (bad ? " input--error" : ""),
                "aria-invalid": bad || undefined,
                ref: i === 0 ? (el: HTMLElement | null) => (firstRef.current = el) : undefined,
              };
              return (
                <div key={f.key} className={"fcell" + (f.wide || f.type === "textarea" ? " fcell--wide" : "")}>
                  <label className="field__label" htmlFor={id}>
                    {tr(f.label, lang)}
                    {f.required && <span className="req"> *</span>}
                  </label>
                  {f.type === "textarea" ? (
                    <textarea {...common} rows={4} className={common.className + " input--area"} onChange={(e) => set(f.key, e.target.value)} />
                  ) : f.type === "select" ? (
                    <select {...common} onChange={(e) => set(f.key, e.target.value)}>
                      {f.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {tr(o.label, lang)}
                        </option>
                      ))}
                    </select>
                  ) : f.type === "fk" ? (
                    <select {...common} onChange={(e) => set(f.key, e.target.value)}>
                      <option value="">{tr(C.none, lang)}</option>
                      {(fk[f.key] ?? []).map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                      {values[f.key] && !(fk[f.key] ?? []).some((o) => o.id === values[f.key]) && (
                        <option value={values[f.key]}>…</option>
                      )}
                    </select>
                  ) : f.type === "rating" ? (
                    <div className="rating" role="radiogroup" aria-labelledby={id}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          role="radio"
                          aria-checked={values[f.key] === String(n)}
                          aria-label={String(n)}
                          className={"rating__dot" + (Number(values[f.key] || 0) >= n ? " is-on" : "")}
                          onClick={() => set(f.key, values[f.key] === String(n) ? "" : String(n))}
                          ref={i === 0 && n === 1 ? (el) => (firstRef.current = el) : undefined}
                        />
                      ))}
                    </div>
                  ) : (
                    <input
                      {...common}
                      type={f.type === "money" || f.type === "number" ? "text" : f.type}
                      inputMode={f.type === "money" ? "decimal" : f.type === "number" ? "numeric" : undefined}
                      placeholder={f.placeholder}
                      onChange={(e) => set(f.key, e.target.value)}
                    />
                  )}
                  {f.hint && <span className="fhint">{tr(f.hint, lang)}</span>}
                </div>
              );
            })}
          </div>

          {row && (
            <dl className="meta">
              <div>
                <dt>{tr(C.created, lang)}</dt>
                <dd>{new Date(String(row.created_at)).toLocaleString(lang === "es" ? "es-ES" : "en-GB")}</dd>
              </div>
              <div>
                <dt>{tr(C.updated, lang)}</dt>
                <dd>{new Date(String(row.updated_at)).toLocaleString(lang === "es" ? "es-ES" : "en-GB")}</dd>
              </div>
            </dl>
          )}

          {error && (
            <div className="note note--error" role="alert">
              <span className="note__tag">ERR</span>
              <span className="note__text">{error}</span>
            </div>
          )}
        </div>

        <div className="drawer__foot">
          {row &&
            (confirmDel ? (
              <div className="delconfirm">
                <span>{tr(C.delConfirm, lang)}</span>
                <button type="button" className="btn btn--danger btn--sm" onClick={remove} disabled={saving}>
                  {tr(C.delYes, lang)}
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirmDel(false)}>
                  {tr(C.cancel, lang)}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn--ghost btn--sm btn--del"
                onClick={() => setConfirmDel(true)}
                disabled={!isAdmin}
                title={isAdmin ? undefined : tr(C.adminOnly, lang)}
              >
                {tr(C.del, lang)}
              </button>
            ))}
          <span className="drawer__spacer" />
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
            {tr(C.cancel, lang)}
          </button>
          <button type="submit" className={"btn btn--primary btn--sm" + (saving ? " btn--busy" : "")} aria-busy={saving}>
            {saving && <span className="spinner" aria-hidden="true" />}
            {tr(saving ? C.saving : C.save, lang)}
          </button>
        </div>
      </form>
    </div>
  );
}
