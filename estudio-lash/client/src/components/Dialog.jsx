import { useEffect } from 'react';
import { createPortal } from 'react-dom';

/** Janela sobreposta genérica, renderizada no <body> e centralizada na tela. */
export function Modal({ title, subtitle, onClose, children, footer, size = 'md' }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return createPortal(
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        className={`dialog-card dialog-${size}`}
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {(title || subtitle) && (
          <div className="dialog-header">
            <div>
              {title && <h3>{title}</h3>}
              {subtitle && <p className="muted">{subtitle}</p>}
            </div>
            <button type="button" className="dialog-close" onClick={onClose} aria-label="Fechar">
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M5 5l10 10M15 5L5 15" />
              </svg>
            </button>
          </div>
        )}
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-footer">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

/** Confirmação (com dois botões) ou aviso simples (um botão). */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Sim',
  cancelLabel = 'Não',
  tone = 'default',
  busy = false,
  onConfirm,
  onCancel,
  alertOnly = false,
}) {
  return (
    <Modal
      onClose={onCancel}
      size="sm"
      footer={
        alertOnly ? (
          <button type="button" onClick={onCancel}>
            Entendi
          </button>
        ) : (
          <>
            <button type="button" className="ghost" onClick={onCancel} disabled={busy}>
              {cancelLabel}
            </button>
            <button
              type="button"
              className={tone === 'danger' ? 'danger' : ''}
              onClick={onConfirm}
              disabled={busy}
            >
              {busy ? 'Aguarde...' : confirmLabel}
            </button>
          </>
        )
      }
    >
      <div className={`confirm-content ${tone}`}>
        <span className="confirm-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9.5" />
            <path d="M12 7.5v5.5" />
            <path d="M12 16.5h.01" />
          </svg>
        </span>
        <div>
          <h3>{title}</h3>
          {message && <p>{message}</p>}
        </div>
      </div>
    </Modal>
  );
}

/** Aviso flutuante que não altera a posição de rolagem da página. */
export function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(onClose, toast.err ? 5000 : 3200);
    return () => clearTimeout(t);
  }, [toast, onClose]);

  if (!toast) return null;
  return createPortal(
    <div className={`toast ${toast.err ? 'err' : 'ok'}`} role="status" onClick={onClose}>
      {toast.err || toast.ok}
    </div>,
    document.body
  );
}
