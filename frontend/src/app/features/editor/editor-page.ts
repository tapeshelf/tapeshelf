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
  lucideCopyPlus,
  lucideEye,
  lucideListVideo,
  lucidePause,
  lucidePlay,
  lucideRedo2,
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
import {
  EDITOR_ICON_BUTTON,
  EDITOR_ON,
  EditorPanelComponent,
  type EditorTab,
  EditorToolsComponent,
} from './editor-panel';
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
    EditorToolsComponent,
  ],
  styles: EDITOR_ON,
  providers: [
    EditorStore,
    provideIcons({
      lucideArrowLeft,
      lucidePlay,
      lucidePause,
      lucideUndo2,
      lucideRedo2,
      lucideEye,
      lucideListVideo,
      lucideCopyPlus,
    }),
  ],
  host: {
    class: 'block',
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
      <header class="mb-5 flex flex-wrap items-center gap-x-4 gap-y-3">
        <a
          [href]="back().url"
          class="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text"
          data-testid="editor-back"
          (click)="leave($event)"
        >
          <ng-icon name="lucideArrowLeft" size="16" />{{ back().label | transloco }}
        </a>
        <h1
          class="min-w-0 flex-1 basis-48 truncate font-display text-xl font-bold"
          [attr.title]="st.title"
        >
          {{ st.title }}
        </h1>
        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            [class]="iconButton"
            [disabled]="!store.canUndo()"
            [attr.aria-label]="'editor.undo' | transloco"
            [attr.title]="'editor.undo' | transloco"
            data-testid="undo"
            (click)="store.undo()"
          >
            <ng-icon name="lucideUndo2" size="20" />
          </button>
          <button
            type="button"
            [class]="iconButton"
            [disabled]="!store.canRedo()"
            [attr.aria-label]="'editor.redo' | transloco"
            [attr.title]="'editor.redo' | transloco"
            (click)="store.redo()"
          >
            <ng-icon name="lucideRedo2" size="20" />
          </button>
          @if (st.canCopy) {
            <button
              type="button"
              [class]="iconButton"
              [disabled]="locked() || store.identity()"
              [attr.aria-label]="'editor.saveCopy' | transloco"
              [attr.title]="'editor.saveCopy' | transloco"
              data-testid="editor-save-copy"
              (click)="store.save('copy')"
            >
              <ng-icon name="lucideCopyPlus" size="20" />
            </button>
          }
          <!-- Into the video, for good: this one says it in words. -->
          <button
            type="button"
            appButton
            class="h-11! px-6!"
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

      <div class="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div
          #card
          class="min-w-0 overflow-hidden rounded-xl border-2 border-line bg-surface shadow-hard"
          data-testid="editor-card"
        >
          <!-- The picture on a dark monitor, whichever the page's theme: its colours read true. -->
          <div class="bg-[#0d0d0e] p-3">
            <!-- A new one for each version of the video: after a save it plays the new one. -->
            @for (version of [store.generation()]; track version) {
              <app-editor-stage [result]="result()" [cropTool]="tab() === 'frame'" [card]="card" />
            }
          </div>
          <div class="flex items-center gap-3 border-t-2 border-line px-4 py-3">
            <button
              type="button"
              appButton
              class="h-11! w-11! rounded-full! px-0!"
              [attr.aria-label]="(store.playing() ? 'player.pause' : 'player.play') | transloco"
              data-testid="editor-play"
              (click)="store.togglePlay()"
            >
              <ng-icon [name]="store.playing() ? 'lucidePause' : 'lucidePlay'" size="20" />
            </button>
            <span class="min-w-0 truncate font-mono text-sm" data-testid="editor-time">
              {{ format(store.time()) }} / {{ format(store.duration()) }}
            </span>
            <span class="ml-auto flex shrink-0 gap-2">
              <button
                type="button"
                [class]="iconButton"
                [class.on]="store.previewCuts()"
                [attr.aria-pressed]="store.previewCuts()"
                [attr.aria-label]="'editor.previewCuts' | transloco"
                [attr.title]="'editor.previewCuts' | transloco"
                data-testid="editor-preview-cuts"
                (click)="store.previewCuts.set(!store.previewCuts())"
              >
                <ng-icon name="lucideListVideo" size="20" />
              </button>
              <button
                type="button"
                [class]="iconButton"
                [class.on]="result()"
                [attr.aria-pressed]="result()"
                [attr.aria-label]="'editor.result' | transloco"
                [attr.title]="'editor.result' | transloco"
                data-testid="editor-result"
                (click)="result.set(!result())"
              >
                <ng-icon name="lucideEye" size="20" />
              </button>
            </span>
          </div>
          <div class="border-t-2 border-line p-4">
            <app-editor-timeline />
          </div>
        </div>
        <div class="flex min-w-0 flex-col gap-3">
          <app-editor-tools [(tab)]="tab" />
          <app-editor-panel [(tab)]="tab" />
        </div>
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
  protected readonly iconButton = EDITOR_ICON_BUTTON;
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
    // The key's place, not its letter: these work the same in a Cyrillic layout.
    if (mod && e.code === 'KeyZ') {
      e.preventDefault();
      if (e.shiftKey) this.store.redo();
      else this.store.undo();
    } else if (mod && e.code === 'KeyY') {
      e.preventDefault();
      this.store.redo();
    } else if (!mod && !e.altKey && (e.code === 'KeyI' || e.code === 'KeyO')) {
      e.preventDefault();
      this.store.rangeTo(e.code === 'KeyI' ? 'start' : 'end', this.store.time());
    } else if (!mod && !e.altKey && (e.code === 'Comma' || e.code === 'Period')) {
      e.preventDefault();
      this.store.video?.pause();
      const step = this.store.frameStep() * (e.code === 'Comma' ? -1 : 1);
      this.store.seek(this.store.time() + step);
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
