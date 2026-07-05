export interface InputCallbacks {
  /** One-finger drag on the canvas (aim / camera orbit). */
  onDrag(dx: number, dy: number): void;
  /** Pinch zoom factor (>1 = fingers moving apart). */
  onPinch(scale: number): void;
  /** Drag position in normalized device coords (ball-in-hand placement). */
  onPointAt(ndcX: number, ndcY: number, phase: 'start' | 'move' | 'end'): void;
  /** Power slider: 0..1 while dragging, then release. */
  onPowerChange(p: number): void;
  onPowerRelease(p: number): void;
}

/** Unified pointer handling: mouse on desktop, touch (incl. pinch) on mobile. */
export class InputManager {
  enabled = true;
  private canvas: HTMLElement;
  private powerEl: HTMLElement;
  private cb: InputCallbacks;

  private pointers = new Map<number, { x: number; y: number }>();
  private lastPinchDist = 0;
  private power = 0;
  private powerActive = false;
  private powerStartX = 0;

  constructor(canvas: HTMLElement, powerEl: HTMLElement, cb: InputCallbacks) {
    this.canvas = canvas;
    this.powerEl = powerEl;
    this.cb = cb;

    canvas.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);

    powerEl.addEventListener('pointerdown', this.onPowerDown);
  }

  private ndc(e: PointerEvent): [number, number] {
    return [
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1,
    ];
  }

  private onDown = (e: PointerEvent): void => {
    if (!this.enabled) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      const pts = [...this.pointers.values()];
      this.lastPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    }
    const [nx, ny] = this.ndc(e);
    this.cb.onPointAt(nx, ny, 'start');
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.enabled) return;

    if (this.powerPointerId === e.pointerId) {
      this.updatePower(e);
      return;
    }

    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;

    if (this.pointers.size === 2) {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pts = [...this.pointers.values()];
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (this.lastPinchDist > 0) this.cb.onPinch(d / this.lastPinchDist);
      this.lastPinchDist = d;
      return;
    }

    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.cb.onDrag(dx, dy);
    const [nx, ny] = this.ndc(e);
    this.cb.onPointAt(nx, ny, 'move');
  };

  private onUp = (e: PointerEvent): void => {
    if (this.powerPointerId === e.pointerId) {
      this.powerPointerId = null;
      this.powerActive = false;
      this.cb.onPowerRelease(this.power);
      this.power = 0;
      return;
    }
    if (this.pointers.has(e.pointerId)) {
      this.pointers.delete(e.pointerId);
      this.lastPinchDist = 0;
      const [nx, ny] = this.ndc(e);
      this.cb.onPointAt(nx, ny, 'end');
    }
  };

  // ---------- Power slider ----------
  private powerPointerId: number | null = null;

  private onPowerDown = (e: PointerEvent): void => {
    if (!this.enabled) return;
    e.stopPropagation();
    this.powerPointerId = e.pointerId;
    this.powerActive = true;
    this.powerStartX = e.clientX;
    this.power = 0;
    this.updatePower(e);
  };

  private updatePower(e: PointerEvent): void {
    const rect = this.powerEl.getBoundingClientRect();
    // Drag right along the bar OR pull down below it — both charge power
    const alongBar = (e.clientX - rect.left) / rect.width;
    const pullDown = (e.clientY - rect.top) / 160;
    this.power = Math.min(1, Math.max(0, Math.max(alongBar, pullDown)));
    this.cb.onPowerChange(this.power);
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    this.powerEl.removeEventListener('pointerdown', this.onPowerDown);
  }
}
