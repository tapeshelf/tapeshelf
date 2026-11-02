import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { MosaicComponent } from './mosaic';

@Component({
  imports: [MosaicComponent],
  template: `
    <div style="width: 1000px">
      <app-mosaic
        #mosaic
        [items]="items()"
        [key]="key"
        [aspect]="aspect"
        [count]="items().length"
        [maxRows]="rows()"
        [itemTemplate]="tile"
      />
    </div>
    <ng-template #tile let-item><div class="tile" [attr.data-n]="item"></div></ng-template>
  `,
})
class Host {
  readonly items = signal(Array.from({ length: 40 }, (_, i) => i));
  readonly rows = signal(0);
  readonly mosaic = viewChild.required(MosaicComponent);
  readonly key = (n: number) => n;
  readonly aspect = () => 16 / 9;
}

const settle = () => new Promise((r) => setTimeout(r, 30));

describe('MosaicComponent', () => {
  it('draws only its first rows when told to (a category’s preview)', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.autoDetectChanges();
    await settle();
    // No layout in the test DOM: the width the browser would measure.
    (fixture.componentInstance.mosaic() as unknown as { measured(w: number): void }).measured(1000);
    await settle();
    const tiles = () => fixture.nativeElement.querySelectorAll('.tile').length as number;
    const all = tiles();
    expect(all).toBe(40);
    fixture.componentInstance.rows.set(2);
    await settle();
    const two = tiles();
    expect(two).toBeGreaterThan(0);
    expect(two).toBeLessThan(all);
    // Two full rows: the first tiles, in order.
    const shown = [...fixture.nativeElement.querySelectorAll('.tile')].map((el: Element) =>
      Number(el.getAttribute('data-n')),
    );
    expect(shown).toEqual(Array.from({ length: two }, (_, i) => i));
    fixture.componentInstance.rows.set(0);
    await settle();
    expect(tiles()).toBe(all);
  });
});
