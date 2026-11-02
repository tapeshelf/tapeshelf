import { TestBed } from '@angular/core/testing';

import { MarkdownComponent, parseInline, parseMarkdown } from './markdown';

describe('parseMarkdown', () => {
  it('reads headings, joined paragraphs and both kinds of lists', () => {
    const blocks = parseMarkdown(
      [
        '# Terms of use',
        '',
        'First line',
        'continues here.',
        '',
        '## What you may upload',
        '- your own videos',
        '* videos you may share',
        '',
        '1. read',
        '2) agree',
        '##### deep heading',
      ].join('\r\n'),
    );
    expect(blocks.map((b) => b.kind)).toEqual(['h', 'p', 'h', 'ul', 'ol', 'h']);
    expect(blocks[0]).toEqual({
      kind: 'h',
      level: 1,
      inline: [{ kind: 'text', text: 'Terms of use' }],
    });
    expect(blocks[1]).toEqual({
      kind: 'p',
      inline: [{ kind: 'text', text: 'First line continues here.' }],
    });
    expect(blocks[3]).toMatchObject({
      kind: 'ul',
      items: [[{ text: 'your own videos' }], [{ text: 'videos you may share' }]],
    });
    expect(blocks[4]).toMatchObject({
      kind: 'ol',
      items: [[{ text: 'read' }], [{ text: 'agree' }]],
    });
    expect(blocks[5]).toMatchObject({ kind: 'h', level: 4 });
  });

  it('ends a list when a paragraph line follows it', () => {
    expect(parseMarkdown('- one\n- two\nafter').map((b) => b.kind)).toEqual(['ul', 'p']);
  });
});

describe('parseInline', () => {
  it('finds bold, italic, code and links', () => {
    expect(
      parseInline('Write to [us](mailto:ops@example.org), **now**, *please*, `code`.'),
    ).toEqual([
      { kind: 'text', text: 'Write to ' },
      { kind: 'link', text: 'us', href: 'mailto:ops@example.org', external: false },
      { kind: 'text', text: ', ' },
      { kind: 'strong', text: 'now' },
      { kind: 'text', text: ', ' },
      { kind: 'em', text: 'please' },
      { kind: 'text', text: ', ' },
      { kind: 'code', text: 'code' },
      { kind: 'text', text: '.' },
    ]);
  });

  it('keeps unsafe and protocol-relative links as plain text', () => {
    expect(parseInline('[x](javascript:alert(1))')[0]).toEqual({ kind: 'text', text: 'x' });
    expect(parseInline('[x](//evil.example)')[0]).toEqual({ kind: 'text', text: 'x' });
    expect(parseInline('[site](/privacy)')[0]).toMatchObject({ kind: 'link', external: false });
    expect(parseInline('[web](https://example.org)')[0]).toMatchObject({
      kind: 'link',
      external: true,
    });
  });
});

describe('MarkdownComponent', () => {
  it('renders text, never markup, and opens external links safely', () => {
    const fixture = TestBed.createComponent(MarkdownComponent);
    fixture.componentRef.setInput(
      'source',
      '## Title <img src=x onerror=alert(1)>\n\nSee [docs](https://example.org).',
    );
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('h2')?.textContent).toContain('<img src=x onerror=alert(1)>');
    const a = el.querySelector('a')!;
    expect(a.getAttribute('href')).toBe('https://example.org');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    expect(a.getAttribute('target')).toBe('_blank');
  });
});
