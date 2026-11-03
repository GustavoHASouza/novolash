import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Editor de imagem em tela cheia para posicionar, dar zoom e girar a foto antes de salvar,
 * garantindo o enquadramento exato (16:10 para serviços ou 1:1 para foto da conta).
 * Renderizado via portal no <body> para ficar sempre visível, independentemente da rolagem.
 */
export default function ImageCropModal({
  src,
  aspect = 16 / 10,
  outputWidth = 960,
  circle = false,
  title = 'Ajustar enquadramento da imagem',
  onCancel,
  onConfirm,
}) {
  const frameRef = useRef(null);
  const originalRef = useRef(null);
  const [workSrc, setWorkSrc] = useState(null);
  const [workImg, setWorkImg] = useState(null);
  const [rotation, setRotation] = useState(0);
  const [frameSize, setFrameSize] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  // Trava a rolagem da página enquanto o editor estiver aberto
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => e.key === 'Escape' && onCancel?.();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onCancel]);

  // Carrega a imagem original
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      originalRef.current = img;
      setRotation(0);
      setWorkSrc(src);
      setLoadError(false);
    };
    img.onerror = () => setLoadError(true);
    img.src = src;
  }, [src]);

  // Gera a versão girada a partir da original (sem perda acumulada de qualidade)
  useEffect(() => {
    const img = originalRef.current;
    if (!img) return;
    if (rotation === 0) {
      setWorkSrc(src);
      return;
    }
    try {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      const swap = rotation % 180 !== 0;
      const canvas = document.createElement('canvas');
      canvas.width = swap ? h : w;
      canvas.height = swap ? w : h;
      const ctx = canvas.getContext('2d');
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.drawImage(img, -w / 2, -h / 2);
      setWorkSrc(canvas.toDataURL('image/jpeg', 0.92));
    } catch {
      setLoadError(true);
    }
  }, [rotation, src]);

  useEffect(() => {
    if (!workSrc) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setWorkImg(img);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };
    img.src = workSrc;
  }, [workSrc]);

  useEffect(() => {
    function updateFrame() {
      if (!frameRef.current) return;
      const rect = frameRef.current.getBoundingClientRect();
      setFrameSize({ w: rect.width, h: rect.height });
    }
    updateFrame();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateFrame) : null;
    if (ro && frameRef.current) ro.observe(frameRef.current);
    window.addEventListener('resize', updateFrame);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', updateFrame);
    };
  }, []);

  const imgW = workImg ? workImg.naturalWidth || workImg.width : 0;
  const imgH = workImg ? workImg.naturalHeight || workImg.height : 0;

  // Escala base para cobrir todo o quadro (object-fit: cover)
  const baseScale =
    imgW && imgH && frameSize.w && frameSize.h
      ? Math.max(frameSize.w / imgW, frameSize.h / imgH)
      : 1;

  const renderedW = imgW * baseScale * zoom;
  const renderedH = imgH * baseScale * zoom;
  const maxOffsetX = Math.max(0, (renderedW - frameSize.w) / 2);
  const maxOffsetY = Math.max(0, (renderedH - frameSize.h) / 2);

  const clamp = (val, min, max) => Math.min(max, Math.max(min, val));
  const clampedOffset = {
    x: clamp(offset.x, -maxOffsetX, maxOffsetX),
    y: clamp(offset.y, -maxOffsetY, maxOffsetY),
  };

  function handlePointerDown(e) {
    e.preventDefault();
    setDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      ox: clampedOffset.x,
      oy: clampedOffset.y,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function handlePointerMove(e) {
    if (!dragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setOffset({
      x: clamp(dragStartRef.current.ox + dx, -maxOffsetX, maxOffsetX),
      y: clamp(dragStartRef.current.oy + dy, -maxOffsetY, maxOffsetY),
    });
  }

  function handlePointerUp() {
    setDragging(false);
  }

  const rotate = (delta) => setRotation((r) => (r + delta + 360) % 360);

  function handleApply() {
    if (!workImg || !frameSize.w || !frameSize.h) return;

    const outW = outputWidth;
    const outH = Math.round(outputWidth / aspect);
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');

    const ratio = outW / frameSize.w;
    const drawW = renderedW * ratio;
    const drawH = renderedH * ratio;
    const drawX = (outW - drawW) / 2 + clampedOffset.x * ratio;
    const drawY = (outH - drawH) / 2 + clampedOffset.y * ratio;

    ctx.fillStyle = '#faf5f0';
    ctx.fillRect(0, 0, outW, outH);
    try {
      ctx.drawImage(workImg, drawX, drawY, drawW, drawH);
      onConfirm(canvas.toDataURL('image/jpeg', 0.85));
    } catch {
      setLoadError(true);
    }
  }

  const RotateIcon = ({ flip }) => (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
    >
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <polyline points="3 3 3 9 9 9" />
    </svg>
  );

  return createPortal(
    <div className="crop-editor" role="dialog" aria-modal="true" aria-label={title}>
      <div className="crop-editor-top">
        <button type="button" className="crop-editor-link" onClick={onCancel}>
          Cancelar
        </button>
        <span className="crop-editor-title">{title}</span>
        <button type="button" className="crop-editor-link strong" onClick={handleApply} disabled={!workImg}>
          Aplicar
        </button>
      </div>

      <div className="crop-editor-stage">
        <div
          ref={frameRef}
          className={`crop-frame ${circle ? 'crop-frame-circle' : ''}`}
          style={{ aspectRatio: `${aspect}` }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {workImg && (
            <img
              src={workSrc}
              alt="Pré-visualização do recorte"
              draggable={false}
              style={{
                width: `${renderedW}px`,
                height: `${renderedH}px`,
                transform: `translate(calc(-50% + ${clampedOffset.x}px), calc(-50% + ${clampedOffset.y}px))`,
              }}
            />
          )}
          <div className="crop-grid-overlay" />
        </div>
        <p className="crop-editor-hint">
          {loadError
            ? 'Não foi possível editar esta imagem a partir do link. Envie a foto pelo aparelho para ajustá-la.'
            : 'Arraste a foto para posicionar, use o zoom e gire se necessário.'}
        </p>
      </div>

      <div className="crop-editor-panel">
        <div className="crop-controls">
          <span className="crop-zoom-label">Zoom</span>
          <input
            type="range"
            min="1"
            max="3"
            step="0.02"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
          <span className="crop-zoom-value">{Math.round(zoom * 100)}%</span>
        </div>

        <div className="crop-rotate-row">
          <button type="button" className="ghost sm crop-rotate-btn" onClick={() => rotate(-90)}>
            <RotateIcon /> Girar à esquerda
          </button>
          <button type="button" className="ghost sm crop-rotate-btn" onClick={() => rotate(90)}>
            <RotateIcon flip /> Girar à direita
          </button>
        </div>

        <div className="crop-modal-actions">
          <button type="button" className="ghost" onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" onClick={handleApply} disabled={!workImg}>
            Aplicar ajuste
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
