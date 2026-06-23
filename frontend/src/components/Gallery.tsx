import { type Item } from "../api";

/**
 * Responsive photo grid. Tiles are square, rounded, lazily-loaded thumbnails
 * with a subtle hover lift and a caption that peeks in on hover/focus.
 * Clicking a tile opens the lightbox at that index.
 */
export function Gallery({
  items,
  onOpen,
  label,
}: {
  items: Item[];
  onOpen: (index: number) => void;
  label: string;
}) {
  return (
    <ul className="gallery-grid" aria-label={label}>
      {items.map((item, i) => (
        <li key={item.id} className="gallery-tile" style={{ animationDelay: `${Math.min(i, 16) * 35}ms` }}>
          <button
            type="button"
            className="gallery-tile-btn"
            onClick={() => onOpen(i)}
            aria-label={item.caption ? `Foto öffnen: ${item.caption}` : "Foto öffnen"}
          >
            <img
              className="gallery-img"
              src={item.thumbUrl}
              alt={item.caption || "Foto"}
              loading="lazy"
              decoding="async"
              draggable={false}
            />
            {item.caption && (
              <span className="gallery-caption" aria-hidden="true">{item.caption}</span>
            )}
            <span className="gallery-zoom" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}
