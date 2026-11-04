import Icon from "../lib/icons";
import React, { useEffect, useMemo, useState } from "react";
import { api, ago, fmtDate, fmtDT, fmtTime, toDate, ymd } from "../lib/api";
import { navigate, useAuth, useDebounced, useFetch, useShell, useUI } from "../lib/store";
import { Badge, Empty, ErrorBox, Loading, Menu, Pager, Toggle } from "../lib/ui";
import "../styles/notifications.css";

/* [key, label, icon] */
const TYPES = [
  ["all", "All", "bell"],
  ["order", "Orders", "cart"],
  ["inventory", "Inventory", "box"],
  ["payment", "Payments", "card"],
  ["table", "Tables", "table"],
  ["customer", "Customers", "user"],
  ["expense", "Expenses", "rupee"],
  ["report", "Reports", "calendar"],
  ["system", "System", "gear"],
];
const iconOf = (t) => (TYPES.find((x) => x[0] === t) || TYPES[8])[2];
const labelOf = (t) => (TYPES.find((x) => x[0] === t) || TYPES[8])[1];

const LINK = {
  order: "/admin/orders",
  table: "/admin/tables",
  product: "/admin/menu",
  customer: "/admin/customers",
  report: "/admin/reports/daily",
  expense: "/admin/expenses",
};

/* [setting key, title, hint] */
const PREFS = [
  ["n_new_order", "New orders", "When a new order comes in"],
  ["n_low_stock", "Low stock alerts", "When items are running low"],
  ["n_payment", "Payment updates", "When a payment status changes"],
  ["n_table", "Table alerts", "Reservations and table updates"],
  ["n_expense", "Expense alerts", "When an expense is unusually high"],
  ["n_daily_report", "Daily report", "When the daily report is ready"],
  ["n_system", "System updates", "Changes and maintenance notices"],
];

const STATUS = [["all", "All"], ["unread", "Unread"], ["read", "Read"]];

/* ---------- small pieces ---------- */

function Activity({ days }) {
  const max = Math.max(...days.map((d) => d.value), 1);
  const total = days.reduce((s, d) => s + d.value, 0);
  return (
    <section className="np-card">
      <header className="np-card-h">
        <h3>Last 7 days</h3>
        <span className="np-total"><b>{total}</b> notifications</span>
      </header>
      <div className="np-chart" role="img" aria-label={`Notifications per day: ${days.map((d) => `${d.day} ${d.value}`).join(", ")}`}>
        {days.map((d, i) => (
          <div key={d.key} className={`np-col ${i === days.length - 1 ? "today" : ""} ${d.value ? "" : "zero"}`} title={`${d.day} ${d.date}: ${d.value}`}>
            <span className="np-val">{d.value}</span>
            <div className="np-track"><i style={{ height: d.value ? `${Math.max((d.value / max) * 100, 6)}%` : "3px" }} /></div>
            <span className="np-day">{d.day}</span>
            <small>{d.date}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function Detail({ n, onClose, onRemove }) {
  const link = LINK[n.link_type];
  return (
    <section className="np-card np-detail" data-type={n.type} aria-label="Notification details">
      <header className="np-card-h">
        <h3>Details</h3>
        <button className="np-x" onClick={onClose} aria-label="Close details"><Icon n="x" size={16} /></button>
      </header>
      <div className="np-detail-top">
        <span className="np-ic"><Icon n={iconOf(n.type)} size={18} /></span>
        <div>
          <b>{n.title}</b>
          <small>{labelOf(n.type)} · {fmtDT(n.created_at)}</small>
        </div>
      </div>
      <p className="np-detail-msg">{n.message}</p>
      <dl className="np-facts">
        <div><dt>Received</dt><dd>{ago(n.created_at)}</dd></div>
        <div><dt>Priority</dt><dd><Badge v={n.priority} /></dd></div>
        <div><dt>Status</dt><dd>{n.is_read ? "Read" : "Unread"}</dd></div>
      </dl>
      <div className="np-actions">
        {link && (
          <button className="np-btn pri" onClick={() => navigate(link, n.link_type === "order" ? { openId: Number(n.link_id) } : null)}>
            Open {n.link_type} <Icon n="external" size={14} />
          </button>
        )}
        <button className="np-btn dng" onClick={() => onRemove(n)}><Icon n="trash" size={14} /> Remove</button>
      </div>
    </section>
  );
}

/* ---------- page ---------- */

export default function Notifications() {
  const { settings: S, refresh } = useAuth();
  const { toast } = useUI();
  const { search, reload } = useShell();
  const [f, setF] = useState({ type: "all", status: "all", time: "all" });
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState(null);
  const [local, setLocal] = useState({});
  const dq = useDebounced(search);
  const d = useFetch("/notifications", { ...f, q: dq, page, limit: 10 }, [], 3000);
  useEffect(() => setPage(1), [f, dq]);

  const data = d.data;
  const ub = data?.unread_by_type || {};
  const unreadTotal = data?.unread_total || 0;
  const filtered = f.type !== "all" || f.status !== "all" || f.time !== "all" || !!dq;

  /* close details with Esc */
  useEffect(() => {
    if (!sel) return undefined;
    const k = (e) => e.key === "Escape" && setSel(null);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [sel]);

  const done = () => { d.reload(); reload(); };
  const read = async (n) => {
    if (!n.is_read) { await api(`/notifications/${n.id}/read`, { method: "PATCH" }).catch(() => {}); done(); }
  };
  const open = (n) => { setSel({ ...n, is_read: 1 }); read(n); };
  const readAll = async () => {
    try { const r = await api("/notifications/read-all", { method: "POST" }); toast(r.message); done(); }
    catch (e) { toast(e.message, "err"); }
  };
  const remove = async (n) => {
    try { await api(`/notifications/${n.id}`, { method: "DELETE" }); setSel(null); done(); }
    catch (e) { toast(e.message, "err"); }
  };
  const pref = async (k, v) => {
    setLocal((p) => ({ ...p, [k]: v }));
    try { await api("/settings", { method: "PUT", body: { settings: { [k]: v } } }); await refresh(); }
    catch (e) { toast(e.message, "err"); }
    finally { setLocal((p) => { const c = { ...p }; delete c[k]; return c; }); }
  };

  /* last 7 days for the chart */
  const days = Array.from({ length: 7 }, (_, i) => {
    const dt = new Date();
    dt.setDate(dt.getDate() - 6 + i);
    const key = ymd(dt), r = (data?.last7 || []).find((x) => x.date === key);
    return { key, value: r ? r.n : 0, day: dt.toLocaleString("en", { weekday: "short" }), date: String(dt.getDate()).padStart(2, "0") };
  });

  /* group the list by day: Today / Yesterday / date */
  const groups = useMemo(() => {
    const list = data?.notifications || [];
    const today = ymd(), y = new Date(); y.setDate(y.getDate() - 1);
    const yest = ymd(y), out = [];
    list.forEach((n) => {
      const k = ymd(toDate(n.created_at));
      let g = out[out.length - 1];
      if (!g || g.key !== k) { g = { key: k, label: k === today ? "Today" : k === yest ? "Yesterday" : fmtDate(n.created_at), items: [] }; out.push(g); }
      g.items.push(n);
    });
    return out;
  }, [data]);

  const clearFilters = () => setF({ type: "all", status: "all", time: "all" });

  return (
    <div className="page np">
      {/* ---------- header ---------- */}
      <div className="np-head">
        <div>
          <h1><Icon n="bell" size={24} /> Notifications</h1>
          <p>{unreadTotal > 0 ? `You have ${unreadTotal} unread ${unreadTotal === 1 ? "notification" : "notifications"}.` : "You're all caught up."}</p>
        </div>
        <button className="np-btn" onClick={readAll} disabled={!unreadTotal}><Icon n="check" size={15} /> Mark all as read</button>
      </div>

      <div className="np-grid">
        {/* ---------- main column ---------- */}
        <div className="np-main">
          <div className="np-tabs" role="tablist" aria-label="Notification type">
            {TYPES.map(([k, l, ic]) => {
              const c = k === "all" ? unreadTotal : ub[k];
              return (
                <button key={k} role="tab" aria-selected={f.type === k} className={`np-tab ${f.type === k ? "on" : ""}`} onClick={() => setF({ ...f, type: k })}>
                  <Icon n={ic} size={15} /> {l}{c > 0 && <i>{c}</i>}
                </button>
              );
            })}
          </div>

          <div className="np-tools">
            <div className="np-seg" role="group" aria-label="Read status">
              {STATUS.map(([k, l]) => <button key={k} aria-pressed={f.status === k} className={f.status === k ? "on" : ""} onClick={() => setF({ ...f, status: k })}>{l}</button>)}
            </div>
            <select value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} aria-label="Time range">
              <option value="all">All time</option>
              <option value="today">Today</option>
              <option value="week">Last 7 days</option>
              <option value="month">Last 30 days</option>
            </select>
            {filtered && <button className="np-link" onClick={clearFilters}>Clear filters</button>}
          </div>

          <section className="np-card np-list">
            {d.error && !data ? <ErrorBox msg={d.error} retry={d.reloadFull} />
              : !data ? <Loading />
              : !data.notifications.length ? (
                <div className="np-empty">
                  <Empty icon="bell" text={filtered ? "No notifications match these filters." : "You're all caught up. New alerts will show up here."} />
                  {filtered && <button className="np-btn" onClick={clearFilters}>Clear filters</button>}
                </div>
              ) : groups.map((g) => (
                <div key={g.key} className="np-group">
                  <h4>{g.label}</h4>
                  {g.items.map((n) => (
                    <div
                      key={n.id}
                      role="button"
                      tabIndex={0}
                      data-type={n.type}
                      className={`np-row ${n.is_read ? "" : "unread"} ${sel?.id === n.id ? "sel" : ""}`}
                      onClick={() => open(n)}
                      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(n); } }}
                    >
                      <span className="np-ic"><Icon n={iconOf(n.type)} size={18} /></span>
                      <div className="np-body">
                        <div className="np-title"><b>{n.title}</b>{String(n.priority).toLowerCase() !== "normal" && <Badge v={n.priority} />}</div>
                        <p>{n.message}</p>
                      </div>
                      <div className="np-meta">
                        <time title={fmtDT(n.created_at)}>{fmtTime(n.created_at)}</time>
                        {!n.is_read && <i className="np-dot" role="img" aria-label="Unread" />}
                      </div>
                      <span className="np-menu" onClick={(e) => e.stopPropagation()}>
                        <Menu items={[["View details", () => open(n)], !n.is_read ? ["Mark as read", () => read(n)] : null, ["Remove", () => remove(n), true]]} />
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            {data && <Pager page={page} total={data.total} limit={10} onPage={setPage} label="notifications" />}
          </section>
        </div>

        {/* ---------- right rail ---------- */}
        <aside className="np-rail">
          {sel && <div className="np-scrim" onClick={() => setSel(null)} />}
          {sel && <Detail n={sel} onClose={() => setSel(null)} onRemove={remove} />}

          <Activity days={days} />

          <section className="np-card">
            <header className="np-card-h">
              <h3>Alert preferences</h3>
            </header>
            <div className="np-prefs">
              {PREFS.map(([k, l, h]) => (
                <div className="np-pref" key={k}>
                  <div><b>{l}</b><small>{h}</small></div>
                  <Toggle checked={local[k] ?? S?.[k]} onChange={(v) => pref(k, v)} />
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}