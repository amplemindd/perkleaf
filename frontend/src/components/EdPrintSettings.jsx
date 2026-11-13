import React, { useCallback, useEffect, useState } from "react";
import Icon from "../lib/icons";
import { Field, Toggle } from "../lib/ui";
import { edPrinters, edPrintTest, edStatus, getEdCfg, setEdCfg } from "../lib/edprint";
// Settings block: print KOT directly to the receipt printer through EDPrintTool (no print dialog).
export default function EdPrintSettings() {
  const [cfg, setCfg] = useState(getEdCfg());
  const [printers, setPrinters] = useState([]);
  const [state, setState] = useState({ kind: "idle", text: "" }); // idle | ok | err | busy
  const save = (patch) => setCfg((c) => { const n = { ...c, ...patch }; setEdCfg(n); return n; });
  const check = useCallback(async () => {
    setState({ kind: "busy", text: "Checking EDPrintTool..." });
    try {
      await edStatus();
      const list = await edPrinters();
      setPrinters(list);
      if (!list.length) { setState({ kind: "err", text: "EDPrintTool is running but no printer is added in it." }); return; }
      const cur = getEdCfg();
      if (!cur.printer || !list.some((p) => p.id === cur.printer)) save({ printer: list[0].id });
      setState({ kind: "ok", text: `Connected. ${list.length} printer(s) found.` });
    } catch (e) {
      setState({ kind: "err", text: e.message });
    }
  }, []);
  useEffect(() => { check(); }, [check]);
  const test = async () => {
    setState({ kind: "busy", text: "Sending test KOT..." });
    try { await edPrintTest(); setState({ kind: "ok", text: "Test KOT sent. Check the printer." }); }
    catch (e) { setState({ kind: "err", text: e.message }); }
  };
  const sel = printers.find((p) => p.id === cfg.printer);
  const lang = sel && sel.settings && sel.settings.language;
  return (
    <div className="form-grid" style={{ marginTop: 18 }}>
      <div style={{ gridColumn: "1 / -1" }}>
        <h3 style={{ margin: "0 0 4px" }}>Direct thermal printing (EDPrintTool)</h3>
        <small className="muted">KOT prints straight to the receipt printer without the print dialog. Saved on this computer only - turn it on only on the PC that has the printer.</small>
      </div>
      <div style={{ gridColumn: "1 / -1" }}>
        <Toggle checked={cfg.on} onChange={(v) => save({ on: v })} label="Use EDPrintTool for KOT printing on this computer" />
      </div>
      <Field label="EDPrintTool address">
        <input value={cfg.url} onChange={(e) => save({ url: e.target.value })} placeholder="http://localhost:8189" />
      </Field>
      <Field label="Printer">
        <select value={cfg.printer} onChange={(e) => save({ printer: e.target.value })}>
          {!printers.length && <option value={cfg.printer}>{cfg.printer || "(click Check connection)"}</option>}
          {printers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
      {lang && lang !== "ESC/POS" && (
        <div className="errbox" style={{ gridColumn: "1 / -1" }}>
          <Icon n="alert" /> This printer is set to <b>{lang}</b> in EDPrintTool. Open EDPrintTool, select the printer, press <b>Settings</b> and change Language to <b>ESC/POS</b> (paper 80mm), then Save.
        </div>
      )}
      <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="btn" onClick={check}>Check connection</button>
        <button type="button" className="btn pri" onClick={test} disabled={!cfg.printer}><Icon n="print" size={15} /> Test KOT print</button>
        {state.text && <small style={{ color: state.kind === "err" ? "#c0392b" : state.kind === "ok" ? "#1e7e34" : undefined, fontWeight: 600 }}>{state.text}</small>}
      </div>
    </div>
  );
}