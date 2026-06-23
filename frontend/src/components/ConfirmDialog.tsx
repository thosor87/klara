import { useCallback, useEffect, useRef, useState } from "react";

type ConfirmOptions = {
  title: string;
  message: string;
  /** Label for the primary (confirming) action button. */
  confirmLabel: string;
  /** Optional label for the cancel button (defaults to "Abbrechen"). */
  cancelLabel?: string;
  /** Style the confirm button as a destructive action (red). */
  danger?: boolean;
};

type PendingConfirm = ConfirmOptions & {
  resolve: (ok: boolean) => void;
};

/**
 * Branded replacement for `window.confirm`. Returns an `ask()` function that
 * resolves to a boolean, plus a `dialog` element to render once near the root
 * of the consuming component. Matches the existing dialog-backdrop/dialog-card
 * styling used by ShareDialog. Esc and backdrop-click cancel; the confirm
 * button is focused on open.
 */
export function useConfirm() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const ask = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...opts, resolve });
    });
  }, []);

  const close = useCallback(
    (ok: boolean) => {
      setPending((cur) => {
        cur?.resolve(ok);
        return null;
      });
    },
    [],
  );

  const dialog = pending ? (
    <ConfirmDialog
      title={pending.title}
      message={pending.message}
      confirmLabel={pending.confirmLabel}
      cancelLabel={pending.cancelLabel}
      danger={pending.danger}
      onConfirm={() => close(true)}
      onCancel={() => close(false)}
    />
  ) : null;

  return { ask, dialog };
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = "Abbrechen",
  danger,
  onConfirm,
  onCancel,
}: ConfirmOptions & { onConfirm: () => void; onCancel: () => void }) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div
        className="dialog-card confirm-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title">{title}</h2>
        <p className="muted">{message}</p>
        <div className="dialog-actions">
          <button type="button" className="btn-ghost-dark" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={danger ? "btn-danger" : undefined}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
