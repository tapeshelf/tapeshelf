import { record } from './navigation-history';

const push = { popstate: false, replace: false };
const replace = { popstate: false, replace: true };
const pop = { popstate: true, replace: false };

describe('navigation history', () => {
  it('pushes ordinary navigations and rewrites the last entry on redirects', () => {
    let s = record([], '/v/1', push);
    s = record(s, '/@ann/v/1', replace);
    expect(s).toEqual(['/@ann/v/1']); // opened by a link: nowhere to go back to
    s = record(s, '/@ann', push);
    expect(s).toEqual(['/@ann/v/1', '/@ann']);
  });

  it('pops on browser back and pushes on browser forward', () => {
    let s = record(['/@ann', '/@ann/v/1'], '/@ann', pop);
    expect(s).toEqual(['/@ann']);
    s = record(s, '/@ann/v/1', pop);
    expect(s).toEqual(['/@ann', '/@ann/v/1']);
  });
});
