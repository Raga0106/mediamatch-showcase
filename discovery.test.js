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

test('liking a work recommends another same-topic creator', () => {
  const engine = make();
  const liked = engine.current();
  engine.decide('like');
  const recommendations = engine.recommendations('creator', 2);
  assert.ok(recommendations.some(({ item }) => item.topic === liked.topic && item.creatorId !== liked.creatorId));
  assert.ok(recommendations.every(({ item }) => item.creatorId !== liked.creatorId));
  assert.match(recommendations[0].reason, /另一位創作者/);
});

test('liking a creator recommends works from a different same-topic source', () => {
  const engine = make();
  engine.setMode('creator');
  const liked = engine.current();
  engine.decide('like');
  const recommendations = engine.recommendations('work', 3);
  assert.ok(recommendations.some(({ item }) => item.topic === liked.topic && item.creatorId !== liked.creatorId));
  assert.ok(recommendations.every(({ item }) => item.creatorId !== liked.creatorId));
});

test('every reviewed item is excluded from its mode’s future cards and recommendations', () => {
  const engine = make();
  const visited = new Set();
  for (let index = 0; index < 12; index++) {
    const current = engine.current();
    assert.ok(current);
    assert.ok(!visited.has(current.id));
    visited.add(current.id);
    engine.decide(index % 2 ? 'like' : 'skip');
    assert.ok(engine.recommendations('work', 12).every(({ item }) => !visited.has(item.id)));
  }
  assert.equal(engine.current(), null);
  assert.equal(engine.recommendations('work', 12).length, 0);
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
  assert.deepEqual(engine.recommendations('work', 12), onlyWork.recommendations('work', 12));
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
  engine.recommendations('creator');
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


test('recommendations exclude the displayed active card but can include an unseen pinned card in the other mode', () => {
  const engine = make();
  const workId = engine.current().id;
  assert.ok(engine.recommendations('work', 12).every(({ item }) => item.id !== workId));
  engine.setMode('creator');
  const creatorId = engine.current().id;
  assert.ok(engine.recommendations('creator', 6).every(({ item }) => item.id !== creatorId));
  assert.ok(engine.recommendations('work', 12).some(({ item }) => item.id === workId));
  engine.setMode('work');
  assert.ok(engine.recommendations('creator', 6).some(({ item }) => item.id === creatorId));
  assert.equal(engine.current().id, workId);
});
