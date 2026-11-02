export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
/** Policy: 8–128 chars, at least one letter and one digit. */
export const PASSWORD_PATTERN = /^(?=.*\p{L})(?=.*\d).{8,128}$/u;

export function isStrongEnough(password: string): boolean {
  return (
    password.length >= PASSWORD_MIN &&
    password.length <= PASSWORD_MAX &&
    PASSWORD_PATTERN.test(password)
  );
}
