import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api, type ReportItem } from "../api";

type OutletCtx = { refreshPending: () => void };

const STATUS_LABELS: Record<ReportItem["status"], string> = {
  open: "Offen",
  answered: "Beantwortet",
  ignored: "Ignoriert",
  trashed: "Gelöscht",
};

export function ReportsQueue() {
  const { refreshPending } = useOutletContext<OutletCtx>();
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState<string | null>(null); // id of the item being acted upon
  const [answerFor, setAnswerFor] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(false);
    api.getReports()
      .then((data) => {
        setReports(data);
        setLoading(false);
        refreshPending();
      })
      .catch(() => { setError(true); setLoading(false); });
  }

  useEffect(() => { load(); }, []);

  async function handleIgnore(id: string) {
    setBusy(id); setMsg("");
    try {
      await api.patchReport(id, "ignore");
      setMsg("Meldung ignoriert.");
      load();
    } catch {
      setMsg("Fehler beim Ignorieren.");
    } finally {
      setBusy(null);
    }
  }

  async function handleAnswer(id: string) {
    if (!answerText.trim()) return;
    setBusy(id); setMsg("");
    try {
      await api.patchReport(id, "answer", answerText.trim());
      setMsg("Antwort gespeichert.");
      setAnswerFor(null);
      setAnswerText("");
      load();
    } catch {
      setMsg("Fehler beim Antworten.");
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(id: string) {
    setConfirmDelete(null);
    setBusy(id); setMsg("");
    try {
      await api.patchReport(id, "delete");
      setMsg("Foto in den Papierkorb verschoben.");
      load();
    } catch {
      setMsg("Fehler beim Löschen.");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <p className="muted">Lädt Meldungen …</p>;
  if (error) return <p className="err">Meldungen konnten nicht geladen werden.</p>;

  const visible = reports.filter((r) => r.status === "open" || r.status === "answered");

  return (
    <div className="reports-queue">
      <div className="reports-header">
        <h2>Meldungen</h2>
        <span className="muted" style={{ fontSize: ".9rem" }}>
          {visible.length === 0
            ? "Keine offenen Meldungen."
            : `${visible.filter((r) => r.status === "open").length} offen`}
        </span>
      </div>

      {msg && <p className="approval-msg">{msg}</p>}

      {visible.length === 0 && (
        <p className="muted empty-hint">Alles erledigt — keine Meldungen zu bearbeiten.</p>
      )}

      <div className="reports-list">
        {visible.map((report) => (
          <div key={report.id} className={`report-card${report.status === "answered" ? " report-card--answered" : ""}`}>
            <div className="report-thumb-wrap">
              <img
                src={report.thumbUrl}
                alt="Gemeldetes Foto"
                className="report-thumb"
                loading="lazy"
              />
            </div>
            <div className="report-body">
              <div className="report-meta">
                <span className={`report-status report-status--${report.status}`}>
                  {STATUS_LABELS[report.status]}
                </span>
                <span className="report-folder">{report.folderName}</span>
                <span className="report-by muted">{report.reportedByEmail}</span>
              </div>
              <p className="report-reason">„{report.reason}"</p>
              {report.response && (
                <p className="report-response">
                  <strong>Antwort:</strong> {report.response}
                </p>
              )}

              {/* Action row */}
              <div className="report-actions">
                {report.status === "open" && (
                  <>
                    <button
                      className="btn-inline btn-secondary"
                      disabled={busy === report.id}
                      onClick={() => handleIgnore(report.id)}
                    >
                      Ignorieren
                    </button>
                    <button
                      className="btn-inline btn-secondary"
                      disabled={busy === report.id}
                      onClick={() => { setAnswerFor(report.id); setAnswerText(""); }}
                    >
                      Antworten
                    </button>
                    <button
                      className="btn-inline btn-reject"
                      disabled={busy === report.id}
                      onClick={() => setConfirmDelete(report.id)}
                    >
                      Löschen
                    </button>
                  </>
                )}
                {report.status === "answered" && (
                  <button
                    className="btn-inline btn-reject"
                    disabled={busy === report.id}
                    onClick={() => setConfirmDelete(report.id)}
                  >
                    Löschen
                  </button>
                )}
              </div>

              {/* Inline answer form */}
              {answerFor === report.id && (
                <div className="report-answer-form">
                  <textarea
                    className="report-reason"
                    placeholder="Antwort an den Melder …"
                    value={answerText}
                    onChange={(e) => setAnswerText(e.target.value)}
                    rows={3}
                    autoFocus
                  />
                  <div className="dialog-actions">
                    <button
                      type="button"
                      className="btn-ghost-dark btn-inline"
                      onClick={() => setAnswerFor(null)}
                    >
                      Abbrechen
                    </button>
                    <button
                      className="btn-inline btn-approve"
                      disabled={busy === report.id || !answerText.trim()}
                      onClick={() => handleAnswer(report.id)}
                    >
                      Speichern
                    </button>
                  </div>
                </div>
              )}

              {/* Inline delete confirm */}
              {confirmDelete === report.id && (
                <div className="report-confirm">
                  <p>Foto wirklich in den Papierkorb verschieben?</p>
                  <div className="dialog-actions">
                    <button
                      type="button"
                      className="btn-ghost-dark btn-inline"
                      onClick={() => setConfirmDelete(null)}
                    >
                      Abbrechen
                    </button>
                    <button
                      className="btn-inline btn-reject"
                      onClick={() => handleDelete(report.id)}
                    >
                      Ja, löschen
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
