import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PaddleClient } from './paddle.client.js';
import { PaddleIps } from './paddle-ips.js';

describe('PaddleIps', () => {
  const getIps = vi.fn<() => Promise<string[]>>();
  const ips = () => new PaddleIps({ getIps } as unknown as PaddleClient);

  beforeEach(() => {
    vi.useFakeTimers();
    getIps.mockReset().mockResolvedValue(['34.237.3.244/32', '10.1.0.0/16']);
  });
  afterEach(() => vi.useRealTimers());

  it('allows the listed addresses and subnets, as they arrive behind the proxy', async () => {
    const list = ips();
    expect(await list.allows('34.237.3.244')).toBe(true);
    expect(await list.allows('::ffff:34.237.3.244')).toBe(true);
    expect(await list.allows('10.1.200.7')).toBe(true);
  });

  it('refuses everyone else, and what is not an address', async () => {
    const list = ips();
    expect(await list.allows('203.0.113.9')).toBe(false);
    expect(await list.allows('2001:db8::1')).toBe(false);
    expect(await list.allows(undefined)).toBe(false);
    expect(await list.allows('nonsense')).toBe(false);
  });

  it('takes IPv6 too, should Paddle list any', async () => {
    getIps.mockResolvedValue(['2001:db8::/32']);
    const list = ips();
    expect(await list.allows('2001:db8::1')).toBe(true);
    expect(await list.allows('2001:db9::1')).toBe(false);
  });

  it('reads the list once for known addresses, again after an hour', async () => {
    const list = ips();
    await list.allows('34.237.3.244');
    vi.advanceTimersByTime(59 * 60 * 1000);
    await list.allows('34.237.3.244');
    expect(getIps).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2 * 60 * 1000);
    await list.allows('34.237.3.244');
    expect(getIps).toHaveBeenCalledTimes(2);
  });

  it('picks up a new Paddle address, but a stranger cannot make it ask more than once a minute', async () => {
    const list = ips();
    expect(await list.allows('52.0.0.1')).toBe(false);
    expect(await list.allows('52.0.0.1')).toBe(false);
    expect(getIps).toHaveBeenCalledTimes(1);
    getIps.mockResolvedValue(['52.0.0.1/32']);
    vi.advanceTimersByTime(61 * 1000);
    expect(await list.allows('52.0.0.1')).toBe(true);
  });

  it('keeps the last list when Paddle is down; with none, it says it cannot tell', async () => {
    const list = ips();
    await list.allows('34.237.3.244');
    getIps.mockRejectedValue(new Error('down'));
    vi.advanceTimersByTime(2 * 60 * 60 * 1000);
    expect(await list.allows('34.237.3.244')).toBe(true);

    await expect(ips().allows('34.237.3.244')).rejects.toThrow('down');
  });
});
