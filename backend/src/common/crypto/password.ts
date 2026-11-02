import { hash, verify } from '@node-rs/argon2';

// argon2id, 64 MiB, 3 passes: strong enough for interactive logins, cheap enough for a small VPS.
const OPTIONS = { memoryCost: 65536, timeCost: 3, parallelism: 1 } as const;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export async function verifyPassword(
  hashed: string,
  plain: string,
): Promise<boolean> {
  try {
    return await verify(hashed, plain);
  } catch {
    return false;
  }
}
