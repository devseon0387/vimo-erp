'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTutorial } from './useTutorial';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const PADDING = 8;
const TOOLTIP_GAP = 12;
const TOOLTIP_W = 320;
const TOOLTIP_H_ESTIMATE = 200; // 툴팁 예상 높이

export default function TutorialOverlay() {
  const { isActive, currentStepIndex, steps, nextStep, prevStep, skip } = useTutorial();
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [windowSize, setWindowSize] = useState({ w: 0, h: 0 });
  const [resolvedPlacement, setResolvedPlacement] = useState<'top' | 'bottom' | 'left' | 'right'>('bottom');
  const tooltipRef = useRef<HTMLDivElement>(null);
  const measureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentStep = steps[currentStepIndex];

  // 대상 요소 위치 측정
  const measureTarget = useCallback(() => {
    if (!currentStep) return;
    const el = document.querySelector(`[data-tour="${currentStep.target}"]`);
    if (!el) {
      setTargetRect(null);
      return;
    }

    const rect = el.getBoundingClientRect();
    const padded: Rect = {
      x: rect.x - PADDING,
      y: rect.y - PADDING,
      width: rect.width + PADDING * 2,
      height: rect.height + PADDING * 2,
    };
    setTargetRect(padded);

    // 툴팁이 뷰포트 안에 들어오도록 placement 자동 조정
    const ww = window.innerWidth;
    const wh = window.innerHeight;
    const preferred = currentStep.placement;

    const fitsBottom = padded.y + padded.height + TOOLTIP_GAP + TOOLTIP_H_ESTIMATE < wh;
    const fitsTop = padded.y - TOOLTIP_GAP - TOOLTIP_H_ESTIMATE > 0;
    const fitsLeft = padded.x - TOOLTIP_GAP - TOOLTIP_W > 0;
    const fitsRight = padded.x + padded.width + TOOLTIP_GAP + TOOLTIP_W < ww;

    // 선호 방향이 들어가면 그대로, 아니면 다른 방향 시도
    if (preferred === 'bottom' && fitsBottom) setResolvedPlacement('bottom');
    else if (preferred === 'top' && fitsTop) setResolvedPlacement('top');
    else if (preferred === 'left' && fitsLeft) setResolvedPlacement('left');
    else if (preferred === 'right' && fitsRight) setResolvedPlacement('right');
    else if (fitsBottom) setResolvedPlacement('bottom');
    else if (fitsTop) setResolvedPlacement('top');
    else if (fitsLeft) setResolvedPlacement('left');
    else if (fitsRight) setResolvedPlacement('right');
    else setResolvedPlacement('bottom'); // 최후 폴백
  }, [currentStep]);

  // 스텝 변경 시 대상으로 스크롤 후 측정
  // 탭 전환 등으로 대상이 아직 DOM에 없을 수 있으므로 재시도
  useEffect(() => {
    if (!isActive || !currentStep) return;

    setWindowSize({ w: window.innerWidth, h: window.innerHeight });

    let retryCount = 0;
    const MAX_RETRIES = 10;

    const tryMeasure = () => {
      const el = document.querySelector(`[data-tour="${currentStep.target}"]`);
      if (!el) {
        // 대상이 아직 렌더링 안 됨 → 재시도
        if (retryCount < MAX_RETRIES) {
          retryCount++;
          measureTimerRef.current = setTimeout(tryMeasure, 100);
        } else {
          setTargetRect(null);
        }
        return;
      }

      // 뷰포트 안에 있는지 체크
      const rect = el.getBoundingClientRect();
      const inView = rect.top >= 0 && rect.bottom <= window.innerHeight;

      if (!inView) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // 스크롤 애니메이션 완료 후 측정
        measureTimerRef.current = setTimeout(measureTarget, 350);
      } else {
        measureTarget();
      }
    };

    // 초기 50ms 대기 (탭 전환 등 state 반영 대기)
    measureTimerRef.current = setTimeout(tryMeasure, 50);

    return () => {
      if (measureTimerRef.current) clearTimeout(measureTimerRef.current);
    };
  }, [isActive, currentStepIndex, currentStep, measureTarget]);

  // 리사이즈 & 스크롤 시 재측정
  useEffect(() => {
    if (!isActive) return;

    const handleResize = () => {
      setWindowSize({ w: window.innerWidth, h: window.innerHeight });
      measureTarget();
    };
    const handleScroll = () => measureTarget();

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isActive, measureTarget]);

  // Escape 키 → 건너뛰기
  useEffect(() => {
    if (!isActive) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') skip();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isActive, skip]);

  if (!isActive || !currentStep) return null;

  // 툴팁 위치 계산
  const tooltipStyle = computeTooltipStyle(targetRect, resolvedPlacement, windowSize);

  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          key="tutorial-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          style={{ position: 'fixed', inset: 0, zIndex: 9999, pointerEvents: 'auto' }}
        >
          {/* SVG 마스크 오버레이 */}
          <svg
            width="100%"
            height="100%"
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
          >
            <defs>
              <mask id="tutorial-mask">
                <rect width="100%" height="100%" fill="white" />
                {targetRect && (
                  <motion.rect
                    initial={false}
                    animate={{
                      x: targetRect.x,
                      y: targetRect.y,
                      width: targetRect.width,
                      height: targetRect.height,
                    }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    rx={12}
                    fill="black"
                  />
                )}
              </mask>
            </defs>
            <rect
              width="100%"
              height="100%"
              fill="rgba(0,0,0,0.5)"
              mask="url(#tutorial-mask)"
              onClick={skip}
              style={{ cursor: 'pointer' }}
            />
          </svg>

          {/* 스포트라이트 보더 */}
          {targetRect && (
            <motion.div
              initial={false}
              animate={{
                left: targetRect.x,
                top: targetRect.y,
                width: targetRect.width,
                height: targetRect.height,
              }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              style={{
                position: 'fixed',
                borderRadius: 12,
                border: '2px solid rgba(249, 115, 22, 0.6)',
                boxShadow: '0 0 0 4px rgba(249, 115, 22, 0.15)',
                pointerEvents: 'none',
              }}
            />
          )}

          {/* 툴팁 */}
          <motion.div
            ref={tooltipRef}
            key={currentStepIndex}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2, delay: 0.1 }}
            style={{
              position: 'fixed',
              ...tooltipStyle,
              width: TOOLTIP_W,
              maxWidth: 'calc(100vw - 32px)',
              pointerEvents: 'auto',
            }}
          >
            <div
              style={{
                background: '#fff',
                borderRadius: 16,
                padding: '20px',
                boxShadow: '0 20px 60px -8px rgba(0,0,0,0.2), 0 4px 16px -4px rgba(0,0,0,0.1)',
                border: '1px solid #f0ece9',
              }}
            >
              {/* 스텝 카운터 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                {steps.map((_, i) => (
                  <div
                    key={i}
                    style={{
                      width: i === currentStepIndex ? 20 : 6,
                      height: 6,
                      borderRadius: 3,
                      background: i === currentStepIndex ? '#f97316' : '#e7e5e4',
                      transition: 'all 0.2s',
                    }}
                  />
                ))}
                <span style={{ marginLeft: 'auto', fontSize: 12, color: '#a8a29e', fontWeight: 500 }}>
                  {currentStepIndex + 1}/{steps.length}
                </span>
              </div>

              {/* 제목 + 설명 */}
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1c1917', marginBottom: 6 }}>
                {currentStep.title}
              </h3>
              <p style={{ fontSize: 14, color: '#78716c', lineHeight: 1.5, marginBottom: 16 }}>
                {currentStep.description}
              </p>

              {/* 버튼 */}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  onClick={skip}
                  style={{
                    padding: '8px 16px',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#a8a29e',
                    background: 'none',
                    border: 'none',
                    borderRadius: 10,
                    cursor: 'pointer',
                    transition: 'color 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#78716c'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#a8a29e'; }}
                >
                  건너뛰기
                </button>
                {currentStepIndex > 0 && (
                  <button
                    onClick={prevStep}
                    style={{
                      padding: '8px 16px',
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#44403c',
                      background: '#f5f3f1',
                      border: 'none',
                      borderRadius: 10,
                      cursor: 'pointer',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#ebe8e5'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#f5f3f1'; }}
                  >
                    이전
                  </button>
                )}
                <button
                  onClick={nextStep}
                  style={{
                    padding: '8px 20px',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#fff',
                    background: '#f97316',
                    border: 'none',
                    borderRadius: 10,
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                    boxShadow: '0 2px 8px rgba(249, 115, 22, 0.3)',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#dc4f08'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#f97316'; }}
                >
                  {currentStepIndex === steps.length - 1 ? '완료' : '다음'}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * 대상 rect와 placement에 따라 툴팁의 top/left를 계산.
 * 모든 값은 viewport 기준 px 좌표 (position: fixed).
 */
function computeTooltipStyle(
  rect: Rect | null,
  placement: 'top' | 'bottom' | 'left' | 'right',
  win: { w: number; h: number },
): React.CSSProperties {
  if (!rect) {
    return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  }

  const clampLeft = (l: number) => Math.max(16, Math.min(l, win.w - TOOLTIP_W - 16));

  switch (placement) {
    case 'bottom': {
      const top = rect.y + rect.height + TOOLTIP_GAP;
      const left = clampLeft(rect.x + rect.width / 2 - TOOLTIP_W / 2);
      return { top, left };
    }
    case 'top': {
      // 툴팁 하단이 대상 상단에 붙도록 → top = rect.y - gap - 툴팁높이
      // 정확한 높이는 모르므로 auto로 배치: bottom 기준 사용 대신 top + transform
      const top = rect.y - TOOLTIP_GAP;
      const left = clampLeft(rect.x + rect.width / 2 - TOOLTIP_W / 2);
      return { top, left, transform: 'translateY(-100%)' };
    }
    case 'left': {
      // 툴팁이 대상의 왼쪽에 위치
      const left = rect.x - TOOLTIP_GAP - TOOLTIP_W;
      const safeLeft = Math.max(16, left);
      // 세로 중앙 정렬, 뷰포트 밖으로 나가지 않도록 클램핑
      let top = rect.y + rect.height / 2 - TOOLTIP_H_ESTIMATE / 2;
      top = Math.max(16, Math.min(top, win.h - TOOLTIP_H_ESTIMATE - 16));
      return { top, left: safeLeft };
    }
    case 'right': {
      const left = rect.x + rect.width + TOOLTIP_GAP;
      const safeLeft = Math.min(left, win.w - TOOLTIP_W - 16);
      let top = rect.y + rect.height / 2 - TOOLTIP_H_ESTIMATE / 2;
      top = Math.max(16, Math.min(top, win.h - TOOLTIP_H_ESTIMATE - 16));
      return { top, left: safeLeft };
    }
  }
}
