import { Dialog } from '@angular/cdk/dialog';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ToastHostComponent } from './toast-host';

@Component({ template: '<p>A dialog</p>' })
class SomeDialog {}

describe('ToastHostComponent', () => {
  it('sits under <body>, so a dialog neither hides it from screen readers nor covers it', async () => {
    const fixture = TestBed.createComponent(ToastHostComponent);
    await fixture.whenStable();
    TestBed.tick();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.parentElement).toBe(document.body);
    expect(host.getAttribute('aria-live')).toBe('polite');

    const ref = TestBed.inject(Dialog).open(SomeDialog);
    await fixture.whenStable();
    expect(host.getAttribute('aria-hidden')).toBeNull();
    ref.close();
    fixture.destroy();
    expect(host.isConnected).toBe(false);
  });
});
