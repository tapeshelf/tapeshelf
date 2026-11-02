import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { Component, input, output } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideChevronDown } from '@ng-icons/lucide';

/** One entry of the list: a category, "all videos", or an owner's filter after a line. */
export interface FolderMenuItem {
  key: string;
  label: string;
  count: number | null;
  current: boolean;
  /** Starts a group of its own (the owner's filters under the categories). */
  divided?: boolean;
}

/**
 * Every category of a shelf in one list: on a phone, where the row of tabs scrolls
 * sideways, and in the compact bar that stays under the header while the shelf scrolls.
 */
@Component({
  selector: 'app-shelf-folder-menu',
  imports: [CdkMenuTrigger, CdkMenu, CdkMenuItem, NgIcon],
  providers: [provideIcons({ lucideCheck, lucideChevronDown })],
  template: `
    <button
      type="button"
      class="flex max-w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium transition-colors hover:bg-surface-2"
      [cdkMenuTriggerFor]="menu"
      [attr.aria-label]="ariaLabel()"
      data-testid="folder-menu"
    >
      <span
        class="truncate"
        [class]="strong() ? 'font-display text-base font-bold tracking-tight' : ''"
        >{{ label() }}</span
      >
      @if (count() !== null) {
        <span class="font-mono text-[11px] font-semibold text-accent-text">{{ count() }}</span>
      }
      <ng-icon name="lucideChevronDown" size="14" class="shrink-0 text-muted" />
    </button>
    <ng-template #menu>
      <div
        cdkMenu
        class="flex max-h-[min(70dvh,32rem)] w-64 flex-col overflow-y-auto rounded-md border border-border bg-surface p-1 text-sm text-text shadow-[0_12px_32px_-12px_rgb(0_0_0/0.35)]"
      >
        @for (item of items(); track item.key) {
          @if (item.divided) {
            <div class="my-1 h-px bg-border" role="separator"></div>
          }
          <button
            cdkMenuItem
            type="button"
            class="flex items-center justify-between gap-3 rounded px-2.5 py-1.5 text-left hover:bg-surface-2"
            [class.font-semibold]="item.current"
            [attr.aria-current]="item.current ? 'page' : null"
            (cdkMenuItemTriggered)="picked.emit(item.key)"
          >
            <span class="flex min-w-0 items-center gap-2">
              <ng-icon
                name="lucideCheck"
                size="14"
                class="shrink-0"
                [class.invisible]="!item.current"
              />
              <span class="truncate">{{ item.label }}</span>
            </span>
            @if (item.count !== null) {
              <span class="font-mono text-[11px] text-faint">{{ item.count }}</span>
            }
          </button>
        }
      </div>
    </ng-template>
  `,
})
export class ShelfFolderMenuComponent {
  readonly items = input.required<FolderMenuItem[]>();
  /** What the button says: the open category, or "All categories". */
  readonly label = input.required<string>();
  readonly count = input<number | null>(null);
  readonly ariaLabel = input<string>('');
  /** In display type, as the category's name in the compact bar. */
  readonly strong = input(false);
  readonly picked = output<string>();
}
