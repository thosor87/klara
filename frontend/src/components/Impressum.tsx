import { Link } from "react-router-dom";

export function Impressum() {
  return (
    <article className="legal-page">
      <Link to="/" className="legal-back">← Zurück</Link>
      <div className="page-head">
        <p className="page-kicker">Rechtliches</p>
        <h1 className="page-title">Impressum</h1>
      </div>

      <h2>Angaben gemäß § 5 DDG (Digitale-Dienste-Gesetz)</h2>

      <h2>Verantwortlich</h2>
      <p>
        Thomas Soring
        <br />
        Le-Corbusier-Str. 31b
        <br />
        26127 Oldenburg
      </p>

      <h2>Kontakt</h2>
      <p>
        E-Mail: <a href="mailto:tsoring@lilapixel.de">tsoring@lilapixel.de</a>
      </p>

      <h2>Zweck dieser Anwendung</h2>
      <p>
        KlaRa ist ein privates, nicht-kommerzielles Angebot zum geprüften
        Austausch von Fotos innerhalb einer Grundschulklasse. Der Zugang ist auf
        die von der Lehrkraft freigeschalteten Klassen-Mitglieder beschränkt.
      </p>

      <h2>Haftung für Inhalte</h2>
      <p>
        Die Inhalte dieser Anwendung wurden mit größter Sorgfalt erstellt. Für die
        Richtigkeit, Vollständigkeit und Aktualität kann jedoch keine Gewähr
        übernommen werden. Als Diensteanbieter bin ich gemäß § 7 Abs. 1 DDG für
        eigene Inhalte nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis
        10 DDG bin ich als Diensteanbieter nicht verpflichtet, übermittelte oder
        gespeicherte fremde Informationen zu überwachen oder nach Umständen zu
        forschen, die auf eine rechtswidrige Tätigkeit hinweisen. Von Nutzern
        hochgeladene Fotos werden vor der Veröffentlichung durch die Lehrkraft
        geprüft und freigegeben.
      </p>

      <h2>Urheberrecht</h2>
      <p>
        Die in dieser Anwendung geteilten Fotos und Inhalte unterliegen dem
        deutschen Urheberrecht und verbleiben bei den jeweiligen Urhebern. Eine
        Verwendung außerhalb der Klassen-Gemeinschaft, insbesondere eine
        Weiterverbreitung von Fotos, auf denen Kinder zu sehen sind, ist ohne
        Zustimmung der Betroffenen bzw. ihrer Erziehungsberechtigten nicht
        gestattet.
      </p>

      <h2>Datenschutz</h2>
      <p>
        Informationen zur Verarbeitung personenbezogener Daten finden Sie in der{" "}
        <Link to="/datenschutz">Datenschutzerklärung</Link>.
      </p>
      <p>
        Der Nutzung der im Rahmen der Impressumspflicht veröffentlichten
        Kontaktdaten durch Dritte zur Übersendung nicht ausdrücklich angeforderter
        Werbung wird hiermit ausdrücklich widersprochen.
      </p>
    </article>
  );
}
