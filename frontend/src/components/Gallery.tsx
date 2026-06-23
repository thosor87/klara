import { type Item } from "../api";

/**
 * Responsive photo grid. Tiles are square, rounded, lazily-loaded thumbnails
 * with a subtle hover lift and a caption that peeks in on hover/focus.
 *
 * Normal mode: clicking a tile opens the lightbox at that index.
 * Selection mode (`selectable`): clicking a tile toggles its selection.
 */
export function Gallery({
  items,
  onOpen,
  label,
  selectable = false,
  selected,
  onToggleSelect,
}: {
  items: Item[];
  onOpen: (index: number) => void;
  label: string;
  selectable?: boolean;
  selected?: Set<string>;
  onToggleSelect?: (id: string) => void;
}) {
  return (
    <ul className="gallery-grid" aria-label={label}>
      {items.map((item, i) => {
        const isSelected = selectable && !!selected?.has(item.id);
        return (
          <li
            key={item.id}
            className={`gallery-tile${isSelected ? " gallery-tile--selected" : ""}`}
            style={{ animationDelay: `${Math.min(i, 16) * 35}ms` }}
          >
            <button
              type="button"
              className="gallery-tile-btn"
              onClick={() => (selectable ? onToggleSelect?.(item.id) : onOpen(i))}
              aria-pressed={selectable ? isSelected : undefined}
              aria-label={
                selectable
                  ? `Foto ${isSelected ? "abwählen" : "auswählen"}${item.caption ? `: ${item.caption}` : ""}`
                  : item.caption
                    ? `Foto öffnen: ${item.caption}`
                    : "Foto öffnen"
              }
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
              {selectable ? (
                <span className={`gallery-check${isSelected ? " is-on" : ""}`} aria-hidden="true">
                  {isSelected ? "✓" : ""}
                </span>
              ) : (
                <span className="gallery-zoom" aria-hidden="true" />
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
