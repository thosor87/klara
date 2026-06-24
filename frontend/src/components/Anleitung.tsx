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
        KlaRa ist das private Album unserer Klasse. Hier sammeln wir <strong>Fotos und kurze
        Videos</strong> vom Schulalltag, von Ausflügen und Festen — nur für die Familien der Klasse
        sichtbar. Manchmal liegen oben in einem Album auch <strong>Dokumente</strong> (z. B.
        Elternbriefe) zum Herunterladen. So geht es:
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
        meldet sich die Lehrkraft bei dir, sobald dein Zugang aktiv ist.
      </div>

      <h2>Fotos &amp; Videos ansehen</h2>
      <p>
        Nach dem Anmelden siehst du die <strong>Alben</strong> — zum Beispiel nach Schuljahr,
        Klasse oder Anlass sortiert. Tippe ein Album an, um die <strong>Galerie</strong> zu öffnen.
      </p>
      <ul>
        <li>
          <strong>Vollbild:</strong> Tippe ein Foto an, um es groß zu sehen. Mit den Pfeilen oder
          durch Wischen blätterst du weiter. Am Handy oder Tablet kannst du ins Querformat drehen,
          dann wird das Bild bildschirmfüllend gezeigt.
        </li>
        <li>
          <strong>Videos:</strong> Videos erkennst du am Play-Symbol. Tippe sie an, dann werden sie
          mit Ton abgespielt.
        </li>
        <li>
          <strong>Diashow:</strong> Im Vollbild kannst du eine automatische Diashow starten und das
          Tempo wählen.
        </li>
        <li>
          <strong>Teilen &amp; Download:</strong> Über die Teilen-Funktion bekommst du einen Link,
          und mit „Herunterladen" speicherst du ein Foto oder Video auf deinem Gerät. In der
          Album-Ansicht kannst du auch mehrere Bilder markieren und gemeinsam herunterladen.
        </li>
        <li>
          <strong>Sortierung:</strong> Oben in der Galerie kannst du zwischen „Neueste zuerst" und
          „Älteste zuerst" umschalten.
        </li>
        <li>
          <strong>Dokumente:</strong> Hat die Lehrkraft Dokumente hinterlegt, erscheinen sie ganz
          oben über den Bildern. Tippe auf „Herunterladen", um sie zu öffnen.
        </li>
      </ul>

      <h2>Fotos &amp; Videos hochladen</h2>
      <p>
        In jedem Album kannst du eigene Inhalte beitragen. Tippe auf <strong>„Hochladen"</strong>,
        wähle ein oder mehrere Fotos oder kurze Videos aus (Videos bis ca. 60 Sekunden), und sie
        werden hochgeladen. Deine Beiträge sind zuerst mit dem Hinweis
        <strong> „wartet auf Freigabe"</strong> markiert — die Lehrkraft schaut sie kurz an, bevor
        sie für alle sichtbar werden.
      </p>
      <ul>
        <li>Du kannst mehrere Dateien auf einmal auswählen.</li>
        <li>
          Videos werden nach dem Hochladen kurz aufbereitet („wird verarbeitet") und sind dann
          überall sauber abspielbar.
        </li>
        <li>
          Deine noch nicht freigegebenen Beiträge siehst nur du. Du kannst sie über das kleine X
          wieder löschen, solange sie nicht freigegeben sind.
        </li>
      </ul>

      <h2>Ein Foto melden</h2>
      <p>
        Wenn dir ein Bild Sorgen macht oder nicht gezeigt werden sollte, kannst du es melden. Öffne
        das Foto und nutze die Melden-Funktion; schreib kurz dazu, worum es geht. Die Lehrkraft
        bekommt die Meldung und kümmert sich darum.
      </p>

      <h2>Für die Lehrkraft (Admin)</h2>
      <p>Als Administratorin oder Administrator hast du zusätzliche Möglichkeiten:</p>
      <ul>
        <li>
          <strong>Alben anlegen:</strong> Unter „Alben verwalten" legst du Alben an — mit Klasse(n),
          Datum (ein Tag oder ein Zeitraum) und später einem Titelbild aus den Fotos des Albums.
          Direkt nach dem Anlegen wirst du gefragt, ob du gleich Inhalte hochladen möchtest.
        </li>
        <li>
          <strong>Inhalte hinzufügen:</strong> Über „Bearbeiten" eines Albums kannst du selbst
          Fotos und Videos hochladen und <strong>bis zu 10 Dokumente</strong> (beliebiges Format,
          z. B. PDF, Word, Excel) hinterlegen. Die Dokumente erscheinen für alle ganz oben im Album.
        </li>
        <li>
          <strong>Freigeben:</strong> Unter „Freigabe" prüfst du neue Uploads. Du kannst mehrere auf
          einmal freigeben oder ablehnen — oder einen einzelnen Beitrag im Vollbild ansehen und dort
          entscheiden. An jeder Kachel steht, aus welchem Album sie kommt. Ein Video lässt sich
          freigeben, sobald es fertig verarbeitet ist.
        </li>
        <li>
          <strong>Meldungen:</strong> Unter „Meldungen" siehst du gemeldete Fotos. Du kannst die
          Meldung <strong>ignorieren</strong> (das Foto bleibt) oder das <strong>Foto entfernen</strong>
          (es wandert in den Papierkorb).
        </li>
        <li>
          <strong>Papierkorb:</strong> Gelöschte Fotos und Videos liegen 30 Tage im Papierkorb
          (unten unter „Alben verwalten"), lassen sich dort wiederherstellen oder endgültig löschen.
        </li>
        <li>
          <strong>Album löschen:</strong> Ein deaktiviertes Album kannst du löschen. Fotos und
          Videos wandern in den Papierkorb; hinterlegte Dokumente werden dabei endgültig gelöscht
          (für Dokumente gibt es keinen Papierkorb) — du wirst vorher gewarnt.
        </li>
        <li>
          <strong>Nutzer verwalten:</strong> Unter „Nutzer" schaltest du wartende Anmeldungen frei,
          lädst neue Adressen ein, machst Mitglieder zu Admins (oder zurück), deaktivierst Konten
          und weist Klassen zu — auch mehreren Konten auf einmal. Dort legst du auch fest, welche
          E-Mail-Domains sich anmelden dürfen, und ganz unten findest du ein <strong>Protokoll</strong>,
          das nachvollziehbar macht, wer wann was getan hat.
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
