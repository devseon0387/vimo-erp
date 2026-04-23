'use client';

import { useEffect, useRef } from 'react';

const LERP_RING  = 0.18;
const LERP_DOT   = 0.15;
const DOT_SIZE    = 13;
const RING_SIZE   = 50;

export default function CustomCursor() {
  const dotRef  = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches) return;

    const dot  = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;

    let mouseX = -100, mouseY = -100;
    let ringX  = -100, ringY  = -100;
    let rafId: number;
    let hovering = false;

    let dotScale = 1;
    let dotScaleTarget = 1;

    // ring scale: 1 = RING_SIZE, hover = 30/RING_SIZE
    let ringScale = 1;
    let ringScaleTarget = 1;

    const applyDefault = () => {
      dotScaleTarget = 1;
      dot.style.opacity      = '1';
      dot.style.background   = 'rgb(234,88,12)';
      ringScaleTarget        = 1;
      ring.style.opacity     = '0.45';
      ring.style.background  = 'transparent';
      ring.style.borderWidth = '2px';
      ring.style.borderColor = 'rgba(249,115,22,0.7)';
    };

    const applyHover = () => {
      dot.style.opacity      = '0';
      ringScaleTarget        = 30 / RING_SIZE;
      ring.style.opacity     = '1';
      ring.style.background  = 'rgba(249,115,22,0.13)';
      ring.style.borderWidth = '1.5px';
      ring.style.borderColor = 'rgba(249,115,22,0.75)';
    };

    const onMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };

    const onMouseOver = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('a,button,input,textarea,select,[role="button"]')) {
        if (!hovering) { hovering = true; applyHover(); }
      }
    };
    const onMouseOut = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('a,button,input,textarea,select,[role="button"]')) {
        if (hovering) { hovering = false; applyDefault(); }
      }
    };

    const onMouseDown = () => {
      if (hovering) {
        ring.style.background  = 'rgba(249,115,22,0.22)';
        ring.style.borderColor = 'rgba(249,115,22,1)';
      } else {
        dotScaleTarget = (RING_SIZE - 4) / DOT_SIZE;
        ring.style.opacity = '0.6';
      }
    };
    const onMouseUp = () => {
      hovering ? applyHover() : applyDefault();
    };

    const onDocLeave = () => { dot.style.opacity = '0'; ring.style.opacity = '0'; };
    const onDocEnter = () => { if (!hovering) { dot.style.opacity = '1'; ring.style.opacity = '0.45'; } };

    const loop = () => {
      // dot: translate 즉시 (중심 보정), scale lerp
      dotScale += (dotScaleTarget - dotScale) * LERP_DOT;
      dot.style.transform = `translate(${mouseX - DOT_SIZE / 2}px, ${mouseY - DOT_SIZE / 2}px) scale(${dotScale})`;

      // ring: translate lerp (중심 보정), scale lerp
      ringX += (mouseX - ringX) * LERP_RING;
      ringY += (mouseY - ringY) * LERP_RING;
      ringScale += (ringScaleTarget - ringScale) * LERP_DOT;
      ring.style.transform = `translate(${ringX - RING_SIZE / 2}px, ${ringY - RING_SIZE / 2}px) scale(${ringScale})`;

      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);

    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('mouseover', onMouseOver, { passive: true });
    window.addEventListener('mouseout',  onMouseOut,  { passive: true });
    window.addEventListener('mousedown', onMouseDown, { passive: true });
    window.addEventListener('mouseup',   onMouseUp,   { passive: true });
    document.addEventListener('mouseleave', onDocLeave, { passive: true });
    document.addEventListener('mouseenter', onDocEnter, { passive: true });

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseover', onMouseOver);
      window.removeEventListener('mouseout',  onMouseOut);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup',   onMouseUp);
      document.removeEventListener('mouseleave', onDocLeave);
      document.removeEventListener('mouseenter', onDocEnter);
    };
  }, []);

  return (
    <>
      <div
        ref={dotRef}
        style={{
          position:      'fixed',
          top:           0,
          left:          0,
          width:         DOT_SIZE,
          height:        DOT_SIZE,
          background:    'rgb(234,88,12)',
          borderRadius:  '50%',
          pointerEvents: 'none',
          zIndex:        99999,
          willChange:    'transform, opacity',
          transition:    'opacity 0.15s ease, background 0.15s ease',
        }}
      />
      <div
        ref={ringRef}
        style={{
          position:      'fixed',
          top:           0,
          left:          0,
          width:         RING_SIZE,
          height:        RING_SIZE,
          borderRadius:  '50%',
          border:        '2px solid rgba(249,115,22,0.7)',
          background:    'transparent',
          pointerEvents: 'none',
          zIndex:        99998,
          opacity:       0.45,
          willChange:    'transform, opacity',
          transition:    'opacity 0.2s ease, background 0.2s ease, border-color 0.2s ease, border-width 0.2s ease',
        }}
      />
    </>
  );
}
