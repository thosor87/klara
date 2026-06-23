import { Link } from "react-router-dom";

export function Anleitung() {
  return (
    <article className="legal-page">
      <Link to="/" className="legal-back">← Zurück</Link>
      <div className="page-head">
        <p className="page-kicker">Hilfe</p>
        <h1 className="page-title">Anleitung</h1>
      </div>

      <p>
        KlaRa ist das private Fotoalbum unserer Klasse. Hier sammeln wir Bilder vom Schulalltag,
        von Ausflügen und Festen — nur für die Familien der Klasse sichtbar. So geht es:
      </p>

      <h2>Anmelden</h2>
      <p>
        Gib auf der Startseite deine E-Mail-Adresse ein und tippe auf „Code anfordern". Du bekommst
        eine kurze Mail mit einem sechsstelligen Code. Trag den Code ein — oder klick einfach den
        Link in der Mail, dann bist du direkt drin. Der Code gilt nur für kurze Zeit; bei Bedarf
        forderst du einfach einen neuen an.
      </p>
      <div className="legal-note">
        Falls du keine Mail bekommst, ist deine Adresse vielleicht noch nicht freigeschaltet. Dann
        meldet sich die Lehrerin bei dir, sobald dein Zugang aktiv ist.
      </div>

      <h2>Fotos ansehen</h2>
      <p>
        Nach dem Anmelden siehst du die <strong>Alben</strong> — zum Beispiel nach Schuljahr,
        Klasse oder Anlass sortiert. Tippe ein Album an, um die <strong>Galerie</strong> zu
        öffnen.
      </p>
      <ul>
        <li>
          <strong>Vollbild:</strong> Tippe ein Foto an, um es groß zu sehen. Mit den Pfeilen oder
          durch Wischen blätterst du weiter.
        </li>
        <li>
          <strong>Diashow:</strong> Im Vollbild kannst du eine automatische Diashow starten und das
          Tempo wählen.
        </li>
        <li>
          <strong>Teilen:</strong> Über die Teilen-Funktion bekommst du einen Link zum Foto, den du
          weitergeben kannst.
        </li>
        <li>
          <strong>Download:</strong> Lade ein Foto herunter, um es auf deinem Gerät zu speichern.
        </li>
        <li>
          <strong>Sortierung:</strong> Oben in der Galerie kannst du zwischen „Neueste zuerst" und
          „Älteste zuerst" umschalten.
        </li>
      </ul>

      <h2>Fotos hochladen</h2>
      <p>
        In jedem Album kannst du eigene Fotos beitragen. Tippe auf „Hochladen", wähle ein oder
        mehrere Bilder aus, und sie werden hochgeladen. Deine Fotos sind zuerst mit dem Hinweis
        <strong> „wartet auf Freigabe"</strong> markiert — die Lehrerin schaut sie kurz an, bevor
        sie für alle sichtbar werden.
      </p>
      <ul>
        <li>Du kannst mehrere Fotos auf einmal auswählen.</li>
        <li>
          Deine noch nicht freigegebenen Fotos siehst nur du. Du kannst sie über das kleine
          X wieder löschen, solange sie nicht freigegeben sind.
        </li>
      </ul>

      <h2>Ein Foto melden</h2>
      <p>
        Wenn dir ein Bild Sorgen macht oder nicht gezeigt werden sollte, kannst du es melden. Öffne
        das Foto und nutze die Melden-Funktion; schreib kurz dazu, worum es geht. Die Lehrerin
        bekommt die Meldung und kümmert sich darum.
      </p>

      <h2>Für die Lehrerin (Admin)</h2>
      <p>Als Administratorin hast du zusätzliche Möglichkeiten:</p>
      <ul>
        <li>
          <strong>Alben anlegen:</strong> Unter „Alben verwalten" legst du Alben an — mit
          Schuljahr, Klasse, Datum (ein Tag oder ein Zeitraum), einem Titelbild aus den Fotos des
          Albums und einer wählbaren Reihenfolge.
        </li>
        <li>
          <strong>Freigeben:</strong> Unter „Freigabe" prüfst du neue Uploads. Du kannst mehrere
          Fotos auf einmal auswählen und gemeinsam freigeben oder ablehnen — oder ein einzelnes
          Foto im Vollbild ansehen und dort direkt entscheiden und weiterblättern.
        </li>
        <li>
          <strong>Meldungen bearbeiten:</strong> Unter „Meldungen" siehst du gemeldete Fotos und
          kannst antworten, ignorieren oder das Foto entfernen.
        </li>
        <li>
          <strong>Papierkorb:</strong> Gelöschte Fotos liegen 30 Tage im Papierkorb (unten unter
          „Alben verwalten") und lassen sich dort wiederherstellen, bevor sie endgültig verschwinden.
        </li>
        <li>
          <strong>Nutzer verwalten:</strong> Unter „Nutzer" schaltest du wartende Anmeldungen frei,
          lädst neue Adressen ein, machst Mitglieder zu Admins (oder zurück) und deaktivierst
          Konten. Dort legst du auch unter „Erlaubte Login-Domains" fest, welche E-Mail-Domains
          sich anmelden dürfen.
        </li>
        <li>
          <strong>Klassen verwalten:</strong> Über den Link „Klassen verwalten" im Album-Formular
          pflegst du die Auswahlliste, die beim Anlegen eines Albums erscheint.
        </li>
      </ul>

      <p style={{ marginTop: "2rem" }}>
        Noch Fragen? Schreib uns einfach an{" "}
        <a href="mailto:tsoring@lilapixel.de">tsoring@lilapixel.de</a>.
      </p>
    </article>
  );
}
