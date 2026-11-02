import { type AbstractControl, type ValidationErrors } from '@angular/forms';

export interface FieldError {
  key: string;
  params?: Record<string, unknown>;
}

/** Maps the first validation error of a control to a translation key (shown only after interaction). */
export function fieldError(
  control: AbstractControl | null,
  overrides: Record<string, string> = {},
): FieldError | null {
  if (!control || !control.invalid || !(control.touched || control.dirty)) return null;
  const errors = control.errors ?? {};
  for (const name of Object.keys(errors)) {
    if (overrides[name]) return { key: overrides[name] };
    switch (name) {
      case 'required':
        return { key: 'validation.required' };
      case 'email':
        return { key: 'validation.email' };
      case 'minlength':
        return {
          key: 'validation.minLength',
          params: { n: (errors[name] as { requiredLength: number }).requiredLength },
        };
      case 'maxlength':
        return {
          key: 'validation.maxLength',
          params: { n: (errors[name] as { requiredLength: number }).requiredLength },
        };
      case 'pattern':
        return { key: 'validation.pattern' };
      default:
        return { key: 'validation.invalid' };
    }
  }
  return null;
}

/** Required, and more than spaces: a name of spaces alone is no name. */
export function notBlank(control: AbstractControl): ValidationErrors | null {
  const v: unknown = control.value;
  return typeof v !== 'string' || !v.trim() ? { required: true } : null;
}

export const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,30}$/;
/** Same policy as the backend. */
export const PASSWORD_PATTERN = /^(?=.*\p{L})(?=.*\d).{8,128}$/u;
