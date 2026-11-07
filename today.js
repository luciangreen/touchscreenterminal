// The Today panel: hotspots of recent work with progress buttons, the gap-fill word game,
// rewards (GitHub statistics, posts and check-ins to edit) and the Claude to-action list.
import { api } from '/shared/api.js';
import { askClaude } from '/shared/claude.js';
import {
  actionPrompt, addToActions, checkGuess, checkinText, dashed, dashedCopy, hint, hotspots, isAssignment,
  keyTermLines, makeGame, markActions, parseActions, progressSummary, promoText, SITES, slug, stamp
} from './lib/today.js';

const TODO = 'LucianOS/claude-to-action.md';
const DEFAULTS = {
  gameFolders: ['LucianOS/gl', 'LucianOS/gl/finished', 'Dropbox/GitHub-private2/Philosophy'],
  github: 'luciangreen',
  checkin: '',
  progress: []
};

export function initToday({ el, openPath, say, insideDesktop, getState, saveState }) {
  const panel = el('section', { id: 'today', className: 'today hidden', 'aria-label': 'Today' });
  document.body.append(panel);
  const cfg = () => {
    const st = getState();
    st.today = { ...DEFAULTS, ...(st.today ?? {}) };
    return st.today;
  };
  const save = () => saveState();
  let tab = 'work';
  let spots = [];

  const tabs = [['work', '🔥 Work'], ['game', '🧩 Game'], ['rewards', '🏆 Rewards'], ['claude', '📋 Claude']];
  const tabBar = el('nav', { className: 'tabs', role: 'tablist' });
  const body = el('div', { className: 'todaybody' });
  const closeBtn = el('button', { className: 'big', textContent: '✕', 'aria-label': 'Close Today', onclick: () => close() });
  panel.append(el('header', { className: 'todaytop' }, el('strong', { textContent: 'Today' }), el('span', { id: 'todaySummary', className: 'quiet' }), el('span', { className: 'spacer' }), closeBtn), tabBar, body);

  function renderTabs() {
    tabBar.replaceChildren(...tabs.map(([id, label]) => el('button', {
      role: 'tab', textContent: label, className: id === tab ? 'on' : '', 'aria-selected': String(id === tab),
      onclick: () => show(id)
    })));
    const p = progressSummary(cfg().progress);
    panel.querySelector('#todaySummary').textContent = `${p.today} today · ${p.week} this week${p.streak > 1 ? ` · ${p.streak}-day streak 🔥` : ''}`;
  }

  function open(which = tab) {
    panel.classList.remove('hidden');
    return show(which);
  }
  function close() {
    panel.classList.add('hidden');
  }
  function show(which) {
    tab = which;
    renderTabs();
    body.replaceChildren(el('p', { className: 'quiet', textContent: 'Loading…' }));
    const views = { work: workView, game: gameView, rewards: rewardsView, claude: claudeView };
    return views[which]().catch((err) => body.replaceChildren(el('p', { className: 'error', textContent: err.message })));
  }

  const write = (path, text) => api.files.write(path, text, { mkdirs: true });
  const readOr = (path, fallback = '') => api.files.read(path).then((r) => r.content, () => fallback);

  function logProgress(kind, folder) {
    const c = cfg();
    c.progress = [...c.progress, { at: Date.now(), kind, folder }].slice(-500);
    save();
    renderTabs();
    const p = progressSummary(c.progress);
    say?.(p.today === 1 ? 'First progress today. Well done! Pick a reward if you like.' : `That's ${p.today} today. Well done!`);
    banner(`✓ Progress logged (${kind}). Treat yourself:`, [['🏆 Rewards', () => show('rewards')]]);
  }

  function banner(text, actions = []) {
    body.querySelector('.banner')?.remove();
    body.prepend(el('div', { className: 'banner' }, el('span', { textContent: text }), ...actions.map(([l, fn]) => el('button', { textContent: l, onclick: fn }))));
  }

  // Lines with algorithmic key terms go on the Claude to-action list.
  async function collectKeyTerms(text, source) {
    const lines = keyTermLines(text).map((l) => l.line);
    if (!lines.length) return 0;
    const { text: next, added } = addToActions(await readOr(TODO), lines, source);
    if (added) await write(TODO, next);
    return added;
  }

  // ------------------------------------------------------------ 🔥 work
  async function workView() {
    const { results } = await api.files.recent('', { days: 7, limit: 600 });
    spots = hotspots(results);
    if (!spots.length) {
      body.replaceChildren(el('p', { className: 'empty', textContent: 'Nothing has changed in the last week. Any start counts: open a folder and change one thing.' }));
      return;
    }
    body.replaceChildren(
      el('p', { className: 'quiet', textContent: 'Where you have been working this week. Each button counts as progress.' }),
      ...spots.map((h) => {
        const ago = agoText(h.last);
        return el('article', { className: 'spot' },
          el('div', { className: 'spothead' },
            el('strong', { textContent: h.name }),
            el('span', { className: 'quiet small', textContent: `${h.files.length} change${h.files.length === 1 ? '' : 's'} · last ${ago}` }),
            el('span', { className: 'spacer' }),
            el('button', { textContent: 'Go there', onclick: () => { close(); openPath(h.folder, { isDir: true }); } })),
          el('div', { className: 'spotfiles' }, ...h.files.slice(0, 3).map((f) => el('button', { className: 'link', textContent: f.path.slice(h.folder.length + 1) || f.name, onclick: () => openPath(f.path, { editor: true }) }))),
          el('div', { className: 'progressbtns' },
            el('button', { textContent: '✓ Anything', title: 'You did something on it: that counts', onclick: () => logProgress('anything', h.folder) }),
            el('button', { textContent: '✍️ 5 hand-written lines', onclick: () => fiveLines(h) }),
            el('button', { textContent: '✳️ Send to Claude', onclick: () => sendSpot(h) }),
            el('button', { textContent: '▶ Run a workflow', onclick: () => pickWorkflow(h) })));
      }));
  }

  function fiveLines(h) {
    const inputs = [1, 2, 3, 4, 5].map((n) => el('input', { type: 'text', placeholder: `Line ${n}`, 'aria-label': `Line ${n}`, autocapitalize: 'sentences' }));
    const saveBtn = el('button', { className: 'primary big', textContent: 'Save 5 lines' });
    const form = el('form', { className: 'fivelines' }, el('h3', { textContent: `5 lines on ${h.name}` }), el('p', { className: 'quiet small', textContent: 'Write them yourself: ideas, a plan, what you did. They go in LucianOS/progress.' }), ...inputs, el('div', { className: 'row' }, el('button', { type: 'button', textContent: 'Cancel', onclick: () => show('work') }), el('span', { className: 'spacer' }), saveBtn));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const lines = inputs.map((i) => i.value.trim()).filter(Boolean);
      if (lines.length < 5) {
        inputs.find((i) => !i.value.trim())?.focus();
        return say?.(`${5 - lines.length} more to go.`);
      }
      const file = `LucianOS/progress/${slug(h.name)}.md`;
      const prev = await readOr(file, `# Progress on ${h.name}\n`);
      await write(file, `${prev.replace(/\s*$/, '\n')}\n## ${new Date().toLocaleString()}\n\n${lines.map((l) => `- ${l}`).join('\n')}\n`);
      const added = await collectKeyTerms(lines.join('\n'), file);
      await show('work');
      logProgress('5 lines', h.folder);
      if (added) banner(`✓ Saved. ${added} line${added === 1 ? '' : 's'} with algorithm ideas went on the Claude list.`, [['📋 Claude list', () => show('claude')], ['🏆 Rewards', () => show('rewards')]]);
    });
    body.replaceChildren(form);
    inputs[0].focus();
  }

  async function sendSpot(h) {
    const latest = h.files.find((f) => /\.(pl|js|md|txt|py|json|html|css)$/i.test(f.path)) ?? h.files[0];
    const text = latest ? (await readOr(latest.path)).slice(0, 6000) : '';
    const prompt = [
      `I'm working on ${h.folder}. Files I've changed this week, newest first:`,
      ...h.files.slice(0, 12).map((f) => `- ${f.path.slice(h.folder.length + 1)} (${agoText(f.mtimeMs)})`),
      '',
      latest ? `The most recent, ${latest.path}:\n\n\`\`\`\n${text}\n\`\`\`` : '',
      '',
      'Suggest the next three small, concrete steps I could take, each doable in under 30 minutes. Be brief.'
    ].join('\n');
    try {
      const reply = await askClaude({ purpose: `Next steps for ${h.name}`, prompt, maxTokens: 1200 });
      if (reply === null) return;
      const file = `LucianOS/progress/${slug(h.name)} claude ${stamp()}.md`;
      await write(file, `# Next steps for ${h.name} (Claude)\n\n${reply}\n`);
      openPath(file, { editor: true });
      logProgress('Claude', h.folder);
    } catch (err) {
      banner(err.status === 409 ? 'Claude is off. Add a key in LucianOS ▸ Tools ▸ Claude settings.' : err.message);
    }
  }

  async function pickWorkflow(h) {
    const wf = await api.state.get('workflows').catch(() => null);
    const items = (wf?.items ?? []).filter((i) => !i.hidden);
    if (!items.length) {
      body.replaceChildren(el('p', { className: 'empty', textContent: 'No workflows yet. Add some in the LucianOS checklist (Tools ▸ Checklist).' }), el('button', { textContent: 'Back', onclick: () => show('work') }));
      return;
    }
    body.replaceChildren(
      el('h3', { textContent: 'Run a workflow' }),
      el('div', { className: 'wflist' }, ...items.map((i) => el('button', {
        className: 'big wide',
        textContent: `${i.finishedOn === new Date().toISOString().slice(0, 10) ? '✓ ' : ''}${i.title}`,
        onclick: () => { runWorkflow(i); logProgress('workflow', h.folder); }
      }))),
      el('button', { textContent: 'Back', onclick: () => show('work') }));
  }

  function runWorkflow(item) {
    if (insideDesktop) {
      window.parent.postMessage({ type: 'lucianos.workflow', id: item.id }, location.origin);
      return;
    }
    if (item.kind === 'script' || item.kind === 'note') return openPath(item.target, { editor: item.kind === 'note' });
    if (item.kind === 'url') return window.open(item.target, '_blank');
    if (item.kind === 'app') return window.open(`/apps/${encodeURIComponent(item.target)}/`, '_blank');
    say?.('That one runs on the LucianOS desktop. Opening it.');
    window.open('/', '_blank');
  }

  // ------------------------------------------------------------ 🧩 game
  let game = null;
  async function gameView() {
    const c = cfg();
    const files = [];
    for (const folder of c.gameFolders) {
      const list = await api.files.list(folder).catch(() => null);
      for (const e of list?.entries ?? []) if (e.type === 'file' && /\.(txt|md)$/i.test(e.name)) files.push(e);
    }
    files.sort((a, b) => b.mtimeMs - a.mtimeMs);
    const usable = files.filter((f) => !isAssignment(f.name)).slice(0, 30);
    const foldersInput = el('input', { type: 'text', value: c.gameFolders.join(', '), 'aria-label': 'Folders for the game' });
    foldersInput.addEventListener('change', () => { c.gameFolders = foldersInput.value.split(',').map((x) => x.trim()).filter(Boolean); save(); show('game'); });
    body.replaceChildren(
      el('p', { className: 'quiet', textContent: 'Guess the missing words in your Grammar Logic and philosophy files. Files about assignments are left out.' }),
      el('label', { className: 'quiet small folders' }, 'From: ', foldersInput),
      usable.length
        ? el('div', { className: 'gamefiles' }, ...usable.map((f) => el('button', { textContent: f.name.replace(/\.(txt|md)$/i, ''), title: f.path, onclick: () => startGame(f) })))
        : el('p', { className: 'empty', textContent: 'No text files in those folders yet. Run Grammar Logic, or add a folder above.' }));
  }

  async function startGame(f) {
    const text = await readOr(f.path);
    if (isAssignment(f.name, text)) return banner('That file looks like an assignment, so it is left out.');
    const lines = makeGame(text, { seed: Date.now() % 100000, rate: 0.22 });
    if (!lines.length) return banner('Not enough words in that file for a game.');
    const copy = `LucianOS/games/${f.name.replace(/\.(txt|md)$/i, '')} dashed ${stamp()}.txt`;
    await write(copy, dashedCopy(lines));
    game = { file: f, text, lines, copy, filled: {}, state: {}, done: false };
    renderGame();
  }

  function renderGame() {
    const g = game;
    const total = g.lines.reduce((n, l) => n + l.parts.filter((p) => typeof p !== 'string').length, 0);
    const score = el('span', { className: 'score' });
    const updateScore = () => {
      const right = Object.values(g.state).filter((s) => s === 'right').length;
      score.textContent = `${right} / ${total}`;
      if (right === total && !g.done) {
        g.done = true;
        logProgress('game', g.file.path.split('/').slice(0, -1).join('/'));
        say?.('All of them! Brilliant.');
      }
    };
    let focused = null;
    const lineEls = g.lines.map((l, li) => {
      const row = el('div', { className: 'gameline' });
      const said = el('pre', { className: 'claudesaid hidden' });
      const parts = l.parts.map((p) => {
        if (typeof p === 'string') return document.createTextNode(p);
        const input = el('input', { type: 'text', className: `gap ${g.state[p.gap] ?? ''}`, value: g.filled[p.gap] ?? '', 'aria-label': `Missing word, ${p.word.length} letters`, autocapitalize: 'off', autocomplete: 'off', spellcheck: false, placeholder: '-'.repeat(p.word.length) });
        input.style.width = `${Math.max(3, p.word.length + 1)}ch`;
        input.readOnly = g.state[p.gap] === 'right';
        input.addEventListener('focus', () => (focused = { input, p }));
        input.addEventListener('change', () => {
          const v = input.value;
          g.filled[p.gap] = v;
          const r = checkGuess(p.word, v);
          g.state[p.gap] = r === 'empty' ? undefined : r;
          input.className = `gap ${g.state[p.gap] ?? ''}`;
          if (r === 'right') {
            input.value = p.word;
            g.filled[p.gap] = p.word;
            input.readOnly = true;
            const next = [...panel.querySelectorAll('.gap')].find((x) => !x.readOnly && x !== input);
            next?.focus();
          }
          if (r === 'close') say?.('Close!');
          updateScore();
        });
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.dispatchEvent(new Event('change')); });
        return input;
      });
      const ask = el('button', { className: 'small', textContent: '✳️', title: 'Ask Claude about this line', 'aria-label': 'Ask Claude about this line', onclick: () => askLine(li, said) });
      row.append(el('div', { className: 'gametext' }, ...parts), ask);
      return el('div', {}, row, said);
    });
    body.replaceChildren(
      el('div', { className: 'gamehead' },
        el('strong', { textContent: g.file.name }), score, el('span', { className: 'spacer' }),
        el('button', { textContent: '💡 Hint', onclick: () => { if (focused && !focused.input.readOnly) { focused.input.value = hint(focused.p.word).replace(/-+$/, ''); focused.input.focus(); } else say?.('Tap a gap first.'); } }),
        el('button', { textContent: 'Show answers', onclick: () => { g.lines.forEach((l) => l.parts.forEach((p) => { if (typeof p !== 'string' && g.state[p.gap] !== 'right') { g.filled[p.gap] = p.word; g.state[p.gap] = 'shown'; } })); renderGame(); } }),
        el('button', { textContent: 'Back', onclick: () => show('game') })),
      el('p', { className: 'quiet small', textContent: `Dashed copy saved as ${g.copy}. Green is right, amber is close.` }),
      ...lineEls,
      el('div', { className: 'row gamefoot' },
        el('button', { textContent: '📋 Add algorithm lines to the Claude list', onclick: async () => {
          const n = await collectKeyTerms(g.text, g.file.path);
          banner(n ? `Added ${n} line${n === 1 ? '' : 's'} to the Claude to-action list.` : 'No new lines with algorithm terms in this file.', n ? [['📋 Claude list', () => show('claude')]] : []);
        } }),
        el('button', { textContent: '✳️ Claude: fill the gaps', title: 'Claude finds the pattern of the lines and suggests every missing word', onclick: () => fillAll() })));
    updateScore();
  }

  async function askLine(li, out) {
    const g = game;
    const l = g.lines[li];
    const around = g.lines.slice(Math.max(0, li - 2), li + 3).map((x) => x.text).filter((t) => t !== l.text);
    try {
      const reply = await askClaude({
        purpose: 'Line structure and gaps',
        prompt: `Here is a line with missing words shown as dashes (one dash per letter):\n\n${dashed(l.parts)}\n\nNearby lines from the same file:\n${around.map((t) => `- ${t}`).join('\n')}\n\nIn two or three sentences, describe the structure of the line (its pattern of ideas and parts of speech). Then suggest one word for each gap, in order, as a numbered list.`,
        maxTokens: 500
      });
      if (reply === null) return;
      out.textContent = reply;
      out.classList.remove('hidden');
    } catch (err) {
      banner(err.message);
    }
  }

  async function fillAll() {
    const g = game;
    try {
      const reply = await askClaude({
        purpose: 'Fill the gaps',
        prompt: `These lines come from my notes. Dashes stand for missing words, one dash per letter.\n\n${g.lines.map((l, i) => `${i + 1}. ${dashed(l.parts)}`).join('\n')}\n\nFirst say in one sentence what structure the lines share. Then rewrite each line, numbered, with your best word in each gap.`,
        maxTokens: 1500
      });
      if (reply === null) return;
      const file = g.copy.replace(/\.txt$/, ' claude.md');
      await write(file, `# Claude's gap-fill\n\nFrom ${g.file.path}. Compare with your own guesses.\n\n${reply}\n`);
      openPath(file, { editor: true });
    } catch (err) {
      banner(err.message);
    }
  }

  // ------------------------------------------------------------ 🏆 rewards
  async function rewardsView() {
    const c = cfg();
    const statsBox = el('div', { className: 'stats' }, el('p', { className: 'quiet', textContent: 'Getting GitHub statistics…' }));
    const userInput = el('input', { type: 'text', value: c.github, 'aria-label': 'GitHub user name', autocapitalize: 'off' });
    userInput.addEventListener('change', () => { c.github = userInput.value.trim(); save(); show('rewards'); });
    const repoSel = el('select', { 'aria-label': 'Repository to promote' });
    const nameInput = el('input', { type: 'text', value: c.checkin, placeholder: 'Name', 'aria-label': 'Who to check in with' });
    nameInput.addEventListener('change', () => { c.checkin = nameInput.value.trim(); save(); });
    let repos = [];

    const draft = async (kind, text, title) => {
      const file = `LucianOS/posts/${stamp()} ${kind}.md`;
      await write(file, text);
      openPath(file, { editor: true });
      say?.(`I've drafted ${title}. Edit it, then post it.`);
    };

    body.replaceChildren(
      el('section', { className: 'reward' },
        el('h3', {}, '📈 GitHub ', el('span', { className: 'quiet small' }, 'for ', userInput)),
        statsBox),
      el('section', { className: 'reward' },
        el('h3', { textContent: '📣 Promote a project' }),
        el('div', { className: 'row' }, repoSel),
        el('div', { className: 'progressbtns' }, ...Object.entries(SITES).map(([id, site]) => el('button', {
          textContent: site.name,
          onclick: () => {
            const repo = repos.find((r) => r.name === repoSel.value) ?? { name: repoSel.value || 'my project' };
            draft(`${id} ${slug(repo.name)}`, `${promoText(id, repo)}\n---\nWhere: ${site.url}\nTip: ${site.tip}\n`, `a ${site.name} post about ${repo.name}`);
          }
        })))),
      el('section', { className: 'reward' },
        el('h3', { textContent: '💌 Check in with someone' }),
        el('div', { className: 'row' }, nameInput, el('button', {
          textContent: 'Draft a message',
          onclick: async () => {
            if (!spots.length) spots = hotspots((await api.files.recent('', { days: 7, limit: 600 }).catch(() => ({ results: [] }))).results);
            draft(`check-in ${slug(nameInput.value || 'someone')}`, checkinText(nameInput.value.trim(), { hotspots: spots, progress: progressSummary(c.progress) }), 'a check-in message');
          }
        }))));

    try {
      const s = await api.github.stats(c.github);
      repos = [...s.recent, ...s.top.filter((t) => !s.recent.some((r) => r.name === t.name))];
      statsBox.replaceChildren(
        el('div', { className: 'statgrid' },
          ...[['Repos', s.repos], ['Stars', s.stars], ['Forks', s.forks], ['Pushed this week', s.pushedThisWeek]].map(([k, v]) => el('div', {}, el('b', { textContent: String(v) }), el('span', { className: 'quiet small', textContent: k })))),
        s.top.length ? el('p', { className: 'small' }, 'Most starred: ', s.top.map((t) => `${t.name} ★${t.stars}`).join(' · ')) : null);
    } catch (err) {
      statsBox.replaceChildren(el('p', { className: 'quiet', textContent: `${err.message}. You can still draft posts below.` }));
    }
    repoSel.replaceChildren(...(repos.length ? repos : spots.map((h) => ({ name: h.name }))).map((r) => el('option', { value: r.name, textContent: r.name })));
  }

  // ------------------------------------------------------------ 📋 Claude list
  async function claudeView() {
    const doc = await readOr(TODO);
    const items = parseActions(doc);
    const open = items.filter((a) => a.state === ' ');
    const sent = items.filter((a) => a.state === '~').length;
    const done = items.filter((a) => a.state === 'x').length;
    body.replaceChildren(
      el('p', { className: 'quiet', textContent: 'Lines from your notes that involve an algorithm. LucianOS collects them from the game, your 5 lines and your files; Claude can turn them into Prolog.' }),
      el('div', { className: 'row' },
        el('span', { textContent: `${open.length} waiting · ${sent} sent · ${done} done` }),
        el('span', { className: 'spacer' }),
        el('button', { textContent: '✏️ Open list', onclick: async () => { if (!doc) await write(TODO, addToActions('', [], '').text); openPath(TODO, { editor: true }); } }),
        el('button', { textContent: '🔎 Collect from recent files', onclick: collectRecent }),
        el('button', { className: 'primary', textContent: `✳️ Send ${Math.min(5, open.length)} to Claude`, disabled: !open.length, onclick: () => sendActions(doc, open.slice(0, 5)) })),
      open.length
        ? el('ol', { className: 'actions' }, ...open.slice(0, 40).map((a) => el('li', { textContent: a.text })))
        : el('p', { className: 'empty', textContent: 'Nothing waiting. Collect from recent files, or add lines with 📋 in the game.' }));
  }

  async function collectRecent() {
    const { results } = await api.files.recent('', { days: 3, limit: 200 });
    let n = 0;
    for (const f of results.filter((x) => /\.(txt|md)$/i.test(x.name) && !x.path.startsWith('LucianOS/') && !isAssignment(x.name)).slice(0, 25)) {
      n += await collectKeyTerms(await readOr(f.path), f.path);
    }
    await show('claude');
    banner(n ? `Added ${n} line${n === 1 ? '' : 's'}.` : 'No new lines with algorithm terms in files changed in the last 3 days.');
  }

  async function sendActions(doc, batch) {
    try {
      const reply = await askClaude({ purpose: `To-action list (${batch.length} lines)`, prompt: actionPrompt(batch.map((a) => a.text)), maxTokens: 2500 });
      if (reply === null) return;
      const file = `LucianOS/diagnostics/to-action ${stamp()}.md`;
      await write(file, `# Claude on ${batch.length} to-action lines\n\n${batch.map((a, i) => `${i + 1}. ${a.text}`).join('\n')}\n\n---\n\n${reply}\n`);
      await write(TODO, markActions(doc, batch.map((a) => a.line), '~'));
      openPath(file, { editor: true });
      await show('claude');
    } catch (err) {
      banner(err.status === 409 ? 'Claude is off. Add a key in LucianOS ▸ Tools ▸ Claude settings.' : err.message);
    }
  }

  return { open, close, isOpen: () => !panel.classList.contains('hidden') };
}

function agoText(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 60) return `${Math.max(1, m)} min ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}
