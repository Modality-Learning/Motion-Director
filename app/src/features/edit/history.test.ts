import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { History } from './history';

describe('undo and redo', () => {
  let state = { n: 0 };
  let h: History;
  const snap = () => JSON.stringify(state);
  beforeEach(() => { vi.useFakeTimers(); state = { n: 0 }; h = new History(snap); });
  afterEach(() => vi.useRealTimers());

  it('makes the changes of one moment one step', () => {
    h.commit(); state.n = 1;
    h.commit(); state.n = 2; // the same drag
    vi.runAllTimers();
    expect(h.undo).toEqual(['{"n":0}']);
    expect(JSON.parse(h.step('undo')!)).toEqual({ n: 0 });
  });
  it('makes no step when nothing actually changed', () => {
    h.commit();
    vi.runAllTimers();
    expect(h.undo).toEqual([]);
  });
  it('steps back and forward again', () => {
    h.commit(); state.n = 1; vi.runAllTimers();
    h.commit(); state.n = 2; vi.runAllTimers();
    state = JSON.parse(h.step('undo')!);
    expect(state.n).toBe(1);
    state = JSON.parse(h.step('undo')!);
    expect(state.n).toBe(0);
    expect(h.step('undo')).toBeNull();
    state = JSON.parse(h.step('redo')!);
    expect(state.n).toBe(1);
  });
  it('takes a step still being recorded before undoing it', () => {
    h.commit(); state.n = 5; // not yet the end of the moment
    expect(JSON.parse(h.step('undo')!)).toEqual({ n: 0 });
    expect(h.redo).toEqual(['{"n":5}']);
  });
  it('forgets what could be redone once something new is done', () => {
    h.commit(); state.n = 1; vi.runAllTimers();
    state = JSON.parse(h.step('undo')!);
    h.commit(); state.n = 9; vi.runAllTimers();
    expect(h.redo).toEqual([]);
  });
  it('takes a change from elsewhere in without making it a step', () => {
    h.commit(); state.n = 1; vi.runAllTimers();
    state.n = 40; h.accept(); // another window
    expect(h.undo).toEqual(['{"n":0}']);
    expect(h.committed).toBe('{"n":40}');
  });
  it('keeps only the newest steps', () => {
    const small = new History(snap, () => {}, 3);
    for (let i = 1; i <= 5; i++) { small.commit(); state.n = i; vi.runAllTimers(); }
    expect(small.undo.map((x) => JSON.parse(x).n)).toEqual([2, 3, 4]);
  });
  it('says when what can be undone changes', () => {
    const seen = vi.fn(), t = new History(snap, seen);
    t.commit(); state.n = 1; vi.runAllTimers();
    expect(seen).toHaveBeenCalled();
  });
});
