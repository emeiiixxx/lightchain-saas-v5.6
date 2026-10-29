/** C03: discrete wheel notches and continuous scrolling share one zoom policy. */
export const VIEWER_WHEEL_STEP = 1.1;
export const VIEWER_SCROLL_SENSITIVITY = 0.0015;

type WheelInput = Pick<WheelEvent, 'deltaMode' | 'deltaX' | 'deltaY' | 'ctrlKey' | 'timeStamp'> & {
  // Optional compatibility hint on wheel events, never a separate mousewheel listener.
  wheelDeltaY?: number;
};

const multipleOf = (value: number, unit: number) => Math.abs(value / unit - Math.round(value / unit)) < 0.001;

/**
 * WheelEvent has no reliable device identifier. Recognize common stepped inputs,
 * not OS/brand names; ambiguous gestures keep the existing continuous behavior.
 * Keep a continuous gesture continuous even when its inertia produces large deltas.
 */
export function createViewerWheelZoom() {
  let lastTime = -Infinity;
  let mode: 'continuous' | 'stepped' | null = null;
  let stepUnit = 0;
  let stepDeltaMode = 0;
  let pendingSteps = 0;

  const reset = () => {
    lastTime = -Infinity;
    mode = null;
    stepUnit = 0;
    pendingSteps = 0;
  };

  const factor = (event: WheelInput, pageHeight: number) => {
    // Read deltaMode first: some browsers adjust legacy delta units when accessed.
    const deltaMode = event.deltaMode;
    const deltaY = event.deltaY;
    if (!Number.isFinite(deltaY) || deltaY === 0) return 1;
    if (event.timeStamp - lastTime > 240 || event.timeStamp < lastTime) reset();
    lastTime = event.timeStamp;
    const delta = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? pageHeight : 1);
    const continuous = () => Math.exp(-Math.max(-600, Math.min(600, delta)) * VIEWER_SCROLL_SENSITIVITY);

    // Pinch and horizontal/fractional pixel scrolling retain their previous curve.
    if (event.ctrlKey || event.deltaX !== 0 || (deltaMode === 0 && !Number.isInteger(deltaY))) {
      mode = 'continuous';
      pendingSteps = 0;
    }
    if (mode === 'continuous') return continuous();
    if (mode === 'stepped' && stepDeltaMode !== deltaMode) {
      reset();
      lastTime = event.timeStamp;
    }

    const legacyDelta = event.wheelDeltaY;
    const hasNotchHint = typeof legacyDelta === 'number' && Number.isFinite(legacyDelta)
      && legacyDelta !== 0 && Math.sign(legacyDelta) === -Math.sign(deltaY)
      && multipleOf(Math.abs(legacyDelta), 120);
    if (!mode) {
      const amount = Math.abs(deltaY);
      // Optional 120-unit notch hint supports different system scroll settings.
      if (hasNotchHint && (deltaMode !== 0 || (amount >= 40 && Number.isInteger(amount)))) {
        stepUnit = amount / (Math.abs(legacyDelta!) / 120);
      } else if (deltaMode === 1 && Number.isInteger(amount)) {
        // Firefox commonly reports three lines per notch; accumulate split lines.
        stepUnit = 3;
      } else if (deltaMode === 0 && amount >= 100 && multipleOf(amount, 100)) {
        stepUnit = 100;
      } else if (deltaMode === 0 && amount >= 120 && multipleOf(amount, 120)) {
        stepUnit = 120;
      } else {
        mode = 'continuous';
        return continuous();
      }
      mode = 'stepped';
      stepDeltaMode = deltaMode;
    }

    // Normalize distance, including coalesced/multiple notches; never count events.
    const steps = hasNotchHint ? -legacyDelta! / 120 : deltaY / stepUnit;
    if (pendingSteps && Math.sign(steps) !== Math.sign(pendingSteps)) pendingSteps = 0;
    pendingSteps += steps;
    const wholeSteps = Math.trunc(pendingSteps + Math.sign(pendingSteps) * 1e-8);
    pendingSteps -= wholeSteps;
    return Math.pow(VIEWER_WHEEL_STEP, -wholeSteps);
  };

  return { factor, reset };
}
