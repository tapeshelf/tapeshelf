import { type RequestSummaryDto, type RequestUserDto } from '../../api';

export interface RequestGroup {
  counterpart: RequestUserDto;
  items: RequestSummaryDto[];
}

/**
 * incoming requests from the same person are shown together. Groups keep the
 * order of their newest request; requests inside a group keep the list order.
 */
export function groupByCounterpart(items: RequestSummaryDto[]): RequestGroup[] {
  const groups = new Map<string, RequestGroup>();
  for (const r of items) {
    const group = groups.get(r.counterpart.id);
    if (group) group.items.push(r);
    else groups.set(r.counterpart.id, { counterpart: r.counterpart, items: [r] });
  }
  return [...groups.values()];
}
