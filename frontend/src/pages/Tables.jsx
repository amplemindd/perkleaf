import Icon from "../lib/icons";
import React, { useState } from "react";
import { createPortal } from "react-dom";
import { api, cap, elapsed, fmtDT, fmtTime, money } from "../lib/api";
import { navigate } from "../lib/store";
import { useAuth, useFetch, useShell, useUI } from "../lib/store";
import { Badge, Empty, ErrorBox, Field, Loading, Modal, Tabs } from "../lib/ui";
import { ReceiptModal } from "../components/Receipt";
import { QR_BRAND, QR_STEPS, downloadQrCard } from "../lib/qrcard";
import "../styles/table-qr.css";

const ST = ["available", "occupied", "reserved", "cleaning", "out_of_service"];

function TableTile({ t, on, onClick, i }) {
  const n = Math.min(t.capacity || 4, 10),
    base = Math.floor(n / 4),
    rem = n % 4;
  const top = base + (rem > 0 ? 1 : 0),
    bottom = base + (rem > 1 ? 1 : 0),
    left = base + (rem > 2 ? 1 : 0),
    right = base;
  const chairs = (k, cls) =>
    Array.from({ length: k }, (_, x) => (
      <i key={x} className={`chair ${cls}`} />
    ));
  return (
    <button
      className={`tile ${t.status} ${on ? "on" : ""}`}
      style={{ "--i": Math.min(i, 30) }}
      onClick={onClick}
    >
      <span className="tile-bar" />
      <div className="seat">
        <div className="srow">{chairs(top, "h")}</div>
        <div className="smid">
          <div className="scol">{chairs(left, "v")}</div>
          <div className="sq">
            <b>{t.name}</b>
          </div>
          <div className="scol">{chairs(right, "v")}</div>
        </div>
        <div className="srow">{chairs(bottom, "h")}</div>
      </div>
      <span className={`tile-st ${t.status}`}>{cap(t.status)}</span>
      <div className="tile-info">
        {t.status === "occupied" && t.order && (
          <>
            <span>
              <Icon n="users" size={13} /> {t.order.guests || 1} guests
            </span>
            <span>
              <Icon n="clock" size={13} /> {elapsed(t.status_since)}
            </span>
            <b>{money(t.order.total)}</b>
          </>
        )}
        {t.status === "reserved" && (
          <>
            <span>
              <Icon n="user" size={13} /> {t.reserved_for || "Reserved"}
            </span>
            <span>
              <Icon n="clock" size={13} />{" "}
              {t.reserved_at ? fmtTime(t.reserved_at) : "-"}
            </span>
          </>
        )}
        {t.status === "cleaning" && (
          <span>
            <Icon n="sparkle" size={13} /> Est. 15 min
          </span>
        )}
        {t.status === "out_of_service" && (
          <span>
            <Icon n="ban" size={13} /> Not in use
          </span>
        )}
        {t.status === "available" && (
          <span>
            <Icon n="users" size={13} /> {t.capacity} seats · ready
          </span>
        )}
      </div>
    </button>
  );
}

function Detail({ id, onClose, refresh, admin }) {
  const { can } = useAuth();
  const { toast, ask } = useUI();
  const d = useFetch(`/tables/${id}`, null, [id]);
  const [rec, setRec] = useState(false);
  const [move, setMove] = useState(false);
  const [qrData, setQrData] = useState("");
  const [qrLink, setQrLink] = useState("");

  const all = useFetch("/tables");
  const t = d.data?.table;
  if (!t)
    return (
      <div className="side-panel">
        {d.error ? <ErrorBox msg={d.error} /> : <Loading />}
      </div>
    );
  const go = (path, state) => navigate(admin ? "/admin" + path : path, state);
  const posPath = admin ? "/admin/pos" : "/";

const makeQr = () => {
  const env = process.env.REACT_APP_PUBLIC_URL;
  const isLocal = (u) =>
    /^https?:\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(u || "");
  const baseUrl = (env && !isLocal(env) ? env : window.location.origin).replace(/\/$/, "");

  const url = `${baseUrl}/customer-order/${t.qr_token}`;
  setQrLink(url);
  setQrData(
    `https://api.qrserver.com/v1/create-qr-code/?size=420x420&margin=12&data=${encodeURIComponent(url)}`,
  );
};






  const printQr = () => {
    document.body.classList.add("print-qr");
    const done = () => {
      document.body.classList.remove("print-qr");
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
  };



  const cancel = async () => {
    const reason = await ask(
      `Cancel the active order on ${t.name}? Enter a reason:`,
      {
        input: true,
        danger: true,
        okText: "Cancel order",
        title: "Cancel order",
      },
    );
    if (reason)
      try {
        await api(`/orders/${t.order.id}/cancel`, {
          method: "POST",
          body: { reason },
        });
        toast("Order cancelled.");
        d.reload();
        refresh();
      } catch (e) {
        toast(e.message, "err");
      }
  };
  return (
    <div className="side-panel">
      <div className="sp-h">
        <h3>Table {t.name}</h3>
        <button className="btn sm dng" onClick={onClose}>
          <Icon n="x" /> Close
        </button>
      </div>
      {admin && can("tables.manage") && (
        <button
          className="btn pri block"
          onClick={makeQr}
          disabled={!t.qr_token}
        >
          <Icon n="qr" /> {"Generate / Download Table QR"}
        </button>
      )}
      <div className="chips2">
        <Badge v={t.status} />
        <span className="chip2">
          <Icon n="clock" /> {fmtTime(t.status_since)} (
          {elapsed(t.status_since)})
        </span>
        <span className="chip2">
          <Icon n="users" /> {t.capacity} seats
        </span>
      </div>
      {t.status === "reserved" && (
        <div className="kv">
          <span>Reserved for</span>
          <b>
            {t.reserved_for}
            {t.reserved_phone ? ` · ${t.reserved_phone}` : ""}
            {t.reserved_at ? ` · ${fmtDT(t.reserved_at)}` : ""}
          </b>
        </div>
      )}
      {t.order ? (
        <>
          <h4 className="sp-t">Current Order</h4>
          <div className="hl">
            <b>Order {t.order.bill_no}</b>
            <button
              className="lnk"
              onClick={() => go("/orders", { openId: t.order.id })}
            >
              View in Orders
            </button>
          </div>
          <div className="kv">
            <span>
              <Icon n="user" /> Customer
            </span>
            <b>{t.order.customer_name}</b>
          </div>
          <div className="kv">
            <span>
              <Icon n="users" /> Guests
            </span>
            <b>{t.order.guests}</b>
          </div>
          <div className="kv">
            <span>Order Type</span>
            <b>Dine In</b>
          </div>
          <div className="kv">
            <span>Total</span>
            <b>
              {money(t.order.total)} ({t.items.length} items)
            </b>
          </div>
          {can("pos") && (
            <button
              className="btn pri block"
              onClick={() => navigate(posPath, { orderId: t.order.id })}
            >
              <Icon n="plus" /> Add Items to Order
            </button>
          )}
          <h4 className="sp-t">Order Items ({t.items.length})</h4>
          <div className="oitems">
            {t.items.map((i, k) => (
              <div key={k} className="oi">
                <div className="oi-n">
                  <b>{i.product_name}</b>
                  <small>{money(i.unit_price)}</small>
                </div>
                <span>x {i.qty}</span>
                <b>{money(i.line_total)}</b>
              </div>
            ))}
          </div>
          <div className="sums">
            <div>
              <span>Subtotal</span>
              <b>{money(t.order.subtotal)}</b>
            </div>
            {t.order.discount_amount > 0 && (
              <div>
                <span>Discount</span>
                <b>-{money(t.order.discount_amount)}</b>
              </div>
            )}
            <div>
              <span>GST</span>
              <b>{money(t.order.tax_amount)}</b>
            </div>
          </div>
          <div className="gtot">
            <span>Grand Total</span>
            <b>{money(t.order.total)}</b>
          </div>
          <div className="sp-actions">
            <button className="btn pri" onClick={() => setRec(true)}>
              <Icon n="print" /> Print Bill
            </button>
            {can("pos") && (
              <button className="btn" onClick={() => setMove(true)}>
                <Icon n="swap" /> Move Table
              </button>
            )}
            {can("orders.cancel") && (
              <button className="btn dng" onClick={cancel}>
                <Icon n="trash" /> Cancel Order
              </button>
            )}
          </div>
        </>
      ) : (
        <p className="muted">No active order on this table.</p>
      )}

      
      {qrData &&
        createPortal(
          <Modal
            title={`Table ${t.name} · Customer QR`}
            onClose={() => setQrData("")}
            footer={
              <>
                <div className="qrm-actions">
                  <button className="btn" onClick={printQr}>
                    <Icon n="print" /> Print QR
                  </button>
                  <button
                    className="btn pri"
                    onClick={() =>
                      downloadQrCard(qrData, t.name).catch(() =>
                        toast("Could not create the image. Use Print QR instead.", "err"),
                      )
                    }
                  >
                    <Icon n="download" /> Download QR
                  </button>
                </div>
              </>
            }
          >
            {/localhost|127\.0\.0\.1/i.test(qrLink) && (
              <div className="qrm-warn">
                <b>This QR will not open on a customer’s phone.</b>
                <span>
                  It points to <code>{qrLink.replace(/\/customer-order\/.*/, "")}</code>, which is only your own
                  computer. Open this app using your PC’s network address (for example
                  http://192.168.x.x:3000), or set <code>REACT_APP_PUBLIC_URL</code> to your website
                  address, then generate the QR again.
                </span>
              </div>
            )}
            <div className="qrm-card">
              <div className="qrm-brand">
                <b>{QR_BRAND.name}</b>
                <span>{QR_BRAND.sub}</span>
              </div>
              <div className="qrm-table">TABLE {t.name}</div>
              <div className="qrm-img">
                <img src={qrData} alt={`QR Code ${t.name}`} />
              </div>
              <h4 className="qrm-title">SCAN &amp; ORDER</h4>
              <p className="qrm-sub">Order directly from your mobile — no waiting!</p>
              <ol className="qrm-steps">
                {QR_STEPS.map(([en, hi], i) => (
                  <li key={i}>
                    <span className="n">{i + 1}</span>
                    <div>
                      <b>{en}</b>
                      <small>{hi}</small>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="qrm-help">Need help? Please ask our staff 🙂</div>
              <small className="qrm-powered">{QR_BRAND.powered}</small>
            </div>
          </Modal>,
          document.body,
        )}

      {rec && (
        <ReceiptModal orderId={t.order.id} onClose={() => setRec(false)} />
      )}
      {move && (
        <Modal title={`Move ${t.name} to…`} onClose={() => setMove(false)}>
          <div className="chips">
            {(all.data?.tables || [])
              .filter(
                (x) =>
                  x.id !== t.id && ["available", "cleaning"].includes(x.status),
              )
              .map((x) => (
                <button
                  key={x.id}
                  className="tchip"
                  onClick={async () => {
                    try {
                      await api(`/tables/${t.id}/move`, {
                        method: "POST",
                        body: { to_table_id: x.id },
                      });
                      toast("Order moved.");
                      setMove(false);
                      onClose();
                      refresh();
                    } catch (e) {
                      toast(e.message, "err");
                    }
                  }}
                >
                  {x.name}
                </button>
              ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function Tables() {
  const { can } = useAuth();
  const { toast, ask } = useUI();
  const { search, admin } = useShell();
  const list = useFetch("/tables", null, [], 10000);
  const [flt, setFlt] = useState("all");
  const [view, setView] = useState("floor");
  const [sel, setSel] = useState(null);
  const [form, setForm] = useState(null);
  const [res, setRes] = useState(null);
  const posPath = admin ? "/admin/pos" : "/";
  const all = list.data?.tables || [],
    counts = list.data?.counts || {};
  const shown = all.filter(
    (t) =>
      (flt === "all" || t.status === flt) &&
      t.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const cur = all.find((t) => t.id === sel);
  const quick = async (status, extra) => {
    try {
      const r = await api(`/tables/${sel}/status`, {
        method: "PATCH",
        body: { status, ...extra },
      });
      toast(r.message);
      list.reload();
    } catch (e) {
      toast(e.message, "err");
    }
  };
  const needSel = (fn) => () =>
    sel ? fn() : toast("Select a table first.", "err");
  const save = async () => {
    try {
      await api(form.id ? `/tables/${form.id}` : "/tables", {
        method: form.id ? "PUT" : "POST",
        body: { name: form.name, capacity: Number(form.capacity) || 4 },
      });
      toast("Table saved.");
      setForm(null);
      list.reload();
    } catch (e) {
      toast(e.message, "err");
    }
  };
  const del = async () => {
    if (
      await ask(`Delete table ${cur.name}?`, { danger: true, okText: "Delete" })
    )
      try {
        await api(`/tables/${cur.id}`, { method: "DELETE" });
        toast("Table deleted.");
        setSel(null);
        list.reload();
      } catch (e) {
        toast(e.message, "err");
      }
  };
  return (
    <div className={`page split tables-page ${sel ? "has-panel" : ""}`}>
      <div className="split-main">
        <div className="ph">
          <div>
            <h1>Tables</h1>
            <p className="muted">
              View table status, manage orders and handle customers
            </p>
          </div>
          <div className="row-end trow">
            <button
              className={`btn ${view === "floor" ? "pri" : ""}`}
              onClick={() => setView("floor")}
            >
              <Icon n="grid" /> Floor View
            </button>
            <button
              className={`btn ${view === "list" ? "pri" : ""}`}
              onClick={() => setView("list")}
            >
              <Icon n="list" /> List View
            </button>
            {can("tables.manage") && (
              <button
                className="btn"
                onClick={() => setForm({ name: "", capacity: 4 })}
              >
                <Icon n="plus" /> New Table
              </button>
            )}
          </div>
        </div>
        <div className="tsum">
          {ST.map((k) => (
            <button
              key={k}
              className={`tsum-i ${k} ${flt === k ? "on" : ""}`}
              onClick={() => setFlt(flt === k ? "all" : k)}
            >
              <span>{cap(k)}</span>
              <b>{counts[k] || 0}</b>
            </button>
          ))}
          <div className="occ">
            <span>
              Occupancy{" "}
              <b>
                {all.length
                  ? Math.round(((counts.occupied || 0) / all.length) * 100)
                  : 0}
                %
              </b>
            </span>
            <div className="occ-bar">
              <i
                style={{
                  width: `${all.length ? ((counts.occupied || 0) / all.length) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        </div>
        <Tabs
          value={flt}
          onChange={setFlt}
          items={[
            ["all", `All Tables (${all.length})`],
            ...ST.map((s) => [s, `${cap(s)} (${counts[s] || 0})`]),
          ]}
        />
        {list.error && !list.data ? (
          <ErrorBox msg={list.error} retry={list.reloadFull} />
        ) : !list.data ? (
          <Loading />
        ) : !shown.length ? (
          <Empty icon="table" text="No tables found." />
        ) : view === "floor" ? (
          <div className="floor">
            {shown.map((t, i) => (
              <TableTile
                key={t.id}
                i={i}
                t={t}
                on={sel === t.id}
                onClick={() => setSel(t.id)}
              />
            ))}
          </div>
        ) : (
          <section className="card">
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Table</th>
                    <th>Seats</th>
                    <th>Status</th>
                    <th>Order</th>
                    <th>Since</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((t) => (
                    <tr
                      key={t.id}
                      className={sel === t.id ? "sel" : ""}
                      onClick={() => setSel(t.id)}
                    >
                      <td>
                        <b>{t.name}</b>
                      </td>
                      <td>{t.capacity}</td>
                      <td>
                        <Badge v={t.status} />
                      </td>
                      <td>{t.order ? t.order.bill_no : "-"}</td>
                      <td>{fmtTime(t.status_since)}</td>
                      <td>{t.order ? money(t.order.total) : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        <h3 className="qa-t">Quick Actions</h3>
        <div className="qa">
          <button
            className="btn pri"
            onClick={needSel(() =>
              cur.status === "occupied"
                ? navigate(posPath, { orderId: cur.order.id })
                : cur.status === "out_of_service"
                  ? toast("Table is out of service.", "err")
                  : navigate(posPath, { tableId: cur.id }),
            )}
          >
            <Icon n="plus" /> Open Table
          </button>
          <button
            className="btn"
            onClick={needSel(() =>
              navigate(admin ? "/admin/orders" : "/orders"),
            )}
          >
            <Icon n="list" /> View Orders
          </button>
          <button
            className="btn"
            onClick={needSel(() =>
              setRes({ reserved_for: "", reserved_phone: "", reserved_at: "" }),
            )}
          >
            <Icon n="calendar" /> Reserve Table
          </button>
          <button className="btn" onClick={needSel(() => quick("cleaning"))}>
            <Icon n="sparkle" /> Mark Cleaning
          </button>
          <button className="btn" onClick={needSel(() => quick("available"))}>
            <Icon n="check" /> Mark Available
          </button>
          {can("tables.manage") && (
            <button
              className="btn"
              onClick={needSel(() => quick("out_of_service"))}
            >
              ⊘ Out of Service
            </button>
          )}
          {can("tables.manage") && (
            <button
              className="btn"
              onClick={needSel(() =>
                setForm({ id: cur.id, name: cur.name, capacity: cur.capacity }),
              )}
            >
              <Icon n="edit" /> Edit Table
            </button>
          )}
          {can("tables.manage") && (
            <button className="btn dng" onClick={needSel(del)}>
              <Icon n="trash" /> Delete
            </button>
          )}
        </div>
      </div>
      {sel && (
        <Detail
          id={sel}
          admin={admin}
          onClose={() => setSel(null)}
          refresh={list.reload}
        />
      )}
      {form && (
        <Modal
          title={form.id ? "Edit Table" : "New Table"}
          onClose={() => setForm(null)}
          footer={
            <>
              <button className="btn" onClick={() => setForm(null)}>
                Cancel
              </button>
              <button className="btn pri" onClick={save}>
                Save Table
              </button>
            </>
          }
        >
          <Field
            label="Table name"
            req
            hint="Leave empty to create the next number automatically (T25, T26…)"
          >
            <input
              value={form.name}
              maxLength={50}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. T25"
            />
          </Field>
          <Field label="Seating capacity">
            <input
              type="number"
              min="1"
              max="50"
              value={form.capacity}
              onChange={(e) => setForm({ ...form, capacity: e.target.value })}
            />
          </Field>
        </Modal>
      )}
      {res && (
        <Modal
          title={`Reserve ${cur?.name}`}
          onClose={() => setRes(null)}
          footer={
            <>
              <button className="btn" onClick={() => setRes(null)}>
                Cancel
              </button>
              <button
                className="btn pri"
                onClick={async () => {
                  await quick("reserved", res);
                  setRes(null);
                }}
              >
                Reserve
              </button>
            </>
          }
        >
          <Field label="Customer name" req>
            <input
              value={res.reserved_for}
              onChange={(e) => setRes({ ...res, reserved_for: e.target.value })}
            />
          </Field>
          <Field label="Phone">
            <input
              value={res.reserved_phone}
              onChange={(e) =>
                setRes({ ...res, reserved_phone: e.target.value })
              }
            />
          </Field>
          <Field label="Date & time">
            <input
              type="datetime-local"
              value={res.reserved_at}
              onChange={(e) => setRes({ ...res, reserved_at: e.target.value })}
            />
          </Field>
        </Modal>
      )}
    </div>
  );
}