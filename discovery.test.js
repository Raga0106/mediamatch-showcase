'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEngine } = require('./discovery.js');

// A representative catalog with two independent sources per topic, not a copy
// of the implementation. The browser supplies the real creator directory.
const catalog = [
  { id: 'ai-lab', name: 'AI Lab', topic: 'AI', style: '深入實作', works: [{ id: 'a1', title: 'AI practical' }, { id: 'a2', title: 'AI checks' }] },
  { id: 'ai-digest', name: 'AI Digest', topic: 'AI', style: '快讀整理', works: [{ id: 'b1', title: 'AI news' }, { id: 'b2', title: 'Small AI' }] },
  { id: 'build-lab', name: 'Build Lab', topic: '工程實作', style: '實作紀錄', works: [{ id: 'c1', title: 'Home server' }, { id: 'c2', title: 'Sensors' }] },
  { id: 'circuit-notes', name: 'Circuit Notes', topic: '工程實作', style: '短篇實作', works: [{ id: 'd1', title: 'Networks' }, { id: 'd2', title: 'Debugging' }] },
  { id: 'data-finance', name: 'Data Finance', topic: '商業金融', style: '分析整理', works: [{ id: 'e1', title: 'Markets' }, { id: 'e2', title: 'Payments' }] },
  { id: 'longview', name: 'Longview', topic: '商業金融', style: '深入分析', works: [{ id: 'f1', title: 'Subscriptions' }, { id: 'f2', title: 'Growth' }] }
];
const external = () => ({
  followedIds: [], creatorScores: Object.fromEntries(catalog.map(creator => [creator.id, 50])),
  topicScores: { AI: 50, '工程實作': 50, '商業金融': 50 }, summary: { followed: 0, rated: 0 }
});
const make = () => createEngine(catalog, external());

function remainingSequentialOrder(engine, mode) {
  engine.setMode(mode);
  const order = [];
  while (engine.current()) {
    assert.ok(order.length < 12, 'A deck must finish without repeating cards');
    order.push(engine.current().id);
    engine.decide('skip');
  }
  return order;
}

test('switching modes preserves each current card and decision history', () => {
  const engine = make();
  engine.decide('like');
  const work = engine.current().id;
  engine.setMode('creator');
  const creator = engine.current().id;
  engine.setMode('work');
  assert.equal(engine.current().id, work);
  assert.equal(engine.snapshot().modes.work.history.length, 1);
  engine.setMode('creator');
  assert.equal(engine.current().id, creator);
  assert.equal(engine.snapshot().modes.creator.history.length, 0);
});

test('skip is neutral and an explicit dislike changes shared preferences', () => {
  const engine = make();
  const initial = engine.snapshot().signals;
  engine.decide('skip');
  assert.deepEqual(engine.snapshot().signals, initial);
  assert.equal(engine.snapshot().modes.work.history[0].decision, 'skip');
  engine.decide('dislike');
  assert.ok(engine.snapshot().signals.topic[engine.item('work', engine.snapshot().modes.work.history[1].id).topic] < 50);
});

test('a creator interest is local and never follows or rewrites external reading signals', () => {
  const supplied = external();
  const before = structuredClone(supplied);
  const engine = createEngine(catalog, supplied);
  engine.setMode('creator');
  engine.decide('like');
  assert.deepEqual(supplied, before);
  assert.equal(supplied.followedIds.length, 0);
  assert.ok(engine.snapshot().signals.topic.AI > 50);
});

test('every reviewed item is excluded from its mode’s future sequential cards', () => {
  const engine = make();
  const visited = new Set();
  for (let index = 0; index < 12; index++) {
    const current = engine.current();
    assert.ok(current);
    assert.ok(!visited.has(current.id));
    visited.add(current.id);
    engine.decide(index % 2 ? 'like' : 'skip');
  }
  assert.equal(engine.current(), null);
});

test('undo recomputes both modes from remaining decisions while preserving inactive progress', () => {
  const engine = make();
  engine.decide('like');
  engine.setMode('creator');
  const before = engine.snapshot().signals;
  const liked = engine.current();
  engine.decide('like');
  const creatorProgress = structuredClone(engine.snapshot().modes.creator);
  engine.setMode('work');
  const currentWork = engine.current().id;
  engine.setMode('creator');
  engine.undo();
  assert.equal(engine.current().id, liked.id);
  assert.deepEqual(engine.snapshot().signals, before);
  assert.equal(engine.snapshot().modes.work.currentId, currentWork);
  assert.equal(engine.snapshot().modes.work.history.length, 1);
  assert.equal(engine.snapshot().modes.creator.history.length, creatorProgress.history.length - 1);
  const onlyWork = make();
  onlyWork.decide('like');
  onlyWork.setMode('creator');
  assert.deepEqual(remainingSequentialOrder(engine, 'work'), remainingSequentialOrder(onlyWork, 'work'));
});

test('shared signals rerank future candidates while each displayed card stays fixed', () => {
  const engine = make();
  engine.setMode('creator');
  const creatorCurrent = engine.current().id;
  engine.setMode('work');
  const workCurrent = engine.current().id;
  engine.setExternal({ ...external(), followedIds: ['longview'], topicScores: { AI: 50, '工程實作': 50, '商業金融': 95 } });
  assert.equal(engine.current().id, workCurrent);
  engine.setMode('creator');
  assert.equal(engine.current().id, creatorCurrent);
  engine.decide('skip');
  assert.equal(engine.current().topic, '商業金融');
});

test('collecting and viewing details do not affect interest; reset retains collections and external signals', () => {
  const engine = make();
  const id = engine.current().id;
  const original = engine.snapshot().signals;
  engine.item('work', id);
  engine.catalog();
  engine.toggleSaved(id);
  assert.deepEqual(engine.snapshot().signals, original);
  assert.equal(engine.snapshot().modes.work.history.length, 0);
  const supplied = { ...external(), followedIds: ['ai-lab'] };
  engine.setExternal(supplied);
  engine.decide('like');
  engine.setMode('creator');
  engine.decide('dislike');
  engine.reset();
  assert.equal(engine.snapshot().modes.work.history.length, 0);
  assert.equal(engine.snapshot().modes.creator.history.length, 0);
  assert.deepEqual(engine.snapshot().savedIds, [id]);
  assert.deepEqual(engine.snapshot().signals, createEngine(catalog, supplied).snapshot().signals);
});


test('advancing one deck does not consume the other deck’s displayed source or progress', () => {
  const engine = make();
  const workId = engine.current().id;
  engine.setMode('creator');
  const creatorId = engine.current().id;
  engine.decide('skip');
  const nextCreatorId = engine.current().id;
  assert.notEqual(nextCreatorId, creatorId);
  const creatorProgress = structuredClone(engine.snapshot().modes.creator);
  engine.setMode('work');
  assert.equal(engine.current().id, workId);
  engine.decide('skip');
  assert.notEqual(engine.current().id, workId);
  assert.deepEqual(engine.snapshot().modes.creator, creatorProgress);
  engine.setMode('creator');
  assert.equal(engine.current().id, nextCreatorId);
});

// Exercise the sequential cards themselves. Both decks are opened first so a
// later cross-mode signal must leave the displayed card pinned, then influence
// the card selected after that pinned card is advanced.
function nextSequentialCardAfter(sourceMode, sourceCreatorId, decision) {
  const engine = make();
  engine.setMode('creator');
  const targetMode = sourceMode === 'work' ? 'creator' : 'work';
  engine.setMode(sourceMode);
  let attempts = 0;
  while (engine.current() && engine.current().creatorId !== sourceCreatorId) {
    assert.ok(++attempts < 12, 'The selected source must be reachable through neutral skips');
    engine.decide('skip');
  }
  const selected = engine.current();
  assert.ok(selected);
  const pinnedTarget = structuredClone(engine.snapshot().modes[targetMode]);
  engine.decide(decision);
  const afterFeedback = engine.snapshot();
  const sourceProgress = structuredClone(afterFeedback.modes[sourceMode]);
  engine.setMode(targetMode);
  const displayedTarget = engine.current();
  const onReturn = engine.snapshot();
  engine.decide('skip');
  return { engine, selected, targetMode, pinnedTarget, afterFeedback, sourceProgress, displayedTarget, onReturn, next: engine.current() };
}

function assertPinnedProgress(result, sourceMode) {
  assert.deepEqual(result.afterFeedback.modes[result.targetMode], result.pinnedTarget,
    'Feedback in one mode must not replace the other displayed card or its history');
  assert.equal(result.displayedTarget.id, result.pinnedTarget.currentId,
    'Returning to the other mode must resume its displayed card');
  assert.deepEqual(result.onReturn.modes[sourceMode], result.sourceProgress,
    'Switching modes must preserve the originating deck progress');
  assert.deepEqual(result.engine.snapshot().modes[sourceMode], result.sourceProgress,
    'Advancing the receiving deck must not advance the originating deck');
  assert.equal(result.engine.snapshot().modes[result.targetMode].history.length, result.pinnedTarget.history.length + 1);
}

test('liking a work changes the next sequential creator card after the pinned creator is advanced', () => {
  // Choose a noninitial topic so a fixed catalog order cannot accidentally pass.
  const liked = nextSequentialCardAfter('work', 'build-lab', 'like');
  const neutral = nextSequentialCardAfter('work', 'build-lab', 'skip');
  assertPinnedProgress(liked, 'work');
  assertPinnedProgress(neutral, 'work');
  assert.equal(liked.next.topic, liked.selected.topic);
  assert.notEqual(liked.next.creatorId, liked.selected.creatorId, 'The next card should introduce another creator');
  assert.notEqual(liked.next.id, neutral.next.id, 'The sequential deck must respond to the work like');
  assert.notEqual(neutral.next.topic, liked.selected.topic, 'A neutral skip must retain the baseline next card');
  assert.deepEqual(neutral.engine.snapshot().signals, make().snapshot().signals);
});

test('disliking a work demotes its topic in the next sequential creator card while a skip stays neutral', () => {
  const disliked = nextSequentialCardAfter('work', 'ai-lab', 'dislike');
  const neutral = nextSequentialCardAfter('work', 'ai-lab', 'skip');
  assertPinnedProgress(disliked, 'work');
  assertPinnedProgress(neutral, 'work');
  assert.equal(neutral.next.topic, neutral.selected.topic);
  assert.notEqual(disliked.next.topic, disliked.selected.topic);
  assert.notEqual(disliked.next.id, neutral.next.id);
  assert.deepEqual(neutral.engine.snapshot().signals, make().snapshot().signals);
});

test('liking a creator changes the next sequential work card to a related different source', () => {
  const liked = nextSequentialCardAfter('creator', 'build-lab', 'like');
  const neutral = nextSequentialCardAfter('creator', 'build-lab', 'skip');
  assertPinnedProgress(liked, 'creator');
  assertPinnedProgress(neutral, 'creator');
  assert.equal(liked.next.topic, liked.selected.topic);
  assert.notEqual(liked.next.creatorId, liked.selected.creatorId, 'Creator interest should extend to another source’s work');
  assert.notEqual(liked.next.id, neutral.next.id, 'The work deck itself must respond to the creator like');
  assert.notEqual(neutral.next.topic, liked.selected.topic);
  assert.deepEqual(neutral.engine.snapshot().signals, make().snapshot().signals);
});

test('disliking a creator changes the next sequential work card while a creator skip stays neutral', () => {
  const disliked = nextSequentialCardAfter('creator', 'ai-lab', 'dislike');
  const neutral = nextSequentialCardAfter('creator', 'ai-lab', 'skip');
  assertPinnedProgress(disliked, 'creator');
  assertPinnedProgress(neutral, 'creator');
  assert.equal(neutral.next.topic, neutral.selected.topic);
  assert.notEqual(disliked.next.topic, disliked.selected.topic);
  assert.notEqual(disliked.next.id, neutral.next.id);
  assert.deepEqual(neutral.engine.snapshot().signals, make().snapshot().signals);
});

test('undoing cross-mode interest restores the baseline future card without disturbing the other displayed card', () => {
  for (const sourceMode of ['work', 'creator']) {
    const engine = make();
    engine.setMode('creator');
    const targetMode = sourceMode === 'work' ? 'creator' : 'work';
    const pinned = structuredClone(engine.snapshot().modes[targetMode]);
    engine.setMode(sourceMode);
    while (engine.current().creatorId !== 'build-lab') engine.decide('skip');
    const sourceBeforeLike = structuredClone(engine.snapshot().modes[sourceMode]);
    engine.decide('like');
    assert.equal(engine.undo(), true);
    assert.deepEqual(engine.snapshot().modes[sourceMode], sourceBeforeLike);
    assert.deepEqual(engine.snapshot().modes[targetMode], pinned);
    engine.setMode(targetMode);
    engine.decide('skip');
    const neutral = nextSequentialCardAfter(sourceMode, 'build-lab', 'skip');
    assert.equal(engine.current().id, neutral.next.id,
      'Removing the source feedback must remove its effect from the receiving sequential deck');
    assert.deepEqual(engine.snapshot().signals, make().snapshot().signals);
  }
});

test('the latest explicit negative feedback supersedes an earlier positive anchor in either mode', () => {
  for (const mode of ['work', 'creator']) {
    const engine = make();
    engine.setMode(mode);
    engine.decide('like');
    const rejected = engine.current();
    engine.decide('dislike');
    const state = engine.snapshot();
    assert.equal(state.anchor.kind, 'avoid');
    assert.equal(state.anchor.item.id, rejected.id);
    assert.match(engine.reason(engine.current(), mode), /不感興趣|降低|減少/);
    const avoidAnchor = structuredClone(state.anchor);
    const signals = structuredClone(state.signals);
    engine.decide('skip');
    assert.deepEqual(engine.snapshot().anchor, avoidAnchor, 'An explicit neutral skip must not replace negative feedback');
    assert.deepEqual(engine.snapshot().signals, signals);
  }
});
