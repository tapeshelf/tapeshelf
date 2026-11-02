import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';

import { OptionComponent, SelectComponent } from './select';

@Component({
  imports: [SelectComponent, OptionComponent, FormsModule],
  template: `
    <app-select [ngModel]="value()" (ngModelChange)="value.set($event)" [ariaLabel]="'Fruit'">
      <app-option [value]="'apple'">Apple</app-option>
      <app-option [value]="'banana'">Banana</app-option>
      <app-option [value]="'cherry'" [disabled]="true">Cherry</app-option>
    </app-select>
  `,
})
class Host {
  readonly value = signal<string>('apple');
}

describe('SelectComponent', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;

  const trigger = () =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[role="combobox"]')!;
  const listbox = () => document.querySelector<HTMLElement>('[role="listbox"]');
  const options = () => [...document.querySelectorAll<HTMLElement>('[role="option"]')];
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  // The CDK key manager reads keyCode, as browsers still set it.
  const CODES: Record<string, number> = { ArrowDown: 40, ArrowUp: 38, Enter: 13, Escape: 27 };
  const press = async (key: string) => {
    trigger().dispatchEvent(
      new KeyboardEvent('keydown', { key, keyCode: CODES[key], bubbles: true, cancelable: true }),
    );
    await settle();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    await settle();
  });

  afterEach(() => fixture.destroy());

  it('shows the chosen option on the trigger and keeps the list closed', () => {
    expect(trigger().textContent).toContain('Apple');
    expect(trigger().getAttribute('aria-label')).toBe('Fruit');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(listbox()).toBeNull();
  });

  it('opens on click, picks an option with the mouse and closes', async () => {
    trigger().click();
    await settle();
    expect(listbox()).not.toBeNull();
    expect(options().map((o) => o.textContent?.trim())).toEqual(['Apple', 'Banana', 'Cherry']);
    expect(options()[0].getAttribute('aria-selected')).toBe('true');

    options()[1].click();
    await settle();
    expect(host.value()).toBe('banana');
    expect(trigger().textContent).toContain('Banana');
    expect(listbox()).toBeNull();
  });

  it('walks the list with the keyboard, skipping disabled options, and chooses with Enter', async () => {
    await press('ArrowDown'); // opens on the current option
    expect(listbox()).not.toBeNull();
    expect(trigger().getAttribute('aria-activedescendant')).toBe(options()[0].id);
    await press('ArrowDown');
    expect(trigger().getAttribute('aria-activedescendant')).toBe(options()[1].id);
    await press('ArrowDown'); // Cherry is disabled: wraps to Apple
    expect(trigger().getAttribute('aria-activedescendant')).toBe(options()[0].id);
    await press('ArrowUp');
    await press('Enter');
    expect(host.value()).toBe('banana');
    expect(listbox()).toBeNull();
  });

  it('closes on Escape without changing the value', async () => {
    await press('ArrowDown');
    await press('ArrowDown');
    await press('Escape');
    expect(listbox()).toBeNull();
    expect(host.value()).toBe('apple');
  });

  it('follows a value written from the outside', async () => {
    host.value.set('banana');
    await settle();
    expect(trigger().textContent).toContain('Banana');
  });
});
