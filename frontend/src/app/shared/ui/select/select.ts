import { ActiveDescendantKeyManager, type Highlightable } from '@angular/cdk/a11y';
import {
  CdkConnectedOverlay,
  CdkOverlayOrigin,
  type ConnectedPosition,
} from '@angular/cdk/overlay';
import {
  Component,
  DestroyRef,
  ElementRef,
  afterEveryRender,
  computed,
  contentChildren,
  effect,
  forwardRef,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { type ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideChevronDown } from '@ng-icons/lucide';

let nextId = 0;

/** What the CDK key manager walks: the option behind a plain-boolean `disabled`. */
interface KeyItem extends Highlightable {
  option: OptionComponent;
  getLabel(): string;
}

const POSITIONS: ConnectedPosition[] = [
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 4 },
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -4 },
  { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 4 },
  { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -4 },
];

/** One choice inside `app-select`; its projected text is the label shown on the trigger when chosen. */
@Component({
  selector: 'app-option',
  imports: [NgIcon],
  providers: [provideIcons({ lucideCheck })],
  host: {
    role: 'option',
    class:
      'flex cursor-pointer items-center gap-2 rounded-sm px-3 py-1.5 text-sm text-text select-none',
    '[id]': 'id',
    '[attr.aria-selected]': 'selected()',
    '[attr.aria-disabled]': 'disabled() || null',
    '[class.bg-shelf]': 'active()',
    '[class.font-semibold]': 'selected()',
    '[class.opacity-50]': 'disabled()',
    '[class.cursor-not-allowed]': 'disabled()',
    '(click)': 'pick()',
  },
  template: `
    <span class="min-w-0 flex-1 truncate"><ng-content /></span>
    @if (selected()) {
      <ng-icon name="lucideCheck" size="14" class="shrink-0 text-accent-text" aria-hidden="true" />
    }
  `,
})
export class OptionComponent {
  private readonly select = inject<SelectComponent>(forwardRef(() => SelectComponent));
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly value = input.required<unknown>();
  readonly disabled = input(false);
  readonly id = `app-option-${nextId++}`;
  readonly active = signal(false);
  readonly selected = computed(() => this.select.value() === this.value());

  /** Read live from the DOM, so a language switch shows through on the trigger. */
  get label(): string {
    return this.el.nativeElement.textContent?.trim() ?? '';
  }

  setActiveStyles(): void {
    this.active.set(true);
    this.el.nativeElement.scrollIntoView?.({ block: 'nearest' });
  }

  setInactiveStyles(): void {
    this.active.set(false);
  }

  protected pick(): void {
    if (!this.disabled()) this.select.choose(this);
  }
}

/**
 * A select whose list is ours, not the browser's (the native dropdown did not match the
 * theme): the trigger looks like every other field (`.ts-control`), the list is an ink-outlined
 * panel with a hard shadow in a CDK overlay. Works with `ngModel` and `formControlName`; keyboard:
 * arrows, Home/End, typing a letter, Enter/Space, Escape. Options are `app-option` children.
 */
@Component({
  selector: 'app-select',
  imports: [CdkConnectedOverlay, CdkOverlayOrigin, NgIcon],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SelectComponent), multi: true },
    provideIcons({ lucideChevronDown }),
  ],
  host: { class: 'block' },
  template: `
    <button
      #trigger
      type="button"
      cdkOverlayOrigin
      #origin="cdkOverlayOrigin"
      [class]="triggerClass()"
      role="combobox"
      aria-haspopup="listbox"
      [attr.id]="inputId()"
      [attr.aria-label]="ariaLabel()"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="open() ? panelId : null"
      [attr.aria-activedescendant]="open() ? activeId() : null"
      [disabled]="isDisabled()"
      (click)="toggle()"
      (keydown)="onKeydown($event)"
      (blur)="onBlur()"
    >
      <span class="min-w-0 truncate">{{ label() }}</span>
      <ng-icon
        name="lucideChevronDown"
        size="14"
        class="shrink-0 transition-transform duration-150"
        [class.rotate-180]="open()"
        aria-hidden="true"
      />
    </button>
    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="origin"
      [cdkConnectedOverlayOpen]="open()"
      [cdkConnectedOverlayPositions]="positions()"
      [cdkConnectedOverlayMinWidth]="panelMinWidth()"
      (overlayOutsideClick)="onOutsideClick($event)"
      (detach)="close()"
    >
      <div
        role="listbox"
        [id]="panelId"
        class="max-h-64 w-full overflow-y-auto rounded-md border-2 border-line bg-surface p-1 text-text shadow-hard"
        (mousedown)="$event.preventDefault()"
      >
        <ng-content />
      </div>
    </ng-template>
  `,
})
export class SelectComponent implements ControlValueAccessor {
  readonly size = input<'' | 'sm'>('');
  /**
   * `player`: the small translucent control inside the video player's bar. `quiet`: plain text with
   * a chevron, as the links beside it — the language in the footer.
   */
  readonly variant = input<'field' | 'player' | 'quiet'>('field');
  readonly ariaLabel = input<string | null>(null);
  /** Goes on the trigger, so a `<label for>` can point at it. */
  readonly inputId = input<string | null>(null);
  readonly disabled = input(false);

  private readonly options = contentChildren(OptionComponent);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  readonly value = signal<unknown>(undefined);
  protected readonly open = signal(false);
  protected readonly label = signal('');
  protected readonly activeId = signal<string | null>(null);
  protected readonly panelMinWidth = signal(0);
  protected readonly panelId = `app-select-panel-${nextId++}`;
  /** The player's and the footer's triggers sit at the bottom: those lists open upwards first. */
  protected readonly positions = computed(() =>
    this.variant() !== 'field'
      ? [POSITIONS[1], POSITIONS[0], POSITIONS[3], POSITIONS[2]]
      : POSITIONS,
  );
  private readonly disabledByForm = signal(false);
  protected readonly isDisabled = computed(() => this.disabled() || this.disabledByForm());
  protected readonly triggerClass = computed(() => {
    switch (this.variant()) {
      case 'player':
        return 'inline-flex h-7 max-w-full cursor-pointer items-center gap-1 rounded bg-white/10 px-2 text-xs text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50';
      case 'quiet':
        return 'inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded py-0.5 transition-colors hover:text-text focus-visible:text-text aria-expanded:text-text';
      default:
        return 'ts-control ts-select' + (this.size() === 'sm' ? ' ts-control-sm' : '');
    }
  });
  private keys: ActiveDescendantKeyManager<KeyItem> | null = null;
  private onChange: (value: unknown) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor() {
    effect(() => {
      const options = this.options();
      untracked(() => {
        this.keys?.destroy();
        const items: KeyItem[] = options.map((option) => ({
          option,
          get disabled() {
            return option.disabled();
          },
          getLabel: () => option.label,
          setActiveStyles: () => option.setActiveStyles(),
          setInactiveStyles: () => option.setInactiveStyles(),
        }));
        this.keys = new ActiveDescendantKeyManager(items)
          .withWrap()
          .withHomeAndEnd()
          .withTypeAhead();
        this.keys.change.subscribe(() =>
          this.activeId.set(this.keys?.activeItem?.option.id ?? null),
        );
      });
    });
    // The trigger shows the chosen option's text; read after each render so translations are in.
    afterEveryRender(() => {
      const text = this.options().find((o) => o.value() === this.value())?.label ?? '';
      if (text !== this.label()) this.label.set(text);
    });
    inject(DestroyRef).onDestroy(() => this.keys?.destroy());
  }

  writeValue(value: unknown): void {
    this.value.set(value);
  }

  registerOnChange(fn: (value: unknown) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabledByForm.set(disabled);
  }

  choose(option: OptionComponent): void {
    if (option.value() !== this.value()) {
      this.value.set(option.value());
      this.onChange(option.value());
    }
    this.close();
    this.trigger().nativeElement.focus();
  }

  protected toggle(): void {
    if (this.open()) this.close();
    else this.openPanel();
  }

  protected close(): void {
    if (!this.open()) return;
    this.open.set(false);
    this.keys?.setActiveItem(-1);
    this.onTouched();
  }

  protected onOutsideClick(event: MouseEvent): void {
    // The trigger's own click toggles; closing here as well would reopen it at once.
    if (!this.trigger().nativeElement.contains(event.target as Node)) this.close();
  }

  protected onBlur(): void {
    if (!this.open()) this.onTouched();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (!this.open()) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        this.openPanel();
      }
      return;
    }
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        this.close();
        return;
      case 'Tab':
        this.close();
        return;
      case 'Enter':
      case ' ': {
        event.preventDefault();
        const active = this.keys?.activeItem;
        if (active) this.choose(active.option);
        return;
      }
      default:
        this.keys?.onKeydown(event);
    }
  }

  private openPanel(): void {
    if (this.isDisabled() || this.open()) return;
    this.panelMinWidth.set(this.trigger().nativeElement.offsetWidth);
    this.open.set(true);
    const current = this.options().findIndex((o) => o.value() === this.value());
    this.keys?.setActiveItem(Math.max(current, 0));
  }
}
