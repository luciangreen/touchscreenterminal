// Small helpers for the touchscreen terminal, kept free of the page so they can be tested.

export const parentOf = (path) => path.split('/').slice(0, -1).join('/');

// "a/b/c" -> [{name:'Home', path:''}, {name:'a', path:'a'}, {name:'b', path:'a/b'}, {name:'c', path:'a/b/c'}]
export function crumbsOf(path) {
  const parts = path ? path.split('/') : [];
  return [{ name: 'Home', path: '' }, ...parts.map((name, i) => ({ name, path: parts.slice(0, i + 1).join('/') }))];
}

export function formatSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

export function formatWhen(ms, now = Date.now()) {
  const d = new Date(ms);
  const days = (now - ms) / 86400000;
  if (days < 1 && new Date(now).getDate() === d.getDate()) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (days < 365) return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

// Split a command line, honouring quotes: git commit -m "two words" -> ['git','commit','-m','two words']
export function splitArgs(text) {
  const out = [];
  const re = /"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(text))) out.push(m[1] !== undefined ? m[1].replace(/\\(.)/g, '$1') : m[2] ?? m[3]);
  return out;
}

// Most recent first, no repeats, at most `max`.
export function remember(list, item, max = 12) {
  return [item, ...list.filter((x) => x !== item)].slice(0, max);
}

// Is this pointer movement a swipe to the right (go up a folder)?
export function isSwipeRight(dx, dy, ms) {
  return dx > 80 && Math.abs(dy) < 50 && ms < 600;
}
