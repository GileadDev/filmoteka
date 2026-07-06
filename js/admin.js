// Инструмент наполнения: поиск в TMDb (ru-RU) + добор рейтинга IMDb из OMDb,
// предпросмотр и генерация готовой записи для data.json.
// Токены хранятся в localStorage браузера и в репозиторий не попадают.

const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p/w500';

const els = {
  tmdbToken: document.getElementById('tmdb-token'),
  omdbToken: document.getElementById('omdb-token'),
  searchInput: document.getElementById('search-input'),
  searchBtn: document.getElementById('search-btn'),
  searchStatus: document.getElementById('search-status'),
  searchResults: document.getElementById('search-results'),
  editSection: document.getElementById('edit-section'),
  preview: document.getElementById('preview'),
  myRating: document.getElementById('my-rating'),
  myStatus: document.getElementById('my-status'),
  myType: document.getElementById('my-type'),
  myComment: document.getElementById('my-comment'),
  copyBtn: document.getElementById('copy-json-btn'),
  downloadBtn: document.getElementById('download-btn'),
  resultStatus: document.getElementById('result-status'),
  jsonOutput: document.getElementById('json-output')
};

let current = null; // выбранное произведение (заготовка записи)

// --- Токены: сохраняем/восстанавливаем ---
els.tmdbToken.value = localStorage.getItem('tmdbToken') || '';
els.omdbToken.value = localStorage.getItem('omdbToken') || '';
els.tmdbToken.addEventListener('change', () => localStorage.setItem('tmdbToken', els.tmdbToken.value.trim()));
els.omdbToken.addEventListener('change', () => localStorage.setItem('omdbToken', els.omdbToken.value.trim()));

// TMDb: поддерживаем и v3 api_key, и v4 Bearer-токен (v4 начинается с "ey")
function tmdbFetch(path, params = {}) {
  const token = els.tmdbToken.value.trim();
  const url = new URL(TMDB_BASE + path);
  url.searchParams.set('language', 'ru-RU');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const opts = {};
  if (token.startsWith('ey')) {
    opts.headers = { Authorization: 'Bearer ' + token };
  } else {
    url.searchParams.set('api_key', token);
  }
  return fetch(url, opts).then(r => {
    if (!r.ok) throw new Error('TMDb: HTTP ' + r.status);
    return r.json();
  });
}

function setStatus(el, msg, isError = false) {
  el.hidden = !msg;
  el.textContent = msg || '';
  el.classList.toggle('error', isError);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function slugify(title, year) {
  const s = String(title).toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '');
  return year ? `${s}-${year}` : s;
}

// --- Поиск ---
async function search() {
  const q = els.searchInput.value.trim();
  if (!q) return;
  if (!els.tmdbToken.value.trim()) {
    setStatus(els.searchStatus, 'Сначала укажите токен TMDb (раздел 1).', true);
    return;
  }
  setStatus(els.searchStatus, 'Ищу…');
  els.searchResults.innerHTML = '';
  try {
    const data = await tmdbFetch('/search/multi', { query: q, include_adult: 'false' });
    const results = (data.results || [])
      .filter(r => r.media_type === 'movie' || r.media_type === 'tv')
      .slice(0, 8);
    if (!results.length) {
      setStatus(els.searchStatus, 'Ничего не найдено.', true);
      return;
    }
    setStatus(els.searchStatus, '');
    els.searchResults.innerHTML = results.map((r, i) => {
      const title = r.title || r.name;
      const year = (r.release_date || r.first_air_date || '').slice(0, 4);
      const poster = r.poster_path ? IMG_BASE + r.poster_path : '';
      return `<div class="search-result" data-i="${i}">
        <img src="${poster}" alt="" onerror="this.style.visibility='hidden'">
        <div><b>${escapeHtml(title)}</b> ${year ? '(' + year + ')' : ''}
        <div class="hint">${r.media_type === 'movie' ? 'Фильм' : 'Сериал'} · TMDb ${r.vote_average ? r.vote_average.toFixed(1) : '—'}</div></div>
      </div>`;
    }).join('');
    els.searchResults.onclick = e => {
      const row = e.target.closest('.search-result');
      if (row) pick(results[Number(row.dataset.i)]);
    };
  } catch (err) {
    setStatus(els.searchStatus, 'Ошибка поиска: ' + err.message, true);
  }
}

// --- Выбор результата: детали TMDb + рейтинг IMDb из OMDb ---
async function pick(r) {
  setStatus(els.searchStatus, 'Загружаю детали…');
  try {
    const isMovie = r.media_type === 'movie';
    const details = await tmdbFetch(
      `/${isMovie ? 'movie' : 'tv'}/${r.id}`,
      { append_to_response: 'external_ids' }
    );
    const title = details.title || details.name || '';
    const originalTitle = details.original_title || details.original_name || '';
    const year = Number((details.release_date || details.first_air_date || '').slice(0, 4)) || null;
    const imdbId = details.imdb_id || (details.external_ids && details.external_ids.imdb_id) || '';

    // Добор точного рейтинга IMDb через OMDb (один раз, при добавлении)
    let imdbRating = null;
    const omdbKey = els.omdbToken.value.trim();
    if (imdbId && omdbKey) {
      try {
        const omdb = await (await fetch(
          `https://www.omdbapi.com/?apikey=${encodeURIComponent(omdbKey)}&i=${encodeURIComponent(imdbId)}`
        )).json();
        const val = parseFloat(omdb.imdbRating);
        if (!Number.isNaN(val)) imdbRating = val;
      } catch (_) { /* OMDb недоступен — оставим null */ }
    }

    // Аниме определяем по жанру Animation (16) + стране/языку — предзаполняем тип
    const isAnimation = (details.genres || []).some(g => g.id === 16);
    const isJapanese = details.original_language === 'ja';
    els.myType.value = isAnimation && isJapanese ? 'anime' : (isMovie ? 'film' : 'series');

    current = {
      id: slugify(originalTitle || title, year),
      title,
      originalTitle,
      type: els.myType.value,
      year,
      poster: details.poster_path ? IMG_BASE + details.poster_path : '',
      imdbRating,
      myRating: null,
      description: details.overview || '',
      myComment: '',
      status: 'watched',
      dateAdded: new Date().toISOString().slice(0, 10),
      imdbId,
      tmdbId: details.id
    };

    setStatus(els.searchStatus,
      imdbRating === null && omdbKey ? 'Готово (рейтинг IMDb получить не удалось).' :
      !omdbKey ? 'Готово. Без ключа OMDb рейтинг IMDb не подтянут.' : 'Готово.');
    renderPreview();
    els.editSection.hidden = false;
    els.editSection.scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    setStatus(els.searchStatus, 'Ошибка: ' + err.message, true);
  }
}

function renderPreview() {
  els.preview.innerHTML = `
    <div class="card">
      <img class="card-poster" src="${escapeHtml(current.poster)}" alt="">
      <div class="card-body">
        <div class="card-title-row">
          <span class="card-title">${escapeHtml(current.title)}</span>
          ${current.imdbRating ? `<span class="badge badge-imdb">IMDb ${current.imdbRating}</span>` : ''}
        </div>
        <div class="card-meta">${escapeHtml(current.originalTitle)} · ${current.year || ''}</div>
        <div class="card-desc">${escapeHtml(current.description)}</div>
      </div>
    </div>`;
}

function buildEntry() {
  return {
    ...current,
    type: els.myType.value,
    myRating: els.myRating.value ? Number(els.myRating.value) : null,
    myComment: els.myComment.value.trim(),
    status: els.myStatus.value
  };
}

// --- Кнопка «Скопировать JSON» ---
els.copyBtn.addEventListener('click', async () => {
  if (!current) return;
  const json = JSON.stringify(buildEntry(), null, 2);
  els.jsonOutput.hidden = false;
  els.jsonOutput.value = json;
  try {
    await navigator.clipboard.writeText(json);
    setStatus(els.resultStatus, 'Скопировано! Вставьте запись в массив в data.json (не забудьте запятую между записями).');
  } catch (_) {
    setStatus(els.resultStatus, 'Скопируйте запись из поля ниже вручную.');
  }
});

// --- Кнопка «Скачать обновлённый data.json» ---
els.downloadBtn.addEventListener('click', async () => {
  if (!current) return;
  let data = [];
  try {
    data = await (await fetch('data.json?nocache=' + Date.now())).json();
  } catch (_) {
    setStatus(els.resultStatus, 'Не удалось прочитать текущий data.json — скачаю файл только с новой записью.', true);
  }
  const entry = buildEntry();
  const idx = data.findIndex(i => i.id === entry.id);
  if (idx >= 0) data[idx] = entry; else data.push(entry);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'data.json';
  a.click();
  URL.revokeObjectURL(a.href);
  setStatus(els.resultStatus, 'Файл скачан. Замените им data.json в репозитории и закоммитьте.');
});

els.searchBtn.addEventListener('click', search);
els.searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') search(); });
