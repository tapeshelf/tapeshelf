import { BlockList, isIP, isIPv6 } from 'node:net';

import { Injectable } from '@nestjs/common';

import { PaddleClient } from './paddle.client.js';

/** How long the list is trusted, and how often an unknown address may cause a new look at it. */
const TTL_MS = 60 * 60 * 1000;
const RECHECK_MS = 60 * 1000;

/**
 * The addresses Paddle's notifications come from. Paddle's `/ips` is the source of truth and can
 * change, so the list is read from there, not written down here: every hour, and sooner when a
 * notification comes from an address it does not have.
 */
@Injectable()
export class PaddleIps {
  private list: BlockList | null = null;
  private readAt = 0;

  constructor(private readonly paddle: PaddleClient) {}

  /** Throws only when the list has never been read: the caller can't tell either way. */
  async allows(ip: string | undefined): Promise<boolean> {
    const address = ip?.replace(/^::ffff:/, '');
    if (!address || !isIP(address)) return false;
    const family = isIPv6(address) ? 'ipv6' : 'ipv4';
    const age = Date.now() - this.readAt;
    const known = this.list?.check(address, family) ?? false;
    if (!this.list || age >= TTL_MS || (!known && age >= RECHECK_MS))
      await this.read();
    return this.list!.check(address, family);
  }

  private async read(): Promise<void> {
    try {
      const list = new BlockList();
      for (const cidr of await this.paddle.getIps()) {
        const [net, prefix] = cidr.split('/');
        const family = isIPv6(net!) ? 'ipv6' : 'ipv4';
        list.addSubnet(
          net!,
          Number(prefix ?? (family === 'ipv6' ? 128 : 32)),
          family,
        );
      }
      this.list = list;
      this.readAt = Date.now();
    } catch (err) {
      // Paddle's API is down: the last list still holds. Without one there is nothing to go on.
      if (!this.list) throw err;
    }
  }
}
