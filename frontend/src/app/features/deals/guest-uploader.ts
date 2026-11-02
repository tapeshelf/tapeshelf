import { Injectable, inject } from '@angular/core';

import { Api } from '../../api/api';
import { dealsUploadComplete } from '../../api/fn/deals/deals-upload-complete';
import { dealsUploadParts } from '../../api/fn/deals/deals-upload-parts';
import { dealsUploadStart } from '../../api/fn/deals/deals-upload-start';
import type { GuestDealDto } from '../../api/models/guest-deal-dto';
import { titleOr } from '../../shared/forms/limits';

const PARALLEL = 3;

/**
 * A guest's upload for their deal: straight to storage in parts, like a person's, without
 * resuming after a reload (a guest has no shelf to come back to). Resolves to the deal as it is then.
 */
@Injectable({ providedIn: 'root' })
export class GuestUploader {
  private readonly api = inject(Api);

  async upload(
    dealId: string,
    file: File,
    title: string,
    sensitive: boolean,
    progress: (sent: number) => void,
  ): Promise<GuestDealDto> {
    const session = await this.api.invoke(dealsUploadStart, {
      id: dealId,
      body: { filename: file.name, size: file.size, mimeType: file.type || undefined },
    });
    const numbers = Array.from({ length: session.partCount }, (_, i) => i + 1);
    const done: { partNumber: number; etag: string; size: number }[] = [];
    let sent = 0;
    const next = async (): Promise<void> => {
      for (let n = numbers.shift(); n !== undefined; n = numbers.shift()) {
        const { parts } = await this.api.invoke(dealsUploadParts, {
          id: dealId,
          sessionId: session.id,
          body: { partNumbers: [n] },
        });
        const blob = file.slice((n - 1) * session.partSize, n * session.partSize);
        const res = await fetch(parts[0]!.url, { method: 'PUT', body: blob });
        if (!res.ok) throw new Error(`part ${n}: ${res.status}`);
        done.push({ partNumber: n, etag: res.headers.get('etag') ?? '', size: blob.size });
        sent += blob.size;
        progress(sent);
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL, session.partCount) }, next));
    done.sort((a, b) => a.partNumber - b.partNumber);
    return this.api.invoke(dealsUploadComplete, {
      id: dealId,
      sessionId: session.id,
      body: { parts: done, title: titleOr(title, file.name), sensitive },
    });
  }
}
