// Страница произведения: читает id из query-параметра и рисует детали
const TYPE_LABELS = { film: 'Фильм', series: 'Сериал', anime: 'Аниме' };
const STATUS_LABELS = { watched: 'Просмотрено', watching: 'Сейчас смотрю' };
const PLACEHOLDER_POSTER =
  'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300">' +
    '<rect width="100%" height="100%" fill="%2323293a"/>' +
    '<text x="50%" y="50%" fill="%239aa3b2" font-size="40" text-anchor="middle" dominant-baseline="middle">🎬</text></svg>'
  );

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function init() {
  const el = document.getElementById('film');
  const id = new URLSearchParams(location.search).get('id');
  let items = [];
  try {
    items = await (await fetch('data.json')).json();
  } catch (e) {
    el.innerHTML = '<p class="empty-msg">Не удалось загрузить data.json</p>';
    return;
  }
  const item = items.find(i => i.id === id);
  if (!item) {
    el.innerHTML = '<p class="empty-msg">Произведение не найдено</p>';
    return;
  }

  document.title = `${item.title} — Моя фильмотека`;
  el.innerHTML = `
    <img class="film-poster" src="${escapeHtml(item.poster)}" alt=""
         onerror="this.src='${PLACEHOLDER_POSTER}'">
    <div class="film-info">
      <div>
        <h1 class="film-title">${escapeHtml(item.title)}</h1>
        <div class="film-original">
          ${escapeHtml(item.originalTitle || '')}${item.originalTitle ? ' · ' : ''}${item.year || ''} · ${TYPE_LABELS[item.type] || ''} · ${STATUS_LABELS[item.status] || ''}
        </div>
      </div>
      <div class="film-badges">
        ${item.imdbRating ? `<span class="badge badge-imdb">IMDb ${item.imdbRating}</span>` : ''}
        ${item.myRating ? `<span class="badge badge-my">Моя ${item.myRating}</span>` : ''}
      </div>
      <p class="film-desc">${escapeHtml(item.description || '')}</p>
      ${item.myComment ? `<div class="film-comment"><b>Мой комментарий:</b><br>${escapeHtml(item.myComment)}</div>` : ''}
      ${item.imdbId ? `<div class="film-links"><a href="https://www.imdb.com/title/${encodeURIComponent(item.imdbId)}/" target="_blank" rel="noopener">Страница на IMDb ↗</a></div>` : ''}
    </div>`;
}

init();
