import { useState } from "react";
import { api, storeSession } from "./api";
import { Alert, Button, Field, Spinner, inputCls } from "./ui";
import Background, { BG_TINTS } from "./Background";

export default function AuthPage({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ full_name: "", email: "", password: "", role: "patient" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const path = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const body =
        mode === "login"
          ? { email: form.email, password: form.password }
          : form;
      const data = await api(path, { method: "POST", body });
      storeSession(data.token, data.user);
      if (data.message && data.user.role === "doctor" && !data.user.is_verified) {
        setNotice(data.message);
      }
      onLogin(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`min-h-screen ${BG_TINTS.ecg} flex items-center justify-center px-4`}>
      <Background variant="ecg" />
      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3 drop-shadow-[0_0_18px_rgba(239,68,68,0.5)]">🫀</div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">CardioAI</h1>
          <p className="text-sm text-slate-600 mt-1.5">
            AI-Based Cardiovascular Disease Prediction Website
          </p>
        </div>

        <div className="bg-white/80 backdrop-blur-md border border-white/70 rounded-2xl shadow-2xl shadow-indigo-300/40 p-8 animate-fade-in-up">
          <div className="flex rounded-lg bg-slate-100 p-1 mb-6">
            {["login", "register"].map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(""); }}
                className={`flex-1 py-2 rounded-md text-sm font-semibold capitalize transition ${
                  mode === m ? "bg-white shadow text-slate-900" : "text-slate-500"
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <Alert>{error}</Alert>
          <Alert kind="info">{notice}</Alert>

          <form onSubmit={submit} className="space-y-4">
            {mode === "register" && (
              <>
                <Field label="Full name">
                  <input className={inputCls} value={form.full_name} onChange={set("full_name")} required minLength={2} />
                </Field>
                <Field label="I am a">
                  <select className={inputCls} value={form.role} onChange={set("role")}>
                    <option value="patient">Patient</option>
                    <option value="doctor">Doctor / Clinician</option>
                  </select>
                </Field>
              </>
            )}
            <Field label="Email">
              <input type="email" className={inputCls} value={form.email} onChange={set("email")} required />
            </Field>
            <Field label="Password">
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  className={`${inputCls} pr-16`}
                  value={form.password}
                  onChange={set("password")}
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 hover:text-slate-700 transition"
                >
                  {showPw ? "Hide" : "Show"}
                </button>
              </div>
            </Field>
            <Button type="submit" className="w-full py-2.5" disabled={busy}>
              {busy && <Spinner />}
              {mode === "login" ? "Login" : "Create account"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
