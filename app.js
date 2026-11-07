// Touchscreen terminal: move around folders by touch, run commands, and talk to the character.
import { api, notify } from '/shared/api.js';
import { mountCharacter } from '/shared/character/character.js';
import { bestMatch } from '/shared/character/commands.js';
import { crumbsOf, formatSize, formatWhen, isSwipeRight, parentOf, remember, splitArgs } from './lib/nav.js';

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null) continue;
    if (k.startsWith('aria-') || k === 'role') n.setAttribute(k, v);
    else n[k] = v;
  }
  n.append(...kids.filter((k) => k !== null && k !== undefined));
  return n;
};

const INSIDE_DESKTOP = window.parent !== window;
const DEFAULT_CHIPS = ['ls -la', 'git status', 'git pull', 'git log --oneline -5', 'pwd', 'swipl --version'];
let st = { folder: '', recent: [], history: [] };
let entries = [];
let job = null;
let stopStream = null;
let character = null;
let allowed = [];

const save = () => api.state.set('touchterm', st).catch(() => {});

function glyph(e) {
  if (e.type === 'dir') return '📁';
  const n = e.name.toLowerCase();
  if (n.endsWith('.shellrun.json')) return '▶️';
  if (/\.(pl|pro)$/.test(n)) return '📜';
  if (/\.md$/.test(n)) return '📝';
  if (/\.(png|jpe?g|gif|webp|heic)$/.test(n)) return '🖼️';
  if (/\.(mid|midi|mp3|wav|m4a)$/.test(n)) return '🎵';
  if (/\.(url|webloc)$/.test(n)) return '🔗';
  return '📄';
}

// ---------------- folders ----------------
async function go(folder, { quiet = false } = {}) {
  let data;
  try {
    data = await api.files.list(folder);
  } catch (err) {
    if (!quiet) toast(err.message);
    return false;
  }
  st.folder = data.path;
  st.recent = remember(st.recent, data.path);
  entries = data.entries;
  $('filter').value = '';
  render();
  save();
  $('list').scrollTop = 0;
  return true;
}

function render() {
  const crumbs = crumbsOf(st.folder);
  $('crumbs').replaceChildren(...crumbs.map((c) => el('button', { textContent: c.name, onclick: () => go(c.path) })));
  $('crumbs').scrollLeft = $('crumbs').scrollWidth;
  $('up').disabled = !st.folder;
  const q = $('filter').value.trim().toLowerCase();
  const shown = q ? entries.filter((e) => e.name.toLowerCase().includes(q)) : entries;
  $('list').replaceChildren(...shown.map((e) => {
    const row = el('div', { className: 'row-item', role: 'button', tabIndex: 0, 'aria-label': `${e.type === 'dir' ? 'Folder' : 'File'} ${e.name}` },
      el('span', { className: 'glyph', textContent: glyph(e) }),
      el('span', { className: 'name', textContent: e.name }),
      el('span', { className: 'meta', textContent: e.type === 'dir' ? '' : `${formatSize(e.size)} · ${formatWhen(e.mtimeMs)}` }),
      el('span', { className: 'chev', textContent: e.type === 'dir' ? '›' : '⋯' }));
    row.dataset.path = e.path;
    const act = () => (e.type === 'dir' ? go(e.path) : openSheet(e));
    row.addEventListener('click', act);
    row.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') act(); });
    return row;
  }));
  if (!shown.length) $('list').append(el('p', { className: 'empty', textContent: q ? 'Nothing matches the filter' : 'This folder is empty' }));
  renderRecent();
}

function renderRecent() {
  $('recent').replaceChildren(...st.recent.map((f) => el('li', { role: 'none' },
    el('button', { role: 'menuitem', textContent: `📁  ${f || 'Home'}`, onclick: () => { closeRecent(); go(f); } }))));
}
function closeRecent() {
  $('recent').classList.add('hidden');
  $('recentBtn').setAttribute('aria-expanded', 'false');
}

// swipe right on the list = up one folder
let swipe = null;
$('list').addEventListener('pointerdown', (e) => { swipe = { x: e.clientX, y: e.clientY, t: performance.now() }; });
$('list').addEventListener('pointerup', (e) => {
  if (swipe && st.folder && isSwipeRight(e.clientX - swipe.x, e.clientY - swipe.y, performance.now() - swipe.t)) go(parentOf(st.folder));
  swipe = null;
});

// ---------------- opening files ----------------
// editor: open as text in iEdit even if it is a script
function openPath(path, { isDir = false, editor = false } = {}) {
  if (INSIDE_DESKTOP) {
    window.parent.postMessage({ type: 'lucianos.open', path, isDir, editor }, location.origin);
    return;
  }
  const lower = path.toLowerCase();
  const url = editor ? `/apps/iedit/?open=${encodeURIComponent(path)}`
    : lower.endsWith('.shellrun.json') ? `/apps/shellrunscriptmaker/?open=${encodeURIComponent(path)}&run=1`
    : /\.(png|jpe?g|gif|webp|mid|midi|mp3|wav|m4a|pdf|mp4|mov)$/.test(lower) ? api.files.rawUrl(path)
    : `/apps/iedit/?open=${encodeURIComponent(path)}`;
  window.open(url, '_blank');
}

function openSheet(e) {
  $('sheetTitle').textContent = `${glyph(e)}  ${e.name}`;
  $('sheetInfo').textContent = `${e.path} · ${formatSize(e.size)} · changed ${new Date(e.mtimeMs).toLocaleString()}`;
  const lower = e.name.toLowerCase();
  const actions = [];
  if (lower.endsWith('.shellrun.json')) {
    actions.push(['▶️  Run in shellrun', () => openPath(e.path)]);
    actions.push(['✏️  Edit as text', () => openPath(e.path, { editor: true })]);
  } else {
    actions.push(['✏️  Open', () => openPath(e.path)]);
  }
  if (/\.(pl|pro)$/.test(lower)) actions.push(['🦉  Load in Prolog', () => runSpec({ prolog: true, text: `consult('${e.name.replace(/'/g, "\\'")}')` })]);
  actions.push(['📋  Copy path', async () => { await navigator.clipboard.writeText(e.path).catch(() => {}); toast('Path copied'); }]);
  $('sheetActions').replaceChildren(...actions.map(([label, fn]) => el('button', { textContent: label, onclick: () => { closeSheet(); fn(); } })));
  $('sheet').classList.remove('hidden');
}
function closeSheet() {
  $('sheet').classList.add('hidden');
}
$('sheetCancel').addEventListener('click', closeSheet);

// ---------------- commands ----------------
function renderChips() {
  const chips = [...new Set([...st.history.slice(0, 6), ...DEFAULT_CHIPS])].slice(0, 12);
  $('chips').replaceChildren(...chips.map((c) => el('button', { textContent: c, title: `Run ${c} here`, onclick: () => runSpec({ text: c }) })));
}

async function runSpec({ text, prolog = $('isProlog').checked }) {
  text = text.trim();
  if (!text) return;
  if (job) return toast('A command is still running');
  let spec;
  if (prolog) {
    spec = { goal: text, cwd: st.folder };
  } else {
    const args = splitArgs(text);
    if (!allowed.includes(args[0])) {
      return showOutput(`${text}`, `"${args[0]}" is not in the suite's allowed commands (${allowed.join(', ')}). Add it to allowedCommands in config.json.\n`, 'error');
    }
    spec = { cmd: args[0], args: args.slice(1), cwd: st.folder };
  }
  st.history = remember(st.history, text, 20);
  save();
  renderChips();
  try {
    job = prolog ? await api.jobs.prolog(spec) : await api.jobs.start(spec);
  } catch (err) {
    return showOutput(text, `${err.message}\n`, 'error');
  }
  showOutput(`${prolog ? '?- ' : '$ '}${text}`, '', 'running');
  $('interrupt').disabled = false;
  stopStream = api.jobs.stream(job.id, {
    output: ({ stream, text: t }) => {
      $('output').append(el('span', { className: stream, textContent: t }));
      $('output').scrollTop = $('output').scrollHeight;
    },
    end: (s) => {
      const msg = s.status === 'done' ? 'Finished' : s.status === 'cancelled' ? 'Interrupted' : `Failed (exit ${s.exitCode ?? s.signal})`;
      $('outStatus').textContent = msg;
      $('outStatus').className = s.status === 'done' ? 'ok' : 'error';
      $('interrupt').disabled = true;
      job = null;
      if (document.hidden) notify('Touchscreen terminal', `${text}: ${msg}`);
      api.files.list(st.folder).then((d) => { entries = d.entries; render(); }).catch(() => {});
    }
  });
}

function showOutput(title, text, status) {
  $('outTitle').textContent = title;
  $('outStatus').textContent = status === 'running' ? 'Running…' : status === 'error' ? 'Not run' : '';
  $('outStatus').className = status === 'error' ? 'error' : 'quiet';
  $('output').replaceChildren(text ? el('span', { className: status === 'error' ? 'stderr' : 'stdout', textContent: text }) : '');
  $('outPanel').classList.remove('hidden');
  if (innerWidth < 760) character?.minimise(); // keep the output readable on a phone
}

$('cmdForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('cmd').value;
  $('cmd').value = '';
  runSpec({ text });
});
$('interrupt').addEventListener('click', () => job && api.jobs.cancel(job.id));
$('outClose').addEventListener('click', () => { $('outPanel').classList.add('hidden'); stopStream?.(); });

// ---------------- toolbar ----------------
$('home').addEventListener('click', () => go(''));
$('up').addEventListener('click', () => go(parentOf(st.folder)));
$('recentBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  const open = $('recent').classList.toggle('hidden') === false;
  $('recentBtn').setAttribute('aria-expanded', String(open));
});
document.addEventListener('click', (e) => { if (!e.target.closest('.recentwrap')) closeRecent(); });
$('filter').addEventListener('input', render);

function toast(text) {
  if (character) character.say(text);
  else alert(text);
}

// ---------------- the character ----------------
async function handle(cmd) {
  switch (cmd.intent) {
    case 'up':
      if (!st.folder) return "You're already at the top.";
      await go(parentOf(st.folder));
      return `Up to ${st.folder || 'Home'}.`;
    case 'home':
      await go('');
      return 'Home.';
    case 'goto': {
      const hit = bestMatch(cmd.name, entries.filter((e) => e.type === 'dir'))
        ?? bestMatch(cmd.name, st.recent.map((f) => ({ name: f.split('/').pop() || 'Home', path: f })));
      if (!hit) return `There's no folder called ${cmd.name} here.`;
      await go(hit.path);
      return `In ${hit.name}. ${entries.length} item${entries.length === 1 ? '' : 's'}.`;
    }
    case 'list': {
      const names = entries.slice(0, 10).map((e) => e.name).join(', ');
      return `You're in ${st.folder || 'Home'}. ${entries.length ? `${entries.length} items: ${names}${entries.length > 10 ? ', and more' : ''}.` : 'It is empty.'}`;
    }
    case 'open': {
      const hit = bestMatch(cmd.name, entries);
      if (!hit) return `I can't see ${cmd.name} here.`;
      if (hit.type === 'dir') { await go(hit.path); return `In ${hit.name}.`; }
      openPath(hit.path);
      return `Opening ${hit.name}.`;
    }
    case 'run': {
      const script = bestMatch(cmd.name, entries.filter((e) => e.name.toLowerCase().endsWith('.shellrun.json')));
      if (script) { openPath(script.path); return `Running ${script.name.replace(/\.shellrun\.json$/i, '')}.`; }
      const args = splitArgs(cmd.name);
      if (allowed.includes(args[0])) { runSpec({ text: cmd.name, prolog: false }); return `Running ${cmd.name}.`; }
      return `I can't find a script called ${cmd.name} here.`;
    }
    case 'find': {
      $('filter').value = cmd.query;
      render();
      const n = entries.filter((e) => e.name.toLowerCase().includes(cmd.query.toLowerCase())).length;
      if (n) return `${n} here match ${cmd.query}.`;
      const { results } = await api.files.search(cmd.query, { path: st.folder });
      if (!results.length) return `Nothing called ${cmd.query} in here or below.`;
      const first = results[0];
      await go(first.type === 'dir' ? first.path : parentOf(first.path));
      return `Found ${first.path}${results.length > 1 ? `, and ${results.length - 1} more` : ''}. I've gone to it.`;
    }
    default:
      return null;
  }
}

// ---------------- start ----------------
async function init() {
  const info = await api.info();
  allowed = info.allowedCommands;
  st = { ...st, ...((await api.state.get('touchterm').catch(() => null)) ?? {}) };
  renderChips();
  const start = new URLSearchParams(location.search).get('folder') ?? st.folder;
  if (!(await go(start, { quiet: true }))) await go('');
  character = await mountCharacter({
    handle,
    bottom: 150,
    greeting: 'Tell me where to go: go to a folder, go up, open a file, or run a script.'
  }).catch(() => null);
}

init().catch((err) => alert(err.message));
