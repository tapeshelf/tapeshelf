import type { NestExpressApplication } from '@nestjs/platform-express';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  MULTIPART_ABOVE,
  StorageService,
} from '../src/infra/storage/storage.service.js';
import { createTestApp } from './utils/test-app.js';

/**
 * Big files go up in parts (some providers refuse single uploads of tens of megabytes now and
 * then): a file above the threshold arrives whole, byte for byte, under its type.
 */
describe('storage: big files in parts (e2e)', () => {
  let app: NestExpressApplication;
  let storage: StorageService;
  let dir: string;

  beforeAll(async () => {
    app = await createTestApp();
    storage = app.get(StorageService);
    dir = await mkdtemp(join(tmpdir(), 'storage-e2e-'));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
    await app.close();
  });

  it('a file above the threshold arrives whole', async () => {
    const body = randomBytes(MULTIPART_ABOVE + 9 * 1024 * 1024 + 123);
    const path = join(dir, 'big.bin');
    await writeFile(path, body);
    const key = `tests/big-${Date.now()}.bin`;
    await storage.put('private', { key, path, contentType: 'video/mp4' });
    expect(await storage.head('private', key)).toEqual({
      size: body.length,
      contentType: 'video/mp4',
    });
    const back = await storage.getBuffer('private', key);
    const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
    expect(hash(back)).toBe(hash(body));
    await storage.deleteObjects('private', [key]);
  }, 120_000);
});
