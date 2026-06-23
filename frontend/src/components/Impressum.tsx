import { Link } from "react-router-dom";

// TODO: Anschrift vom Betreiber ergänzen — die Platzhalter [Straße Hausnummer]
// und [PLZ Ort] müssen vor dem Echtbetrieb durch die echte ladungsfähige
// Anschrift ersetzt werden (Pflichtangabe nach § 5 TMG).
export function Impressum() {
  return (
    <article className="legal-page">
      <Link to="/" className="legal-back">← Zurück</Link>
      <div className="page-head">
        <p className="page-kicker">Rechtliches</p>
        <h1 className="page-title">Impressum</h1>
      </div>

      <h2>Angaben gemäß § 5 TMG</h2>
      <p>
        Thomas Soring
        <br />
        <span className="legal-placeholder">[Straße Hausnummer]</span>
        <br />
        <span className="legal-placeholder">[PLZ Ort]</span>
      </p>

      <h2>Kontakt</h2>
      <p>
        E-Mail: <a href="mailto:tsoring@lilapixel.de">tsoring@lilapixel.de</a>
      </p>

      <h2>Verantwortlich für den Inhalt</h2>
      <p>
        Thomas Soring (Anschrift wie oben)
      </p>

      <div className="legal-note">
        Hinweis für den Betreiber: Bitte vor dem Echtbetrieb die vollständige ladungsfähige
        Anschrift ergänzen. Die Platzhalter oben sind nur als Vorlage gedacht.
      </div>
    </article>
  );
}
