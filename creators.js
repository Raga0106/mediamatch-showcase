(function () {
  'use strict';

  const creators = [
    {
      id: 'ai-lab', name: '模型實測室', initials: 'AI', topic: 'AI', platform: 'YouTube', language: '繁體中文',
      style: '動手驗證，慢慢拆解', description: '用小實驗理解 AI 工具的能力與限制，偏好把設定、過程和失敗一起說清楚。',
      works: [
        { id: 'local-model', title: '本地模型的一週實驗筆記', format: '18 分鐘影片', description: '從硬體、速度到使用情境，示範如何比較工具是否適合自己。' },
        { id: 'ai-checklist', title: 'AI 回答之後，我會再查什麼？', format: '12 分鐘影片', description: '用一份查核清單示意如何對待生成內容與來源。' }
      ]
    },
    {
      id: 'ai-digest', name: 'AI 快讀', initials: '讀', topic: 'AI', platform: 'RSS / Blogs', language: 'English',
      style: '工具快訊，幾分鐘掌握重點', description: '用短篇週報整理 AI 工具與產品動態，適合想先知道發生什麼，再決定是否深入的人。',
      works: [
        { id: 'model-context', title: '這週的 AI 工具，有哪些變化值得注意？', format: '6 分鐘週報', description: '用短篇摘要整理幾項虛構產品更新，快速區分新功能與使用情境。' },
        { id: 'small-models', title: '三分鐘看懂本週 AI 產品快訊', format: '3 分鐘短文', description: '示意如何將工具消息濃縮成重點，讓讀者自行決定哪些值得追看。' }
      ]
    },
    {
      id: 'build-lab', name: '週末造物所', initials: '{ }', topic: '工程實作', platform: 'RSS / Blogs', language: '繁體中文',
      style: '一步一步做，保留踩坑紀錄', description: '從家裡的小需求出發，用程式、開源工具與硬體做出能實際操作的原型。',
      works: [
        { id: 'home-server', title: '舊筆電的家庭伺服器練習', format: '12 分鐘實作文章', description: '把系統安裝、網路設定與後續維護串成一次實作示意。' },
        { id: 'sensor-board', title: '第一塊環境感測看板', format: '10 分鐘實作文章', description: '用感測資料練習從硬體讀值到畫面呈現的完整流程。' }
      ]
    },
    {
      id: 'circuit-notes', name: 'Circuit Notes', initials: '⌁', topic: '工程實作', platform: 'YouTube', language: 'English',
      style: '短篇筆記，重視排查過程', description: '記下程式與電路中容易忽略的小細節，提供可以照著思考的除錯路徑。',
      works: [
        { id: 'sensor-network', title: '感測網路為什麼偶爾斷線？', format: '18 分鐘影片', description: '示意從電源、連線到程式狀態逐層排查問題。' },
        { id: 'debug-notes', title: '讓下一次除錯容易一點', format: '14 分鐘影片', description: '用紀錄與小工具，讓實驗結果可以回頭檢查。' }
      ]
    },
    {
      id: 'data-finance', name: '數據看財經', initials: '↗', topic: '商業金融', platform: 'RSS / Blogs', language: '繁體中文',
      style: '數字切入，先問假設', description: '從商業案例和資料讀法展開討論，關心數字如何產生、能回答什麼問題。',
      works: [
        { id: 'product-market', title: '好產品為什麼也會失敗？', format: '12 分鐘分析文章', description: '以虛構案例討論需求、產品選擇與商業模式的關係。' },
        { id: 'payment-path', title: '一筆跨境付款走過哪些地方？', format: '11 分鐘分析文章', description: '沿著付款流程理解各方角色，以及比較成本時的前提。' }
      ]
    },
    {
      id: 'longview', name: 'Longview Letters', initials: '◎', topic: '商業金融', platform: 'YouTube', language: 'English',
      style: '長期觀察，拆解商業結構', description: '把公司、產業與產品放在較長的時間軸裡，用影片整理值得繼續追問的問題。',
      works: [
        { id: 'business-shape', title: '同樣是訂閱，生意可能很不同', format: '21 分鐘影片', description: '用示意案例比較收入、成本與留存之間的關係。' },
        { id: 'growth-context', title: '成長曲線之外，還要看什麼？', format: '17 分鐘影片', description: '整理讀商業數據時，容易被省略的背景與條件。' }
      ]
    }
  ];

  const topics = ['AI', '工程實作', '商業金融'];
  const ratingLabels = { unrated: '先不評價', useful: '有收穫', ordinary: '普通', thin: '偏水' };
  const signals = { useful: 1, ordinary: 0, thin: -1 };
  const followed = new Set();
  const ratings = new Map();
  const filters = { topic: '全部', platform: '全部', language: '全部', followedOnly: false };
  let mount = null;
  let dialog = null;
  let activeCreatorId = null;
  let returnFocus = null;
  let returnFocusAction = null;
  let returnDiscoveryFocus = null;

  const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const findCreator = id => creators.find(creator => creator.id === id);
  const ratingKey = (creatorId, workId) => `${creatorId}:${workId}`;
  const clamp = value => Math.max(0, Math.min(100, value));
  const creatorRatings = creator => creator.works.map(work => ratings.get(ratingKey(creator.id, work.id))).filter(value => value !== undefined);
  const creatorScore = creator => clamp(50 + creatorRatings(creator).reduce((total, value) => total + signals[value] * 15, 0));
  const topicScore = topic => clamp(50 + creators.filter(creator => creator.topic === topic).flatMap(creatorRatings).reduce((total, value) => total + signals[value] * 5, 0));
  const summary = () => ({ followed: followed.size, rated: ratings.size });
  const catalog = () => creators.map(creator => Object.assign({}, creator, { works: creator.works.map(work => Object.assign({}, work)) }));
  const getSignals = () => ({
    followedIds: Array.from(followed),
    creatorScores: Object.fromEntries(creators.map(creator => [creator.id, creatorScore(creator)])),
    topicScores: Object.fromEntries(topics.map(topic => [topic, topicScore(topic)])),
    summary: summary()
  });

  function announce(message) {
    if (mount) mount.querySelector('.creator-live').textContent = message;
  }

  function notify(type, creator, extra) {
    document.dispatchEvent(new CustomEvent('mediamatch:creators-change', {
      detail: Object.assign({
        type, creatorId: creator.id, topic: creator.topic, followed: followed.has(creator.id),
        creatorScore: creatorScore(creator), topicScore: topicScore(creator.topic), summary: summary()
      }, extra || {})
    }));
  }

  function followLabel(creator) {
    return followed.has(creator.id) ? '已追蹤 · 取消' : '在 MediaMatch 追蹤';
  }

  function cardHTML(creator) {
    const score = creatorScore(creator);
    const rated = creatorRatings(creator).length;
    return `<article class="creator-card">
      <div class="creator-card-top"><span class="creator-avatar" aria-hidden="true">${escapeHTML(creator.initials)}</span><span class="creator-fiction">虛構示例</span></div>
      <div class="creator-tags"><span>${escapeHTML(creator.topic)}</span><span>${escapeHTML(creator.platform)}</span><span lang="${creator.language === 'English' ? 'en' : 'zh-Hant'}">${escapeHTML(creator.language)}</span></div>
      <h3>${escapeHTML(creator.name)}</h3><p class="creator-style">${escapeHTML(creator.style)}</p>
      <p class="creator-description">${escapeHTML(creator.description)}</p>
      <p class="creator-work-label">代表作品 · 示意</p><p class="creator-work-title">${escapeHTML(creator.works[0].title)}</p>
      <div class="creator-score"><div><span>我的偏好示意</span><strong>${score}<small> / 100</small></strong></div><div class="creator-score-track" aria-hidden="true"><span style="width:${score}%"></span></div><p>${rated ? `已評價 ${rated} 篇 · 只反映你的閱讀感受` : '50 為示意起點，尚未留下閱讀評價'}</p></div>
      <div class="creator-card-actions"><button type="button" class="creator-detail-button" data-creator-details="${creator.id}" aria-label="查看${escapeHTML(creator.name)}的作品與評價">看創作者與作品 <span aria-hidden="true">↗</span></button><button type="button" class="creator-follow-button${followed.has(creator.id) ? ' creator-is-followed' : ''}" data-creator-follow="${creator.id}" aria-pressed="${followed.has(creator.id)}" aria-label="${escapeHTML(followLabel(creator))}：${escapeHTML(creator.name)}">${followLabel(creator)}</button></div>
    </article>`;
  }

  function renderResults() {
    if (!mount) return;
    const focused = document.activeElement;
    const focusedFollow = focused && focused.getAttribute && focused.getAttribute('data-creator-follow');
    const visible = creators.filter(creator =>
      (filters.topic === '全部' || creator.topic === filters.topic) &&
      (filters.platform === '全部' || creator.platform === filters.platform) &&
      (filters.language === '全部' || creator.language === filters.language) &&
      (!filters.followedOnly || followed.has(creator.id))
    );
    const stats = summary();
    mount.querySelector('.creator-follow-count').textContent = `已追蹤 ${stats.followed} 位`;
    mount.querySelector('.creator-rated-count').textContent = `已評價 ${stats.rated} 篇示意作品`;
    mount.querySelector('.creator-result-count').textContent = `目前顯示 ${visible.length} / ${creators.length} 位`;
    mount.querySelectorAll('[data-creator-topic-score]').forEach(element => {
      element.textContent = `${topicScore(element.dataset.creatorTopicScore)} / 100`;
    });
    mount.querySelectorAll('[data-creator-topic]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.creatorTopic === filters.topic)));
    const results = mount.querySelector('.creator-results');
    if (visible.length) {
      results.innerHTML = `<div class="creator-grid">${visible.map(cardHTML).join('')}</div>`;
    } else {
      const noFollows = filters.followedOnly && followed.size === 0;
      results.innerHTML = `<div class="creator-empty"><span aria-hidden="true">${noFollows ? '♡' : '⌕'}</span><h3>${noFollows ? '你的追蹤清單還是空的' : '目前的條件沒有符合的創作者'}</h3><p>${noFollows ? '先看看示意創作者，找到想繼續關注的人，再按「在 MediaMatch 追蹤」。' : '這裡只有 6 位虛構示例。試著放寬平台或語言，或換一個探索主題。'}</p><button type="button" class="creator-detail-button" data-creator-clear>查看全部示意創作者</button></div>`;
    }
    if (focusedFollow && mount.contains(focused)) return;
    if (focusedFollow && focused && !focused.isConnected) {
      const replacement = results.querySelector(`[data-creator-follow="${focusedFollow}"]`);
      (replacement || mount.querySelector('[data-creator-followed-only]')).focus();
    }
  }

  function updateDialogSignals(message) {
    if (!dialog || !dialog.open || !activeCreatorId) return;
    const creator = findCreator(activeCreatorId);
    dialog.querySelector('.creator-dialog-score-value').textContent = `${creatorScore(creator)} / 100`;
    dialog.querySelector('.creator-dialog-topic-value').textContent = `${topicScore(creator.topic)} / 100`;
    const button = dialog.querySelector('[data-creator-follow]');
    button.textContent = followLabel(creator);
    button.setAttribute('aria-pressed', String(followed.has(creator.id)));
    button.classList.toggle('creator-is-followed', followed.has(creator.id));
    if (message) dialog.querySelector('.creator-dialog-status').textContent = message;
  }

  function toggleFollow(id) {
    const creator = findCreator(id);
    if (!creator) return false;
    if (followed.has(id)) followed.delete(id); else followed.add(id);
    renderResults();
    const message = followed.has(id) ? `已在 MediaMatch 追蹤${creator.name}。這不會訂閱外部平台。` : `已取消在 MediaMatch 追蹤${creator.name}。`;
    announce(message);
    updateDialogSignals(message);
    notify('follow', creator);
    return followed.has(id);
  }

  function setRating(creatorId, workId, rating) {
    const creator = findCreator(creatorId);
    if (!creator || !creator.works.some(work => work.id === workId) || !(rating in ratingLabels)) return;
    const key = ratingKey(creatorId, workId);
    if (rating === 'unrated') ratings.delete(key); else ratings.set(key, rating);
    renderResults();
    const message = rating === 'unrated' ? '已移除這篇作品的閱讀評價。' : `已記錄「${ratingLabels[rating]}」。只更新你的${creator.name}與${creator.topic}主題偏好。`;
    updateDialogSignals(message);
    announce(message);
    notify('rating', creator, { workId, rating });
  }

  function open(id, workId, recommendationReason) {
    const creator = findCreator(id);
    if (!creator) return false;
    if (!mount) initialize();
    if (!dialog) return false;
    if (!dialog.open) {
      returnFocus = document.activeElement;
      returnFocusAction = null;
      returnDiscoveryFocus = returnFocus && returnFocus.getAttribute ? returnFocus.getAttribute('data-discovery-focus') : null;
      if (returnFocus && mount.contains(returnFocus)) {
        const action = ['data-creator-details', 'data-creator-follow'].find(attribute => returnFocus.hasAttribute(attribute));
        if (action) returnFocusAction = { attribute: action, creatorId: returnFocus.getAttribute(action) };
      }
    }
    activeCreatorId = id;
    const reason = typeof recommendationReason === 'string' && recommendationReason.trim()
      ? recommendationReason.trim()
      : `從${creator.topic}主題認識${creator.name}，看看「${creator.style}」的作品是否符合你的偏好。`;
    dialog.innerHTML = `<div class="creator-dialog-shell">
      <button type="button" class="creator-dialog-close" data-creator-close aria-label="關閉創作者視窗">×</button>
      <p class="creator-dialog-eyebrow">FICTIONAL CREATOR · 虛構創作者</p>
      <h2 id="creatorDialogTitle">${escapeHTML(creator.name)}</h2>
      <div class="creator-tags"><span>${escapeHTML(creator.topic)}</span><span>${escapeHTML(creator.platform)}</span><span>${escapeHTML(creator.language)}</span></div>
      <p class="creator-dialog-style">${escapeHTML(creator.style)}</p><p id="creatorDialogDescription">${escapeHTML(creator.description)} 以下作品皆為示意，沒有連接真實內容。</p>
      <p class="creator-dialog-reason"><strong>探索提示</strong>${escapeHTML(reason)}</p>
      <button type="button" class="creator-follow-button${followed.has(id) ? ' creator-is-followed' : ''}" data-creator-follow="${id}" aria-pressed="${followed.has(id)}">${followLabel(creator)}</button>
      <p class="creator-follow-note">追蹤只代表加入 MediaMatch 內部清單，不會訂閱 ${escapeHTML(creator.platform)}，也不會通知任何人。</p>
      <div class="creator-dialog-signals"><div><span>我的創作者偏好</span><strong class="creator-dialog-score-value">${creatorScore(creator)} / 100</strong></div><div><span>我的${escapeHTML(creator.topic)}主題訊號</span><strong class="creator-dialog-topic-value">${topicScore(creator.topic)} / 100</strong></div></div>
      <p class="creator-score-explanation">以上是個人偏好示意，並非客觀評分、人氣或正確性判斷。每位創作者從 50 起算；「有收穫」提高偏好，「普通」保留中性訊號，「偏水」降低偏好，「先不評價」可撤回。只有這位創作者和同主題訊號會改變。</p>
      <h3 class="creator-works-heading">代表作品與讀後感受</h3>
      <p class="creator-works-intro">操作示範：想像閱讀後的感受，再選一項。這裡不會播放或開啟真實作品。</p>
      <div class="creator-work-list">${creator.works.map(work => {
        const selected = ratings.get(ratingKey(id, work.id)) || 'unrated';
        return `<article class="creator-work"><span class="creator-work-format">虛構作品 · ${escapeHTML(work.format)}</span><h4>${escapeHTML(work.title)}</h4><p>${escapeHTML(work.description)}</p><label for="creator-rating-${id}-${work.id}">讀後感受 <span>／僅影響我的偏好</span></label><select id="creator-rating-${id}-${work.id}" data-creator-rating="${work.id}" aria-label="${escapeHTML(work.title)}的讀後感受">${Object.entries(ratingLabels).map(([value, label]) => `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`).join('')}</select></article>`;
      }).join('')}</div>
      <p class="creator-dialog-status" role="status" aria-live="polite">本次操作僅保留在這個分頁的記憶體；重新整理即重設。</p>
    </div>`;
    if (!dialog.open) dialog.showModal();
    const work = creator.works.find(item => item.id === workId);
    const focusTarget = work ? dialog.querySelector(`[data-creator-rating="${work.id}"]`) : dialog.querySelector('[data-creator-close]');
    focusTarget.focus();
    return true;
  }

  function resetFilters() {
    Object.assign(filters, { topic: '全部', platform: '全部', language: '全部', followedOnly: false });
    mount.querySelector('[data-creator-platform]').value = '全部';
    mount.querySelector('[data-creator-language]').value = '全部';
    mount.querySelector('[data-creator-followed-only]').checked = false;
    renderResults();
    mount.querySelector('[data-creator-topic="全部"]').focus();
    announce('已清除顯示條件，顯示全部 6 位示意創作者。');
  }

  function initialize() {
    if (mount) return;
    mount = document.getElementById('creatorExplorer');
    if (!mount) return;
    mount.classList.add('creator-explorer');
    mount.innerHTML = `<p class="creator-demo-note"><strong>概念示範 · 全部資料均為虛構</strong><span>6 位創作者、作品與分數都用來體驗流程。所有操作只保留在本分頁，重新整理即重設。</span></p>
      <div class="creator-filter-layout"><fieldset class="creator-topic-panel"><legend>主題偏好 · 我想探索</legend><p>選擇探索方向；讀後評價會留下該主題的個人偏好訊號。</p><div class="creator-topic-options">${['全部'].concat(topics).map(topic => `<button type="button" data-creator-topic="${topic}" aria-pressed="${topic === '全部'}">${topic}</button>`).join('')}</div><div class="creator-topic-signals" aria-label="個人主題偏好示意">${topics.map(topic => `<span>${topic} <strong data-creator-topic-score="${topic}">50 / 100</strong></span>`).join('')}</div></fieldset>
      <fieldset class="creator-hard-filters"><legend>顯示條件 · 平台與語言</legend><p>只篩選目前看見的卡片，不改變個人偏好分數。</p><div class="creator-select-row"><label for="creatorPlatform">平台<select id="creatorPlatform" aria-label="平台" data-creator-platform><option value="全部">所有平台</option><option>YouTube</option><option>RSS / Blogs</option></select></label><label for="creatorLanguage">語言<select id="creatorLanguage" aria-label="語言" data-creator-language><option value="全部">所有語言</option><option>繁體中文</option><option>English</option></select></label></div></fieldset></div>
      <div class="creator-list-toolbar"><div class="creator-list-stats"><strong class="creator-follow-count">已追蹤 0 位</strong><span class="creator-rated-count">已評價 0 篇示意作品</span></div><label class="creator-followed-toggle"><input type="checkbox" data-creator-followed-only>只看已追蹤</label></div>
      <p class="creator-follow-boundary">MediaMatch 內部追蹤 ≠ 外部平台訂閱。追蹤不會替你訂閱或追蹤任何外部帳號。</p>
      <p class="creator-result-count"></p><div class="creator-results"></div>
      <p class="creator-score-footnote">「我的偏好示意」只來自你對作品的讀後選擇，不是客觀品質、事實查核結果或熱門排行榜。本區未連接 API、推薦後端或資料庫。</p>
      <p class="creator-live" role="status" aria-live="polite" aria-atomic="true"></p>`;

    mount.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button || !mount.contains(button)) return;
      if (button.hasAttribute('data-creator-topic')) {
        filters.topic = button.dataset.creatorTopic;
        renderResults();
        announce(`已選擇${filters.topic === '全部' ? '全部主題' : filters.topic}。${mount.querySelector('.creator-result-count').textContent}`);
      } else if (button.hasAttribute('data-creator-details')) open(button.dataset.creatorDetails);
      else if (button.hasAttribute('data-creator-follow')) toggleFollow(button.dataset.creatorFollow);
      else if (button.hasAttribute('data-creator-clear')) resetFilters();
    });
    mount.addEventListener('change', event => {
      if (event.target.hasAttribute('data-creator-platform')) filters.platform = event.target.value;
      else if (event.target.hasAttribute('data-creator-language')) filters.language = event.target.value;
      else if (event.target.hasAttribute('data-creator-followed-only')) filters.followedOnly = event.target.checked;
      else return;
      renderResults();
      announce(mount.querySelector('.creator-result-count').textContent);
    });

    dialog = document.createElement('dialog');
    dialog.className = 'creator-dialog';
    dialog.setAttribute('aria-labelledby', 'creatorDialogTitle');
    dialog.setAttribute('aria-describedby', 'creatorDialogDescription');
    dialog.addEventListener('click', event => {
      const closeButton = event.target.closest('[data-creator-close]');
      const followButton = event.target.closest('[data-creator-follow]');
      if (closeButton) dialog.close();
      else if (followButton) toggleFollow(followButton.dataset.creatorFollow);
      else if (event.target === dialog) {
        const rect = dialog.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
      }
    });
    dialog.addEventListener('change', event => {
      if (event.target.hasAttribute('data-creator-rating')) setRating(activeCreatorId, event.target.dataset.creatorRating, event.target.value);
    });
    dialog.addEventListener('close', () => {
      activeCreatorId = null;
      if (returnFocus && returnFocus.isConnected && typeof returnFocus.focus === 'function') returnFocus.focus();
      else if (mount && mount.isConnected) {
        const replacement = returnFocusAction && mount.querySelector(`[${returnFocusAction.attribute}="${returnFocusAction.creatorId}"]`);
        const discoveryReplacement = returnDiscoveryFocus === null ? null : Array.from(document.querySelectorAll('[data-discovery-focus]')).find(element => element.getAttribute('data-discovery-focus') === returnDiscoveryFocus);
        (replacement || discoveryReplacement || mount.querySelector('[data-creator-topic="全部"]')).focus();
      }
      returnFocus = null;
      returnFocusAction = null;
      returnDiscoveryFocus = null;
    });
    document.body.append(dialog);
    renderResults();
  }

  // Public bridge for the content-card demo. All values are local to this page.
  window.MediaMatchCreators = {
    open,
    isFollowed: id => followed.has(id),
    toggleFollow,
    creatorLabel: id => { const creator = findCreator(id); return creator ? creator.name : ''; },
    summary,
    catalog,
    getSignals
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
}());
