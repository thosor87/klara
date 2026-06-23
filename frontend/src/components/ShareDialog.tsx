import { useEffect, useRef, useState } from "react";

/**
 * Shows the deep link to the current folder (and photo, if one is open) so a
 * class member can be pointed straight at it. The link is just the app URL —
 * Plan 2 fixes that sharing is login-only, so there are no token URLs. We make
 * that explicit in the note.
 */
export function ShareDialog({
  folderId,
  itemId,
  title,
  onClose,
}: {
  folderId: string;
  itemId?: string;
  title?: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const url = `${window.location.origin}/ordner/${folderId}${itemId ? `?foto=${itemId}` : ""}`;
  const canNativeShare = typeof navigator !== "undefined" && !!navigator.share;

  useEffect(() => {
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Clipboard blocked (e.g. insecure context): select-fallback handled by input.
      setCopied(false);
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({ title: title || "KlaRa", text: "Schau dir das in KlaRa an:", url });
    } catch { /* user cancelled */ }
  }

  return (
    <div className="dialog-backdrop share-backdrop" onClick={onClose}>
      <div
        className="dialog-card share-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="share-title">Teilen</h2>
        <p className="muted">
          Schick diesen Link an ein Klassen-Mitglied. {itemId ? "Er öffnet direkt dieses Foto." : "Er öffnet diesen Ordner."}
        </p>

        <div className="share-link-row">
          <input
            className="share-link-input"
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Link zum Teilen"
          />
          <button className="btn-secondary share-copy-btn" onClick={copy}>
            {copied ? "Kopiert ✓" : "Link kopieren"}
          </button>
        </div>

        {canNativeShare && (
          <button className="btn-secondary share-native-btn" onClick={nativeShare}>
            Über App teilen …
          </button>
        )}

        <p className="share-note">
          🔒 Nur angemeldete Klassen-Mitglieder können den Link öffnen.
        </p>

        <div className="dialog-actions">
          <button ref={closeRef} className="btn-ghost-dark" onClick={onClose}>Schließen</button>
        </div>
      </div>
    </div>
  );
}
