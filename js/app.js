// Логика главной: загрузка data.json, вкладки, фильтры, рендер
const state = {
  items: [],
  tab: 'home',       // home | top | new
  filter: 'recent',  // recent | rating | watching
  type: 'all'        // all | film | series | anime
};

const TYPE_LABELS = { film: 'Фильм', series: 'Сериал', anime: 'Аниме' };
const PLACEHOLDER_POSTER =
  'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300">' +
    '<rect width="100%" height="100%" fill="%2323293a"/>' +
    '<text x="50%" y="50%" fill="%239aa3b2" font-size="40" text-anchor="middle" dominant-baseline="middle">🎬</text></svg>'
  );

async function loadData() {
  try {
    const res = await fetch('data.json');
    state.items = await res.json();
  } catch (e) {
    document.getElementById('content').innerHTML =
      '<p class="empty-msg">Не удалось загрузить data.json</p>';
    return;
  }
  render();
}

function getVisibleItems() {
  let items = [...state.items];

  if (state.type !== 'all') {
    items = items.filter(i => i.type === state.type);
  }

  if (state.tab === 'top') {
    items.sort((a, b) => (b.myRating || 0) - (a.myRating || 0));
    return items.slice(0, 100);
  }
  if (state.tab === 'new') {
    items.sort((a, b) => (b.dateAdded || '').localeCompare(a.dateAdded || ''));
    return items;
  }

  // Главная — применяем выбранный фильтр
  if (state.filter === 'watching') {
    items = items.filter(i => i.status === 'watching');
    items.sort((a, b) => (b.dateAdded || '').localeCompare(a.dateAdded || ''));
  } else if (state.filter === 'rating') {
    items.sort((a, b) => (b.myRating || 0) - (a.myRating || 0));
  } else {
    items.sort((a, b) => (b.dateAdded || '').localeCompare(a.dateAdded || ''));
  }
  return items;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function cardHtml(item) {
  const badges = [
    item.imdbRating ? `<span class="badge badge-imdb">IMDb ${item.imdbRating}</span>` : '',
    item.myRating ? `<span class="badge badge-my">Моя ${item.myRating}</span>` : '',
    item.status === 'watching' ? `<span class="badge badge-watching">Смотрю</span>` : ''
  ].join('');
  return `
    <a class="card" href="film.html?id=${encodeURIComponent(item.id)}" target="_blank" rel="noopener">
      <img class="card-poster" src="${escapeHtml(item.poster)}" alt=""
           loading="lazy" onerror="this.src='${PLACEHOLDER_POSTER}'">
      <div class="card-body">
        <div class="card-title-row">
          <span class="card-title">${escapeHtml(item.title)}</span>
          ${badges}
        </div>
        <div class="card-meta">
          ${escapeHtml(item.originalTitle || '')}${item.originalTitle ? ' · ' : ''}${item.year || ''} · ${TYPE_LABELS[item.type] || ''}
        </div>
        <div class="card-desc">${escapeHtml(item.description || '')}</div>
        ${item.myComment ? `<div class="card-comment">${escapeHtml(item.myComment)}</div>` : ''}
      </div>
    </a>`;
}

function gridItemHtml(item, rank) {
  return `
    <a class="grid-item" href="film.html?id=${encodeURIComponent(item.id)}" target="_blank" rel="noopener">
      <img src="${escapeHtml(item.poster)}" alt="" loading="lazy" onerror="this.src='${PLACEHOLDER_POSTER}'">
      <span class="grid-rank">#${rank}</span>
      ${item.myRating ? `<span class="badge badge-my grid-rating">${item.myRating}</span>` : ''}
      <div class="grid-caption">${escapeHtml(item.title)}</div>
    </a>`;
}

function render() {
  const content = document.getElementById('content');
  const items = getVisibleItems();

  document.getElementById('filters').style.display =
    state.tab === 'home' ? 'flex' : 'none';

  if (!items.length) {
    content.className = 'cards';
    content.innerHTML = '<p class="empty-msg">Пока пусто</p>';
    return;
  }

  if (state.tab === 'top') {
    content.className = 'poster-grid';
    content.innerHTML = items.map((it, i) => gridItemHtml(it, i + 1)).join('');
  } else {
    content.className = 'cards';
    content.innerHTML = items.map(cardHtml).join('');
  }
}

// Переключение вкладок
document.getElementById('tabs').addEventListener('click', e => {
  const btn = e.target.closest('.tab-btn');
  if (!btn) return;
  state.tab = btn.dataset.tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
  render();
});

// Фильтры главной
document.getElementById('filters').addEventListener('click', e => {
  const btn = e.target.closest('.filter-btn');
  if (!btn) return;
  state.filter = btn.dataset.filter;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b === btn));
  render();
});

// Фильтр по типу
document.getElementById('type-filters').addEventListener('click', e => {
  const btn = e.target.closest('.type-btn');
  if (!btn) return;
  state.type = btn.dataset.type;
  document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('active', b === btn));
  render();
});

loadData();
