# KlaRa Plan 3 — Galerie (Vollbild, Diashow, Mobile, Teilen, Download)

> TDD gilt nur fürs Backend; dieses Plan ist fast reines Frontend (kein React-Test-Setup → Verifikation = `npm run build` + visuelle Prüfung).

**Goal:** Aus dem einfachen Foto-Grid (Plan 2) eine schöne, kindgerechte, moderne Galerie machen: Vollbild-Lightbox mit Tastatur/Swipe-Navigation, konfigurierbare Diashow, exzellentes Mobile-Layout (iPad/iPhone), Teilen-Dialog (Deeplink, nur für Eingeloggte) und Download. Das ist der Design-Showcase von KlaRa.

**Architecture:** Reines Frontend auf der Plan-2-Basis. Neu: clientseitiges Routing (`react-router-dom`) für Deeplinks zu Ordnern/Fotos (die Fastify-SPA-Fallback liefert für jeden Nicht-`/api`-Pfad `index.html`, also funktionieren echte Pfade). Kein Backend-Change (presigned GET-URLs aus Plan 2 reichen; 1 h Gültigkeit deckt eine Betrachtungssession).

**Tech Stack:** + `react-router-dom`. Vorhandene API unverändert.

## Design-Richtung (verbindlich)
- **Markenwelt:** Lila `#5b3fb0` als Leitfarbe, weiche abgerundete Flächen, sanfte Schatten, System-Font. Freundlich und verspielt, aber aufgeräumt und modern — **nicht** kindisch-überladen. Qualitätsanspruch: Portfolio-tauglich (LILAPIXEL).
- **Ruhe vor Foto:** In der Galerie tritt UI-Chrome zurück, die Fotos dominieren. Vollbild = dunkler, fast schwarzer Hintergrund, damit Farben leuchten.
- **Mobil zuerst:** Daumenfreundliche Tap-Ziele (≥44 px), Swipe-Gesten, Full-Bleed-Fotos auf dem Handy, `viewport-fit=cover` (Safe-Areas auf iPhone beachten via `env(safe-area-inset-*)`).
- **Bewegung dezent:** sanfte Übergänge (fade/scale), `prefers-reduced-motion` respektieren.
- **Barrierearm:** sichtbarer Fokus, `alt`-Texte (Caption oder „Foto"), Lightbox per Tastatur bedienbar, Screenreader-Ankündigung der Position („Foto 3 von 12").

## Routing (neu, `react-router-dom`)
SPA-Pfade (alle login-gated: ohne aktive Session → Login-Screen, danach Weiterleitung zum Ziel):
- `/` — Ordner-Übersicht
- `/ordner/:folderId` — Galerie eines Ordners
- `/ordner/:folderId?foto=:itemId` — Galerie mit geöffneter Lightbox auf diesem Foto (Query-Param, damit Teilen-Links auf ein konkretes Foto zeigen können)
- Admin: `/freigabe`, `/verwaltung/ordner`, `/verwaltung/nutzer`
Die bestehende `App.tsx`-View-Umschaltung wird auf den Router umgestellt; `TopBar`/`NavBar` nutzen `<Link>`/`NavLink`. Login-Gate bleibt: solange `/api/me` 401 liefert, Login-Screen; nach Login normal navigieren (die Ziel-URL bleibt erhalten).

## Komponenten
| Datei | Inhalt |
|---|---|
| `frontend/src/components/Gallery.tsx` | Responsives Foto-Grid (gleichmäßige, abgerundete Kacheln; Lazy-`loading="lazy"` für Thumbs; Hover-Zoom dezent; Klick → Lightbox). Ersetzt das simple Grid in `FolderView`. |
| `frontend/src/components/Lightbox.tsx` | Vollbild-Overlay: großes Bild (`webUrl`), Caption, Vor/Zurück (Pfeiltasten + On-Screen-Buttons + Touch-Swipe), Schließen (Esc/Tap/Backdrop), Zähler „3/12", Buttons **Diashow**, **Teilen**, **Download**. Fokus-Falle + Body-Scroll-Lock. |
| `frontend/src/components/Slideshow.tsx` (oder Teil von Lightbox) | Auto-Advance mit konfigurierbarem Intervall (3/5/10 s, Auswahl im UI), Play/Pause, Loop, sanftes Fade. Pausiert bei Nutzerinteraktion. |
| `frontend/src/components/ShareDialog.tsx` | Kleiner Dialog: zeigt den Deeplink (`<APP_BASE_URL>/ordner/:id` bzw. mit `?foto=`), Button **Link kopieren** (`navigator.clipboard`), Hinweis „Nur angemeldete Klassen-Mitglieder können den Link öffnen." Optional Web-Share-API (`navigator.share`) auf Mobile. |
| `frontend/src/download.ts` | `downloadImage(url, filename)` — `fetch`→`blob`→Object-URL→`<a download>`-Klick. Dateiname z.B. `klara-<caption-oder-datum>.jpg`. |

## Verhalten im Detail
- **Lightbox-Navigation:** ← / → blättern, Esc schließt, Home/End optional. Touch: horizontaler Swipe blättert, Swipe-down oder Tap auf Backdrop schließt. Vorladen des nächsten Bildes (`new Image()`), damit Blättern flüssig ist.
- **Diashow:** Start über Button in der Lightbox; läuft mit gewähltem Intervall, blendet Chrome aus, loopt am Ende. Jede Nutzer-Navigation pausiert sie. `prefers-reduced-motion` → kein Fade, harter Schnitt.
- **Teilen:** kopiert den aktuellen Deeplink. Da Plan 2 „Teilen nur für Eingeloggte" festlegt, ist das schlicht die App-URL — keine Token-URLs. Der Dialog macht das transparent.
- **Download:** lädt die `webUrl` (verkleinerte, EXIF-freie Version — das ist bewusst die teilbare Variante).
- **URL-Ablauf:** presigned GET gilt 1 h. Für den Normalfall ausreichend; wenn ein Bild nach langer Session nicht lädt, lädt ein Klick die Ordnerliste neu (frische URLs). (Ein dedizierter Refresh-Endpoint ist bewusst nicht Teil von Plan 3.)

## Tasks
1. `react-router-dom` installieren; `App.tsx` auf `<BrowserRouter>` + Routen umstellen, Login-Gate beibehalten, `TopBar`/`NavBar` auf Router-Links.
2. `Gallery.tsx` — schönes responsives Grid, ersetzt das Grid in `FolderView`.
3. `Lightbox.tsx` — Vollbild + Navigation (Tastatur/Buttons/Swipe) + Zähler + Fokus/Scroll-Lock + a11y.
4. Diashow in die Lightbox integrieren (Intervall-Auswahl, Play/Pause, Loop, reduced-motion).
5. `ShareDialog.tsx` + Deeplink-Logik (`?foto=` öffnet Lightbox beim Laden).
6. `download.ts` + Download-Button.
7. CSS-Politur in `styles.css` (dunkles Lightbox-Theme, Grid, Safe-Areas, Transitions, Fokus-Styles), Mobile-Feinschliff.

## Definition of Done
- `npm run build` sauber.
- Deeplink `/ordner/:id` öffnet (nach Login) direkt die Galerie; `?foto=:itemId` öffnet die Lightbox auf dem Foto.
- Lightbox: Tastatur + Swipe + Buttons navigieren; Diashow läuft konfigurierbar; Teilen kopiert den Link; Download lädt das Bild.
- Sauber auf iPhone/iPad (Safe-Areas, Swipe, große Tap-Ziele) und Desktop.
- `prefers-reduced-motion` respektiert; Lightbox per Tastatur bedienbar.
