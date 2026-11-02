import { readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';

type Read = (path: string) => string;
const readText: Read = (path) => readFileSync(path, 'utf8');

/**
 * CPUs this process may really use: the container's quota (compose `cpus:`, cgroup v2 or v1),
 * else the cores it sees. ffmpeg and x264 count the machine's cores, not the quota: in a 2-CPU
 * container on a big host they started ~130 threads and a frame buffer for each, twice the memory
 * for no speed.
 */
export function cpuBudget(
  read: Read = readText,
  cores = availableParallelism(),
): number {
  const quota = cgroupCpus(read);
  return Math.max(1, Math.min(cores, quota ?? cores));
}

function cgroupCpus(read: Read): number | null {
  try {
    const [quota, period] = read('/sys/fs/cgroup/cpu.max').trim().split(/\s+/);
    if (quota === 'max') return null;
    return Math.ceil(Number(quota) / Number(period)) || null;
  } catch {
    // not cgroup v2
  }
  try {
    const quota = Number(read('/sys/fs/cgroup/cpu/cpu.cfs_quota_us').trim());
    const period = Number(read('/sys/fs/cgroup/cpu/cpu.cfs_period_us').trim());
    return quota > 0 && period > 0 ? Math.ceil(quota / period) : null;
  } catch {
    return null;
  }
}
