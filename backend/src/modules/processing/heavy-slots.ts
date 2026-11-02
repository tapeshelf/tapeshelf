import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.js';
import { cpuBudget } from './cpu-budget.js';

/** At most `size` at once, the rest in order; a slot goes straight to the next in line. */
export class SlotPool {
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(private readonly size: number) {}

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.active < this.size) this.active++;
    else await new Promise<void>((resolve) => this.waiting.push(resolve));
    try {
      return await work();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active--;
    }
  }
}

/** Frames decoded at once in the whole worker at most, whatever the jobs (a 4K frame is ~250 MB). */
export const FRAME_SLOTS = 4;

/**
 * The worker's ffmpeg runs, held to what its container has. Heavy runs — transcodes (also a
 * remux that fell back to one) and editor renders — at most WORKER_CONCURRENCY at once, whatever
 * queue they came from: each holds up to ~1.5 GB for a 4K original, and before, a render, a
 * transcode and two remux fallbacks could run together in one 3 GB container. Frame extractions
 * share FRAME_SLOTS across all jobs (it was 4 per job). Also the threads each run may use.
 */
@Injectable()
export class HeavySlots {
  readonly threads: number;
  /** Frames decoded at once: one per CPU of the budget, up to FRAME_SLOTS. */
  readonly frameSlots: number;
  /** Threads of one frame extraction: the frames at once share the budget. */
  readonly frameThreads: number;
  private readonly heavy: SlotPool;
  private readonly frames: SlotPool;

  constructor(config: ConfigService<Env, true>) {
    this.heavy = new SlotPool(
      config.get('WORKER_CONCURRENCY', { infer: true }),
    );
    this.threads = config.get('FFMPEG_THREADS', { infer: true }) || cpuBudget();
    // Four frames at once on a worker of 0.8 CPU took four times as long each — closer to a frame's
    // time limit — and held four 4K buffers, for no speed.
    this.frameSlots = Math.min(FRAME_SLOTS, this.threads);
    this.frames = new SlotPool(this.frameSlots);
    this.frameThreads = Math.max(1, Math.floor(this.threads / this.frameSlots));
  }

  run<T>(work: () => Promise<T>): Promise<T> {
    return this.heavy.run(work);
  }

  frame<T>(work: () => Promise<T>): Promise<T> {
    return this.frames.run(work);
  }
}
