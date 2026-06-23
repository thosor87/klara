import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { api, type Me } from "./api";
import { Layout } from "./components/Layout";
import { FolderList } from "./components/FolderList";
import { FolderView } from "./components/FolderView";
import { ApprovalQueue } from "./components/ApprovalQueue";
import { AdminFolders } from "./components/AdminFolders";
import { AdminUsers } from "./components/AdminUsers";
import { AdminDomains, AdminClasses } from "./components/Settings";
import { ReportsQueue } from "./components/ReportsQueue";
import { Trash } from "./components/Trash";
import { Footer } from "./components/Footer";
import { Impressum } from "./components/Impressum";
import { Datenschutz } from "./components/Datenschutz";
import { Anleitung } from "./components/Anleitung";

type Stage = "loading" | "email" | "code" | "in";

function RequireAdmin({ me, children }: { me: Me; children: React.ReactNode }) {
  if (me.role !== "admin") return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** A legal/help page shown standalone (no app shell) — used when not logged in. */
function PublicPage({ children }: { children: React.ReactNode }) {
  return (
    <div className="app">
      <div className="legal-page-wrap">{children}</div>
      <Footer />
    </div>
  );
}

function AppRoutes({ me, onLogout }: { me: Me; onLogout: () => void }) {
  return (
    <Routes>
      <Route element={<Layout me={me} onLogout={onLogout} />}>
        <Route path="/" element={<FolderList />} />
        <Route path="/ordner/:folderId" element={<FolderView />} />
        <Route path="/impressum" element={<Impressum />} />
        <Route path="/datenschutz" element={<Datenschutz />} />
        <Route path="/anleitung" element={<Anleitung />} />
        <Route
          path="/freigabe"
          element={<RequireAdmin me={me}><ApprovalQueue /></RequireAdmin>}
        />
        <Route
          path="/meldungen"
          element={<RequireAdmin me={me}><ReportsQueue /></RequireAdmin>}
        />
        <Route
          path="/papierkorb"
          element={<RequireAdmin me={me}><Trash /></RequireAdmin>}
        />
        <Route
          path="/verwaltung/ordner"
          element={<RequireAdmin me={me}><AdminFolders /></RequireAdmin>}
        />
        <Route
          path="/verwaltung/nutzer"
          element={<RequireAdmin me={me}><AdminUsers /></RequireAdmin>}
        />
        <Route
          path="/verwaltung/domains"
          element={<RequireAdmin me={me}><AdminDomains /></RequireAdmin>}
        />
        <Route
          path="/verwaltung/klassen"
          element={<RequireAdmin me={me}><AdminClasses /></RequireAdmin>}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

/** Renders the login flow; on success it stores `me` and navigates back to the
 *  URL the user originally wanted (preserved across the gate). */
function LoginGate({ onLoggedIn }: { onLoggedIn: (me: Me) => void }) {
  const [stage, setStage] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

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
      if (u) onLoggedIn(u);
      else setErr("Code stimmt nicht oder ist abgelaufen.");
    } catch {
      setErr("Anmeldung fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      {stage === "code" ? (
        <main className="card auth-card">
          <h1 className="auth-title">KlaRa</h1>
          <p className="muted">Wir haben dir eine Mail geschickt — falls deine Adresse freigeschaltet ist.
            Gib den 6-stelligen Code ein (oder klick den Link in der Mail).</p>
          <form onSubmit={submitCode}>
            <input inputMode="numeric" autoComplete="one-time-code" placeholder="6-stelliger Code"
              value={code} onChange={(e) => setCode(e.target.value)} />
            <button disabled={busy || code.trim().length < 6}>Anmelden</button>
          </form>
          {err && <p className="err">{err}</p>}
          <button className="link-btn" onClick={() => { setStage("email"); setErr(""); }}>
            Andere Adresse</button>
        </main>
      ) : (
        <main className="card auth-card">
          <h1 className="auth-title">KlaRa</h1>
          <p className="muted">Melde dich mit deiner Schul-E-Mail an. Du bekommst einen Code per Mail.</p>
          <form onSubmit={submitEmail}>
            <input type="email" autoComplete="email" placeholder="name@grundschule-xy.de"
              value={email} onChange={(e) => setEmail(e.target.value)} />
            <button disabled={busy || !email.includes("@")}>Code anfordern</button>
          </form>
          {err && <p className="err">{err}</p>}
        </main>
      )}
      <Footer className="auth-footer" />
    </div>
  );
}

/** Bridges login state and the router: stays on the current URL after login. */
function AuthBoundary() {
  const [stage, setStage] = useState<Stage>("loading");
  const [me, setMe] = useState<Me | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const PUBLIC_PAGES: Record<string, React.ReactNode> = {
    "/impressum": <Impressum />,
    "/datenschutz": <Datenschutz />,
    "/anleitung": <Anleitung />,
  };

  useEffect(() => {
    api.me().then((u) => {
      if (u) { setMe(u); setStage("in"); }
      else setStage("email");
    });
  }, []);

  async function logout() {
    await api.logout();
    setMe(null);
    setStage("email");
    navigate("/", { replace: true });
  }

  function handleLoggedIn(u: Me) {
    setMe(u);
    setStage("in");
    // Stay on the originally requested URL (deep links survive the gate).
    navigate(location.pathname + location.search, { replace: true });
  }

  if (stage === "in" && me) return <AppRoutes me={me} onLogout={logout} />;

  // Legal/help pages must be reachable WITHOUT a session.
  const publicPage = PUBLIC_PAGES[location.pathname];
  if (publicPage) return <PublicPage>{publicPage}</PublicPage>;

  if (stage === "loading") return <main className="card auth-card"><p>Lädt …</p></main>;
  return <LoginGate onLoggedIn={handleLoggedIn} />;
}

export function App() {
  return (
    <BrowserRouter>
      <AuthBoundary />
    </BrowserRouter>
  );
}
