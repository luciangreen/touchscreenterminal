import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  actionPrompt, addToActions, checkGuess, checkinText, dashed, dashedCopy, hint, hotspots, isAssignment,
  keyTermLines, makeGame, markActions, parseActions, progressSummary, promoText, workFolder
} from '../lib/today.js';

const H = 3600000;

test('hotspots group recent files by repo, newest work first', () => {
  const now = Date.UTC(2026, 10, 7, 12);
  const files = [
    { path: 'Dropbox/GitHub/mnns/prolog/a.pl', mtimeMs: now - H },
    { path: 'Dropbox/GitHub/mnns/README.md', mtimeMs: now - 2 * H },
    { path: 'Dropbox/GitHub/fastos/lib/x.js', mtimeMs: now - 30 * H },
    { path: 'Desktop/notes.txt', mtimeMs: now - 3 * H },
    { path: 'LucianOS/gl/x.txt', mtimeMs: now },
    { path: 'Dropbox/GitHub/mnns/node_modules/y.js', mtimeMs: now }
  ];
  assert.equal(workFolder('Dropbox/GitHub/mnns/prolog/a.pl'), 'Dropbox/GitHub/mnns');
  const h = hotspots(files, { now });
  assert.deepEqual(h.map((x) => x.name), ['mnns', 'Desktop', 'fastos']);
  assert.equal(h[0].files[0].path, 'Dropbox/GitHub/mnns/prolog/a.pl');
});

test('progress: today, this week and a streak of days', () => {
  const now = new Date(2026, 10, 7, 15).getTime();
  const day = (n, h = 10) => new Date(2026, 10, 7 - n, h).getTime();
  const log = [{ at: day(0) }, { at: day(0, 11) }, { at: day(1) }, { at: day(2) }, { at: day(4) }];
  assert.deepEqual(progressSummary(log, now), { today: 2, week: 5, streak: 3 });
  // nothing yet today: the streak still counts up to yesterday
  assert.equal(progressSummary(log.slice(2), now).streak, 2);
});

test('assignment files are skipped', () => {
  assert.ok(isAssignment('Essay 2.txt'));
  assert.ok(isAssignment('notes.txt', 'Assignment brief: write 2000 words'));
  assert.ok(!isAssignment('meditation 2026-11-07.txt', 'meditation\nbreathing\nawareness'));
});

test('the game dashes longer words, never stopwords, and checks guesses', () => {
  const text = 'The philosopher examined the meaning of happiness\nshort\n% comment line here\nKnowledge requires careful reasoning about truth';
  const g = makeGame(text, { seed: 7, rate: 0.5 });
  assert.equal(g.length, 2);
  for (const l of g) {
    const gaps = l.parts.filter((p) => typeof p !== 'string');
    assert.ok(gaps.length >= 1);
    for (const p of gaps) assert.ok(p.word.length >= 4 && !['the', 'of', 'about'].includes(p.word.toLowerCase()));
    assert.equal(dashed(l.parts, Object.fromEntries(gaps.map((p) => [p.gap, p.word]))), l.text);
  }
  assert.match(dashedCopy(g), /-{4,}/);
  // the same seed gives the same game
  assert.deepEqual(makeGame(text, { seed: 7, rate: 0.5 }), g);
  assert.equal(checkGuess('Happiness', 'happiness'), 'right');
  assert.equal(checkGuess('examined', 'examine'), 'close');
  assert.equal(checkGuess('reasoning', 'reasonin'), 'close');
  assert.equal(checkGuess('truth', 'beauty'), 'wrong');
  assert.equal(hint('truth'), 't----');
});

test('key-term lines go on the to-action list once, and can be marked sent', () => {
  const text = 'A recursive algorithm to reverse a list\nI walked to the park\nSort the findings by date using a stable sort';
  const lines = keyTermLines(text);
  assert.deepEqual(lines.map((l) => l.line), ['A recursive algorithm to reverse a list', 'Sort the findings by date using a stable sort']);
  assert.deepEqual(lines[0].terms.sort(), ['algorithm', 'list', 'recursive', 'reverse']);
  const first = addToActions('', lines.map((l) => l.line), 'gl/meditation.txt', new Date('2026-11-07T10:00:00Z'));
  assert.equal(first.added, 2);
  assert.match(first.text, /## From gl\/meditation.txt \(2026-11-07\)/);
  const again = addToActions(first.text, [lines[0].line, 'Parse the grammar rules'], 'x.txt');
  assert.equal(again.added, 1);
  const items = parseActions(again.text);
  assert.deepEqual(items.map((a) => a.state), [' ', ' ', ' ']);
  const marked = markActions(again.text, [items[0].line]);
  assert.deepEqual(parseActions(marked).map((a) => a.state), ['~', ' ', ' ']);
  assert.match(actionPrompt(['a', 'b']), /1\. a\n2\. b$/);
});

test('reward texts are drafts to edit', () => {
  const repo = { name: 'mnns', description: 'Optimises Prolog with neural networks.', url: 'https://github.com/luciangreen/mnns', language: 'Prolog' };
  assert.match(promoText('hn', repo), /^Title: Show HN: mnns – Optimises Prolog with neural networks\nURL: https:\/\/github.com\/luciangreen\/mnns/);
  assert.match(promoText('libhunt', repo), /Tags: prolog/);
  assert.match(promoText('facebook', repo), /\[One sentence/);
  const c = checkinText('Sam', { hotspots: [{ name: 'mnns' }], progress: { week: 3 } });
  assert.match(c, /^Hi Sam,/);
  assert.match(c, /working on mnns and made progress 3 times this week/);
});
