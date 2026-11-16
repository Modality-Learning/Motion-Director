// Undo and redo. Every change to the clips or a sound's defaults records the state before it; changes in the
// same moment (one drag, one button) are one step: the step is taken once the current task has finished.

export class History {
  undo: string[] = [];
  redo: string[] = [];
  committed: string;
  private tick: ReturnType<typeof setTimeout> | null = null;
  constructor(private snapshot: () => string, private onChange: () => void = () => {}, private limit = 200) {
    this.committed = snapshot();
  }
  /** Starts again from what is there now (another piece, a fresh load). */
  reset() { this.cancel(); this.undo = []; this.redo = []; this.committed = this.snapshot(); this.onChange(); }
  /** Something is about to change: the state before it becomes one step, unless this moment already records one. */
  commit() {
    if (this.tick) return; // already recording this step
    const before = this.committed;
    this.tick = setTimeout(() => {
      this.tick = null;
      const now = this.snapshot();
      if (now === before) return; // nothing actually changed
      this.push(before, now);
    }, 0);
  }
  /** Takes the step being recorded now, rather than at the end of the moment. */
  flush() {
    if (!this.tick) return;
    this.cancel();
    const now = this.snapshot();
    if (now !== this.committed) this.push(this.committed, now);
  }
  /** A change from elsewhere is taken in as it is: ⌘Z still steps back through what was done here. */
  accept() { this.flush(); this.committed = this.snapshot(); }
  /** One step back (undo) or forward (redo): the state to restore, or null when there is none. */
  step(from: 'undo' | 'redo'): string | null {
    this.flush();
    const stack = from === 'undo' ? this.undo : this.redo, other = from === 'undo' ? this.redo : this.undo;
    const next = stack.pop();
    if (next === undefined) return null;
    other.push(this.snapshot());
    this.committed = next;
    this.onChange();
    return next;
  }
  private push(before: string, now: string) {
    this.undo.push(before);
    if (this.undo.length > this.limit) this.undo.shift();
    this.redo = [];
    this.committed = now;
    this.onChange();
  }
  private cancel() { if (this.tick) { clearTimeout(this.tick); this.tick = null; } }
}
