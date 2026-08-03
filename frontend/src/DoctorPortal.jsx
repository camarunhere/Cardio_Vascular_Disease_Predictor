import { useEffect, useState } from "react";
import { api, downloadPdf } from "./api";
import { Alert, Button, Card, Field, RiskBadge, RiskResult, Spinner, TrendChart, fmtDate, inputCls } from "./ui";

export default function DoctorPortal() {
  const [selected, setSelected] = useState(null);
  return selected ? (
    <PatientDetail patientId={selected} onBack={() => setSelected(null)} />
  ) : (
    <PatientList onOpen={setSelected} />
  );
}

function PatientList({ onOpen }) {
  const [patients, setPatients] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/doctor/patients").then(setPatients).catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert>{error}</Alert>;
  if (!patients) return <p className="text-slate-500 text-sm">Loading…</p>;

  return (
    <Card title="Patient Records">
      {patients.length === 0 && <p className="text-sm text-slate-500">No patients registered yet.</p>}
      <ul className="divide-y divide-slate-100">
        {patients.map((p) => (
          <li key={p.id} className="py-3 flex items-center gap-3 flex-wrap">
            <div>
              <div className="text-sm font-semibold text-slate-800">{p.full_name}</div>
              <div className="text-xs text-slate-400">{p.email}</div>
            </div>
            <span className="text-xs text-slate-500 ml-4">{p.assessments} assessment{p.assessments === 1 ? "" : "s"}</span>
            {p.latest_risk && (
              <RiskBadge classification={p.latest_risk} level={p.latest_risk_level} probability={p.latest_probability} />
            )}
            <Button variant="subtle" className="ml-auto" onClick={() => onOpen(p.id)}>
              Open record
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function DoctorNotes({ patientId }) {
  const [notes, setNotes] = useState([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () =>
    api(`/api/doctor/patients/${patientId}/notes`).then(setNotes).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [patientId]);

  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/api/doctor/patients/${patientId}/notes`, { method: "POST", body: { note: text } });
      setText("");
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    try { await api(`/api/doctor/notes/${id}`, { method: "DELETE" }); load(); } catch { /* noop */ }
  };

  return (
    <Card title="🗒️ Doctor Notes">
      <Alert>{error}</Alert>
      <form onSubmit={add} className="flex gap-2 items-start">
        <textarea
          className={`${inputCls} flex-1`}
          rows={2}
          placeholder="Add a note about this patient — visible to all doctors on the platform."
          value={text}
          onChange={(e) => setText(e.target.value)}
          required
          minLength={3}
        />
        <Button type="submit" disabled={busy || text.trim().length < 3}>
          {busy && <Spinner />}Add note
        </Button>
      </form>
      {notes.length > 0 && (
        <ul className="mt-4 space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm animate-fade-in-up">
              <div className="text-slate-700 whitespace-pre-wrap">{n.note}</div>
              <div className="flex items-center text-xs text-slate-400 mt-1.5">
                <span>{n.doctor} · {fmtDate(n.created_at)}</span>
                {n.mine && (
                  <button
                    onClick={() => remove(n.id)}
                    className="ml-auto font-semibold hover:text-red-600 transition"
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function PatientDetail({ patientId, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [reviewOpen, setReviewOpen] = useState(null);
  const [reviewNote, setReviewNote] = useState("");
  const [recText, setRecText] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () =>
    api(`/api/doctor/patients/${patientId}/records`).then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [patientId]);

  if (error) return <div><Alert>{error}</Alert><Button variant="subtle" onClick={onBack}>Back</Button></div>;
  if (!data) return <p className="text-slate-500 text-sm">Loading…</p>;

  const saveReview = async (recordId) => {
    setBusy(true);
    setMsg("");
    try {
      await api(`/api/doctor/records/${recordId}/review`, { method: "POST", body: { note: reviewNote } });
      setMsg("Review saved.");
      setReviewOpen(null);
      setReviewNote("");
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const saveRecommendation = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      await api(`/api/doctor/patients/${patientId}/recommendations`, {
        method: "POST",
        body: { recommendation: recText },
      });
      setMsg("Clinical recommendation saved.");
      setRecText("");
      load();
    } catch (e2) {
      setError(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="subtle" onClick={onBack}>← All patients</Button>
        <h1 className="text-lg font-bold text-slate-900">{data.patient.full_name}</h1>
        <span className="text-sm text-slate-400">{data.patient.email}</span>
      </div>

      <Alert kind="success">{msg}</Alert>

      {data.records.length >= 2 && (
        <div className="grid lg:grid-cols-2 gap-6">
          <Card title="Prediction Trend — Risk Probability">
            <TrendChart
              points={[...data.records].reverse().map((r) => ({ date: r.created_at, value: r.risk_probability }))}
              format={(v) => `${(v * 100).toFixed(0)}%`}
              domain={[0, 1]}
            />
          </Card>
          <Card title="Trend — Systolic Blood Pressure (mmHg)">
            <TrendChart
              points={[...data.records].reverse().map((r) => ({ date: r.created_at, value: r.inputs.ap_hi }))}
              format={(v) => v.toFixed(0)}
            />
          </Card>
        </div>
      )}

      <DoctorNotes patientId={patientId} />

      <Card title="AI Prediction Results (auto-included with the record)">
        {data.records.length === 0 && (
          <p className="text-sm text-slate-500">This patient has no assessments yet.</p>
        )}
        <ul className="divide-y divide-slate-100">
          {data.records.map((r) => (
            <li key={r.id} className="py-4">
              <div className="flex items-center gap-3 flex-wrap mb-2">
                <span className="text-sm text-slate-600">{fmtDate(r.created_at)}</span>
                <RiskBadge classification={r.risk_classification} level={r.risk_level} probability={r.risk_probability} />
                {r.reviewed_at && (
                  <span className="text-xs bg-blue-100 text-blue-700 font-semibold px-2 py-0.5 rounded-full">
                    Reviewed
                  </span>
                )}
                <div className="ml-auto flex gap-2">
                  <Button variant="subtle" onClick={() => setReviewOpen(reviewOpen === r.id ? null : r.id)}>
                    Review
                  </Button>
                  <Button variant="subtle" onClick={() => downloadPdf(`/api/doctor/records/${r.id}/report`, `cvd_report_${r.id}.pdf`)}>
                    PDF
                  </Button>
                </div>
              </div>
              <RiskResult record={r} />
              {reviewOpen === r.id && (
                <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg p-4">
                  <Field label="Review note">
                    <textarea className={inputCls} rows={3} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} />
                  </Field>
                  <Button className="mt-3" disabled={busy || reviewNote.length < 3} onClick={() => saveReview(r.id)}>
                    {busy && <Spinner />}Save review
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Generate Clinical Recommendation">
        <form onSubmit={saveRecommendation}>
          <textarea
            className={inputCls}
            rows={3}
            placeholder="e.g. Schedule a stress echocardiogram; begin statin therapy; follow up in 3 months."
            value={recText}
            onChange={(e) => setRecText(e.target.value)}
            required
            minLength={3}
          />
          <Button type="submit" className="mt-3" disabled={busy}>
            {busy && <Spinner />}Save recommendation
          </Button>
        </form>
        {data.recommendations.length > 0 && (
          <ul className="mt-4 space-y-2">
            {data.recommendations.map((rec) => (
              <li key={rec.id} className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                <div className="text-slate-700">{rec.recommendation}</div>
                <div className="text-xs text-slate-400 mt-1">{fmtDate(rec.created_at)}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {data.uploads.length > 0 && (
        <Card title="Uploaded Medical Reports">
          <ul className="divide-y divide-slate-100 text-sm">
            {data.uploads.map((u) => (
              <li key={u.id} className="py-2 flex justify-between">
                <span className="text-slate-700">{u.filename}</span>
                <span className="text-slate-400 text-xs">{fmtDate(u.uploaded_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
