import Phaser from 'phaser';

export interface CameraOptions {
  /** World rectangle the camera may show. */
  bounds: Phaser.Geom.Rectangle;
  /** Zoom levels to snap to, ascending. The first fits the whole island. */
  levels: number[];
  /** Called for a tap (press and release without dragging), in world coords. */
  onTap: (worldX: number, worldY: number) => void;
  /** Called while a finger is held still or moves, in world coords (for ghost previews). */
  onHover?: (worldX: number, worldY: number) => void;
  onZoomChange?: (zoom: number, level: number) => void;
  reduceMotion?: boolean;
  /**
   * When panning is off (build mode with a block tool), a one-finger drag
   * is reported here instead of moving the camera, in world coords.
   */
  onDrag?: (startX: number, startY: number, x: number, y: number) => void;
  onDragEnd?: (startX: number, startY: number, x: number, y: number) => void;
}

/**
 * Pan, pinch, wheel, and snap zoom for the island camera. Zoom snaps to a
 * few fixed levels so the view is predictable, and the camera stays
 * clamped to the island so he can't scroll off into open sea.
 */
export class IslandCamera {
  private readonly cam: Phaser.Cameras.Scene2D.Camera;
  private dragging = false;
  private moved = false;
  private startX = 0;
  private startY = 0;
  private scrollStartX = 0;
  private scrollStartY = 0;
  private pinchStart = 0;
  private pinchZoom = 1;
  private pinching = false;
  private panEnabled = true;
  private dragStartWorld = { x: 0, y: 0 };
  level = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly opts: CameraOptions,
  ) {
    this.cam = scene.cameras.main;
    this.applyBounds(opts.levels[0]!);

    const input = scene.input;
    input.on('pointerdown', this.onDown, this);
    input.on('pointermove', this.onMove, this);
    input.on('pointerup', this.onUp, this);
    input.on('pointerupoutside', this.onUp, this);
    input.on('wheel', this.onWheel, this);
    scene.events.once('shutdown', () => {
      input.off('pointerdown', this.onDown, this);
      input.off('pointermove', this.onMove, this);
      input.off('pointerup', this.onUp, this);
      input.off('pointerupoutside', this.onUp, this);
      input.off('wheel', this.onWheel, this);
    });
  }

  get zoom() {
    return this.cam.zoom;
  }

  /** Off: one-finger drags draw instead of panning. Pinch and buttons still zoom. */
  setPanEnabled(on: boolean) {
    this.panEnabled = on;
  }

  /**
   * Phaser left-aligns the view when it is larger than the bounds, so at
   * each zoom the bounds grow to at least the view size, centred on the
   * island. Zoomed out that centres the island; zoomed in it clamps tight.
   */
  private applyBounds(zoom: number) {
    const b = this.opts.bounds;
    const vw = this.cam.width / zoom;
    const vh = this.cam.height / zoom;
    const w = Math.max(b.width, vw);
    const h = Math.max(b.height, vh);
    this.cam.setBounds(b.centerX - w / 2, b.centerY - h / 2, w, h);
  }

  /** Jump or glide to a zoom level, keeping a world point centred. */
  setLevel(level: number, centerX?: number, centerY?: number, animate = true) {
    this.level = Phaser.Math.Clamp(level, 0, this.opts.levels.length - 1);
    const zoom = this.opts.levels[this.level]!;
    const cx = centerX ?? this.cam.midPoint.x;
    const cy = centerY ?? this.cam.midPoint.y;
    this.applyBounds(zoom);
    if (!animate || this.opts.reduceMotion) {
      this.cam.setZoom(zoom);
      this.cam.centerOn(cx, cy);
    } else {
      this.cam.zoomTo(zoom, 260, 'Cubic.easeOut');
      this.cam.pan(cx, cy, 260, 'Cubic.easeOut');
    }
    this.opts.onZoomChange?.(zoom, this.level);
  }

  zoomIn(centerX?: number, centerY?: number) {
    this.setLevel(this.level + 1, centerX, centerY);
  }
  zoomOut(centerX?: number, centerY?: number) {
    this.setLevel(this.level - 1, centerX, centerY);
  }
  centerOn(x: number, y: number, animate = true) {
    if (!animate || this.opts.reduceMotion) this.cam.centerOn(x, y);
    else this.cam.pan(x, y, 260, 'Cubic.easeOut');
  }

  private uiHit(pointer: Phaser.Input.Pointer): boolean {
    // Anything interactive under the pointer (buttons, drawers) wins over the map.
    return this.scene.input.hitTestPointer(pointer).length > 0;
  }

  private onDown(pointer: Phaser.Input.Pointer) {
    if (this.uiHit(pointer)) return;
    const p1 = this.scene.input.pointer1;
    const p2 = this.scene.input.pointer2;
    if (p1.isDown && p2.isDown) {
      this.pinching = true;
      this.dragging = false;
      this.pinchStart = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
      this.pinchZoom = this.cam.zoom;
      return;
    }
    this.dragging = true;
    this.moved = false;
    this.startX = pointer.x;
    this.startY = pointer.y;
    this.scrollStartX = this.cam.scrollX;
    this.scrollStartY = this.cam.scrollY;
    this.dragStartWorld = { x: pointer.worldX, y: pointer.worldY };
  }

  private onMove(pointer: Phaser.Input.Pointer) {
    const p1 = this.scene.input.pointer1;
    const p2 = this.scene.input.pointer2;
    if (this.pinching && p1.isDown && p2.isDown) {
      const d = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
      const min = this.opts.levels[0]!;
      const max = this.opts.levels[this.opts.levels.length - 1]!;
      const z = Phaser.Math.Clamp((this.pinchZoom * d) / Math.max(1, this.pinchStart), min * 0.9, max * 1.1);
      this.applyBounds(z);
      this.cam.setZoom(z);
      return;
    }
    if (!this.dragging || !pointer.isDown) {
      if (pointer.isDown === false) this.opts.onHover?.(pointer.worldX, pointer.worldY);
      return;
    }
    const dx = pointer.x - this.startX;
    const dy = pointer.y - this.startY;
    if (!this.moved && Math.hypot(dx, dy) > 8) this.moved = true;
    if (this.moved) {
      if (this.panEnabled) this.cam.setScroll(this.scrollStartX - dx / this.cam.zoom, this.scrollStartY - dy / this.cam.zoom);
      else this.opts.onDrag?.(this.dragStartWorld.x, this.dragStartWorld.y, pointer.worldX, pointer.worldY);
    } else {
      this.opts.onHover?.(pointer.worldX, pointer.worldY);
    }
  }

  private onUp(pointer: Phaser.Input.Pointer) {
    if (this.pinching) {
      const p1 = this.scene.input.pointer1;
      const p2 = this.scene.input.pointer2;
      if (!p1.isDown && !p2.isDown) {
        this.pinching = false;
        this.snapToNearest();
      }
      return;
    }
    if (!this.dragging) return;
    this.dragging = false;
    if (!this.moved && !this.uiHit(pointer)) this.opts.onTap(pointer.worldX, pointer.worldY);
    else if (this.moved && !this.panEnabled) this.opts.onDragEnd?.(this.dragStartWorld.x, this.dragStartWorld.y, pointer.worldX, pointer.worldY);
  }

  private onWheel(pointer: Phaser.Input.Pointer, _objs: unknown, _dx: number, dy: number) {
    if (dy < 0) this.zoomIn(pointer.worldX, pointer.worldY);
    else if (dy > 0) this.zoomOut(pointer.worldX, pointer.worldY);
  }

  private snapToNearest() {
    let best = 0;
    let bestD = Infinity;
    this.opts.levels.forEach((z, i) => {
      const d = Math.abs(Math.log(z) - Math.log(this.cam.zoom));
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    this.setLevel(best);
  }
}
