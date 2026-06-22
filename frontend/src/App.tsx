import { useEffect, useState } from "react";
import { api, type Me } from "./api";

type Stage = "loading" | "email" | "code" | "in";

export function App() {
  const [stage, setStage] = useState<Stage>("loading");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [me, setMe] = useState<Me | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.me().then((u) => { if (u) { setMe(u); setStage("in"); } else setStage("email"); });
  }, []);

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    await api.requestLogin(email);
    setBusy(false); setStage("code");
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    const u = await api.verify(email, code.trim());
    setBusy(false);
    if (u) { setMe(u); setStage("in"); }
    else setErr("Code stimmt nicht oder ist abgelaufen.");
  }

  async function logout() { await api.logout(); setMe(null); setEmail(""); setCode(""); setStage("email"); }

  if (stage === "loading") return <main className="card"><p>Lädt …</p></main>;

  if (stage === "in" && me) return (
    <main className="card">
      <h1>KlaRa</h1>
      <p>Angemeldet als <b>{me.email}</b>{me.role === "admin" ? " (Lehrerin/Admin)" : ""}.</p>
      <button onClick={logout}>Abmelden</button>
    </main>
  );

  if (stage === "code") return (
    <main className="card">
      <h1>KlaRa</h1>
      <p className="muted">Wir haben dir eine Mail geschickt — falls deine Adresse freigeschaltet ist.
        Gib den 6-stelligen Code ein (oder klick den Link in der Mail).</p>
      <form onSubmit={submitCode}>
        <input inputMode="numeric" autoComplete="one-time-code" placeholder="6-stelliger Code"
          value={code} onChange={(e) => setCode(e.target.value)} />
        <button disabled={busy || code.trim().length < 6}>Anmelden</button>
      </form>
      {err && <p className="err">{err}</p>}
      <button onClick={() => setStage("email")} style={{ background: "transparent", color: "#5b3fb0" }}>
        Andere Adresse</button>
    </main>
  );

  return (
    <main className="card">
      <h1>KlaRa</h1>
      <p className="muted">Melde dich mit deiner Schul-E-Mail an. Du bekommst einen Code per Mail.</p>
      <form onSubmit={submitEmail}>
        <input type="email" autoComplete="email" placeholder="name@grundschule-xy.de"
          value={email} onChange={(e) => setEmail(e.target.value)} />
        <button disabled={busy || !email.includes("@")}>Code anfordern</button>
      </form>
    </main>
  );
}
