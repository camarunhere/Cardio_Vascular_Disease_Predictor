import { useEffect, useRef, useState } from "react";
import { api } from "./api";

/** Simple markdown-ish bold rendering for **text**. */
function renderText(text) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((p, i) => (i % 2 ? <strong key={i}>{p}</strong> : p));
}

const SUGGESTIONS = [
  "What is my risk?",
  "Why is my risk high?",
  "How can I reduce my risk?",
  "What is LVEF?",
  "What should I eat?",
];

export default function Chatbot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { from: "bot", text: "Hi! 👋 I'm your CardioAI assistant. Ask me about your risk result, medical terms, diet, exercise — or how to use this site." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const send = async (text) => {
    const message = (text ?? input).trim();
    if (!message || busy) return;
    setInput("");
    setMessages((m) => [...m, { from: "user", text: message }]);
    setBusy(true);
    try {
      const res = await api("/api/patient/chat", { method: "POST", body: { message } });
      setMessages((m) => [...m, { from: "bot", text: res.reply }]);
    } catch {
      setMessages((m) => [...m, { from: "bot", text: "Sorry, I couldn't reach the server. Please try again." }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setOpen(!open)}
        aria-label="Open AI assistant"
        className="fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-2xl shadow-lg shadow-blue-600/30 transition active:scale-95 flex items-center justify-center"
      >
        {open ? "✕" : "💬"}
      </button>

      {open && (
        <div className="fixed bottom-24 right-5 z-40 w-[22rem] max-w-[calc(100vw-2.5rem)] h-[28rem] bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col animate-fade-in-up overflow-hidden">
          <div className="bg-blue-600 text-white px-4 py-3">
            <div className="font-bold text-sm">🫀 CardioAI Assistant</div>
            <div className="text-xs text-blue-100">Explains results & health terms — not medical advice</div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.from === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed animate-fade-in-up ${
                    m.from === "user"
                      ? "bg-blue-600 text-white rounded-br-md"
                      : "bg-slate-100 text-slate-800 rounded-bl-md"
                  }`}
                >
                  {renderText(m.text)}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="bg-slate-100 rounded-2xl rounded-bl-md px-4 py-2.5">
                  <span className="inline-flex gap-1">
                    {[0, 1, 2].map((d) => (
                      <span key={d} className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: `${d * 150}ms` }} />
                    ))}
                  </span>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {messages.length <= 1 && (
            <div className="px-3 pb-2 flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)}
                  className="text-xs px-2.5 py-1 rounded-full border border-blue-200 text-blue-700 hover:bg-blue-50 transition">
                  {s}
                </button>
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => { e.preventDefault(); send(); }}
            className="border-t border-slate-200 p-2.5 flex gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask me anything…"
              className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
            />
            <button type="submit" disabled={busy || !input.trim()}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg text-sm font-semibold transition">
              ➤
            </button>
          </form>
        </div>
      )}
    </>
  );
}
