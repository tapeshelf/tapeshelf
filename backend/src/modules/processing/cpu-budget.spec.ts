import { cpuBudget } from './cpu-budget.js';

const files =
  (map: Record<string, string>) =>
  (path: string): string => {
    if (path in map) return map[path];
    throw new Error('ENOENT');
  };

describe('cpuBudget', () => {
  it('takes the cgroup v2 quota, rounded up, never above the cores', () => {
    expect(
      cpuBudget(files({ '/sys/fs/cgroup/cpu.max': '200000 100000\n' }), 12),
    ).toBe(2);
    expect(
      cpuBudget(files({ '/sys/fs/cgroup/cpu.max': '150000 100000' }), 12),
    ).toBe(2);
    expect(
      cpuBudget(files({ '/sys/fs/cgroup/cpu.max': '800000 100000' }), 4),
    ).toBe(4);
  });

  it('no quota: the cores', () => {
    expect(
      cpuBudget(files({ '/sys/fs/cgroup/cpu.max': 'max 100000' }), 8),
    ).toBe(8);
    expect(cpuBudget(files({}), 6)).toBe(6);
  });

  it('cgroup v1', () => {
    const v1 = files({
      '/sys/fs/cgroup/cpu/cpu.cfs_quota_us': '300000',
      '/sys/fs/cgroup/cpu/cpu.cfs_period_us': '100000',
    });
    expect(cpuBudget(v1, 16)).toBe(3);
    expect(
      cpuBudget(
        files({
          '/sys/fs/cgroup/cpu/cpu.cfs_quota_us': '-1',
          '/sys/fs/cgroup/cpu/cpu.cfs_period_us': '100000',
        }),
        16,
      ),
    ).toBe(16);
  });

  it('at least one', () => {
    expect(
      cpuBudget(files({ '/sys/fs/cgroup/cpu.max': '10000 100000' }), 1),
    ).toBe(1);
  });
});
