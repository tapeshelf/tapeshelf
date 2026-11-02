import { Injectable, signal } from '@angular/core';

export type ToastKind = 'info' | 'success' | 'error';

export interface ToastAction {
  /** Already translated. */
  label: string;
  run: () => void;
}

export interface Toast {
  id: number;
  kind: ToastKind;
  /** Already translated. */
  message: string;
  action?: ToastAction;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  readonly toasts = signal<Toast[]>([]);

  show(message: string, kind: ToastKind = 'info', ttlMs = 4500, action?: ToastAction): void {
    const toast: Toast = { id: this.nextId++, kind, message, action };
    this.toasts.update((list) => [...list, toast]);
    setTimeout(() => this.dismiss(toast.id), ttlMs);
  }

  success(message: string): void {
    this.show(message, 'success');
  }

  error(message: string): void {
    this.show(message, 'error', 7000);
  }

  /** A toast with a button (an important notification): it stays a little longer. */
  withAction(message: string, action: ToastAction, kind: ToastKind = 'info'): void {
    this.show(message, kind, 9000, action);
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
