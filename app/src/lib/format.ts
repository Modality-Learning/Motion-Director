/** 0:04.3, a time on the film as the studio shows it. */
export const fmtT = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
/** 0:04.32, the timeline's clock. */
export const clock = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
export const secs = (t: number) => `${t.toFixed(2)} s`;
export const fmtBytes = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
export const fmtTime = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
