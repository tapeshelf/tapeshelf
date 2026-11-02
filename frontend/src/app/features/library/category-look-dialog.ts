import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { Component, Injectable, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

import { type CategoryDto, type TileScale } from '../../api';
import { toApiError } from '../../core/api/api-error';
import { AuthStore } from '../../core/auth/auth.store';
import { CategoriesStore } from '../../core/categories/categories.store';
import { TILE_SCALES } from '../../shared/collection/shelf-zoom';
import { ButtonDirective } from '../../shared/ui/button/button.directive';
import { FieldComponent } from '../../shared/ui/field/field';
import { OptionComponent, SelectComponent } from '../../shared/ui/select/select';

/** The page's setting, chosen by leaving the category's own empty. */
const PAGE = 'page';
const ROWS = [0, 1, 2, 3, 4, 5, 6];

/**
 * How one category shows in "All videos" grouped by category: its own number of rows and
 * its own tile size, or the page's.
 */
@Component({
  selector: 'app-category-look-dialog',
  imports: [
    FormsModule,
    TranslocoPipe,
    ButtonDirective,
    FieldComponent,
    SelectComponent,
    OptionComponent,
  ],
  template: `
    <form
      class="w-[min(420px,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-5 shadow-float"
      role="dialog"
      [attr.aria-label]="'library.look.title' | transloco: { name: data.name }"
      data-testid="category-look-dialog"
      (ngSubmit)="save()"
    >
      <h2 class="text-base font-semibold">
        {{ 'library.look.title' | transloco: { name: data.name } }}
      </h2>
      <p class="mt-1 text-sm text-muted">{{ 'library.look.lead' | transloco }}</p>
      <div class="mt-4 grid gap-4 sm:grid-cols-2">
        <app-field [label]="'library.look.rows' | transloco">
          <app-select name="rows" [(ngModel)]="rows" data-testid="look-rows">
            <app-option [value]="page">{{
              'library.look.pageDefault' | transloco: { value: rowsLabel(pageRows) }
            }}</app-option>
            @for (n of rowChoices; track n) {
              <app-option [value]="'' + n">{{ rowsLabel(n) }}</app-option>
            }
          </app-select>
        </app-field>
        <app-field [label]="'library.look.size' | transloco">
          <app-select name="size" [(ngModel)]="size" data-testid="look-size">
            <app-option [value]="page">{{
              'library.look.pageDefault'
                | transloco: { value: ('settings.page.tileScales.' + pageScale | transloco) }
            }}</app-option>
            @for (s of scales; track s) {
              <app-option [value]="s">{{ 'settings.page.tileScales.' + s | transloco }}</app-option>
            }
          </app-select>
        </app-field>
      </div>
      @if (error(); as message) {
        <p class="mt-3 text-sm text-danger">{{ message }}</p>
      }
      <div class="mt-5 flex justify-end gap-2">
        <button type="button" appButton variant="ghost" (click)="ref.close()">
          {{ 'common.cancel' | transloco }}
        </button>
        <button type="submit" appButton [disabled]="busy()" data-testid="look-save">
          {{ 'common.save' | transloco }}
        </button>
      </div>
    </form>
  `,
})
export class CategoryLookDialogComponent {
  protected readonly data = inject<CategoryDto>(DIALOG_DATA);
  protected readonly ref = inject(DialogRef);
  private readonly categories = inject(CategoriesStore);
  private readonly t = inject(TranslocoService);
  private readonly settings = inject(AuthStore).user()?.pageSettings;

  protected readonly page = PAGE;
  protected readonly rowChoices = ROWS;
  protected readonly scales = TILE_SCALES;
  protected readonly pageRows = this.settings?.categoryRows ?? 2;
  protected readonly pageScale: TileScale = this.settings?.tileScale ?? 'md';
  protected rows = this.data.previewRows === null ? PAGE : String(this.data.previewRows);
  protected size: string = this.data.tileScale ?? PAGE;
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected rowsLabel(n: number): string {
    return n === 0
      ? this.t.translate('library.look.all')
      : this.t.translate('library.look.rowsCount', { count: n });
  }

  protected async save(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.categories.update(this.data.id, {
        previewRows: this.rows === PAGE ? null : Number(this.rows),
        tileScale: this.size === PAGE ? null : (this.size as TileScale),
      });
      this.ref.close();
    } catch (e) {
      this.error.set(toApiError(e).message || this.t.translate('errors.unknown'));
    } finally {
      this.busy.set(false);
    }
  }
}

@Injectable({ providedIn: 'root' })
export class CategoryLookDialog {
  private readonly dialog = inject(Dialog);

  async open(category: CategoryDto): Promise<void> {
    const ref = this.dialog.open(CategoryLookDialogComponent, {
      data: category,
      backdropClass: 'vs-backdrop',
    });
    await firstValueFrom(ref.closed);
  }
}
