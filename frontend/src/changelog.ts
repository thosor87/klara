// Single source of truth for the app version + changelog (lives in the repo → GitHub).
// Bump APP_VERSION and add an entry when you ship something worth noting.
// The build stamp (git SHA + date) is injected automatically by Vite — see vite.config.ts.

export const APP_VERSION = "1.0.1";

export interface ChangelogEntry {
  version: string;
  date: string; // YYYY-MM-DD
  changes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.0.1",
    date: "2026-06-24",
    changes: [
      "Sicherheits-Härtung im Hintergrund: erzwungene Transportverschlüsselung, strengere Browser-Schutzheader (CSP & Co.) und Schutz vor Login-Missbrauch.",
      "Videos werden beim Aufbereiten von Metadaten (inkl. GPS-Standort) befreit.",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-06-24",
    changes: [
      "Videos: Hochladen, Freigabe und Wiedergabe — automatisch fürs Web aufbereitet (überall abspielbar).",
      "Dokumente: Die Lehrkraft kann pro Album bis zu 10 Dateien hinterlegen; sie erscheinen oben im Album zum Herunterladen.",
      "Meldungen vereinfacht: Ignorieren (Foto behalten) oder Foto entfernen (→ Papierkorb).",
      "Protokoll: In der Nutzer-Verwaltung ist nachvollziehbar, wer wann was getan hat.",
      "Album löschen: Fotos & Videos wandern in den Papierkorb, hinterlegte Dokumente werden mit Warnung entfernt.",
      "Mehrere Fotos markieren und gemeinsam herunterladen; im Querformat füllt das Bild den Schirm.",
      "Eigene Adresse klara.lilapixel.de und eine schönere Anmelde-Mail.",
    ],
  },
];
