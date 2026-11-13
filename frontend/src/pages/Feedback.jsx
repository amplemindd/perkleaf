import Icon from "../lib/icons";
import React, { useEffect, useState } from "react";
import { api, ago, fmtDT, preset } from "../lib/api";
import { navigate, useAuth, useDebounced, useFetch, useShell, useUI } from "../lib/store";
import { Empty, ErrorBox, Loading, Pager, RangePicker } from "../lib/ui";

/* ------------------------------------------------------------------ */
/*  Customer feedback (ratings sent from the QR ordering page)          */
/* ------------------------------------------------------------------ */

const WORDS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

function Star({ size = 16, filled = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function Stars({ value, size = 16 }) {
  return (
    <span className="fb-stars" role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} filled={n <= Math.round(value)} />
      ))}
    </span>
  );
}

const toneOf = (r) => (r >= 4 ? "good" : r === 3 ? "mid" : "bad");

export default function Feedback() {
  const { can } = useAuth();
  const { toast, ask } = useUI();
  const { search } = useShell();
  const [f, setF] = useState({ ...preset("month"), rating: "all" });
  const [page, setPage] = useState(1);
  const dq = useDebounced(search);
  const d = useFetch("/feedback", { ...f, q: dq, page, limit: 10 }, [], 15000);
  useEffect(() => setPage(1), [f, dq]);

  const s = d.data?.summary;
  const total = s?.count || 0;
  const filtered = f.rating !== "all" || !!dq;

  const remove = async (item) => {
    const ok = await ask("Remove this feedback permanently?", { danger: true, okText: "Remove" });
    if (!ok) return;
    try {
      await api(`/feedback/${item.id}`, { method: "DELETE" });
      toast("Feedback removed.");
      d.reload();
    } catch (e) {
      toast(e.message, "err");
    }
  };

  return (
    <div className="page fb">
      <style>{CSS}</style>

      <div className="ph">
        <div>
          <h1>Customer Feedback</h1>
          <p className="muted">Ratings and comments your customers send from the table QR page.</p>
        </div>
        <RangePicker from={f.from} to={f.to} onChange={(r) => setF({ ...f, ...r })} />
      </div>

      {/* ---------- summary ---------- */}
      <section className="fb-sum">
        <div className="fb-avg">
          <b>{total ? s.average.toFixed(1) : "–"}</b>
          <Stars value={s?.average || 0} size={20} />
          <small>
            {total} {total === 1 ? "review" : "reviews"}
          </small>
        </div>

        <div className="fb-dist" aria-label="Rating breakdown">
          {[5, 4, 3, 2, 1].map((n) => {
            const c = s?.distribution?.[n] || 0;
            return (
              <button
                key={n}
                className={`fb-row ${String(f.rating) === String(n) ? "on" : ""}`}
                onClick={() => setF({ ...f, rating: String(f.rating) === String(n) ? "all" : String(n) })}
                title={`Show only ${n}-star feedback`}
              >
                <span className="fb-n">
                  {n} <Star size={12} filled />
                </span>
                <span className="fb-bar">
                  <i className={`tone-${toneOf(n)}`} style={{ width: total ? `${(c / total) * 100}%` : "0%" }} />
                </span>
                <span className="fb-c">{c}</span>
              </button>
            );
          })}
        </div>

        <div className="fb-kpis">
          <div className="fb-kpi good">
            <small>Happy customers</small>
            <b>{total ? Math.round((s.positive / total) * 100) : 0}%</b>
            <span>4 and 5 stars</span>
          </div>
          <div className={`fb-kpi ${s?.low ? "bad" : ""}`}>
            <small>Needs attention</small>
            <b>{s?.low || 0}</b>
            <span>1 and 2 stars</span>
          </div>
        </div>
      </section>

      {/* ---------- filters ---------- */}
      <div className="fb-filter">
        {["all", "5", "4", "3", "2", "1"].map((r) => (
          <button key={r} className={String(f.rating) === r ? "on" : ""} onClick={() => setF({ ...f, rating: r })}>
            {r === "all" ? (
              "All"
            ) : (
              <>
                {r} <Star size={12} filled />
              </>
            )}
          </button>
        ))}
        {dq && <span className="fb-q">Search: “{dq}”</span>}
      </div>

      {/* ---------- list ---------- */}
      <section className="card">
        {d.error && !d.data ? (
          <ErrorBox msg={d.error} retry={d.reloadFull} />
        ) : !d.data ? (
          <Loading />
        ) : !d.data.items.length ? (
          <Empty icon="sparkle" text={filtered ? "No feedback matches these filters." : "No feedback yet. It will appear here when customers rate you."} />
        ) : (
          <div className="fb-list">
            {d.data.items.map((it) => (
              <article key={it.id} className={`fb-item tone-${toneOf(it.rating)}`}>
                <div className="fb-score">
                  <b>{it.rating}</b>
                  <Star size={14} filled />
                </div>

                <div className="fb-body">
                  <div className="fb-top">
                    <Stars value={it.rating} />
                    <strong>{WORDS[it.rating]}</strong>
                    {it.rating <= 2 && <span className="fb-flag">Needs attention</span>}
                  </div>

                  <p className={it.comment ? "fb-text" : "fb-text none"}>{it.comment || "No comment written."}</p>

                  {it.tags?.length > 0 && (
                    <div className="fb-tags">
                      {it.tags.map((t) => (
                        <span key={t}>{t}</span>
                      ))}
                    </div>
                  )}

                  <div className="fb-meta">
                    <span>
                      <Icon n="user" size={13} /> {it.customer_name || "Guest"}
                    </span>
                    <span>
                      <Icon n="table" size={13} /> Table {it.table_name || "-"}
                    </span>
                    {it.bill_no && (
                      <span>
                        <Icon n="receipt" size={13} /> {it.bill_no}
                      </span>
                    )}
                    <span title={fmtDT(it.created_at)}>
                      <Icon n="clock" size={13} /> {ago(it.created_at)}
                    </span>
                  </div>
                </div>

                <div className="fb-act">
                  {it.order_id && (
                    <button onClick={() => navigate("/admin/orders", { openId: Number(it.order_id) })} title="Open the order">
                      <Icon n="external" size={15} />
                    </button>
                  )}
                  {can("customers.manage") && (
                    <button className="dng" onClick={() => remove(it)} title="Remove feedback" aria-label="Remove feedback">
                      <Icon n="trash" size={15} />
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
        {d.data && <Pager page={page} total={d.data.total} limit={10} onPage={setPage} label="reviews" />}
      </section>
    </div>
  );
}

const CSS = `
.fb{--fb-good:#15803d;--fb-mid:#d49a00;--fb-bad:#d92d20}
.fb-stars{display:inline-flex;gap:2px;color:#f5b301;vertical-align:middle}
.fb-sum{display:grid;grid-template-columns:200px minmax(0,1fr) 230px;gap:18px;align-items:center;margin:0 0 16px;padding:20px;background:var(--card-bg,#fff);border:1px solid var(--border,#e1eae3)}
.fb-avg{display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center}
.fb-avg b{font-size:54px;font-weight:800;line-height:1;color:var(--text,#17211b)}
.fb-avg small{color:var(--muted,#718078);font-weight:600}
.fb-dist{display:flex;flex-direction:column;gap:6px}
.fb-row{display:grid;grid-template-columns:38px minmax(0,1fr) 34px;align-items:center;gap:10px;padding:3px 6px;background:none;border:1px solid transparent;cursor:pointer;text-align:left;color:inherit}
.fb-row:hover{background:var(--green-pale,#f0fdf4)}
.fb-row.on{background:var(--green-light,#dcfce7);border-color:var(--green,#15803d)}
.fb-n{display:flex;align-items:center;gap:3px;font-weight:700;font-size:13px}
.fb-n svg{color:#f5b301}
.fb-bar{height:9px;background:var(--border,#e1eae3);overflow:hidden}
.fb-bar i{display:block;height:100%;transition:width .5s}
.fb-bar i.tone-good{background:var(--fb-good)}
.fb-bar i.tone-mid{background:var(--fb-mid)}
.fb-bar i.tone-bad{background:var(--fb-bad)}
.fb-c{font-size:13px;font-weight:700;text-align:right;color:var(--muted,#718078)}
.fb-kpis{display:flex;flex-direction:column;gap:10px}
.fb-kpi{padding:12px 14px;background:var(--page-bg,#f5f7f5);border-left:4px solid var(--border,#e1eae3)}
.fb-kpi.good{border-left-color:var(--fb-good)}
.fb-kpi.bad{border-left-color:var(--fb-bad)}
.fb-kpi small{display:block;font-size:12px;font-weight:700;color:var(--muted,#718078)}
.fb-kpi b{display:block;font-size:26px;font-weight:800;line-height:1.15}
.fb-kpi span{font-size:11.5px;color:var(--muted,#718078)}
.fb-filter{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:0 0 14px}
.fb-filter button{display:flex;align-items:center;gap:4px;padding:8px 16px;font-weight:700;font-size:13px;color:var(--text,#17211b);background:var(--card-bg,#fff);border:1px solid var(--border,#e1eae3);cursor:pointer}
.fb-filter button svg{color:#f5b301}
.fb-filter button.on{color:#fff;background:var(--green,#15803d);border-color:var(--green,#15803d)}
.fb-q{font-size:13px;color:var(--muted,#718078)}
.fb-list{display:flex;flex-direction:column}
.fb-item{display:flex;align-items:flex-start;gap:14px;padding:16px 18px;border-bottom:1px solid var(--border,#e1eae3);border-left:4px solid transparent}
.fb-item:last-child{border-bottom:0}
.fb-item.tone-bad{border-left-color:var(--fb-bad);background:rgba(217,45,32,.04)}
.fb-score{flex:0 0 52px;height:52px;display:flex;align-items:center;justify-content:center;gap:2px;font-size:20px;font-weight:800;color:#fff;background:var(--fb-good)}
.fb-score svg{margin-top:-1px}
.fb-item.tone-mid .fb-score{background:var(--fb-mid)}
.fb-item.tone-bad .fb-score{background:var(--fb-bad)}
.fb-body{flex:1;min-width:0}
.fb-top{display:flex;align-items:center;flex-wrap:wrap;gap:10px}
.fb-top strong{font-size:14px}
.fb-flag{padding:2px 8px;font-size:11px;font-weight:800;letter-spacing:.3px;color:#fff;background:var(--fb-bad)}
.fb-text{margin:6px 0 0;font-size:14.5px;line-height:1.5;overflow-wrap:anywhere}
.fb-text.none{color:var(--muted,#718078);font-style:italic}
.fb-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.fb-tags span{padding:3px 10px;font-size:12px;font-weight:700;color:var(--green-dark,#14532d);background:var(--green-light,#dcfce7)}
.fb-meta{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:10px;font-size:12.5px;color:var(--muted,#718078)}
.fb-meta span{display:inline-flex;align-items:center;gap:5px}
.fb-act{display:flex;gap:6px}
.fb-act button{width:34px;height:34px;display:grid;place-items:center;color:var(--muted,#718078);background:var(--page-bg,#f5f7f5);border:1px solid var(--border,#e1eae3);cursor:pointer}
.fb-act button:hover{color:var(--green,#15803d);border-color:var(--green,#15803d)}
.fb-act button.dng:hover{color:var(--fb-bad);border-color:var(--fb-bad)}
@media (max-width:900px){.fb-sum{grid-template-columns:minmax(0,1fr)}.fb-avg{flex-direction:row;justify-content:flex-start;gap:14px}.fb-kpis{flex-direction:row}.fb-kpi{flex:1}}
@media (max-width:560px){.fb-item{padding:14px 12px;gap:10px}.fb-score{flex-basis:44px;height:44px;font-size:17px}.fb-act{flex-direction:column}}
`;