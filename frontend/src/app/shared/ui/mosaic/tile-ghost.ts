import { Component } from '@angular/core';

/**
 * A picture on its way (a shelf's tile, a placeholder row): the tile's own colour with a soft light
 * passing over it. Only a transform moves, so a long shelf scrolls as smoothly while it plays. The
 * one who places it gives it its position.
 */
@Component({
  selector: 'app-tile-ghost',
  host: { 'aria-hidden': 'true' },
  styles: `
    :host {
      display: block;
      overflow: hidden;
      background-color: var(--vs-surface-2);
    }
    :host::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(
        100deg,
        transparent 25%,
        color-mix(in srgb, var(--vs-surface) 70%, transparent) 50%,
        transparent 75%
      );
      transform: translateX(-100%);
      animation: pass 1.6s ease-in-out infinite;
    }
    @keyframes pass {
      to {
        transform: translateX(100%);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      :host::after {
        animation: none;
        opacity: 0;
      }
    }
  `,
  template: '',
})
export class TileGhostComponent {}
