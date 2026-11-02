import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, input } from '@angular/core';

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'strong' | 'em' | 'code'; text: string }
  | { kind: 'link'; text: string; href: string; external: boolean };

export type MdBlock =
  | { kind: 'h'; level: 1 | 2 | 3 | 4; inline: Inline[] }
  | { kind: 'p'; inline: Inline[] }
  | { kind: 'ul' | 'ol'; items: Inline[][] };

const INLINE =
  /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*([^*\s][^*]*?)\*|_([^_\s][^_]*?)_/g;
const SAFE_HREF = /^(https?:\/\/|mailto:|\/(?!\/))/i;

/** Bold, italic, code and links; a link to anything but http(s), mailto or a site path stays text. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push({ kind: 'text', text: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ kind: 'strong', text: m[1] });
    else if (m[2] !== undefined) out.push({ kind: 'code', text: m[2] });
    else if (m[3] !== undefined) {
      const href = m[4]!;
      out.push(
        SAFE_HREF.test(href)
          ? { kind: 'link', text: m[3], href, external: /^https?:/i.test(href) }
          : { kind: 'text', text: m[3] },
      );
    } else out.push({ kind: 'em', text: (m[5] ?? m[6])! });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

/**
 * The small Markdown subset an operator needs for terms, privacy and imprint: #–#### headings,
 * paragraphs (lines join until a blank line), "-"/"*" and "1." lists, plus parseInline.
 */
export function parseMarkdown(source: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  let paragraph: string[] = [];
  let list: { kind: 'ul' | 'ol'; items: Inline[][] } | null = null;
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'p', inline: parseInline(paragraph.join(' ')) });
    paragraph = [];
    if (list) blocks.push(list);
    list = null;
  };
  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      const level = Math.min(heading[1]!.length, 4) as 1 | 2 | 3 | 4;
      blocks.push({ kind: 'h', level, inline: parseInline(heading[2]!.replace(/\s+#+$/, '')) });
      continue;
    }
    const item = /^(?:([-*])|\d+[.)])\s+(.*)$/.exec(line);
    if (item) {
      const kind = item[1] ? 'ul' : 'ol';
      if (paragraph.length || (list && list.kind !== kind)) flush();
      list ??= { kind, items: [] };
      list.items.push(parseInline(item[2]!));
      continue;
    }
    if (list) flush();
    paragraph.push(line);
  }
  flush();
  return blocks;
}

/** Renders parseMarkdown's blocks with the site's typography (no innerHTML, nothing executable). */
@Component({
  selector: 'app-markdown',
  host: { class: 'block' },
  template: `
    <ng-template #inline let-parts>
      @for (part of parts; track $index) {
        @switch (part.kind) {
          @case ('strong') {
            <strong class="font-semibold">{{ part.text }}</strong>
          }
          @case ('em') {
            <em>{{ part.text }}</em>
          }
          @case ('code') {
            <code class="label-mono rounded bg-surface px-1">{{ part.text }}</code>
          }
          @case ('link') {
            <a
              [href]="part.href"
              class="underline underline-offset-2 hover:text-accent-text"
              [attr.target]="part.external ? '_blank' : null"
              [attr.rel]="part.external ? 'noopener noreferrer' : null"
              >{{ part.text }}</a
            >
          }
          @default {
            {{ part.text }}
          }
        }
      }
    </ng-template>
    @for (block of blocks(); track $index) {
      @switch (block.kind) {
        @case ('h') {
          @switch (block.level) {
            @case (1) {
              <h1 class="font-display mb-6 text-3xl font-semibold sm:text-4xl">
                <ng-container *ngTemplateOutlet="inline; context: { $implicit: block.inline }" />
              </h1>
            }
            @case (2) {
              <h2 class="font-display mt-10 mb-3 text-xl font-semibold">
                <ng-container *ngTemplateOutlet="inline; context: { $implicit: block.inline }" />
              </h2>
            }
            @default {
              <h3 class="mt-6 mb-2 text-lg font-semibold">
                <ng-container *ngTemplateOutlet="inline; context: { $implicit: block.inline }" />
              </h3>
            }
          }
        }
        @case ('p') {
          <p class="my-4 text-[17px] leading-relaxed">
            <ng-container *ngTemplateOutlet="inline; context: { $implicit: block.inline }" />
          </p>
        }
        @case ('ul') {
          <ul class="my-4 flex list-disc flex-col gap-2 pl-6 text-[17px] leading-relaxed">
            @for (item of block.items; track $index) {
              <li><ng-container *ngTemplateOutlet="inline; context: { $implicit: item }" /></li>
            }
          </ul>
        }
        @case ('ol') {
          <ol class="my-4 flex list-decimal flex-col gap-2 pl-6 text-[17px] leading-relaxed">
            @for (item of block.items; track $index) {
              <li><ng-container *ngTemplateOutlet="inline; context: { $implicit: item }" /></li>
            }
          </ol>
        }
      }
    }
  `,
  imports: [NgTemplateOutlet],
})
export class MarkdownComponent {
  readonly source = input.required<string>();
  protected readonly blocks = computed(() => parseMarkdown(this.source()));
}
