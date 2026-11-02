import type { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.js';
import { HeavySlots } from './heavy-slots.js';

const slots = (size: number, threads = 2) =>
  new HeavySlots({
    get: (key: string) => (key === 'WORKER_CONCURRENCY' ? size : threads),
  } as unknown as ConfigService<Env, true>);

const later = () => {
  let done!: () => void;
  const gate = new Promise<void>((r) => (done = r));
  return { gate, done };
};

describe('HeavySlots', () => {
  it('runs at most `size` at once, the rest in order', async () => {
    const s = slots(1);
    const order: string[] = [];
    const a = later();
    const first = s.run(async () => {
      order.push('a start');
      await a.gate;
      order.push('a end');
    });
    const second = s.run(async () => {
      order.push('b');
    });
    const third = s.run(async () => {
      order.push('c');
    });
    await Promise.resolve();
    expect(order).toEqual(['a start']);
    a.done();
    await Promise.all([first, second, third]);
    expect(order).toEqual(['a start', 'a end', 'b', 'c']);
  });

  it('a failed run frees its slot', async () => {
    const s = slots(1);
    await expect(
      s.run(() => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');
    await expect(s.run(async () => 'next')).resolves.toBe('next');
  });

  it('two slots: two at once', async () => {
    const s = slots(2);
    let running = 0;
    let peak = 0;
    const job = async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
    };
    await Promise.all([s.run(job), s.run(job), s.run(job), s.run(job)]);
    expect(peak).toBe(2);
  });

  it('threads: the setting, else the CPU budget; frames share it', () => {
    expect(slots(1, 3).threads).toBe(3);
    expect(slots(1, 8).frameThreads).toBe(2);
    expect(slots(1, 2).frameThreads).toBe(1);
    expect(slots(1, 0).threads).toBeGreaterThanOrEqual(1);
  });

  it('frames: one per CPU of the budget across all jobs, four at most', async () => {
    const peak = async (threads: number) => {
      const s = slots(1, threads);
      let running = 0;
      let most = 0;
      const frame = async () => {
        running++;
        most = Math.max(most, running);
        await new Promise((r) => setTimeout(r, 2));
        running--;
      };
      await Promise.all(Array.from({ length: 12 }, () => s.frame(frame)));
      return most;
    };
    expect(await peak(8)).toBe(4);
    expect(await peak(2)).toBe(2);
    expect(await peak(1)).toBe(1);
    expect(slots(1, 1).frameThreads).toBe(1);
  });
});
