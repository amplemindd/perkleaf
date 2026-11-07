import Icon from "../lib/icons";
import React, { useEffect, useState } from "react";
import { api, downloadFile, fmtDT, img, ORIGIN } from "../lib/api";
import PlatIcon from "../components/PlatIcon";
import { A, useAuth, useFetch, useUI } from "../lib/store";
import { Field, ImagePick, Panel, Toggle } from "../lib/ui";
import { FONTS, fontStack } from "../i18n/fonts";
import { setLanguage } from "../i18n";
import { COLOR_CHOICES, applyAppearance, effective, localSet } from "../lib/borders";

const TZ = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "America/New_York", "UTC"];
const opt = (a) => a.map((x) => (Array.isArray(x) ? x : [x, x]));
const SEC = {
  info: ["Restaurant Information", "Basic information about your café", [["company_name", "Company / software name (waiter app)", "text"], ["restaurant_name", "Restaurant Name * (shown in the header)", "text"], ["qr_brand_name", "Customer QR Brand Name (shown on table QR)", "text"], ["tagline", "Tagline (shown under the name)", "text"], ["phone", "Phone Number", "text"], ["support_phone", "Support phone (waiter Call Support)", "text"], ["support_whatsapp", "Support WhatsApp number (waiter Chat Support)", "text"], ["email", "Email Address", "text"], ["address", "Address", "area"], ["gstin", "GSTIN (tax registration)", "text"]]],
  business: ["Business Settings", "Configure business hours and basic options", [["timezone", "Time Zone", "select", opt(TZ)], ["open_time", "Open Time", "time"], ["close_time", "Close Time", "time"], ["week_off", "Week Off", "select", opt(["None", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"])],
    ["dine_in_enabled", "Dine In Enabled", "bool"], ["takeaway_enabled", "Takeaway (Pick Up) Enabled", "bool"], ["delivery_enabled", "Delivery Enabled", "bool"], ["online_enabled", "Online Orders", "bool"]]],
  theme: ["Theme & Appearance", "Customize the look and feel", [["dark_mode", "Dark Mode", "bool"], ["border_color", "Border Colour", "select", opt(COLOR_CHOICES.map((c) => [c.value, c.label]))], ["icon_color", "Icon Colour", "select", opt(COLOR_CHOICES.map((c) => [c.value, c.label]))], ["sidebar_style", "Sidebar Style", "select", opt([["expanded", "Expanded"], ["collapsed", "Collapsed"]])], ["font", "Primary Font", "select", opt(FONTS.map((f) => [f.value, f.label]))],
    ["language", "Language", "select", opt([["English", "English"], ["Hindi", "हिन्दी (Hindi)"], ["Marathi", "मराठी (Marathi)"]])], ["date_format", "Date Format", "select", opt(["DD Mon YYYY", "DD/MM/YYYY", "MM/DD/YYYY"])], ["currency", "Currency", "select", opt([["INR", "INR (₹)"]])]]],
  pos: ["POS Settings", "Configure billing and order settings", [["auto_print", "Auto Print Bill", "bool"], ["auto_tax", "Auto Calculate Tax", "bool"], ["allow_discounts", "Allow Discounts", "bool"], ["require_table", "Require Table Selection (Dine In)", "bool"],
    ["default_order_type", "Default Order Type", "select", opt([["dine_in", "Dine In"], ["pickup", "Pick Up"], ["delivery", "Delivery"]])], ["default_payment_method", "Default Payment Method", "select", opt([["cash", "Cash"], ["upi", "UPI"], ["card", "Card"]])],
    ["bill_prefix", "Bill Number Prefix", "text"], ["bill_start", "Bill Start From", "num"], ["discount_limit_cashier", "Max discount for cashiers (%)", "num"], ["table_after_bill", "After payment, table becomes", "select", opt([["available", "Available"], ["cleaning", "Cleaning"]])], ["loyalty_per_100", "Loyalty points per ₹100", "num"]]],
  tax: ["Tax / GST Settings", "Configure default tax settings (rates are managed in Taxes / GST)", [["tax_enabled", "Enable GST", "bool"], ["tax_mode", "Inclusive / Exclusive", "select", opt([["exclusive", "Exclusive (add on bill)"], ["inclusive", "Inclusive (in price)"]])], ["round_off", "Round Off Amount", "select", opt([["nearest1", "Nearest 1"], ["none", "None"]])], ["show_tax_on_bill", "Show GST Details in Bill", "bool"]]],
  pay: ["Payment Methods", "Enable or disable payment options", [["pm_cash", "Cash", "bool"], ["pm_upi", "UPI (PhonePe, GPay, Paytm)", "bool"], ["pm_card", "Card Payment", "bool"], ["pm_wallet", "Wallet", "bool"], ["pm_split", "Split Payment", "bool"], ["pm_qr", "Show QR Code in POS", "bool"], ["upi_id", "UPI ID (shown with the QR)", "text"]]],
  receipt: ["Receipt & Invoice Settings", "Customize your bill / receipt format", [["show_logo", "Show Logo in Bill", "bool"], ["show_restaurant_details", "Show Restaurant Details", "bool"], ["show_gst_details", "Show GST Details", "bool"], ["show_thanks", "Show Thank You Message", "bool"], ["footer_message", "Bill Footer Message", "area"], ["paper_size", "Bill Paper Size", "select", opt([["80mm", "80mm (Thermal Printer)"], ["58mm", "58mm (Thermal Printer)"]])]]],
  tables: ["Table Settings", "Defaults used when adding tables", [["default_table_capacity", "Default table capacity", "num"], ["table_prefix", "Table name prefix", "text"]]],
  notif: ["Notification Settings", "Configure system notifications", [["n_new_order", "New Order Notification", "bool"], ["n_low_stock", "Low Stock Alert", "bool"], ["n_payment", "Payment Notification", "bool"], ["n_table", "Table Status Alerts", "bool"], ["n_daily_report", "Daily Report Ready", "bool"], ["n_expense", "Expense Alert", "bool"], ["n_system", "System Notifications", "bool"], ["high_expense_threshold", "High expense alert at (₹)", "num"]]],
  system: ["System Settings", "Access and automation", [["public_front", "Allow the public POS screen without login (cashier mode)", "bool"], ["backup_auto", "Auto Backup", "bool"], ["backup_frequency", "Backup Frequency", "select", opt([["daily", "Daily"], ["weekly", "Weekly"]])], ["backup_retention", "Keep backups for (days)", "num"]]],
};
const TABS = [["general", "General", "gear", ["info", "business", "theme"]], ["info", "Restaurant Info", "store", ["info"]], ["pos", "POS Settings", "monitor", ["pos"]], ["tax", "Tax / GST", "percent", ["tax"]], ["pay", "Payment Methods", "card", ["pay"]], ["receipt", "Receipt & Invoice", "receipt", ["receipt"]], ["tables", "Table Settings", "table", ["tables"]], ["users", "Users & Roles", "users", []], ["notif", "Notification Settings", "bell", ["notif"]], ["system", "System Settings", "tool", ["system"]], ["integr", "Integrations", "globe", []], ["backup", "Backup & Data", "save", []]];

export default function Settings() {
  const { settings, refresh, can } = useAuth();
  const { toast, ask } = useUI();
  const [s, setS] = useState({ ...settings, border_color: effective(settings, "border_color"), icon_color: effective(settings, "icon_color") });
  const [tab, setTab] = useState("general");
  const [logo, setLogo] = useState("");
  const [qr, setQr] = useState("");
  const [busy, setBusy] = useState(false);
  const rates = useFetch(can("taxes") ? "/taxes" : "");
  const backups = useFetch(can("backup") ? "/backups" : "");
  const set = (k, v) => setS((x) => ({ ...x, [k]: v }));
  // Live preview of dark mode / font / language while editing (reverts if you leave without saving)
  useEffect(() => {
    const el = document.documentElement;
    el.dataset.theme = s.dark_mode ? "dark" : "light";
    el.style.setProperty("--font", fontStack(s.font));
    setLanguage(s.language || "English");
    applyAppearance(s);
  }, [s.dark_mode, s.font, s.language, s.border_color, s.icon_color]);
  useEffect(() => () => {
    const el = document.documentElement;
    el.dataset.theme = settings.dark_mode ? "dark" : "light";
    el.style.setProperty("--font", fontStack(settings.font));
    setLanguage(settings.language || "English");
    applyAppearance(settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);
  const save = async () => {
    setBusy(true);
    try {
      const body = { settings: s };
      if (logo === "remove") body.remove_logo = true; else if (logo) body.logo_data = logo;
      if (qr === "remove") body.remove_qr = true; else if (qr) body.qr_data = qr;
      const r = await api("/settings", { method: "PUT", body });
      localSet("border_color", s.border_color); localSet("icon_color", s.icon_color);
      toast("Settings saved."); setS({ ...r.settings, border_color: s.border_color || "default", icon_color: s.icon_color || "default" }); setLogo(""); setQr(""); await refresh();
    } catch (e) { toast(e.message, "err"); } finally { setBusy(false); }
  };
  const field = ([k, label, t, o]) => {
    if (t === "bool") return <Toggle key={k} checked={!!s[k]} onChange={(v) => set(k, v)} label={label} />;
    return (
      <Field key={k} label={label}>
        {t === "area" ? <textarea rows={3} value={s[k] || ""} onChange={(e) => set(k, e.target.value)} />
          : t === "select" ? <select value={s[k]} onChange={(e) => set(k, e.target.value)}>{o.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          : <input type={t === "num" ? "number" : t === "time" ? "time" : "text"} min={t === "num" ? 0 : undefined} value={s[k] ?? ""} onChange={(e) => set(k, t === "num" ? e.target.value : e.target.value)} />}
      </Field>
    );
  };
  const t = TABS.find((x) => x[0] === tab);
  const mk = async () => { try { const r = await api("/backups", { method: "POST" }); toast(r.message); backups.reload(); } catch (e) { toast(e.message, "err"); } };
  const restore = async (b) => { const c = await ask(`This replaces ALL current data with backup ${b.filename}. Type RESTORE to confirm.`, { input: true, danger: true, okText: "Restore", title: "Restore backup" }); if (c) try { const r = await api(`/backups/${b.id}/restore`, { method: "POST", body: { confirm: c } }); toast(r.message); refresh(); } catch (e) { toast(e.message, "err"); } };
  return (
    <div className="page">
      <div className="ph"><div><h1><Icon n="gear" /> Settings</h1><p className="muted">Manage your café system settings, preferences and configurations</p></div><button className="btn pri" disabled={busy} onClick={save}><Icon n="save" /> {busy ? "Saving…" : "Save Changes"}</button></div>
      <div className="stabs">{TABS.map(([k, l, ic]) => <button key={k} className={`stab ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}><Icon n={ic} size={20} />{l}</button>)}</div>
      <div className="sgrid">
        {t[3].map((k) => (
          <Panel key={k} title={SEC[k][0]} right={<small className="muted">{SEC[k][1]}</small>}>
            {k === "info" && <div className="logo-row"><div><b>Logo (optional)</b><ImagePick value={logo && logo !== "remove" ? logo : logo === "remove" ? "" : img(s.logo_url)} onChange={(v) => setLogo(v || "remove")} label="Upload logo" /></div></div>}
            {k === "tax" && <Field label="Default GST Rate"><select value={s.default_tax_rate_id} onChange={(e) => set("default_tax_rate_id", Number(e.target.value))}><option value={0}>None (0%)</option>{(rates.data?.rates || []).filter((r) => r.is_active).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>}
            <div className="form-grid">{SEC[k][2].map(field)}</div>
            {k === "theme" && [["border_color", "Border Colour"], ["icon_color", "Icon Colour"]].map(([key, label]) => (
              <div className="border-swatches" key={key}>
                <small className="muted">{label}</small>
                <div className="bsw-row">
                  {COLOR_CHOICES.map((c) => (
                    <button key={c.value} type="button" title={c.label} aria-label={`${label}: ${c.label}`}
                      className={`bsw ${(s[key] || "default") === c.value ? "on" : ""}`}
                      style={{ "--sw": c.hex || "#15803d" }} onClick={() => set(key, c.value)} />
                  ))}
                </div>
              </div>
            ))}
            {k === "theme" && (
              <div className="font-preview" style={{ fontFamily: fontStack(s.font) }}>
                <small className="muted">Font Preview</small>
                <div className="fp-big">Brew &amp; Bite – Café POS 0123456789 ₹</div>
                <div className="fp-dev">ब्रू अँड बाइट – कैफ़े पीओएस · नमस्कार, आपले स्वागत आहे</div>
              </div>
            )}
            {k === "pay" && <div className="qrrow"><b>UPI QR code (optional)</b><ImagePick value={qr && qr !== "remove" ? qr : qr === "remove" ? "" : img(s.qr_image_url)} onChange={(v) => setQr(v || "remove")} label="Upload QR image" /></div>}
          </Panel>
        ))}
        {tab === "users" && <Panel title="Users & Roles"><p>Create staff accounts, assign roles and choose what each role can access.</p><A to="/admin/users" className="btn pri">Open Staff / Users <Icon n="arrowr" /></A></Panel>}
        {tab === "integr" && ["swiggy", "zomato"].map((p) => (
          <Panel key={p} title={`${p === "swiggy" ? "Swiggy" : "Zomato"} integration`} right={<PlatIcon p={p} size={34} />}>
            <p className="muted">Add the details you receive from {p === "swiggy" ? "Swiggy" : "Zomato"}. Until then you can add their orders by hand from Online Orders.</p>
            <Toggle checked={!!s[`${p}_enabled`]} onChange={(v) => set(`${p}_enabled`, v)} label={`Enable ${p === "swiggy" ? "Swiggy" : "Zomato"} orders`} />
            <Toggle checked={!!s[`${p}_auto_accept`]} onChange={(v) => set(`${p}_auto_accept`, v)} label="Auto-accept incoming orders" />
            <Field label="Restaurant / Store ID"><input value={s[`${p}_store_id`] || ""} maxLength={100} onChange={(e) => set(`${p}_store_id`, e.target.value)} /></Field>
            <Field label="API key" hint="Shown as ******** once saved. Type a new value to replace it."><input type="password" autoComplete="new-password" value={s[`${p}_api_key`] || ""} onChange={(e) => set(`${p}_api_key`, e.target.value)} /></Field>
            <Field label="Webhook secret" hint="Give this to the platform. Incoming orders must send it in the x-webhook-secret header."><input type="password" autoComplete="new-password" value={s[`${p}_webhook_secret`] || ""} onChange={(e) => set(`${p}_webhook_secret`, e.target.value)} /></Field>
            <Field label="Webhook URL (give this to the platform)"><input readOnly value={`${ORIGIN}/api/online/webhook/${p}`} onFocus={(e) => e.target.select()} /></Field>
            <p className="note">Developers: the platform-specific code goes in backend-node/lib/aggregators.js (normalize and pushStatus).</p>
          </Panel>
        ))}
        {tab === "backup" && (
          <Panel title="Backup & Data" right={<button className="btn pri sm" onClick={mk}>Create Backup Now</button>}>
            {!can("backup") ? <p className="muted">You do not have permission to manage backups.</p> : <>
              <p className="muted">Backups are JSON snapshots of your business data (menu, orders, customers, expenses, settings). Restoring replaces all current data.</p>
              <table className="tbl sm"><thead><tr><th>File</th><th>Created</th><th>Size</th><th>By</th><th /></tr></thead><tbody>{(backups.data?.backups || []).map((b) => <tr key={b.id}><td>{b.filename}</td><td>{fmtDT(b.created_at)}</td><td>{Math.round(b.size / 1024)} KB</td><td>{b.created_by}</td>
                <td className="macts"><button className="btn sm" onClick={() => downloadFile(`/backups/${b.id}/download`, b.filename).catch((e) => toast(e.message, "err"))}><Icon n="download" /></button><button className="btn sm dng" onClick={() => restore(b)}>Restore</button></td></tr>)}</tbody></table>
              {!(backups.data?.backups || []).length && <p className="muted">No backups yet.</p>}</>}
          </Panel>
        )}
      </div>
    </div>
  );
}