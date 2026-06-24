import { Link } from "react-router-dom";
import { CHANGELOG } from "../changelog";

export function Changelog() {
  return (
    <article className="legal-page">
      <Link to="/" className="legal-back">← Zurück</Link>
      <div className="page-head">
        <p className="page-kicker">KlaRa</p>
        <h1 className="page-title">Änderungen</h1>
      </div>

      {CHANGELOG.map((e) => (
        <section key={e.version} className="changelog-entry">
          <h2>
            v{e.version}{" "}
            <span className="muted changelog-date">
              · {new Date(e.date).toLocaleDateString("de-DE")}
            </span>
          </h2>
          <ul>
            {e.changes.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </section>
      ))}

      <p className="muted changelog-build">
        Aktueller Build: {__BUILD_SHA__} · {__BUILD_DATE__}
      </p>
    </article>
  );
}
