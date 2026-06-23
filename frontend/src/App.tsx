import { useEffect, useState } from "react";
import { api, type Me, type Folder } from "./api";
import { TopBar } from "./components/TopBar";
import { NavBar } from "./components/NavBar";
import { FolderList } from "./components/FolderList";
import { FolderView } from "./components/FolderView";
import { ApprovalQueue } from "./components/ApprovalQueue";
import { AdminFolders } from "./components/AdminFolders";
import { AdminUsers } from "./components/AdminUsers";
import { type View } from "./types";

type Stage = "loading" | "email" | "code" | "in";

function AppShell({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const [view, setView] = useState<View>("folders");
  const [pendingCount, setPendingCount] = useState(0);
  const [openFolder, setOpenFolder] = useState<Folder | null>(null);

  useEffect(() => {
    if (me.role !== "admin") return;
    function refresh() {
      api.getPending().then((items) => setPendingCount(items.length));
    }
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [me.role]);

  function handleNav(newView: View) {
    setOpenFolder(null);
    setView(newView);
  }

  return (
    <div className="app">
      <TopBar email={me.email} onLogout={onLogout} />
      <NavBar role={me.role} view={view} onNav={handleNav} pendingCount={pendingCount} />
      <main className="app-content">
        {view === "folders" && (
          openFolder
            ? <FolderView folder={openFolder} onBack={() => setOpenFolder(null)} />
            : <FolderList onOpenFolder={setOpenFolder} />
        )}
        {view === "approval" && me.role === "admin" && (
          <ApprovalQueue onCountChange={setPendingCount} />
        )}
        {view === "admin-folders" && me.role === "admin" && <AdminFolders />}
        {view === "admin-users" && me.role === "admin" && <AdminUsers />}
      </main>
    </div>
  );
}

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
    try {
      await api.requestLogin(email);
      setStage("code");
    } catch {
      setErr("Anfrage fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      const u = await api.verify(email, code.trim());
      if (u) { setMe(u); setStage("in"); }
      else setErr("Code stimmt nicht oder ist abgelaufen.");
    } catch {
      setErr("Anmeldung fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() { await api.logout(); setMe(null); setEmail(""); setCode(""); setStage("email"); }

  if (stage === "loading") return <main className="card"><p>Lädt …</p></main>;

  if (stage === "in" && me) return <AppShell me={me} onLogout={logout} />;

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
