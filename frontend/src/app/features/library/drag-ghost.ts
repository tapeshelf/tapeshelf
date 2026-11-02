import { Component, computed, input } from '@angular/core';

import type { TileDragController } from './tile-drag';

/**
 * The card that travels under the pointer during a drag. A component of its own: its position
 * changes on every pointer move, and read in the shelf's template it re-checked the shelf with
 * all its tiles each time.
 */
@Component({
  selector: 'app-drag-ghost',
  template: `
    @if (drag().active() && drag().preview(); as preview) {
      <div
        class="ghost-in pointer-events-none fixed z-50 origin-top-left transition-[transform,opacity] duration-200 ease-out"
        [style.left.px]="drag().x() + 12"
        [style.top.px]="drag().y() + 12"
        [style.transform]="transform()"
        [style.opacity]="drag().target()?.type === 'into' ? 0.6 : 0.85"
        data-testid="drag-ghost"
      >
        <div
          class="relative overflow-hidden rounded-md bg-surface-2 shadow-[0_18px_40px_-12px_rgb(0_0_0/0.55)] ring-1 ring-black/10"
          [style.width.px]="width()"
          [style.height.px]="width() / preview.aspect"
        >
          @if (preview.url) {
            <img [src]="preview.url" alt="" class="h-full w-full object-cover" draggable="false" />
          }
          @if (drag().ids().length > 1) {
            <span
              class="absolute top-1.5 right-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-accent px-1.5 font-mono text-xs font-bold text-accent-fg shadow"
              >{{ drag().ids().length }}</span
            >
          }
        </div>
      </div>
    }
  `,
})
export class DragGhostComponent {
  readonly drag = input.required<TileDragController>();

  /** A bit over half the tile it left, never huge, never tiny. */
  protected readonly width = computed(() =>
    Math.round(Math.min(240, Math.max(120, (this.drag().preview()?.width ?? 240) * 0.55))),
  );
  protected readonly transform = computed(() =>
    this.drag().target()?.type === 'into' ? 'rotate(-2deg) scale(0.78)' : 'rotate(-2deg)',
  );
}
