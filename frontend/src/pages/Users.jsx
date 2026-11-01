import Icon from "../lib/icons";
import React, { useEffect, useState } from "react";
import { api, cap, fmtDT, fmtDate } from "../lib/api";
import { useAuth, useFetch, useUI } from "../lib/store";
import { Avatar, Badge, ErrorBox, Loading, Panel, Tabs } from "../lib/ui";
import StaffForm, { blankStaff, staffToForm } from "../components/StaffForm";
import "../styles/users.css";


export default function Users() {
  const { user } = useAuth();
  const { toast, ask } = useUI();
  const users = useFetch("/users");
  const roles = useFetch("/roles");
  const [tab, setTab] = useState("users");
  const [form, setForm] = useState(null);
  const [role, setRole] = useState("manager");
  const [perms, setPerms] = useState([]);
  const rl = roles.data?.roles || [];
  useEffect(() => { const r = rl.find((x) => x.name === role); if (r) setPerms(r.permissions); }, [roles.data, role]); // eslint-disable-line
  const savePerms = async () => { try { await api(`/roles/${role}`, { method: "PUT", body: { permissions: perms } }); toast("Permissions saved."); roles.reload(); } catch (e) { toast(e.message, "err"); } };
  const addRole = async () => { const name = await ask("Name of the new role (letters and numbers):", { input: true, okText: "Create", title: "New role" }); if (name) try { await api("/roles", { method: "POST", body: { name } }); roles.reload(); setRole(name.toLowerCase().replace(/[^a-z0-9_-]/g, "")); } catch (e) { toast(e.message, "err"); } };
  if (users.error && !users.data) return <div className="page"><ErrorBox msg={users.error} retry={users.reloadFull} /></div>;
  return (
    <div className="page">
      <div className="ph"><div><h1>Staff / Users</h1><p className="muted">Create staff accounts and control what each role can do. Permissions are enforced by the server.</p></div>{tab === "users" && <button className="btn pri" onClick={() => setForm({ ...blankStaff })}><Icon n="plus" /> Add User</button>}</div>
      <Tabs value={tab} onChange={setTab} items={[["users", "Users"], ["roles", "Roles & Permissions"]]} />
      {tab === "users" && <section className="card"><div className="table-wrap">{!users.data ? <Loading /> : (
        <table className="tbl"><thead><tr><th>#</th><th>Name</th><th>Email</th><th>Role</th><th>Joining date</th><th>Last login</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>{users.data.users.map((u, i) => <tr key={u.id}><td>{i + 1}</td><td><Avatar name={u.name} size={28} /> <b>{u.name}</b>{u.id === user.id && <small className="muted"> (you)</small>}</td><td>{u.email}</td><td><Badge kind="green">{cap(u.role)}</Badge></td><td>{u.joining_date ? fmtDate(String(u.joining_date).slice(0, 10)) : "-"}</td><td>{u.last_login ? fmtDT(u.last_login) : "Never"}</td><td><Badge kind={u.is_active ? "green" : "gray"}>{u.is_active ? "Active" : "Disabled"}</Badge></td>
            <td><button className="btn sm" onClick={() => setForm(staffToForm(u))}><Icon n="edit" /> Edit</button></td></tr>)}</tbody></table>)}</div></section>}
      {tab === "roles" && (!roles.data ? <Loading /> : (
        <Panel title="Roles & Permissions" right={<button className="btn sm" onClick={addRole}><Icon n="plus" /> New role</button>}>
          <div className="tabs">{rl.map((r) => <button key={r.name} className={`tab ${role === r.name ? "on" : ""}`} onClick={() => setRole(r.name)}>{cap(r.name)}</button>)}</div>
          {role === "admin" && <p className="note">The admin role always has full access.</p>}
          <div className="perm-grid">{roles.data.permissions.map((p) => <label key={p.key} className="perm"><input type="checkbox" disabled={role === "admin"} checked={perms.includes(p.key)} onChange={(e) => setPerms(e.target.checked ? [...perms, p.key] : perms.filter((x) => x !== p.key))} /> {p.label}</label>)}</div>
          {role === "cashier" && <p className="note">The cashier role is also used by the public POS screen (no login). Keep it limited.</p>}
          <div className="sp-actions"><button className="btn pri" disabled={role === "admin"} onClick={savePerms}>Save Permissions</button></div></Panel>))}
      {form && <StaffForm initial={form} roles={rl} onClose={() => setForm(null)} onSaved={() => { setForm(null); users.reload(); }} />}
    </div>
  );
}
