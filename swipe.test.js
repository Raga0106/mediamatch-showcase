'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { installSwipe } = require('./discovery.js');

// A small bubbling event surface with a shared capture registry. Touch starts
// captured on the nested hit target; moving capture to its parent dispatches
// lostpointercapture from that child. This is the mobile sequence mouse-only
// dragging did not exercise.
class Surface {
  constructor(tagName, parentElement = null) {
    this.tagName = tagName.toUpperCase();
    this.parentElement = parentElement;
    this.listeners = new Map();
    this.dataset = {};
    this.style = { transform: '', removeProperty(name) { this[name] = ''; } };
    const classes = new Set();
    this.classList = {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: name => classes.has(name)
    };
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  removeEventListener(type, handler) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter(candidate => candidate !== handler));
  }

  closest(selector) {
    const selectors = selector.split(',').map(value => value.trim());
    for (let element = this; element; element = element.parentElement) {
      if (selectors.some(value => value.toUpperCase() === element.tagName)) return element;
    }
    return null;
  }

  removeAttribute(name) {
    if (name === 'data-swipe-direction') delete this.dataset.swipeDirection;
  }

  dispatch(event) {
    if (!event.target) event.target = this;
    event.currentTarget = this;
    for (const handler of this.listeners.get(event.type) || []) handler(event);
    if (event.bubbles !== false && this.parentElement) this.parentElement.dispatch(event);
    return event;
  }
}

function fixture(captureMode = 'normal') {
  const card = new Surface('article');
  const child = new Surface('span', card);
  const button = new Surface('button', card);
  const buttonChild = new Surface('span', button);
  const capture = new Map();
  const origins = new Map();
  const decisions = [];
  const delivered = [];

  function captureEvent(type, target, pointerId) {
    target.dispatch({ type, target, pointerId, bubbles: true });
  }

  if (captureMode !== 'missing') {
    card.setPointerCapture = pointerId => {
      if (captureMode === 'throwing') throw new Error('Capture unavailable');
      const previous = capture.get(pointerId);
      capture.set(pointerId, card);
      if (previous && previous !== card) captureEvent('lostpointercapture', previous, pointerId);
      if (previous !== card) captureEvent('gotpointercapture', card, pointerId);
    };
    card.hasPointerCapture = pointerId => capture.get(pointerId) === card;
    card.releasePointerCapture = pointerId => {
      if (capture.get(pointerId) !== card) return;
      capture.delete(pointerId);
      captureEvent('lostpointercapture', card, pointerId);
    };
  }

  installSwipe(card, choice => decisions.push(choice));

  function send(type, options = {}) {
    const values = Object.assign({ pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0, clientX: 0, clientY: 0 }, options);
    if (type === 'pointerdown') {
      origins.set(values.pointerId, values.target || child);
      if (values.pointerType === 'touch') capture.set(values.pointerId, values.target || child);
    }
    const target = capture.get(values.pointerId) || values.target || origins.get(values.pointerId) || child;
    const event = Object.assign({}, values, {
      type, target, bubbles: true, cancelable: true, defaultPrevented: false,
      preventDefault() { if (this.cancelable) this.defaultPrevented = true; }
    });
    target.dispatch(event);
    delivered.push(event);
    if (type === 'pointerup' || type === 'pointercancel') {
      const owner = capture.get(values.pointerId);
      capture.delete(values.pointerId);
      origins.delete(values.pointerId);
      if (owner) captureEvent('lostpointercapture', owner, values.pointerId);
    }
    return event;
  }

  return { card, child, buttonChild, decisions, delivered, send };
}

test('a nested-child touch drag survives implicit capture transfer and commits once', () => {
  const swipe = fixture();
  swipe.send('pointerdown', { target: swipe.child, clientX: 20, clientY: 100 });
  swipe.send('pointermove', { clientX: 50, clientY: 102 });
  swipe.send('pointermove', { clientX: 150, clientY: 108 });
  swipe.send('pointerup', { clientX: 150, clientY: 108 });
  swipe.send('pointerup', { clientX: 150, clientY: 108 });
  assert.deepEqual(swipe.decisions, ['like']);
});

test('left touch swipe records a neutral skip', () => {
  const swipe = fixture();
  swipe.send('pointerdown', { clientX: 180, clientY: 100 });
  swipe.send('pointermove', { clientX: 140, clientY: 104 });
  swipe.send('pointerup', { clientX: 50, clientY: 109 });
  assert.deepEqual(swipe.decisions, ['skip']);
});

test('vertical touch scrolling is never prevented and never decides', () => {
  const swipe = fixture();
  swipe.send('pointerdown', { clientX: 50, clientY: 50 });
  swipe.send('pointermove', { clientX: 54, clientY: 90 });
  swipe.send('pointermove', { clientX: 80, clientY: 200 });
  swipe.send('pointerup', { clientX: 90, clientY: 260 });
  assert.deepEqual(swipe.decisions, []);
  assert.ok(swipe.delivered.every(event => !event.defaultPrevented));
  assert.equal(swipe.card.style.transform, '');
});

test('a tap and a short horizontal drag do not decide', () => {
  const swipe = fixture();
  swipe.send('pointerdown', { clientX: 30, clientY: 100 });
  swipe.send('pointerup', { clientX: 30, clientY: 100 });
  swipe.send('pointerdown', { clientX: 30, clientY: 100 });
  swipe.send('pointermove', { clientX: 65, clientY: 102 });
  swipe.send('pointerup', { clientX: 70, clientY: 104 });
  assert.deepEqual(swipe.decisions, []);
  assert.equal(swipe.card.style.transform, '');
  assert.equal(swipe.card.dataset.swipeDirection, undefined);
});

test('a canceled horizontal gesture does not decide or poison the next gesture', () => {
  const swipe = fixture();
  swipe.send('pointerdown', { clientX: 10, clientY: 80 });
  swipe.send('pointermove', { clientX: 120, clientY: 82 });
  swipe.send('pointercancel', { clientX: 120, clientY: 82 });
  swipe.send('pointerup', { clientX: 130, clientY: 82 });
  assert.deepEqual(swipe.decisions, []);
  assert.equal(swipe.card.style.transform, '');
  swipe.send('pointerdown', { clientX: 10, clientY: 80 });
  swipe.send('pointermove', { clientX: 120, clientY: 82 });
  swipe.send('pointerup', { clientX: 120, clientY: 82 });
  assert.deepEqual(swipe.decisions, ['like']);
});

test('secondary touch and unrelated pointer events cannot overwrite the active touch', () => {
  const swipe = fixture();
  swipe.send('pointerdown', { pointerId: 1, clientX: 20, clientY: 80 });
  swipe.send('pointerdown', { pointerId: 2, isPrimary: false, clientX: 200, clientY: 80 });
  swipe.send('pointermove', { pointerId: 2, isPrimary: false, clientX: 20, clientY: 80 });
  swipe.send('pointercancel', { pointerId: 2, isPrimary: false, clientX: 20, clientY: 80 });
  swipe.send('pointermove', { pointerId: 3, isPrimary: false, clientX: 300, clientY: 80 });
  swipe.send('pointerup', { pointerId: 3, isPrimary: false, clientX: 300, clientY: 80 });
  swipe.send('pointermove', { pointerId: 1, clientX: 140, clientY: 84 });
  swipe.send('pointerup', { pointerId: 1, clientX: 140, clientY: 84 });
  assert.deepEqual(swipe.decisions, ['like']);
});

test('a gesture beginning inside a button leaves the button interaction alone', () => {
  const swipe = fixture();
  swipe.send('pointerdown', { target: swipe.buttonChild, clientX: 10, clientY: 80 });
  swipe.send('pointermove', { clientX: 150, clientY: 82 });
  swipe.send('pointerup', { clientX: 150, clientY: 82 });
  assert.deepEqual(swipe.decisions, []);
  assert.ok(swipe.delivered.every(event => !event.defaultPrevented));
});

test('a fast touch release uses its final coordinates even without a move event', () => {
  const swipe = fixture();
  swipe.send('pointerdown', { clientX: 20, clientY: 80 });
  swipe.send('pointerup', { clientX: 145, clientY: 84 });
  assert.deepEqual(swipe.decisions, ['like']);
});

for (const captureMode of ['missing', 'throwing']) {
  test(`${captureMode} capture API does not break a touch drag`, () => {
    const swipe = fixture(captureMode);
    swipe.send('pointerdown', { clientX: 20, clientY: 80 });
    swipe.send('pointermove', { clientX: 55, clientY: 82 });
    swipe.send('pointerup', { clientX: 145, clientY: 84 });
    assert.deepEqual(swipe.decisions, ['like']);
  });
}

test('primary desktop mouse drag still works', () => {
  const swipe = fixture();
  swipe.send('pointerdown', { pointerType: 'mouse', clientX: 20, clientY: 80 });
  swipe.send('pointermove', { pointerType: 'mouse', clientX: 55, clientY: 82 });
  swipe.send('pointermove', { pointerType: 'mouse', clientX: 145, clientY: 84 });
  swipe.send('pointerup', { pointerType: 'mouse', clientX: 145, clientY: 84 });
  assert.deepEqual(swipe.decisions, ['like']);
});

test('a non-primary mouse button cannot swipe a card', () => {
  const swipe = fixture();
  swipe.send('pointerdown', { pointerType: 'mouse', button: 2, clientX: 20, clientY: 80 });
  swipe.send('pointermove', { pointerType: 'mouse', button: 2, clientX: 145, clientY: 84 });
  swipe.send('pointerup', { pointerType: 'mouse', button: 2, clientX: 145, clientY: 84 });
  assert.deepEqual(swipe.decisions, []);
});
