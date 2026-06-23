import { Link } from "react-router-dom";

export function Datenschutz() {
  return (
    <article className="legal-page">
      <Link to="/" className="legal-back">← Zurück</Link>
      <div className="page-head">
        <p className="page-kicker">Rechtliches</p>
        <h1 className="page-title">Datenschutzerklärung</h1>
      </div>

      <div className="legal-banner">
        Entwurf — bitte vor dem Echtbetrieb juristisch prüfen lassen.
      </div>

      <h2>1. Verantwortlicher</h2>
      <p>
        Verantwortlich für die Datenverarbeitung in dieser Anwendung ist:
        <br />
        Thomas Soring (LILAPIXEL)
        <br />
        Anschrift: <span className="legal-placeholder">[Platzhalter — siehe Impressum]</span>
        <br />
        E-Mail: <a href="mailto:tsoring@lilapixel.de">tsoring@lilapixel.de</a>
      </p>

      <h2>2. Zweck der Verarbeitung</h2>
      <p>
        KlaRa dient dem privaten, geprüften Foto-Austausch innerhalb einer einzelnen
        Grundschulklasse. Eltern und die Lehrkraft können Fotos aus dem Schulalltag hochladen,
        ansehen und untereinander teilen. Die Anwendung ist nicht öffentlich; der Zugang ist auf
        freigeschaltete Mitglieder der Klasse beschränkt.
      </p>

      <h2>3. Verarbeitete Daten</h2>
      <ul>
        <li>
          <strong>E-Mail-Adressen</strong> — zur Anmeldung und zur Zustellung des Einmal-Codes.
        </li>
        <li>
          <strong>Hochgeladene Fotos</strong> — die von Nutzerinnen und Nutzern eingestellten
          Bilder. Diese können Kinder zeigen.
        </li>
      </ul>

      <h2>4. Rechtsgrundlage</h2>
      <p>
        Die Verarbeitung erfolgt auf Grundlage der Einwilligung gemäß Art. 6 Abs. 1 lit. a DSGVO.
        Soweit Daten von Kindern betroffen sind, wird die Einwilligung durch die
        Erziehungsberechtigten erteilt.
      </p>

      <h2>5. Auftragsverarbeiter / Hosting</h2>
      <p>Zur Bereitstellung des Dienstes setzen wir folgende Dienstleister ein:</p>
      <ul>
        <li>
          <strong>Vercel</strong> — Hosting und Ausführung der Anwendung (Funktion), Region
          Frankfurt (fra1).
        </li>
        <li>
          <strong>Neon</strong> — PostgreSQL-Datenbank, Region Frankfurt.
        </li>
        <li>
          <strong>AWS</strong> — S3-Objektspeicher für Fotos und SES für den E-Mail-Versand,
          Region eu-central-1 (Frankfurt).
        </li>
      </ul>
      <p>
        Vercel und AWS sind US-Unternehmen. Die Verarbeitung erfolgt in EU-Rechenzentren; ein
        Restrisiko nach US-Recht (insbesondere Cloud Act) kann jedoch nicht vollständig
        ausgeschlossen werden.
      </p>

      <h2>6. Datensparsamkeit</h2>
      <p>
        Fotos werden bereits vor dem Upload im Browser verkleinert und von Standort- und
        Geräte-Metadaten (EXIF/GPS) befreit. Der Foto-Speicher ist privat: Ein Zugriff ist nur
        über kurzlebige, signierte Links nach erfolgreicher Anmeldung möglich.
      </p>

      <h2>7. Zugriff</h2>
      <p>
        Fotos und Inhalte sind ausschließlich für angemeldete, von der Lehrkraft freigeschaltete
        Klassen-Mitglieder sichtbar. Die Anmeldung erfolgt per Einmal-Code beziehungsweise
        Anmelde-Link, der per E-Mail zugestellt wird.
      </p>

      <h2>8. Speicherdauer</h2>
      <p>
        Gelöschte Inhalte verbleiben 30 Tage im Papierkorb und werden danach endgültig — inklusive
        der zugehörigen Speicherobjekte — entfernt. Konten bestehen, bis sie durch die Lehrkraft
        gelöscht werden.
      </p>

      <h2>9. Ihre Rechte</h2>
      <p>Ihnen stehen gegenüber dem Verantwortlichen folgende Rechte zu:</p>
      <ul>
        <li>Auskunft (Art. 15 DSGVO)</li>
        <li>Berichtigung (Art. 16 DSGVO)</li>
        <li>Löschung (Art. 17 DSGVO)</li>
        <li>Einschränkung der Verarbeitung (Art. 18 DSGVO)</li>
        <li>Widerspruch gegen die Verarbeitung (Art. 21 DSGVO)</li>
        <li>Widerruf einer erteilten Einwilligung (Art. 7 Abs. 3 DSGVO)</li>
        <li>Beschwerde bei einer Aufsichtsbehörde (Art. 77 DSGVO)</li>
      </ul>

      <h2>10. Kontakt für Datenschutzanliegen</h2>
      <p>
        Für Fragen und zur Ausübung Ihrer Rechte wenden Sie sich bitte an:{" "}
        <a href="mailto:tsoring@lilapixel.de">tsoring@lilapixel.de</a>
      </p>
    </article>
  );
}
