import { expect, test } from 'vitest';
import { droppedSounds } from './store';

// stand-ins for what Chrome hands over for a drop from Finder: file and folder entries
const file = (name: string, size = 10) => ({ name, isFile: true, isDirectory: false, file: (ok: (f: File) => void) => ok(new File([new Uint8Array(size)], name)) });
const dir = (name: string, children: unknown[]) => ({
  name, isFile: false, isDirectory: true,
  // a reader hands entries over in batches, then an empty batch
  createReader: () => { let sent = false; return { readEntries: (ok: (e: unknown[]) => void) => { ok(sent ? [] : children); sent = true; } }; },
});
const items = (...entries: unknown[]) => entries.map((e) => ({ kind: 'file', webkitGetAsEntry: () => e })) as unknown as DataTransferItemList;

test('a dropped folder is walked for its sound files, which keep their folders', async () => {
  const pack = dir('Impact Pack', [file('boom.wav'), file('LICENSE.txt'), file('.DS_Store'), dir('Metal', [file('clang.aiff'), file('scrape.MP3')])]);
  const { sounds, skipped } = await droppedSounds(items(pack, file('pop.wav')), [] as unknown as FileList);
  expect(sounds.map((s) => `${s.folder}|${s.file.name}`)).toEqual(['Impact Pack|boom.wav', 'Impact Pack/Metal|clang.aiff', 'Impact Pack/Metal|scrape.MP3', '|pop.wav']);
  expect(skipped).toBe(2); // the licence and the .DS_Store
});

test('empty files are skipped, and without entries the files are taken as given', async () => {
  const { sounds, skipped } = await droppedSounds(null, [new File([], 'empty.wav'), new File([new Uint8Array(4)], 'ok.wav'), new File([new Uint8Array(4)], 'notes.txt')] as unknown as FileList);
  expect(sounds.map((s) => s.file.name)).toEqual(['ok.wav']);
  expect(skipped).toBe(2);
});
