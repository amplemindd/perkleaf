import React, { useState } from "react";
import { api, cap, img } from "../lib/api";
import { useUI } from "../lib/store";
import { Field, ImagePick, Modal, Toggle } from "../lib/ui";

export const blankStaff = { name: "", email: "", phone: "", role: "cashier", password: "", is_active: true, joining_date: "", aadhaar_no: "", aadhaar_image: "", aadhaar_image_data: "", remove_aadhaar_image: false,
  bank_name: "", bank_account_no: "", ifsc_code: "", branch_name: "", passbook_image: "", passbook_image_data: "", remove_passbook_image: false, photo_image: "", photo_image_data: "", remove_photo_image: false };
export const staffToForm = (u) => ({ ...blankStaff, ...u, phone: u.phone || "", password: "", is_active: !!u.is_active, joining_date: u.joining_date ? String(u.joining_date).slice(0, 10) : "", aadhaar_no: u.aadhaar_no || "",
  bank_name: u.bank_name || "", bank_account_no: u.bank_account_no || "", ifsc_code: u.ifsc_code || "", branch_name: u.branch_name || "", aadhaar_image: u.aadhaar_image || "", passbook_image: u.passbook_image || "", photo_image: u.photo_image || "" });

// Add / edit staff (cashier, manager, waiter ...). For a waiter the mobile number is the login ID.
export default function StaffForm({ initial, roles, fixedRole, onClose, onSaved }) {
  const { toast } = useUI();
  const [form, setForm] = useState({ ...initial, role: fixedRole || initial.role });
  const [busy, setBusy] = useState(false);
  const isW = form.role === "waiter";
  const up = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const pic = (k) => ({ value: form[`${k}_data`] || (form[k] && !form[`remove_${k}`] ? img(form[k]) : ""), onChange: (v) => setForm({ ...form, [`${k}_data`]: v, [`remove_${k}`]: !v }) });
  const save = async () => {
    setBusy(true);
    try {
      const body = { ...form };
      if (isW) body.email = `w${String(form.phone).replace(/\D/g, "").slice(-10)}@waiter.local`;
      await api(form.id ? `/users/${form.id}` : "/users", { method: form.id ? "PUT" : "POST", body });
      toast(isW ? "Waiter saved." : "Staff saved."); onSaved();
    } catch (e) { toast(e.message, "err"); } finally { setBusy(false); }
  };
  return (
    <Modal wide title={`${form.id ? "Edit" : "Add"} ${isW ? "Waiter" : "Staff"}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn pri" disabled={busy} onClick={save}>{busy ? "Saving…" : `Save ${isW ? "Waiter" : "Staff"}`}</button></>}>
      <h4 className="fsec">Account</h4>
      <Field label="Full name" req><input value={form.name} maxLength={100} onChange={up("name")} /></Field>
      <div className="two">
        {isW ? <Field label="Mobile number (login ID)" req hint="10 digits. The waiter logs in with this number."><input inputMode="numeric" maxLength={14} value={form.phone} onChange={up("phone")} /></Field>
          : <Field label="Email" req><input type="email" value={form.email} onChange={up("email")} /></Field>}
        {isW ? <Field label={form.id ? "New password (optional)" : "Password"} req={!form.id} hint="At least 8 characters"><input type="password" autoComplete="new-password" value={form.password} onChange={up("password")} /></Field>
          : <Field label="Phone"><input value={form.phone} maxLength={20} onChange={up("phone")} /></Field>}
      </div>
      {!isW && <div className="two"><Field label="Role" req><select value={form.role} onChange={up("role")}>{roles.map((r) => <option key={r.name} value={r.name}>{cap(r.name)}</option>)}</select></Field>
        <Field label={form.id ? "New password (optional)" : "Password"} req={!form.id} hint="At least 8 characters"><input type="password" autoComplete="new-password" value={form.password} onChange={up("password")} /></Field></div>}
      <div className="two"><Field label="Joining date"><input type="date" value={form.joining_date} onChange={up("joining_date")} /></Field><div className="fld"><span>Status</span><Toggle checked={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} label="Account active" /></div></div>
      <div className="fld"><span>Profile photo</span><ImagePick label="Upload photo" {...pic("photo_image")} /></div>

      <h4 className="fsec">Identity</h4>
      <Field label="Aadhaar card number" hint="12 digits"><input inputMode="numeric" maxLength={14} value={form.aadhaar_no} onChange={up("aadhaar_no")} placeholder="XXXX XXXX XXXX" /></Field>
      <div className="fld"><span>Aadhaar card image</span><ImagePick label="Upload Aadhaar image" {...pic("aadhaar_image")} /></div>

      <h4 className="fsec">Bank details</h4>
      <div className="two"><Field label="Bank name"><input value={form.bank_name} maxLength={100} onChange={up("bank_name")} /></Field><Field label="Branch name"><input value={form.branch_name} maxLength={100} onChange={up("branch_name")} /></Field></div>
      <div className="two"><Field label="Bank account number" hint="9 to 18 digits"><input inputMode="numeric" maxLength={18} value={form.bank_account_no} onChange={up("bank_account_no")} /></Field>
        <Field label="IFSC code" hint="e.g. SBIN0001234"><input maxLength={11} value={form.ifsc_code} onChange={(e) => setForm({ ...form, ifsc_code: e.target.value.toUpperCase() })} /></Field></div>
      <div className="fld"><span>Passbook photo</span><ImagePick label="Upload passbook photo" {...pic("passbook_image")} /></div>
      <p className="note">Aadhaar and bank details are visible only to users who can manage staff.</p>
    </Modal>
  );
}
