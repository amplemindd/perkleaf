import React, { useState } from "react";
import Icon from "../lib/icons";
import { api, fmtDT, fmtDate, img } from "../lib/api";
import { useFetch, useShell, useUI } from "../lib/store";
import { Avatar, Badge, Empty, ErrorBox, Loading, Modal, Stat } from "../lib/ui";
import StaffForm, { blankStaff, staffToForm } from "../components/StaffForm";

const Row = ({ k, v }) => <div className="kv"><span>{k}</span><b>{v || "-"}</b></div>;

export default function Waiters() {
  const { toast, ask } = useUI();
  const { search } = useShell();
  const users = useFetch("/users");
  const roles = useFetch("/roles");
  const stats = useFetch("/waiters/stats", null, [], 20000);
  const [form, setForm] = useState(null);
  const [view, setView] = useState(null);
  const all = (users.data?.users || []).filter((u) => u.role === "waiter");
  const list = all.filter((u) => `${u.name} ${u.phone || ""}`.toLowerCase().includes(search.trim().toLowerCase()));
  const st = (id) => (stats.data?.stats || []).find((x) => x.waiter_id === id) || { kots: 0, today: 0 };
  const refresh = () => { users.reload(); stats.reload(); };
  const toggle = async (u) => { try { await api(`/users/${u.id}`, { method: "PUT", body: { ...staffToForm(u), is_active: !u.is_active } }); toast(u.is_active ? "Waiter disabled." : "Waiter enabled."); refresh(); setView(null); } catch (e) { toast(e.message, "err"); } };
  const resetPw = async (u) => { const pw = await ask(`Set a new password for ${u.name} (at least 8 characters):`, { input: true, okText: "Save password", title: "Reset password" }); if (pw) try { await api(`/users/${u.id}`, { method: "PUT", body: { ...staffToForm(u), password: pw } }); toast("Password changed."); } catch (e) { toast(e.message, "err"); } };
  if (users.error && !users.data) return <div className="page"><ErrorBox msg={users.error} retry={users.reloadFull} /></div>;
  return (
    <div className="page">
      <div className="ph"><div><h1>Waiters</h1><p className="muted">Create waiter logins (mobile number + password) and keep their complete details in one place.</p></div>
        <div className="row-end"><a className="btn" href="/waiter-login" target="_blank" rel="noreferrer"><Icon n="external" size={15} /> Waiter login page</a><button className="btn pri" onClick={() => setForm({ ...blankStaff, role: "waiter" })}><Icon n="plus" size={15} /> Add Waiter</button></div></div>
      <div className="kpis"><Stat icon="users" label="Total waiters" value={String(all.length)} /><Stat icon="check" label="Active" value={String(all.filter((u) => u.is_active).length)} tone="blue" /><Stat icon="file" label="KOTs sent today" value={String((stats.data?.stats || []).reduce((s, x) => s + Number(x.today || 0), 0))} tone="amber" /></div>
      {!users.data ? <Loading /> : !list.length ? <Empty icon="users" text={all.length ? "No waiter matches your search." : "No waiters yet. Add your first waiter."} /> : (
        <div className="wgrid">
          {list.map((u, i) => (
            <article className={`wcard ${u.is_active ? "" : "off"}`} key={u.id} style={{ "--i": i }}>
              <div className="wc-top">{u.photo_image ? <img className="wc-ph" src={img(u.photo_image)} alt="" /> : <Avatar name={u.name} size={64} />}
                <div><b>{u.name}</b><small><Icon n="phone" size={13} /> {u.phone || "-"}</small><Badge kind={u.is_active ? "green" : "gray"}>{u.is_active ? "Active" : "Disabled"}</Badge></div></div>
              <div className="wc-st"><div><b>{st(u.id).today}</b><small>KOTs today</small></div><div><b>{st(u.id).kots}</b><small>Total KOTs</small></div><div><b>{u.joining_date ? fmtDate(String(u.joining_date).slice(0, 10)) : "-"}</b><small>Joined</small></div></div>
              <div className="wc-act"><button className="btn pri" onClick={() => setView(u)}>View details</button><button className="btn" onClick={() => setForm(staffToForm(u))} aria-label="Edit"><Icon n="edit" size={15} /></button><button className="btn" onClick={() => resetPw(u)} aria-label="Reset password" title="Reset password"><Icon n="lock" size={15} /></button></div>
            </article>))}
        </div>
      )}
      {view && (
        <Modal wide title={`${view.name} · details`} onClose={() => setView(null)} footer={<><button className={`btn ${view.is_active ? "dng" : ""}`} onClick={() => toggle(view)}>{view.is_active ? "Disable account" : "Enable account"}</button><button className="btn" onClick={() => { const f = staffToForm(view); setView(null); setForm(f); }}>Edit</button><button className="btn pri" onClick={() => setView(null)}>Close</button></>}>
          <div className="wd-head">{view.photo_image ? <img className="wc-ph big" src={img(view.photo_image)} alt="" /> : <Avatar name={view.name} size={90} />}
            <div><h3>{view.name}</h3><Badge kind={view.is_active ? "green" : "gray"}>{view.is_active ? "Active" : "Disabled"}</Badge><p className="muted">Login ID: {view.phone}</p></div></div>
          <h4 className="fsec">Personal</h4><Row k="Mobile number" v={view.phone} /><Row k="Joining date" v={view.joining_date ? fmtDate(String(view.joining_date).slice(0, 10)) : ""} /><Row k="Last login" v={view.last_login ? fmtDT(view.last_login) : "Never"} /><Row k="Aadhaar number" v={view.aadhaar_no} />
          <div className="wd-imgs"><div><small>Aadhaar card</small>{view.aadhaar_image ? <a href={img(view.aadhaar_image)} target="_blank" rel="noreferrer"><img src={img(view.aadhaar_image)} alt="Aadhaar card" /></a> : <span className="muted">Not uploaded</span>}</div></div>
          <h4 className="fsec">Bank</h4><Row k="Bank name" v={view.bank_name} /><Row k="Branch" v={view.branch_name} /><Row k="Account number" v={view.bank_account_no} /><Row k="IFSC code" v={view.ifsc_code} />
          <div className="wd-imgs"><div><small>Passbook photo</small>{view.passbook_image ? <a href={img(view.passbook_image)} target="_blank" rel="noreferrer"><img src={img(view.passbook_image)} alt="Passbook" /></a> : <span className="muted">Not uploaded</span>}</div></div>
        </Modal>
      )}
      {form && <StaffForm initial={form} roles={roles.data?.roles || []} fixedRole="waiter" onClose={() => setForm(null)} onSaved={() => { setForm(null); refresh(); }} />}
    </div>
  );
}
