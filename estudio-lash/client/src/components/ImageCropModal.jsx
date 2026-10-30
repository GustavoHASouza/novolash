import { useEffect, useRef, useState } from 'react';

/**
 * Modal interativo para posicionar e dar zoom na imagem antes de salvar,
 * garantindo o enquadramento exato (16:10 para serviços ou 1:1 para foto da conta).
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
  const imgRef = useRef(null);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [frameSize, setFrameSize] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgRef.current = img;
      setImgSize({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };
    img.src = src;
  }, [src]);

  useEffect(() => {
    function updateFrame() {
      if (!frameRef.current) return;
      const rect = frameRef.current.getBoundingClientRect();
      setFrameSize({ w: rect.width, h: rect.height });
    }
    updateFrame();
    window.addEventListener('resize', updateFrame);
    return () => window.removeEventListener('resize', updateFrame);
  }, []);

  // Escala base para cobrir todo o quadro (object-fit: cover)
  const baseScale =
    imgSize.w && imgSize.h && frameSize.w && frameSize.h
      ? Math.max(frameSize.w / imgSize.w, frameSize.h / imgSize.h)
      : 1;

  const renderedW = imgSize.w * baseScale * zoom;
  const renderedH = imgSize.h * baseScale * zoom;
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

  function handleApply() {
    const img = imgRef.current;
    if (!img || !frameSize.w || !frameSize.h) return;

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
    ctx.drawImage(img, drawX, drawY, drawW, drawH);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    onConfirm(dataUrl);
  }

  return (
    <div className="crop-modal-backdrop" onClick={onCancel}>
      <div className="crop-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="crop-modal-header">
          <div>
            <h3>{title}</h3>
            <p className="muted">Arraste a foto para posicionar e ajuste o zoom como desejar.</p>
          </div>
          <button type="button" className="ghost sm" onClick={onCancel}>
            Fechar
          </button>
        </div>

        <div
          ref={frameRef}
          className={`crop-frame ${circle ? 'crop-frame-circle' : ''}`}
          style={{ aspectRatio: `${aspect}` }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {imgSize.w > 0 && (
            <img
              src={src}
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

        <div className="crop-modal-actions">
          <button type="button" className="ghost" onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" onClick={handleApply}>
            Aplicar ajuste
          </button>
        </div>
      </div>
    </div>
  );
}
