import { useState } from "react";
import { api, clearSession, getStoredUser, getToken } from "./api";
import AuthPage from "./AuthPage";
import PatientPortal from "./PatientPortal";
import DoctorPortal from "./DoctorPortal";
import AdminPortal from "./AdminPortal";
import Background, { BG_TINTS } from "./Background";
import Chatbot from "./Chatbot";

const NAV = {
  patient: [
    ["dashboard", "Dashboard"],
    ["assess", "New Assessment"],
    ["progress", "Progress"],
    ["history", "Health History"],
    ["upload", "Upload Reports"],
    ["profile", "Profile"],
  ],
  doctor: [["patients", "Patient Records"]],
  admin: [
    ["users", "Manage Users"],
    ["records", "Patient Records"],
    ["model", "AI Model"],
    ["reports", "System Reports"],
    ["activity", "Activity Monitor"],
  ],
};

// Hero banner content per page: [emoji, title, subtitle, gradient]
const PAGE_HERO = {
  patient: {
    dashboard: ["🫀", "Your Health Dashboard", "Everything about your heart health, at a glance.", "from-blue-600 via-indigo-600 to-cyan-500"],
    assess: ["🩺", "New Risk Assessment", "Enter your health data — the AI will assess your cardiovascular risk and explain why.", "from-rose-600 via-red-500 to-orange-500"],
    progress: ["📈", "Your Progress", "Track how your risk, vitals and habits change over time.", "from-emerald-600 via-teal-500 to-cyan-500"],
    history: ["🗂️", "Health History", "Every assessment you've taken, with full explanations.", "from-cyan-600 via-sky-500 to-blue-600"],
    upload: ["📄", "Upload Medical Reports", "Drop in a report — we'll read it, explain it, and suggest a diet.", "from-sky-600 via-indigo-500 to-violet-600"],
    profile: ["👤", "Your Profile", "Personal details and medical history used to prefill assessments.", "from-violet-600 via-purple-500 to-fuchsia-500"],
  },
  doctor: {
    patients: ["🩺", "Patient Records", "Review patients, monitor prediction trends, and add clinical guidance.", "from-teal-700 via-cyan-600 to-blue-600"],
  },
  admin: {
    users: ["👥", "Manage Users", "Verify doctors, block or remove accounts.", "from-indigo-700 via-blue-700 to-slate-700"],
    records: ["🗃️", "Patient Records", "All assessments across the platform.", "from-indigo-700 via-violet-700 to-purple-700"],
    model: ["🤖", "AI Model", "Retrain, tune thresholds, and redeploy the model.", "from-slate-800 via-indigo-800 to-blue-800"],
    reports: ["📊", "System Reports", "Platform-wide usage and accuracy metrics.", "from-blue-800 via-indigo-700 to-violet-700"],
    activity: ["🖥️", "Activity Monitor", "Security and usage logs across the website.", "from-slate-800 via-slate-700 to-indigo-800"],
  },
};

// A unique animated background per page.
const PAGE_BG = {
  patient: {
    dashboard: "aurora",
    assess: "pulse",
    progress: "chartgrid",
    history: "waves",
    upload: "bubbles",
    profile: "calm",
  },
  doctor: { patients: "medic" },
  admin: {
    users: "network",
    records: "network",
    model: "network",
    reports: "network",
    activity: "network",
  },
};

export default function App() {
  const [user, setUser] = useState(() => (getToken() ? getStoredUser() : null));
  const [tab, setTab] = useState(null);

  if (!user) return <AuthPage onLogin={(u) => { setUser(u); setTab(NAV[u.role][0][0]); }} />;

  const nav = NAV[user.role] || [];
  const active = tab || nav[0][0];

  const logout = async () => {
    try { await api("/api/auth/logout", { method: "POST" }); } catch { /* token may be stale */ }
    clearSession();
    setUser(null);
    setTab(null);
  };

  const bgVariant = PAGE_BG[user.role]?.[active] || "aurora";
  const hero = PAGE_HERO[user.role]?.[active];

  return (
    <div className={`min-h-screen ${BG_TINTS[bgVariant] || "bg-slate-100"}`}>
      <Background variant={bgVariant} />
      <header className="bg-gradient-to-r from-slate-950 via-blue-950 to-indigo-950 border-b border-white/10 sticky top-0 z-20 shadow-lg shadow-slate-900/20">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-4">
          <div className="font-bold text-white whitespace-nowrap">🫀 CardioAI</div>
          <nav className="flex gap-1 overflow-x-auto">
            {nav.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                  active === key
                    ? "bg-white/15 text-white shadow-inner"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right hidden lg:block whitespace-nowrap">
              <div className="text-sm font-semibold text-white leading-tight">{user.full_name}</div>
              <div className="text-xs text-slate-400 capitalize leading-tight">{user.role}</div>
            </div>
            <button
              onClick={logout}
              className="text-sm font-semibold text-slate-400 hover:text-red-400 transition"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main key={active} className="relative z-10 max-w-5xl mx-auto px-4 py-8 animate-fade-in-up">
        {hero && (
          <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-r ${hero[3]} text-white p-6 sm:p-8 mb-6 shadow-xl shadow-slate-900/20`}>
            <div className="absolute -right-4 -bottom-8 text-[7rem] opacity-20 select-none pointer-events-none">
              {hero[0]}
            </div>
            <h1 className="text-2xl font-bold relative">{hero[1]}</h1>
            <p className="text-sm text-white/80 mt-1 relative max-w-xl">{hero[2]}</p>
          </div>
        )}
        {user.role === "doctor" && !user.is_verified ? (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-6 text-sm">
            Your doctor account is pending verification by an administrator. You will be able
            to access patient records once verified.
          </div>
        ) : user.role === "patient" ? (
          <PatientPortal tab={active} />
        ) : user.role === "doctor" ? (
          <DoctorPortal />
        ) : (
          <AdminPortal tab={active} />
        )}
      </main>

      {user.role === "patient" && <Chatbot />}
    </div>
  );
}
