import { expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Markdown, parse } from './markdown';

const BRIEF = `# Wispr Flow: don't type, just speak

An internal demo, about a third-party product.

- **Purpose:** what Wispr Flow is and why it's needed: you think faster than you type,
  so speak instead.
- **Length:** 28.6 s
  - landscape 16:9

## Beats

| Time | What happens | Title |
|---|---|---|
| 0–5 s | A caret on grid paper. | You think faster than you type. |
| 5–10 s | The pill rises. | So just *say it.* |

## Ending

The Flow mark with [the site](https://wisprflow.ai). <script>alert(1)</script>
`;

test('reads a brief into headings, paragraphs, nested lists and a table', () => {
  const blocks = parse(BRIEF);

  expect(blocks.map((b) => b.kind)).toEqual(['heading', 'para', 'list', 'heading', 'table', 'heading', 'para']);
  const list = blocks[2] as Extract<(typeof blocks)[number], { kind: 'list' }>;
  expect(list.items).toHaveLength(2);
  expect(list.items[0].text).toMatch(/you think faster than you type, so speak instead\.$/); // a wrapped line joins its item
  expect(list.items[1].children[0]).toMatchObject({ kind: 'list', items: [{ text: 'landscape 16:9' }] });
  expect(blocks[4]).toMatchObject({ kind: 'table', head: ['Time', 'What happens', 'Title'] });
});

test('renders inline marks, keeps markup in the text as text, and links only to the web', () => {
  render(<Markdown blocks={parse(BRIEF)} />);

  expect(screen.getByText('Purpose:').tagName).toBe('STRONG');
  expect(screen.getByText('say it.').tagName).toBe('EM');
  expect(screen.getByRole('link', { name: 'the site' })).toHaveAttribute('href', 'https://wisprflow.ai');
  expect(screen.getByText(/<script>alert\(1\)<\/script>/)).toBeInTheDocument();
  expect(document.querySelector('script')).toBeNull();
  expect(screen.getByRole('table')).toBeInTheDocument();
});

test('a link to anything but http(s) is shown as its text', () => {
  render(<Markdown blocks={parse('[click](javascript:void-0)')} />);

  expect(screen.queryByRole('link')).toBeNull();
  expect(screen.getByText('click')).toBeInTheDocument();
});
