import { Dialog } from '@angular/cdk/dialog';
import { Location } from '@angular/common';
import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft,
  lucideEye,
  lucidePause,
  lucidePlay,
  lucideRedo2,
  lucideScissors,
  lucideUndo2,
} from '@ng-icons/lucide';

import { NavigationHistory } from '../../core/navigation/navigation-history';
import { VIDEO_CODE, videoLink } from '../../core/navigation/user-links';
import { AlertComponent } from '../../shared/ui/alert/alert';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { ConfirmService } from '../../shared/ui/confirm/confirm-dialog';
import { ProgressBarComponent } from '../../shared/ui/progress/progress-bar';
import { SpinnerComponent } from '../../shared/ui/spinner/spinner';
import { ToastService } from '../../shared/ui/toast/toast.service';
import { formatTime } from './edit-model';
import { EditorPanelComponent, type EditorTab } from './editor-panel';
import { EditorStageComponent } from './editor-stage';
import { EditorTimelineComponent } from './editor-timeline';
import { EditorStore } from './editor.store';

/**
 * /edit/<video id>: the video editor. Crop (a horizontal video can come out
 * vertical, square and back), trim and cut pieces out, timers, captions, blurred areas or plates,
 * turning and mirroring, the sound's volume and loudness. Saved into the same video — for good: the
 * next edit starts from the result — or as a new one; the render runs in the background.
 */
@Component({
  selector: 'app-editor-page',
  imports: [
    TranslocoPipe,
    NgIcon,
    AlertComponent,
    ButtonDirective,
    ProgressBarComponent,
    SpinnerComponent,
    EditorStageComponent,
    EditorTimelineComponent,
    EditorPanelComponent,
  ],
  providers: [
    EditorStore,
    provideIcons({
      lucideArrowLeft,
      lucidePlay,
      lucidePause,
      lucideUndo2,
      lucideRedo2,
      lucideEye,
      lucideScissors,
    }),
  ],
  host: {
    '(document:keydown)': 'onKey($event)',
    '(window:beforeunload)': 'onLeave($event)',
  },
  template: `
    @if (store.loadError(); as message) {
      <app-alert kind="error">{{ message }}</app-alert>
    } @else if (!store.state()) {
      <div class="flex justify-center py-16 text-muted"><app-spinner /></div>
    } @else {
      @let st = store.state()!;
      <header class="mb-4 flex flex-wrap items-center gap-3">
        <a
          [href]="back().url"
          class="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text"
          data-testid="editor-back"
          (click)="leave($event)"
        >
          <ng-icon name="lucideArrowLeft" size="16" />{{ back().label | transloco }}
        </a>
        <h1 class="min-w-0 flex-1 truncate font-display text-xl font-bold">
          <ng-icon name="lucideScissors" size="18" class="mr-1 align-[-2px]" />
          {{ 'editor.title' | transloco }} · {{ st.title }}
        </h1>
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="flex h-9 w-9 items-center justify-center rounded-md hover:bg-surface-2 disabled:opacity-40"
            [disabled]="!store.canUndo()"
            [attr.aria-label]="'editor.undo' | transloco"
            [attr.title]="'editor.undo' | transloco"
            data-testid="undo"
            (click)="store.undo()"
          >
            <ng-icon name="lucideUndo2" size="16" />
          </button>
          <button
            type="button"
            class="flex h-9 w-9 items-center justify-center rounded-md hover:bg-surface-2 disabled:opacity-40"
            [disabled]="!store.canRedo()"
            [attr.aria-label]="'editor.redo' | transloco"
            [attr.title]="'editor.redo' | transloco"
            (click)="store.redo()"
          >
            <ng-icon name="lucideRedo2" size="16" />
          </button>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          @if (st.canCopy) {
            <button
              type="button"
              appButton
              variant="secondary"
              size="sm"
              [disabled]="locked() || store.identity()"
              data-testid="editor-save-copy"
              (click)="store.save('copy')"
            >
              {{ 'editor.saveCopy' | transloco }}
            </button>
          }
          <button
            type="button"
            appButton
            size="sm"
            [disabled]="locked() || !store.dirty()"
            data-testid="editor-save"
            (click)="save()"
          >
            {{ 'editor.save' | transloco }}
          </button>
        </div>
      </header>

      @if (st.foreign) {
        <app-alert kind="info" class="mb-3 block">{{ 'editor.foreign' | transloco }}</app-alert>
      }
      @if (st.job; as job) {
        @if (job.status === 'failed') {
          <div class="mb-3 flex flex-wrap items-center gap-3" data-testid="editor-failed">
            <app-alert kind="error" class="min-w-0 flex-1">{{
              'editor.errors.' + (job.error ?? 'internal') | transloco
            }}</app-alert>
            <button type="button" appButton variant="secondary" size="sm" (click)="store.cancel()">
              {{ 'editor.dismiss' | transloco }}
            </button>
          </div>
        } @else {
          <div
            class="mb-3 flex flex-wrap items-center gap-3 rounded-lg border-2 border-line bg-surface p-3"
            data-testid="editor-job"
          >
            <span class="text-sm font-semibold">
              {{ 'editor.job.' + job.mode | transloco }} · {{ job.progress }}%
            </span>
            <app-progress-bar
              class="min-w-32 flex-1"
              [value]="job.progress"
              [label]="'editor.job.' + job.mode | transloco"
            />
            <button type="button" appButton variant="ghost" size="sm" (click)="store.cancel()">
              {{ 'editor.cancelJob' | transloco }}
            </button>
            <!-- The render runs on the server: the page may go. -->
            <p class="basis-full text-xs text-muted" data-testid="editor-leave-hint">
              {{ (st.foreign ? 'editor.leaveHintForeign' : 'editor.leaveHint') | transloco }}
            </p>
          </div>
        }
      }

      <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div class="min-w-0">
          <!-- A new one for each version of the video: after a save it plays the new one. -->
          @for (version of [store.generation()]; track version) {
            <app-editor-stage [result]="result()" [cropTool]="tab() === 'frame'" />
          }
          <div class="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              appButton
              size="sm"
              [attr.aria-label]="(store.playing() ? 'player.pause' : 'player.play') | transloco"
              data-testid="editor-play"
              (click)="store.togglePlay()"
            >
              <ng-icon [name]="store.playing() ? 'lucidePause' : 'lucidePlay'" size="16" />
            </button>
            <span class="font-mono text-sm" data-testid="editor-time">
              {{ format(store.time()) }} / {{ format(store.duration()) }}
            </span>
            <label class="ml-auto flex items-center gap-1.5 text-xs text-muted">
              <input
                type="checkbox"
                [checked]="store.previewCuts()"
                (change)="store.previewCuts.set(!store.previewCuts())"
              />
              {{ 'editor.previewCuts' | transloco }}
            </label>
            <button
              type="button"
              appButton
              size="sm"
              [variant]="result() ? 'primary' : 'secondary'"
              [attr.aria-pressed]="result()"
              data-testid="editor-result"
              (click)="result.set(!result())"
            >
              <ng-icon name="lucideEye" size="14" />{{ 'editor.result' | transloco }}
            </button>
          </div>
          <app-editor-timeline class="mt-4" />
          <p class="mt-3 text-xs text-muted">{{ 'editor.keys' | transloco }}</p>
        </div>
        <app-editor-panel [(tab)]="tab" />
      </div>
    }
  `,
})
export class EditorPage {
  protected readonly store = inject(EditorStore);
  private readonly router = inject(Router);
  private readonly confirm = inject(ConfirmService);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly t = inject(TranslocoService);
  private readonly history = inject(NavigationHistory);
  private readonly location = inject(Location);

  readonly id = input.required<string>();
  protected readonly tab = signal<EditorTab>('frame');
  protected readonly result = signal(false);
  /** Nothing is saved while a render is on its way. */
  protected readonly locked = computed(() => this.store.busy() || this.store.pending());
  /**
   * Back: to the page the editor was opened from — the video's page or a shelf — as it was
   * left, by stepping back; opened by a link, to the video's page.
   */
  protected readonly back = computed(() => {
    const previous = this.history.previous();
    if (previous) {
      const path = previous.split(/[?#]/)[0]!;
      const label = path.startsWith('/@')
        ? 'editor.backToShelf'
        : VIDEO_CODE.test(path.slice(1))
          ? 'editor.back'
          : 'editor.backOther';
      return { url: previous, label, step: true };
    }
    const code = this.store.state()?.code;
    return {
      url: code ? this.router.serializeUrl(this.router.createUrlTree(videoLink(code))) : '/',
      label: 'editor.back',
      step: false,
    };
  });

  constructor() {
    effect(() => {
      const id = this.id();
      // Only the id: the store reads its own state while loading, and that must not load it again.
      untracked(() => void this.store.load(id));
    });
    inject(DestroyRef).onDestroy(() => this.store.destroy());
    // A copy that is done: a way to it.
    effect(() => {
      const copy = this.store.copyId();
      if (copy)
        this.toast.withAction(this.t.translate('editor.copyDone'), {
          label: this.t.translate('notifications.open'),
          run: () => void this.router.navigate(['/v', copy]),
        });
    });
  }

  protected format(t: number): string {
    return formatTime(t);
  }

  /** Into the same video, for good: said once more before it goes. */
  protected async save(): Promise<void> {
    const ok = await this.confirm.confirm({
      title: this.t.translate('editor.saveTitle'),
      message: this.t.translate(
        this.store.state()?.canCopy ? 'editor.saveText' : 'editor.saveTextForeign',
      ),
      confirmLabel: this.t.translate('editor.save'),
    });
    if (ok) await this.store.save('replace');
  }

  /** "Back": where the editor came from. A click for a new tab is the browser's. */
  protected leave(e: MouseEvent): void {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const back = this.back();
    if (back.step) this.location.back();
    else void this.router.navigateByUrl(back.url);
  }

  /**
   * Leaving with changes not saved asks first, whichever way: "Back", the header, a notification,
   * the browser's back (the route's guard; only "Back" asked before).
   */
  async canLeave(): Promise<boolean> {
    if (!this.store.leavingLoses()) return true;
    const ok = await this.confirm.confirm({
      title: this.t.translate('editor.leaveTitle'),
      message: this.t.translate('editor.leaveText'),
      confirmLabel: this.t.translate('editor.leave'),
      danger: true,
    });
    if (ok) this.store.spec.set(null);
    return ok;
  }

  protected onLeave(e: BeforeUnloadEvent): void {
    if (this.store.leavingLoses()) e.preventDefault();
  }

  protected onKey(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
    // A dialog's keys are its own: Backspace in "Save?" took the selected piece out behind it.
    if (this.dialog.openDialogs.length) return;
    // Space presses a focused button or link; arrows move a slider, a radio, a menu; Alt+arrows go
    // back and forth in the browser. Elsewhere — a tool just clicked — they play and seek, as before.
    const own =
      e.altKey ||
      (e.key === ' '
        ? !!target?.closest('button, a, [role="button"], [role="tab"], [role="checkbox"]')
        : !!target?.closest(
            '[role="slider"], [role="radio"], [role^="menuitem"], [role="option"]',
          ));
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.store.redo();
      else this.store.undo();
    } else if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      this.store.redo();
    } else if (own && (e.key === ' ' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      return;
    } else if (e.key === ' ') {
      e.preventDefault();
      this.store.togglePlay();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const step = (e.shiftKey ? 0.1 : 1) * (e.key === 'ArrowLeft' ? -1 : 1);
      this.store.seek(this.store.time() + step);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      const sel = this.store.selected();
      if (!sel || sel.kind === 'crop') return;
      e.preventDefault();
      this.store.selected.set(null);
      this.store.change((s) => {
        const list = { cut: s.cuts, blur: s.blurs, timer: s.timers, caption: s.captions }[sel.kind];
        list.splice(sel.index, 1);
      });
    }
  }
}
