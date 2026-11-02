import { pluralize } from './plural';

describe('pluralize', () => {
  const en = '{count, plural, one {# video} other {# videos}}';
  const ru = '{n, plural, one {# день} few {# дня} many {# дней} other {# дня}}';

  it('picks the English form', () => {
    expect(pluralize(`Delete ${en}?`, { count: 1 }, 'en')).toBe('Delete 1 video?');
    expect(pluralize(`Delete ${en}?`, { count: 3 }, 'en')).toBe('Delete 3 videos?');
    expect(pluralize(en, { count: 0 }, 'en')).toBe('0 videos');
  });

  it('picks the Russian form by the last digits', () => {
    const forms = [1, 2, 5, 11, 21, 22, 25, 111].map((n) => pluralize(ru, { n }, 'ru'));
    expect(forms).toEqual([
      '1 день',
      '2 дня',
      '5 дней',
      '11 дней',
      '21 день',
      '22 дня',
      '25 дней',
      '111 дней',
    ]);
  });

  it('an exact form wins; {{params}} inside a form are left for the interpolation', () => {
    const text = '{count, plural, =0 {nothing} one {one from {{name}}} other {# from {{name}}}}';
    expect(pluralize(text, { count: 0 }, 'en')).toBe('nothing');
    expect(pluralize(text, { count: 1 }, 'en')).toBe('one from {{name}}');
    expect(pluralize(text, { count: 4 }, 'en')).toBe('4 from {{name}}');
  });

  it('an empty form drops the part; several plurals in one text each take their number', () => {
    const text =
      '“{{gives}}”{givesMore, plural, =0 {} other { and # more}} for “{{wants}}”{wantsMore, plural, =0 {} other { and # more}}.';
    expect(pluralize(text, { givesMore: 0, wantsMore: 2 }, 'en')).toBe(
      '“{{gives}}” for “{{wants}}” and 2 more.',
    );
  });

  it('leaves other texts alone and survives a broken message', () => {
    expect(pluralize('{{count}} selected', { count: 2 }, 'en')).toBe('{{count}} selected');
    expect(pluralize('{count, plural, one {# x', { count: 2 }, 'en')).toBe(
      '{count, plural, one {# x',
    );
    expect(pluralize(en, {}, 'en')).toBe(' videos'); // no number: the general form
  });
});
