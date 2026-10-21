(function (global) {
  'use strict';

  const MODE_NAMES = { work: '作品探索', creator: '創作者探索' };
  const DECISIONS = { like: 1, dislike: -1, skip: 0 };
  const STYLE_TAGS = {
    'ai-lab': ['實作', '深入'], 'ai-digest': ['快讀', '整理'],
    'build-lab': ['實作', '深入'], 'circuit-notes': ['實作', '快讀'],
    'data-finance': ['分析', '整理'], longview: ['分析', '深入']
  };
  const clamp = value => Math.max(0, Math.min(100, Math.round(value)));
  const copy = value => JSON.parse(JSON.stringify(value));

  // The same local interest ledger ranks both modes. Follow and reading signals
  // are supplied by the creator directory; this engine never writes to them.
  function createEngine(catalog, initialSignals) {
    const creators = catalog.map((creator, order) => Object.assign({}, copy(creator), {
      creatorId: creator.id, order, styleTags: STYLE_TAGS[creator.id] || [creator.style]
    }));
    const works = creators.flatMap(creator => creator.works.map((work, index) => Object.assign({}, work, {
      id: `${creator.id}:${work.id}`, workId: work.id, creatorId: creator.id,
      creatorName: creator.name, initials: creator.initials, topic: creator.topic,
      platform: creator.platform, language: creator.language, style: creator.style,
      styleTags: creator.styleTags.slice(), order: creator.order * 2 + index
    })));
    const topics = Array.from(new Set(creators.map(creator => creator.topic)));
    const modes = { work: { currentId: null, history: [] }, creator: { currentId: null, history: [] } };
    const saved = new Set();
    let activeMode = 'work';
    let sequence = 0;
    let external = copy(initialSignals || {});
    const items = mode => mode === 'work' ? works : creators;
    const find = (mode, id) => items(mode).find(item => item.id === id);
    const events = () => Object.values(modes).flatMap(mode => mode.history).sort((a, b) => a.sequence - b.sequence);
    const seen = mode => new Set(modes[mode].history.map(event => event.id));

    function signals() {
      const topic = Object.fromEntries(topics.map(name => [name, Number(external.topicScores && external.topicScores[name]) || 50]));
      const source = Object.fromEntries(creators.map(creator => [creator.id, ((Number(external.creatorScores && external.creatorScores[creator.id]) || 50) - 50) * 0.6]));
      const style = {};
      (external.followedIds || []).forEach(id => {
        const creator = find('creator', id);
        if (!creator) return;
        source[id] += 10;
        topic[creator.topic] += 3;
      });
      events().forEach(event => {
        const value = DECISIONS[event.decision];
        if (!value) return;
        const item = find(event.mode, event.id);
        topic[item.topic] += value * (event.mode === 'work' ? 8 : 10);
        source[item.creatorId] += value * (event.mode === 'work' ? 7 : 10);
        item.styleTags.forEach(tag => { style[tag] = (style[tag] || 0) + value * 4; });
      });
      return { topic: Object.fromEntries(topics.map(name => [name, clamp(topic[name])])), source, style };
    }

    function anchor() {
      const positive = events().filter(event => event.decision === 'like').pop();
      if (positive) return { item: find(positive.mode, positive.id), mode: positive.mode, kind: 'interest' };
      const followed = (external.followedIds || []).slice().reverse().map(id => find('creator', id)).find(Boolean);
      if (followed) return { item: followed, mode: 'creator', kind: 'follow' };
      const rated = creators.filter(creator => (external.creatorScores && external.creatorScores[creator.id]) > 50)
        .sort((a, b) => external.creatorScores[b.id] - external.creatorScores[a.id] || a.order - b.order)[0];
      return rated ? { item: rated, mode: 'creator', kind: 'reading' } : null;
    }

    function rankScore(item, recommendation) {
      const shared = signals();
      const currentAnchor = anchor();
      let value = shared.topic[item.topic] - 50 + shared.source[item.creatorId] * 0.35;
      value += item.styleTags.reduce((sum, tag) => sum + (shared.style[tag] || 0), 0) * 0.35;
      if (currentAnchor) {
        if (item.topic === currentAnchor.item.topic) value += recommendation ? 35 : 18;
        if (item.creatorId !== currentAnchor.item.creatorId) value += recommendation ? 20 : 8;
      }
      return value;
    }

    function ranked(mode, recommendation) {
      const reviewed = seen(mode);
      return items(mode).filter(item => !reviewed.has(item.id))
        .slice().sort((a, b) => rankScore(b, recommendation) - rankScore(a, recommendation) || a.order - b.order);
    }

    function ensureCurrent(mode) {
      if (!modes[mode].currentId) modes[mode].currentId = (ranked(mode)[0] || {}).id || null;
      return find(mode, modes[mode].currentId) || null;
    }

    function reason(item, mode) {
      const currentAnchor = anchor();
      if (!currentAnchor) {
        const preferred = topics.slice().sort((a, b) => signals().topic[b] - signals().topic[a])[0];
        return signals().topic[preferred] !== 50 && item.topic === preferred
          ? `你的共同偏好目前偏向${item.topic}，先從這裡繼續探索。`
          : `先看看${item.topic}的${mode === 'work' ? '作品' : '創作者'}，你的選擇會逐步調整兩種探索。`;
      }
      const lead = currentAnchor.kind === 'follow' ? `你追蹤了${currentAnchor.item.name}`
        : currentAnchor.kind === 'reading' ? `你對${currentAnchor.item.name}的作品給過正向閱讀評價`
          : `你對「${currentAnchor.mode === 'work' ? currentAnchor.item.title : currentAnchor.item.name}」有興趣`;
      if (item.topic === currentAnchor.item.topic && item.creatorId !== currentAnchor.item.creatorId) {
        return `${lead}，延伸看看${item.topic}的另一位創作者${mode === 'work' ? '及其作品' : ''}。`;
      }
      if (item.creatorId === currentAnchor.item.creatorId) return `${lead}，這是同一位創作者的${mode === 'work' ? '另一篇作品' : '完整介紹'}。`;
      const overlap = item.styleTags.find(tag => currentAnchor.item.styleTags.includes(tag));
      return overlap ? `${lead}，這份內容也有「${overlap}」的風格，試試不同主題。`
        : `${lead}，也保留不同主題與來源，看看還有哪些可能。`;
    }

    function recommendations(mode, limit) {
      const currentAnchor = anchor();
      let candidates = ranked(mode, true).filter(item => mode !== activeMode || item.id !== modes[mode].currentId);
      if (currentAnchor) {
        const sameTopicOtherSource = candidates.filter(item => item.topic === currentAnchor.item.topic && item.creatorId !== currentAnchor.item.creatorId);
        if (sameTopicOtherSource.length) {
          const others = candidates.filter(item => item.creatorId !== currentAnchor.item.creatorId);
          candidates = sameTopicOtherSource.concat(others.filter(item => !sameTopicOtherSource.some(other => other.id === item.id)));
        } else {
          candidates = candidates.filter(item => item.creatorId !== currentAnchor.item.creatorId);
        }
      }
      return candidates.slice(0, limit || 2).map(item => ({ item: copy(item), reason: reason(item, mode) }));
    }

    function setMode(mode) {
      if (!modes[mode]) return false;
      activeMode = mode;
      ensureCurrent(mode);
      return true;
    }

    function decide(decision) {
      if (!(decision in DECISIONS)) return false;
      const current = ensureCurrent(activeMode);
      if (!current) return false;
      modes[activeMode].history.push({ mode: activeMode, id: current.id, decision, sequence: ++sequence });
      modes[activeMode].currentId = null;
      ensureCurrent(activeMode);
      return true;
    }

    function undo() {
      const event = modes[activeMode].history.pop();
      if (!event) return false;
      modes[activeMode].currentId = event.id;
      return true;
    }

    function reset() {
      Object.values(modes).forEach(mode => { mode.history = []; mode.currentId = null; });
      ensureCurrent(activeMode);
    }

    function toggleSaved(id) {
      if (!find('work', id)) return false;
      if (saved.has(id)) saved.delete(id); else saved.add(id);
      return saved.has(id);
    }

    function snapshot() {
      return copy({ activeMode, modes, savedIds: Array.from(saved), signals: signals(), anchor: anchor(), totals: { work: works.length, creator: creators.length } });
    }

    ensureCurrent(activeMode);
    return {
      setMode, decide, undo, reset, toggleSaved, snapshot, recommendations, reason,
      current: () => copy(ensureCurrent(activeMode)),
      item: (mode, id) => { const item = find(mode, id); return item ? copy(item) : null; },
      setExternal: value => { external = copy(value || {}); },
      isSaved: id => saved.has(id),
      catalog: () => copy(creators)
    };
  }

  // Bind one gesture at a time. Touch devices implicitly capture the child
  // under the finger, so capture transfers must not cancel the card gesture.
  function installSwipe(card, onDecision, options = {}) {
    let pointer = null;
    let frame = null;
    const view = card.ownerDocument ? card.ownerDocument.defaultView : global;
    const requestFrame = options.requestFrame || (view.requestAnimationFrame && view.requestAnimationFrame.bind(view));
    const cancelFrame = options.cancelFrame || (view.cancelAnimationFrame && view.cancelAnimationFrame.bind(view));
    const interactive = target => target && typeof target.closest === 'function' && target.closest('button,a,input,select,textarea');
    const stopFrame = () => {
      if (frame !== null && cancelFrame) cancelFrame(frame);
      frame = null;
    };
    const paint = () => {
      frame = null;
      if (!pointer || !pointer.horizontal) return;
      const { dx, dy } = pointer;
      card.style.transform = `translate3d(${dx}px,${Math.max(-35, Math.min(35, dy * .15))}px,0) rotate(${dx * .035}deg)`;
      card.style.setProperty('--swipe-progress', Math.min(.95, Math.abs(dx) / 110));
      card.dataset.swipeDirection = dx > 0 ? 'like' : 'skip';
    };
    const clear = () => {
      stopFrame();
      card.style.transform = '';
      card.style.removeProperty('--swipe-progress');
      card.removeAttribute('data-swipe-direction');
      card.classList.remove('discovery-dragging');
      pointer = null;
    };
    const release = id => {
      try {
        if (typeof card.releasePointerCapture === 'function' &&
            (typeof card.hasPointerCapture !== 'function' || card.hasPointerCapture(id))) card.releasePointerCapture(id);
      } catch (_error) { /* Capture may already have been released by the browser. */ }
    };
    const position = event => {
      if (Number.isFinite(event.clientX)) pointer.dx = event.clientX - pointer.x;
      if (Number.isFinite(event.clientY)) pointer.dy = event.clientY - pointer.y;
    };
    card.addEventListener('pointerdown', event => {
      if (pointer || (options.isEnabled && !options.isEnabled()) || event.isPrimary === false || (event.button !== undefined && event.button !== 0) || interactive(event.target)) return;
      card.classList.remove('discovery-entering');
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, dy: 0, horizontal: false, vertical: false };
      // Capture before the first move. A child's lostpointercapture can bubble
      // during this transfer; the listener below ignores that child event.
      try {
        if (typeof card.setPointerCapture === 'function') card.setPointerCapture(event.pointerId);
      } catch (_error) { /* Pointer events still work while inside the card. */ }
    });
    card.addEventListener('pointermove', event => {
      if (!pointer || pointer.id !== event.pointerId || pointer.vertical) return;
      position(event);
      if (!pointer.horizontal && Math.abs(pointer.dy) > 12 && Math.abs(pointer.dy) > Math.abs(pointer.dx)) { pointer.vertical = true; return; }
      if (!pointer.horizontal && Math.abs(pointer.dx) > 12 && Math.abs(pointer.dx) > Math.abs(pointer.dy) * 1.3) {
        pointer.horizontal = true;
        card.classList.add('discovery-dragging');
      }
      if (!pointer.horizontal) return;
      if (event.cancelable) event.preventDefault();
      if (!requestFrame) paint();
      else if (frame === null) frame = requestFrame(paint);
    });
    card.addEventListener('pointerup', event => {
      if (!pointer || pointer.id !== event.pointerId) return;
      position(event);
      const id = pointer.id;
      const choice = !pointer.vertical && Math.abs(pointer.dx) > 100 && Math.abs(pointer.dx) > Math.abs(pointer.dy) * 1.3
        ? (pointer.dx > 0 ? 'like' : 'skip') : null;
      if (choice) {
        stopFrame();
        pointer.horizontal = true;
        paint();
        const motion = { transform: card.style.transform, dx: pointer.dx, dy: pointer.dy };
        // Release capture only after clearing pointer state. The resulting
        // lostpointercapture must not reset the outgoing card to its origin.
        pointer = null;
        card.classList.remove('discovery-dragging');
        release(id);
        onDecision(choice, motion);
      } else {
        clear();
        release(id);
      }
    });
    card.addEventListener('pointercancel', event => {
      if (!pointer || pointer.id !== event.pointerId) return;
      const id = pointer.id;
      clear();
      release(id);
    });
    card.addEventListener('lostpointercapture', event => {
      if (!pointer || event.target !== card || pointer.id !== event.pointerId) return;
      if (typeof card.hasPointerCapture === 'function' && card.hasPointerCapture(event.pointerId)) return;
      clear();
    });
    return { cancel() { const id = pointer && pointer.id; clear(); if (id !== null) release(id); } };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { createEngine, installSwipe };
  if (!global.document) return;

  const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  let mount;
  let engine;
  let workDialog;
  let returnFocusKey;
  let creatorReturnFocusKey;
  let currentDialogWorkId;
  let renderedCardKey;
  let renderedCardWidth;
  let swipeBinding;
  let decisionInFlight = false;
  let lockedButtons = [];
  const symbols = { AI: '✳', '工程實作': '{ }', '商業金融': '↗' };
  const topicClasses = { AI: 'ai', '工程實作': 'build', '商業金融': 'business' };
  const creatorAPI = () => global.MediaMatchCreators;
  const followed = id => Boolean(creatorAPI() && creatorAPI().isFollowed(id));
  const followText = id => followed(id) ? '已追蹤 · 取消' : '在 MediaMatch 追蹤';
  const focusKey = element => element && element.closest('[data-discovery-focus]') && element.closest('[data-discovery-focus]').dataset.discoveryFocus;

  function restoreFocus(key) {
    if (!key) return;
    const target = Array.from(document.querySelectorAll('[data-discovery-focus]')).find(element => element.dataset.discoveryFocus === key);
    if (target) target.focus({ preventScroll: true });
  }

  function announce(message) {
    mount.querySelector('.discovery-live').textContent = message;
    mount.querySelector('.discovery-status').textContent = message;
  }

  function tags(item) {
    return `<div class="discovery-tags"><span>${escapeHTML(item.topic)}</span><span>${escapeHTML(item.platform)}</span><span>${escapeHTML(item.language)}</span></div>`;
  }

  function followButton(id, context) {
    return `<button type="button" class="discovery-follow" data-discovery-follow="${escapeHTML(id)}" data-discovery-focus="${context}-follow:${escapeHTML(id)}" aria-pressed="${followed(id)}">${followText(id)}</button>`;
  }

  function workCard(item) {
    return `<div class="discovery-art discovery-art-${topicClasses[item.topic]}"><span class="discovery-art-label">WORK DISCOVERY · 作品探索</span><span class="discovery-art-symbol" aria-hidden="true">${symbols[item.topic]}</span><span class="discovery-art-format">${escapeHTML(item.format)}</span></div>
      <div class="discovery-card-body">${tags(item)}<h3>${escapeHTML(item.title)}</h3><p class="discovery-card-description">${escapeHTML(item.description)}</p>
      <p class="discovery-current-reason">${escapeHTML(engine.reason(item, 'work'))}</p>
      <div class="discovery-source"><button type="button" class="discovery-source-link" data-discovery-source="${item.creatorId}" data-discovery-focus="card-source:${item.creatorId}"><span class="discovery-mini-avatar" aria-hidden="true">${escapeHTML(item.initials)}</span><span><small>來源創作者 · 虛構示例</small><strong>${escapeHTML(item.creatorName)} ↗</strong></span></button>${followButton(item.creatorId, 'card')}</div>
      <div class="discovery-card-actions"><button type="button" class="discovery-detail" data-discovery-work="${item.id}" data-discovery-focus="card-work:${item.id}">查看作品詳情 ↗</button><button type="button" class="discovery-save" data-discovery-save="${item.id}" data-discovery-focus="card-save:${item.id}" aria-pressed="${engine.isSaved(item.id)}">${engine.isSaved(item.id) ? '已收藏 ✓' : '收藏待看 ＋'}</button></div></div>`;
  }

  function creatorCard(item) {
    return `<div class="discovery-creator-top discovery-art-${topicClasses[item.topic]}"><div><span class="discovery-art-label">CREATOR DISCOVERY · 創作者探索</span><span class="discovery-profile-avatar" aria-hidden="true">${escapeHTML(item.initials)}</span></div><span class="discovery-fiction">虛構創作者</span></div>
      <div class="discovery-card-body">${tags(item)}<h3>${escapeHTML(item.name)}</h3><p class="discovery-card-style">${escapeHTML(item.style)}</p><p class="discovery-card-description">${escapeHTML(item.description)}</p>
      <p class="discovery-current-reason">${escapeHTML(engine.reason(item, 'creator'))}</p>
      <div class="discovery-representative"><h4>先看兩篇代表作品</h4>${item.works.map(work => `<button type="button" data-discovery-work="${item.id}:${work.id}" data-discovery-focus="representative:${item.id}:${work.id}"><span>${escapeHTML(work.title)}</span><small>${escapeHTML(work.format)} ↗</small></button>`).join('')}</div>
      <div class="discovery-card-actions"><button type="button" class="discovery-detail" data-discovery-source="${item.id}" data-discovery-focus="card-source:${item.id}">查看創作者詳情 ↗</button>${followButton(item.id, 'card')}</div><p class="discovery-interest-note">按「有興趣」只調整探索；按「追蹤」才加入追蹤清單。</p></div>`;
  }

  function renderCard() {
    const state = engine.snapshot();
    const item = engine.current();
    const key = `${state.activeMode}:${item ? item.id : 'complete'}`;
    const slot = mount.querySelector('.discovery-card-slot');
    if (renderedCardKey !== key) {
      const width = slot.clientWidth;
      const sameStack = renderedCardKey && renderedCardKey.startsWith(`${state.activeMode}:`) && renderedCardWidth === width;
      const previousHeight = sameStack ? slot.offsetHeight : 0;
      if (swipeBinding) swipeBinding.cancel();
      swipeBinding = null;
      slot.style.minHeight = previousHeight ? `${previousHeight}px` : '';
      renderedCardKey = key;
      renderedCardWidth = width;
      if (!item) {
        const history = state.modes[state.activeMode].history;
        slot.innerHTML = `<div id="discoveryCard" class="discovery-complete" tabindex="0"><span aria-hidden="true">✓</span><p>${MODE_NAMES[state.activeMode]} · 本輪完成</p><h3>每一個選擇，<br>都讓探索更像你。</h3><p>已看過 ${history.length} ${state.activeMode === 'work' ? '篇作品' : '位創作者'}，其中 ${history.filter(event => event.decision === 'like').length} ${state.activeMode === 'work' ? '篇' : '位'}有興趣。切到另一種探索，沿用同一份偏好。</p><button type="button" class="discovery-detail" data-discovery-switch-other>繼續${MODE_NAMES[state.activeMode === 'work' ? 'creator' : 'work']} →</button></div>`;
      } else {
        slot.innerHTML = `<article id="discoveryCard" class="discovery-card discovery-entering" tabindex="0" aria-label="${MODE_NAMES[state.activeMode]}：${escapeHTML(state.activeMode === 'work' ? item.title : item.name)}" aria-describedby="discoveryGestureHelp" data-discovery-item="${escapeHTML(item.id)}">${state.activeMode === 'work' ? workCard(item) : creatorCard(item)}</article>`;
        const card = slot.querySelector('.discovery-card');
        swipeBinding = installSwipe(card, (decision, motion) => act(decision, false, motion), { isEnabled: () => !decisionInFlight });
        card.addEventListener('animationend', event => { if (event.target === card) card.classList.remove('discovery-entering'); });
      }
      // Reserve the outgoing card's space before inserting its replacement.
      // Longer content may grow naturally; shorter cards never move controls up.
      slot.style.minHeight = `${Math.max(previousHeight, slot.firstElementChild.offsetHeight)}px`;
    }
    const currentReason = slot.querySelector('.discovery-current-reason');
    if (currentReason && item) currentReason.textContent = engine.reason(item, state.activeMode);
    mount.querySelectorAll('[data-discovery-decision]').forEach(button => { button.disabled = !item; });
  }

  function renderPreferences() {
    const state = engine.snapshot();
    const current = state.modes[state.activeMode];
    const total = state.totals[state.activeMode];
    mount.querySelector('[data-discovery-progress]').textContent = `已探索 ${current.history.length} / ${total} ${state.activeMode === 'work' ? '篇作品' : '位創作者'}`;
    mount.querySelector('.discovery-progress-fill').style.width = `${current.history.length / total * 100}%`;
    mount.querySelector('[data-discovery-mode-description]').textContent = state.activeMode === 'work' ? '先從一篇內容，找到想繼續認識的人。' : '先認識一種觀點，再遇見不同來源的好內容。';
    mount.querySelector('[data-discovery-undo]').disabled = !current.history.length;
    mount.querySelector('[data-discovery-undo]').textContent = `↶ 撤回${MODE_NAMES[state.activeMode]}上一張`;
    mount.querySelectorAll('[data-discovery-mode]').forEach(button => {
      const selected = button.dataset.discoveryMode === state.activeMode;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    mount.querySelector('#discoveryPanel').setAttribute('aria-labelledby', `discoveryTab-${state.activeMode}`);
    mount.querySelector('.discovery-topic-signals').innerHTML = Object.entries(state.signals.topic).map(([topic, score]) => `<div class="discovery-topic-row"><span>${escapeHTML(topic)}</span><div aria-hidden="true"><i style="width:${score}%"></i></div><strong>${score}<small> / 100</small></strong></div>`).join('');
    mount.querySelector('[data-discovery-reviewed="work"]').textContent = `${state.modes.work.history.length} / ${state.totals.work}`;
    mount.querySelector('[data-discovery-reviewed="creator"]').textContent = `${state.modes.creator.history.length} / ${state.totals.creator}`;
    mount.querySelector('[data-discovery-saved-count]').textContent = `待看收藏 ${state.savedIds.length} 篇`;
    mount.querySelector('[data-discovery-saved-list]').disabled = !state.savedIds.length;
    mount.querySelectorAll('[data-discovery-follow]').forEach(button => {
      button.textContent = followText(button.dataset.discoveryFollow);
      button.setAttribute('aria-pressed', String(followed(button.dataset.discoveryFollow)));
    });
    mount.querySelectorAll('[data-discovery-save]').forEach(button => {
      const isSaved = engine.isSaved(button.dataset.discoverySave);
      button.textContent = isSaved ? '已收藏 ✓' : '收藏待看 ＋';
      button.setAttribute('aria-pressed', String(isSaved));
    });
  }

  function recommendationHTML(recommendation, mode) {
    const item = recommendation.item;
    return `<article class="discovery-recommendation" data-discovery-recommendation="${mode}" data-discovery-recommendation-id="${item.id}" data-discovery-recommendation-source="${item.creatorId}"><div class="discovery-rec-meta"><span>${escapeHTML(item.topic)}</span><span>${escapeHTML(mode === 'work' ? item.format : item.platform)}</span></div><h4>${escapeHTML(mode === 'work' ? item.title : item.name)}</h4>${mode === 'work' ? `<button type="button" class="discovery-rec-source" data-discovery-source="${item.creatorId}" data-discovery-focus="rec-source:${item.id}">來源：${escapeHTML(item.creatorName)} ↗</button>` : `<p class="discovery-rec-style">${escapeHTML(item.style)}</p>`}<p class="discovery-rec-reason">${escapeHTML(recommendation.reason)}</p><button type="button" class="discovery-rec-detail" ${mode === 'work' ? `data-discovery-work="${item.id}"` : `data-discovery-source="${item.id}"`} data-discovery-focus="rec-${mode}:${item.id}">${mode === 'work' ? '看作品詳情' : '看創作者與作品'} ↗</button></article>`;
  }

  function renderRecommendations() {
    ['creator', 'work'].forEach(mode => {
      const list = engine.recommendations(mode, 2);
      mount.querySelector(`[data-discovery-recommendations="${mode}"]`).innerHTML = list.length ? list.map(item => recommendationHTML(item, mode)).join('') : `<p class="discovery-rec-empty">這一類的候選已看得差不多了。可以撤回上一張，或重新開始雙模式探索。</p>`;
    });
    const state = engine.snapshot();
    const anchor = state.anchor;
    mount.querySelector('[data-discovery-recommendation-intro]').textContent = anchor
      ? `${anchor.kind === 'interest' ? '從最新一筆興趣延伸' : anchor.kind === 'follow' ? '從你的追蹤延伸' : '從閱讀感受延伸'}，優先看看同主題的不同來源。`
      : '先提供不同來源的起點；任何一種探索的選擇，都會調整這兩組推薦。';
  }

  function renderAll() {
    if (decisionInFlight) return;
    const key = focusKey(document.activeElement);
    renderCard();
    renderPreferences();
    renderRecommendations();
    if (key && !document.activeElement.closest('dialog[open]')) restoreFocus(key);
  }

  function setDecisionBusy(busy) {
    decisionInFlight = busy;
    mount.setAttribute('aria-busy', String(busy));
    if (busy) {
      lockedButtons = Array.from(mount.querySelectorAll('button:enabled'));
      lockedButtons.forEach(button => { button.disabled = true; button.setAttribute('data-discovery-animation-lock', ''); });
    } else {
      lockedButtons.forEach(button => { button.disabled = false; button.removeAttribute('data-discovery-animation-lock'); });
      lockedButtons = [];
    }
  }

  function flyOut(card, decision, motion) {
    if (global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();
    const direction = decision === 'like' ? 1 : -1;
    const from = motion ? motion.transform : global.getComputedStyle(card).transform;
    const distance = Math.max(540, global.innerWidth * .8, motion ? Math.abs(motion.dx) + 180 : 0);
    const to = `translate3d(${direction * distance}px,12px,0) rotate(${direction * 17}deg)`;
    card.classList.remove('discovery-entering');
    card.classList.add('discovery-exiting');
    card.dataset.swipeDirection = decision;
    card.style.setProperty('--swipe-progress', .95);
    return new Promise(resolve => {
      let timer;
      const finish = () => { global.clearTimeout(timer); resolve(); };
      // Start at the exact release position rather than resetting to the center.
      if (typeof card.animate === 'function') {
        const animation = card.animate([{ transform: from, opacity: 1 }, { transform: to, opacity: 0 }], { duration: 280, easing: 'ease', fill: 'forwards' });
        timer = global.setTimeout(finish, 340);
        animation.finished.then(finish, finish);
      } else {
        card.style.transition = 'none';
        card.style.transform = from === 'none' ? 'translate3d(0,0,0)' : from;
        card.getBoundingClientRect();
        card.style.transition = 'transform .28s ease, opacity .28s ease';
        card.style.transform = to;
        card.style.opacity = '0';
        timer = global.setTimeout(finish, 285);
      }
    });
  }

  async function act(decision, focusCard, motion) {
    if (decisionInFlight) return;
    const state = engine.snapshot();
    const item = engine.current();
    const card = mount.querySelector('.discovery-card');
    if (!item || !card) return;
    const actionFocusKey = focusKey(document.activeElement);
    // Button/keyboard decisions may arrive during a short drag's return motion.
    const releaseMotion = motion || { transform: global.getComputedStyle(card).transform, dx: 0 };
    if (swipeBinding) swipeBinding.cancel();
    setDecisionBusy(true);
    let committed = false;
    try {
      await flyOut(card, decision, releaseMotion);
      const current = engine.current();
      if (engine.snapshot().activeMode === state.activeMode && current && current.id === item.id) committed = engine.decide(decision);
    } finally {
      setDecisionBusy(false);
      renderAll();
    }
    if (!committed) return;
    const label = state.activeMode === 'work' ? item.title : item.name;
    announce(decision === 'skip' ? `已略過「${label}」，共同偏好維持不變。` : decision === 'like' ? `已記錄對「${label}」有興趣，兩種探索與推薦已更新。${state.activeMode === 'creator' ? '探索興趣與追蹤清單各自記錄。' : ''}` : `已記錄對「${label}」不感興趣，兩種探索與推薦已更新。`);
    if (focusCard) mount.querySelector('#discoveryCard').focus({ preventScroll: true });
    else restoreFocus(actionFocusKey);
  }

  function switchMode(mode) {
    if (decisionInFlight || !engine.setMode(mode)) return;
    renderAll();
    const state = engine.snapshot();
    announce(`已切換${MODE_NAMES[mode]}，繼續原本進度：已探索 ${state.modes[mode].history.length} / ${state.totals[mode]}。`);
  }


  function openCreator(id) {
    if (!creatorAPI()) return;
    creatorReturnFocusKey = workDialog.open ? returnFocusKey : (focusKey(document.activeElement) || returnFocusKey);
    if (workDialog.open) workDialog.close();
    const creator = engine.item('creator', id);
    creatorAPI().open(id, undefined, creator ? engine.reason(creator, 'creator') : undefined);
  }

  function showWork(id) {
    const item = engine.item('work', id);
    if (!item) return;
    if (!workDialog.open) returnFocusKey = focusKey(document.activeElement);
    currentDialogWorkId = id;
    workDialog.innerHTML = `<div class="discovery-dialog-shell"><button type="button" class="discovery-dialog-close" data-discovery-close aria-label="關閉作品詳情">×</button><p class="discovery-dialog-eyebrow">FICTIONAL WORK · 虛構作品示例</p><h2 id="discoveryWorkTitle">${escapeHTML(item.title)}</h2>${tags(item)}<p class="discovery-dialog-format">${escapeHTML(item.format)} · 以下是展示用摘要</p><p>${escapeHTML(item.description)}</p><div class="discovery-preview"><h3>這篇作品會帶你看什麼？</h3><p>${escapeHTML(item.style)}。這個示例用一個具體問題，帶你比較方法、理解過程，再回頭檢查原先的想法。</p><p>這裡的作品與創作者皆為虛構資料，供體驗探索、收藏與讀後回饋流程。</p></div><p class="discovery-dialog-reason">${escapeHTML(engine.reason(item, 'work'))}</p><div class="discovery-dialog-actions"><button type="button" class="discovery-detail" data-discovery-source="${item.creatorId}" data-discovery-focus="dialog-source:${item.creatorId}">查看來源：${escapeHTML(item.creatorName)} ↗</button><button type="button" class="discovery-save" data-discovery-save="${item.id}" aria-pressed="${engine.isSaved(item.id)}">${engine.isSaved(item.id) ? '已收藏 ✓' : '收藏待看 ＋'}</button></div><p class="discovery-dialog-footnote">查看詳情與收藏不會自動記錄「有興趣」或追蹤。要留下讀後回饋，可前往來源創作者的作品清單。</p><h3 class="discovery-dialog-related-title">同主題的其他來源</h3><div class="discovery-dialog-related">${engine.catalog().filter(creator => creator.topic === item.topic && creator.id !== item.creatorId).map(creator => `<button type="button" data-discovery-source="${creator.id}" data-discovery-focus="dialog-related:${creator.id}"><strong>${escapeHTML(creator.name)} ↗</strong><span>${escapeHTML(creator.style)}</span></button>`).join('')}</div><p class="discovery-dialog-status" aria-live="polite"></p></div>`;
    if (!workDialog.open) workDialog.showModal();
    workDialog.querySelector('[data-discovery-close]').focus();
  }

  function showSaved() {
    const state = engine.snapshot();
    if (!state.savedIds.length) return;
    returnFocusKey = focusKey(document.activeElement);
    currentDialogWorkId = null;
    workDialog.innerHTML = `<div class="discovery-dialog-shell"><button type="button" class="discovery-dialog-close" data-discovery-close aria-label="關閉待看收藏">×</button><p class="discovery-dialog-eyebrow">SAVED FOR LATER · 待看收藏</p><h2 id="discoveryWorkTitle">留給下次的好內容</h2><p>收藏與探索興趣各自記錄。重新開始探索會保留這份清單。</p><div class="discovery-saved-list">${state.savedIds.map(id => { const item = engine.item('work', id); return `<article><span>${escapeHTML(item.creatorName)} · ${escapeHTML(item.topic)}</span><h3>${escapeHTML(item.title)}</h3><div><button type="button" class="discovery-rec-detail" data-discovery-work="${id}">查看詳情 ↗</button><button type="button" class="discovery-save" data-discovery-save="${id}" aria-label="從待看收藏移除${escapeHTML(item.title)}">移除收藏</button></div></article>`; }).join('')}</div><p class="discovery-dialog-status" aria-live="polite"></p></div>`;
    workDialog.showModal();
    workDialog.querySelector('[data-discovery-close]').focus();
  }

  function handleClick(event) {
    const button = event.target.closest('button');
    if (!button || button.disabled || decisionInFlight) return;
    if (button.hasAttribute('data-discovery-mode')) return switchMode(button.dataset.discoveryMode);
    if (button.hasAttribute('data-discovery-decision')) return act(button.dataset.discoveryDecision, false);
    if (button.hasAttribute('data-discovery-undo')) {
      if (engine.undo()) { renderAll(); announce(`已撤回${MODE_NAMES[engine.snapshot().activeMode]}上一張，兩種探索的共同偏好已重新計算。`); }
      return;
    }
    if (button.hasAttribute('data-discovery-reset')) {
      engine.reset(); renderedCardKey = null; renderAll();
      announce('作品與創作者的探索進度、興趣已重設；追蹤、閱讀評價與待看收藏保留。');
      return;
    }
    if (button.hasAttribute('data-discovery-switch-other')) return switchMode(engine.snapshot().activeMode === 'work' ? 'creator' : 'work');
    if (button.hasAttribute('data-discovery-follow')) {
      creatorAPI().toggleFollow(button.dataset.discoveryFollow);
      announce(followed(button.dataset.discoveryFollow) ? '已加入 MediaMatch 追蹤清單，探索卡片與進度維持原位。' : '已取消追蹤，探索卡片與進度維持原位。');
      return;
    }
    if (button.hasAttribute('data-discovery-source')) return openCreator(button.dataset.discoverySource);
    if (button.hasAttribute('data-discovery-work')) return showWork(button.dataset.discoveryWork);
    if (button.hasAttribute('data-discovery-save')) {
      const id = button.dataset.discoverySave;
      const isSaved = engine.toggleSaved(id);
      renderPreferences();
      announce(isSaved ? '已收藏待看；共同偏好與探索進度維持不變。' : '已移除待看收藏；共同偏好與探索進度維持不變。');
      if (workDialog.open) {
        if (currentDialogWorkId) {
          workDialog.querySelectorAll('[data-discovery-save]').forEach(element => {
            element.textContent = engine.isSaved(element.dataset.discoverySave) ? '已收藏 ✓' : '收藏待看 ＋';
            element.setAttribute('aria-pressed', String(engine.isSaved(element.dataset.discoverySave)));
          });
        } else {
          const row = button.closest('.discovery-saved-list article');
          const next = row.nextElementSibling || row.previousElementSibling;
          row.remove();
          if (next) next.querySelector('button').focus(); else workDialog.querySelector('[data-discovery-close]').focus();
        }
        workDialog.querySelector('.discovery-dialog-status').textContent = isSaved ? '已加入待看收藏。' : '已移除待看收藏。';
      }
      return;
    }
    if (button.hasAttribute('data-discovery-saved-list')) return showSaved();
    if (button.hasAttribute('data-discovery-close')) workDialog.close();
  }

  function initialize() {
    mount = document.getElementById('discoveryDemo');
    if (!mount || !creatorAPI() || !creatorAPI().catalog || engine) return;
    engine = createEngine(creatorAPI().catalog(), creatorAPI().getSignals());
    mount.classList.add('discovery-demo');
    mount.innerHTML = `<div class="discovery-mode-header"><div class="discovery-tabs" role="tablist" aria-label="選擇探索模式"><button type="button" role="tab" id="discoveryTab-work" data-discovery-mode="work" aria-selected="true" aria-controls="discoveryPanel">作品探索 <span>12</span></button><button type="button" role="tab" id="discoveryTab-creator" data-discovery-mode="creator" aria-selected="false" tabindex="-1" aria-controls="discoveryPanel">創作者探索 <span>6</span></button></div><p>兩種入口 · 同一份偏好<br><span>隨時切換，各自保留進度</span></p></div>
      <div class="discovery-grid"><section id="discoveryPanel" class="discovery-main" role="tabpanel" aria-labelledby="discoveryTab-work"><div class="discovery-progress"><span data-discovery-progress></span><button type="button" data-discovery-undo disabled>↶ 撤回上一張</button></div><div class="discovery-progress-track" aria-hidden="true"><i class="discovery-progress-fill"></i></div><p class="discovery-mode-description" data-discovery-mode-description></p><div class="discovery-card-slot"></div><div class="discovery-controls" aria-label="為目前的探索卡片留下興趣"><button type="button" data-discovery-decision="dislike" data-discovery-focus="decision:dislike"><span aria-hidden="true">×</span>不感興趣</button><button type="button" data-discovery-decision="skip" data-discovery-focus="decision:skip"><span aria-hidden="true">←</span>略過</button><button type="button" data-discovery-decision="like" data-discovery-focus="decision:like"><span aria-hidden="true">♡</span>有興趣 →</button></div><p id="discoveryGestureHelp" class="discovery-gesture-help">左滑／← 略過，右滑／→ 有興趣；聚焦卡片後也能用方向鍵。<br>不感興趣可按 ×；收藏留待下次；有興趣不會自動追蹤。</p><p class="discovery-status" aria-hidden="true">先選一張感興趣的卡片，看看另一種探索如何回應。</p></section>
      <aside class="discovery-side" aria-label="共同偏好與跨來源推薦"><section class="discovery-preference-panel"><div class="discovery-panel-heading"><div><span>SHARED PREFERENCES</span><h3>你的共同偏好</h3></div><span class="discovery-live-dot">本次體驗</span></div><div class="discovery-topic-signals"></div><p class="discovery-signal-note">50 是起點，僅代表這次體驗的個人偏好；探索興趣、追蹤與讀後回饋共同影響排序。</p><div class="discovery-reviewed"><span>作品已探索<strong data-discovery-reviewed="work"></strong></span><span>創作者已探索<strong data-discovery-reviewed="creator"></strong></span></div><button type="button" class="discovery-saved-count" data-discovery-saved-list data-discovery-focus="saved-list"><span data-discovery-saved-count></span> ↗</button></section><div class="discovery-recommendation-heading"><h3>興趣，會帶你走得更遠。</h3><p data-discovery-recommendation-intro></p></div><section class="discovery-rec-group"><h3>相關創作者 <span>從作品，遇見另一種觀點</span></h3><div data-discovery-recommendations="creator"></div></section><section class="discovery-rec-group"><h3>相關作品 <span>從創作者，延伸到不同來源</span></h3><div data-discovery-recommendations="work"></div></section></aside></div><div class="discovery-reset-row"><p>全部為虛構示例，資料只留在本次開啟的頁面。</p><button type="button" data-discovery-reset>重新開始雙模式探索</button><span>清除兩種探索的進度與興趣，保留追蹤、閱讀評價、收藏。</span></div><p class="discovery-live" aria-live="polite" aria-atomic="true"></p>`;
    workDialog = document.createElement('dialog');
    workDialog.className = 'discovery-dialog';
    workDialog.setAttribute('aria-labelledby', 'discoveryWorkTitle');
    document.body.appendChild(workDialog);
    mount.addEventListener('click', handleClick);
    workDialog.addEventListener('click', event => {
      if (event.target === workDialog) {
        const rect = workDialog.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) workDialog.close();
      } else handleClick(event);
    });
    workDialog.addEventListener('close', () => {
      if (!document.querySelector('.creator-dialog[open]')) restoreFocus(returnFocusKey);
    });
    mount.addEventListener('keydown', event => {
      if (event.altKey || event.ctrlKey || event.metaKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      if (decisionInFlight) { event.preventDefault(); return; }
      if (event.target.matches('[data-discovery-mode]')) {
        event.preventDefault();
        const mode = event.target.dataset.discoveryMode === 'work' ? 'creator' : 'work';
        switchMode(mode);
        mount.querySelector(`[data-discovery-mode="${mode}"]`).focus();
      } else if (event.target.matches('.discovery-card')) {
        event.preventDefault(); act(event.key === 'ArrowRight' ? 'like' : 'skip', true);
      }
    });
    document.addEventListener('mediamatch:creators-change', () => {
      engine.setExternal(creatorAPI().getSignals());
      renderAll();
    });
    document.addEventListener('close', event => {
      if (event.target.classList && event.target.classList.contains('creator-dialog') && creatorReturnFocusKey) {
        restoreFocus(creatorReturnFocusKey); creatorReturnFocusKey = null;
      }
    }, true);
    global.MediaMatchDiscovery = Object.freeze({ snapshot: () => engine.snapshot() });
    renderAll();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
})(typeof window !== 'undefined' ? window : globalThis);
