import { describe, expect, it } from 'vitest';

import { type RequestSummaryDto } from '../../api';
import { groupByCounterpart } from './request-groups';

const req = (id: string, who: string) =>
  ({
    id,
    counterpart: { id: who, username: who, displayName: who, avatarUrl: null },
  }) as RequestSummaryDto;

describe('groupByCounterpart', () => {
  it('puts requests of one person together, in the order of their first appearance', () => {
    const groups = groupByCounterpart([req('1', 'bob'), req('2', 'ann'), req('3', 'bob')]);
    expect(groups.map((g) => [g.counterpart.id, g.items.map((r) => r.id)])).toEqual([
      ['bob', ['1', '3']],
      ['ann', ['2']],
    ]);
  });
});
