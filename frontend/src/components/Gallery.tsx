import { type Item } from "../api";

/**
 * Responsive photo grid. Tiles are square, rounded, lazily-loaded thumbnails.
 * Clicking a tile opens the lightbox at that index. If `onToggleSelect` is
 * provided, each tile also shows a small checkbox in the corner — ticking it
 * selects the photo (for bulk download) WITHOUT opening the lightbox.
 */
export function Gallery({
  items,
  onOpen,
  label,
  selected,
  onToggleSelect,
}: {
  items: Item[];
  onOpen: (index: number) => void;
  label: string;
  selected?: Set<string>;
  onToggleSelect?: (id: string) => void;
}) {
  const selectable = !!onToggleSelect;
  return (
    <ul className="gallery-grid" aria-label={label}>
      {items.map((item, i) => {
        const isSel = !!selected?.has(item.id);
        return (
          <li
            key={item.id}
            className={`gallery-tile${isSel ? " gallery-tile--selected" : ""}`}
            style={{ animationDelay: `${Math.min(i, 16) * 35}ms` }}
          >
            <button
              type="button"
              className="gallery-tile-btn"
              onClick={() => onOpen(i)}
              aria-label={
                item.type === "video"
                  ? item.caption ? `Video öffnen: ${item.caption}` : "Video öffnen"
                  : item.caption ? `Foto öffnen: ${item.caption}` : "Foto öffnen"
              }
            >
              <img
                className="gallery-img"
                src={item.thumbUrl}
                alt={item.caption || (item.type === "video" ? "Video" : "Foto")}
                loading="lazy"
                decoding="async"
                draggable={false}
              />
              {item.type === "video" && item.processing && (
                <span className="processing-overlay" aria-hidden="true">⏳ wird verarbeitet</span>
              )}
              {item.type === "video" && !item.processing && <span className="video-badge" aria-hidden="true" />}
              {item.caption && (
                <span className="gallery-caption" aria-hidden="true">{item.caption}</span>
              )}
              <span className="gallery-zoom" aria-hidden="true" />
            </button>
            {selectable && (
              <button
                type="button"
                className={`gallery-check-btn${isSel ? " is-on" : ""}`}
                onClick={() => onToggleSelect!(item.id)}
                aria-pressed={isSel}
                aria-label={isSel ? "Foto abwählen" : "Foto für Download auswählen"}
              >
                <span aria-hidden="true">{isSel ? "✓" : ""}</span>
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
