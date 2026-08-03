import { useEffect, useState } from "react";
import { api } from "./api";
import { Alert, Button, Card, Field, RiskBadge, Spinner, fmtDate, inputCls } from "./ui";

export default function AdminPortal({ tab }) {
  if (tab === "users") return <Users />;
  if (tab === "records") return <Records />;
  if (tab === "model") return <Model />;
  if (tab === "reports") return <Reports />;
  if (tab === "activity") return <Activity />;
  return null;
}

function Users() {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const load = () => api("/api/admin/users").then(setUsers).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const patch = async (id, body) => {
    setMsg(""); setError("");
    try {
      await api(`/api/admin/users/${id}`, { method: "PATCH", body });
      load();
    } catch (e) { setError(e.message); }
  };

  const remove = async (id) => {
    if (!confirm("Delete this user and all their data?")) return;
    try {
      await api(`/api/admin/users/${id}`, { method: "DELETE" });
      setMsg("User deleted.");
      load();
    } catch (e) { setError(e.message); }
  };

  if (!users) return error ? <Alert>{error}</Alert> : <p className="text-slate-500 text-sm">Loading…</p>;

  return (
    <Card title="Manage Users">
      <Alert>{error}</Alert>
      <Alert kind="success">{msg}</Alert>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-slate-400 border-b border-slate-200">
              <th className="py-2 pr-4">Name</th><th className="pr-4">Email</th><th className="pr-4">Role</th>
              <th className="pr-4">Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="py-2.5 pr-4 font-medium text-slate-800">{u.full_name}</td>
                <td className="pr-4 text-slate-500">{u.email}</td>
                <td className="pr-4 capitalize">{u.role}</td>
                <td className="pr-4">
                  {u.is_blocked ? (
                    <span className="text-xs font-bold text-red-600">BLOCKED</span>
                  ) : u.role === "doctor" && !u.is_verified ? (
                    <span className="text-xs font-bold text-amber-600">PENDING VERIFICATION</span>
                  ) : (
                    <span className="text-xs font-bold text-green-600">ACTIVE</span>
                  )}
                </td>
                <td>
                  <div className="flex gap-2 py-1">
                    {u.role === "doctor" && !u.is_verified && (
                      <Button variant="success" onClick={() => patch(u.id, { is_verified: true })}>Verify</Button>
                    )}
                    {u.role !== "admin" && (
                      <>
                        <Button variant="subtle" onClick={() => patch(u.id, { is_blocked: !u.is_blocked })}>
                          {u.is_blocked ? "Unblock" : "Block"}
                        </Button>
                        <Button variant="danger" onClick={() => remove(u.id)}>Delete</Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Records() {
  const [records, setRecords] = useState(null);
  const [error, setError] = useState("");

  const load = () => api("/api/admin/records").then(setRecords).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const remove = async (id) => {
    if (!confirm("Delete this health record?")) return;
    try {
      await api(`/api/admin/records/${id}`, { method: "DELETE" });
      load();
    } catch (e) { setError(e.message); }
  };

  if (!records) return error ? <Alert>{error}</Alert> : <p className="text-slate-500 text-sm">Loading…</p>;

  return (
    <Card title="Manage Patient Records">
      <Alert>{error}</Alert>
      {records.length === 0 && <p className="text-sm text-slate-500">No records stored.</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-slate-400 border-b border-slate-200">
              <th className="py-2 pr-4">Date</th><th className="pr-4">Patient</th>
              <th className="pr-4">Result</th><th className="pr-4">Reviewed</th><th></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {records.map((r) => (
              <tr key={r.id}>
                <td className="py-2.5 pr-4 text-slate-600">{fmtDate(r.created_at)}</td>
                <td className="pr-4">
                  <div className="font-medium text-slate-800">{r.patient}</div>
                  <div className="text-xs text-slate-400">{r.email}</div>
                </td>
                <td className="pr-4">
                  <RiskBadge classification={r.risk_classification} probability={r.risk_probability} />
                </td>
                <td className="pr-4 text-xs">{r.reviewed ? "Yes" : "No"}</td>
                <td><Button variant="danger" onClick={() => remove(r.id)}>Delete</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Model() {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [threshold, setThreshold] = useState("");
  const [thresholdMed, setThresholdMed] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () =>
    api("/api/admin/model").then((d) => {
      setInfo(d);
      setThreshold(String(d.risk_threshold));
      setThresholdMed(String(d.risk_threshold_medium ?? 0.4));
    }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const act = async (fn) => {
    setBusy(true); setError(""); setMsg("");
    try {
      const res = await fn();
      setMsg(res.message);
      load();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  if (!info) return error ? <Alert>{error}</Alert> : <p className="text-slate-500 text-sm">Loading…</p>;

  const meta = info.metadata || {};
  return (
    <div className="space-y-6">
      <Alert>{error}</Alert>
      <Alert kind="success">{msg}</Alert>

      <Card title="Current AI Model">
        <dl className="grid sm:grid-cols-2 gap-4 text-sm">
          <div><dt className="text-slate-400">Algorithm</dt><dd className="font-semibold text-slate-800">{meta.model_name || "—"}</dd></div>
          <div><dt className="text-slate-400">Held-out test ROC-AUC</dt><dd className="font-semibold text-slate-800">{meta.test_roc_auc ?? "—"}</dd></div>
          <div><dt className="text-slate-400">Training rows</dt><dd className="font-semibold text-slate-800">{meta.n_train ?? "—"}</dd></div>
          <div><dt className="text-slate-400">Status</dt>
            <dd className="font-semibold text-slate-800">
              {info.retraining ? "Retraining in progress…" : info.model_file_exists ? "Deployed" : "No model artifact"}
            </dd>
          </div>
        </dl>
      </Card>

      <Card title="Risk Classification Thresholds">
        <p className="text-sm text-slate-500 mb-3">
          Probability ≥ high threshold → HIGH risk (alert); ≥ medium threshold → MEDIUM
          risk; below → LOW risk.
        </p>
        <div className="flex items-end gap-3 max-w-md">
          <Field label="Medium ≥">
            <input type="number" step="0.05" min="0.05" max="0.9" className={inputCls}
              value={thresholdMed} onChange={(e) => setThresholdMed(e.target.value)} />
          </Field>
          <Field label="High ≥">
            <input type="number" step="0.05" min="0.1" max="0.95" className={inputCls}
              value={threshold} onChange={(e) => setThreshold(e.target.value)} />
          </Field>
          <Button disabled={busy}
            onClick={() => act(() => api("/api/admin/model/threshold", {
              method: "PATCH",
              body: { risk_threshold: +threshold, risk_threshold_medium: +thresholdMed },
            }))}>
            Save
          </Button>
        </div>
      </Card>

      <Card title="Retrain / Redeploy">
        <p className="text-sm text-slate-500 mb-4">
          Retraining re-runs model selection (logistic regression vs. random forest vs.
          gradient boosting) on data/cardio_train.csv, then Reload swaps the new artifact
          into the serving layer.
        </p>
        <div className="flex gap-3">
          <Button disabled={busy || info.retraining}
            onClick={() => act(() => api("/api/admin/model/retrain", { method: "POST" }))}>
            {busy && <Spinner />}Start retraining
          </Button>
          <Button variant="subtle" disabled={busy || info.retraining}
            onClick={() => act(() => api("/api/admin/model/reload", { method: "POST" }))}>
            Reload model
          </Button>
          <Button variant="subtle" onClick={load}>Refresh status</Button>
        </div>
      </Card>
    </div>
  );
}

function Reports() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/admin/reports").then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <p className="text-slate-500 text-sm">Loading…</p>;

  const stats = [
    ["Total users", data.total_users],
    ["Patients", data.users_by_role.patient || 0],
    ["Doctors", data.users_by_role.doctor || 0],
    ["Total predictions", data.total_predictions],
    ["High-risk predictions", data.high_risk_predictions],
    ["Low-risk predictions", data.low_risk_predictions],
    ["Doctor-reviewed", data.reviewed_predictions],
    ["Uploaded reports", data.uploaded_reports],
    ["Model ROC-AUC", data.model_accuracy ?? "—"],
  ];

  return (
    <Card title="System Reports">
      <div className="grid sm:grid-cols-3 gap-4">
        {stats.map(([label, value]) => (
          <div key={label} className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{value}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Activity() {
  const [logs, setLogs] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/admin/activity").then(setLogs).catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (!logs) return <p className="text-slate-500 text-sm">Loading…</p>;

  return (
    <Card title="Website Activity">
      {logs.length === 0 && <p className="text-sm text-slate-500">No activity yet.</p>}
      <ul className="divide-y divide-slate-100 text-sm">
        {logs.map((l) => (
          <li key={l.id} className="py-2 flex items-center gap-3 flex-wrap">
            <span className="text-xs text-slate-400 w-36 shrink-0">{fmtDate(l.created_at)}</span>
            <span className="font-mono text-xs bg-slate-100 rounded px-2 py-0.5">{l.action}</span>
            <span className="text-slate-600">{l.user_email || "anonymous"}</span>
            {l.detail && <span className="text-xs text-slate-400">{l.detail}</span>}
          </li>
        ))}
      </ul>
    </Card>
  );
}
