// Pure helpers for the Today panel: hotspots, the gap-fill word game, the Claude
// to-action list and reward texts. No DOM, so they can be tested in Node.

const DAY = 86400000;

// ---------------------------------------------------------------- hotspots
// Groups recently changed files into the folders you've been working in.
// A repo-like folder (first two levels under a GitHub folder, or the file's folder)
// stands for the files beneath it.
export function workFolder(filePath) {
  const parts = filePath.split('/');
  parts.pop();
  const gh = parts.findIndex((p) => /^GitHub/i.test(p));
  if (gh >= 0 && parts.length > gh + 1) return parts.slice(0, gh + 2).join('/');
  return parts.join('/');
}

export function hotspots(files, { now = Date.now(), limit = 6, ignore = ['LucianOS'] } = {}) {
  const groups = new Map();
  for (const f of files) {
    if (/(^|\/)(node_modules|\.git)(\/|$)/.test(f.path)) continue;
    const folder = workFolder(f.path);
    if (ignore.some((i) => folder === i || folder.startsWith(`${i}/`))) continue;
    const g = groups.get(folder) ?? { folder, files: [], score: 0, last: 0 };
    g.files.push(f);
    // recent changes count for more: a change an hour ago ≈ 1, a day ago ≈ 0.5
    g.score += 1 / (1 + (now - f.mtimeMs) / DAY);
    g.last = Math.max(g.last, f.mtimeMs);
    groups.set(folder, g);
  }
  return [...groups.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((g) => ({ ...g, name: g.folder.split('/').pop() || 'Home', files: g.files.sort((a, b) => b.mtimeMs - a.mtimeMs) }));
}

// Progress today and this week, from a log of { at, kind } entries.
export function progressSummary(log = [], now = Date.now()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const today = log.filter((p) => p.at >= start.getTime()).length;
  const week = log.filter((p) => p.at >= now - 7 * DAY).length;
  // a streak counts days in a row, up to today, with any progress
  const days = new Set(log.map((p) => new Date(p.at).toDateString()));
  let streak = 0;
  const d = new Date(start);
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1); // today not done yet: count up to yesterday
  while (days.has(d.toDateString())) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return { today, week, streak };
}

// ---------------------------------------------------------------- the word game
export const ASSIGNMENT_WORDS = ['assignment', 'essay', 'exam', 'homework', 'coursework', 'submission', 'assessment', 'marking', 'rubric', 'plagiarism'];

// Files that look like assignments are left out of the game.
export function isAssignment(name, text = '', words = ASSIGNMENT_WORDS) {
  const re = new RegExp(`\\b(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})s?\\b`, 'i');
  return re.test(name) || re.test(text.slice(0, 4000));
}

const STOP = new Set('the a an and or but of to in on at by for with from as is are was were be been being it its this that these those there their they them he she his her we our you your i me my not no so if then than which who whom what when where why how all any each some can could would should will shall may might must do does did has have had into onto over under about also just very more most such only own same too out up down off again further once here both few other nor'.split(' '));

// A small seeded random so a game can be replayed and tested.
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

// Turns text into game lines: some longer words become gaps shown as dashes.
// Returns [{ text, parts: [string | { gap: n, word }] }] for lines with at least one gap.
export function makeGame(text, { seed = 1, rate = 0.25, maxLines = 12, minLen = 4 } = {}) {
  const rand = rng(seed);
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.split(/\s+/).length >= 3 && !/^[#%/*-]{1,3}\s/.test(l) && !/^[:=\-_*#]+$/.test(l));
  const out = [];
  let gapNo = 0;
  for (const line of lines) {
    if (out.length >= maxLines) break;
    const tokens = line.split(/(\s+)/);
    const candidates = tokens
      .map((t, i) => ({ t, i, word: t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '') }))
      .filter(({ word }) => word.length >= minLen && /^[\p{L}][\p{L}'-]*$/u.test(word) && !STOP.has(word.toLowerCase()));
    if (!candidates.length) continue;
    let chosen = candidates.filter(() => rand() < rate);
    if (!chosen.length) chosen = [candidates[Math.floor(rand() * candidates.length)]];
    const picked = new Set(chosen.map((c) => c.i));
    const parts = [];
    tokens.forEach((t, i) => {
      if (!picked.has(i)) return parts.push(t);
      const c = candidates.find((x) => x.i === i);
      const [pre, post] = t.split(c.word);
      if (pre) parts.push(pre);
      parts.push({ gap: gapNo++, word: c.word });
      if (post) parts.push(post);
    });
    out.push({ text: line, parts });
  }
  return out;
}

// The dashed copy of a line, e.g. "the ------- of meaning", with dashes as long as the word.
export function dashed(parts, filled = {}) {
  return parts.map((p) => (typeof p === 'string' ? p : filled[p.gap] ?? '-'.repeat(p.word.length))).join('');
}

export function dashedCopy(game) {
  return game.map((l) => dashed(l.parts)).join('\n') + '\n';
}

const norm = (w) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
export function checkGuess(word, guess) {
  const a = norm(word);
  const b = norm(guess);
  if (!b) return 'empty';
  if (a === b) return 'right';
  // close: same stem (plural, -ed, -ing) or one letter out
  const stem = (w) => w.replace(/(ing|ed|es|s)$/, '');
  if (stem(a) === stem(b)) return 'close';
  if (Math.abs(a.length - b.length) <= 1 && editDistance(a, b) <= 1) return 'close';
  return 'wrong';
}

function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

// The first letter as a hint: "a------".
export const hint = (word) => word[0] + '-'.repeat(word.length - 1);

// ---------------------------------------------------------------- Claude to-action list
export const KEY_TERMS = ['algorithm', 'algorithms', 'predicate', 'recursion', 'recursive', 'list', 'lists', 'sort', 'search', 'parse', 'parser', 'grammar', 'tree', 'graph', 'loop', 'function', 'variable', 'input', 'output', 'data', 'string', 'rule', 'rules', 'query', 'interpreter', 'compile', 'compiler', 'optimise', 'optimize', 'test', 'tests', 'neural', 'program', 'code', 'append', 'member', 'reverse', 'findall'];

// Lines that mention at least `min` algorithmic key terms, ready to hand to Claude.
export function keyTermLines(text, { terms = KEY_TERMS, min = 1, max = 20 } = {}) {
  const re = new RegExp(`\\b(${terms.join('|')})\\b`, 'gi');
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.length < 12 || line.length > 400) continue;
    const hits = new Set((line.match(re) ?? []).map((m) => m.toLowerCase()));
    if (hits.size >= min) out.push({ line, terms: [...hits] });
    if (out.length >= max) break;
  }
  return out;
}

const HEADER = `# Claude to-action list

Lines with algorithmic ideas, collected by LucianOS. Unticked items can be sent to Claude
(LucianOS ▸ Tools ▸ Claude to-action list); "[~]" means sent, "[x]" means done.
Edit freely: delete lines you don't want.

`;

// Adds lines to the to-action file, skipping ones already there.
export function addToActions(existing, lines, source, when = new Date()) {
  const doc = existing && existing.trim() ? existing.replace(/\s*$/, '\n') : HEADER;
  const have = new Set(parseActions(doc).map((a) => a.text));
  const fresh = [...new Set(lines)].filter((l) => !have.has(l));
  if (!fresh.length) return { text: doc, added: 0 };
  const date = when.toISOString().slice(0, 10);
  const block = `\n## From ${source} (${date})\n\n${fresh.map((l) => `- [ ] ${l}`).join('\n')}\n`;
  return { text: doc + block, added: fresh.length };
}

export function parseActions(doc) {
  const out = [];
  doc.split('\n').forEach((l, i) => {
    const m = /^- \[( |~|x)\] (.*)$/.exec(l);
    if (m) out.push({ line: i, state: m[1], text: m[2] });
  });
  return out;
}

// Marks the given line numbers as sent ([~]) or done ([x]).
export function markActions(doc, lineNumbers, state = '~') {
  const set = new Set(lineNumbers);
  return doc.split('\n').map((l, i) => (set.has(i) ? l.replace(/^- \[( |~|x)\]/, `- [${state}]`) : l)).join('\n');
}

export function actionPrompt(items) {
  return [
    'Each line below is an idea from my notes that involves an algorithm. For each one:',
    '1. Say in one sentence what algorithm it describes.',
    '2. Write it as a short SWI-Prolog predicate (with one example query), or say what is missing to write it.',
    'Keep each answer brief, and number them to match.',
    '',
    ...items.map((t, i) => `${i + 1}. ${t}`)
  ].join('\n');
}

// ---------------------------------------------------------------- rewards
export const SITES = {
  libhunt: { name: 'LibHunt', url: 'https://www.libhunt.com/', tip: 'Submit the repo on LibHunt, with a one-line description and tags.' },
  hn: { name: 'Hacker News', url: 'https://news.ycombinator.com/submit', tip: 'Show HN posts need a title starting "Show HN:" and a link people can try.' },
  facebook: { name: 'Facebook', url: 'https://www.facebook.com/', tip: 'A friendly post: what it is, why you made it, and a link.' }
};

export function promoText(site, repo) {
  const r = repo ?? { name: 'my project', description: '', url: '' };
  const what = r.description ? r.description.replace(/\.$/, '') : `${r.name}, something I've been building`;
  const link = r.url || `https://github.com/luciangreen/${r.name}`;
  if (site === 'hn') {
    return `Title: Show HN: ${r.name} – ${what}\nURL: ${link}\n\nFirst comment:\nI made ${r.name} because [why]. It ${what.charAt(0).toLowerCase() + what.slice(1)}. It's open source; I'd welcome feedback on [what you want feedback on].\n`;
  }
  if (site === 'libhunt') {
    return `Name: ${r.name}\nURL: ${link}\nOne-line description: ${what}.\nTags: ${(r.language ?? 'Prolog').toLowerCase()}, [tag], [tag]\n`;
  }
  return `I've just updated ${r.name}: ${what}.\n\n[One sentence on what's new or why it matters to you.]\n\nIt's free and open source: ${link}\n`;
}

export function checkinText(name, { hotspots: spots = [], progress } = {}) {
  const who = name || '[name]';
  const work = spots.slice(0, 2).map((h) => h.name).join(' and ');
  const lines = [`Hi ${who},`, '', `Just checking in: how are you doing?`];
  if (work) lines.push('', `I've been working on ${work}${progress?.week ? ` and made progress ${progress.week} time${progress.week === 1 ? '' : 's'} this week` : ''}.`);
  lines.push('', 'Would you like to catch up soon?', '', 'Lucian');
  return lines.join('\n') + '\n';
}

export function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}${p(d.getMinutes())}`;
}

export const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'item';
