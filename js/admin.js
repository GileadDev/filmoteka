// Инструмент наполнения: живой поиск в TMDb (ru-RU) + добор рейтинга IMDb из OMDb.
// Выбранный фильм показывается карточкой (постер, описание, рейтинг),
// рядом — панель редактирования (моя оценка, комментарий, статус, тип).
// Токены хранятся в localStorage браузера и в репозиторий не попадают.

const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p/w500';

const els = {
  tmdbToken: document.getElementById('tmdb-token'),
  omdbToken: document.getElementById('omdb-token'),
  searchInput: document.getElementById('search-input'),
  searchStatus: document.getElementById('search-status'),
  searchResults: document.getElementById('search-results'),
  selected: document.getElementById('selected'),
  selPoster: document.getElementById('sel-poster'),
  selTitle: document.getElementById('sel-title'),
  selMeta: document.getElementById('sel-meta'),
  selBadges: document.getElementById('sel-badges'),
  selDesc: document.getElementById('sel-desc'),
  myRating: document.getElementById('my-rating'),
  myStatus: document.getElementById('my-status'),
  myType: document.getElementById('my-type'),
  myComment: document.getElementById('my-comment'),
  copyBtn: document.getElementById('copy-json-btn'),
  downloadBtn: document.getElementById('download-btn'),
  addBtn: document.getElementById('add-btn'),
  resultStatus: document.getElementById('result-status'),
  jsonOutput: document.getElementById('json-output'),
  ghToken: document.getElementById('gh-token'),
  ghOwner: document.getElementById('gh-owner'),
  ghRepo: document.getElementById('gh-repo'),
  ghBranch: document.getElementById('gh-branch')
};

let current = null;      // выбранное произведение (заготовка записи)
let searchTimer = null;  // дебаунс живого поиска
let lastQuery = '';

// --- Токены: сохраняем/восстанавливаем ---
els.tmdbToken.value = localStorage.getItem('tmdbToken') || '';
els.omdbToken.value = localStorage.getItem('omdbToken') || '';
els.tmdbToken.addEventListener('change', () => localStorage.setItem('tmdbToken', els.tmdbToken.value.trim()));
els.omdbToken.addEventListener('change', () => localStorage.setItem('omdbToken', els.omdbToken.value.trim()));

// --- Настройки GitHub: автозаполнение (общая логика в js/gh.js) + сохранение ---
const ghCfg = GH.config();
els.ghToken.value = ghCfg.token;
els.ghOwner.value = ghCfg.owner;
els.ghRepo.value = ghCfg.repo;
els.ghBranch.value = ghCfg.branch;
[['ghToken', els.ghToken], ['ghOwner', els.ghOwner], ['ghRepo', els.ghRepo], ['ghBranch', els.ghBranch]]
  .forEach(([key, el]) => el.addEventListener('change', () => localStorage.setItem(key, el.value.trim())));

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

// --- Живой поиск: срабатывает по мере ввода, с дебаунсом ---
els.searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const q = els.searchInput.value.trim();
  if (q.length < 2) {
    els.searchResults.innerHTML = '';
    setStatus(els.searchStatus, '');
    return;
  }
  searchTimer = setTimeout(() => search(q), 400);
});

// Клик мимо списка — закрыть его
document.addEventListener('click', e => {
  if (!e.target.closest('.search-box')) els.searchResults.innerHTML = '';
});

async function search(q) {
  if (!els.tmdbToken.value.trim()) {
    setStatus(els.searchStatus, 'Сначала укажите токен TMDb (раздел 1).', true);
    return;
  }
  lastQuery = q;
  try {
    const data = await tmdbFetch('/search/multi', { query: q, include_adult: 'false' });
    if (q !== lastQuery) return; // пришёл устаревший ответ — игнорируем
    const results = (data.results || [])
      .filter(r => r.media_type === 'movie' || r.media_type === 'tv')
      .slice(0, 10);
    if (!results.length) {
      els.searchResults.innerHTML = '';
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

// --- Выбор из списка: детали TMDb + рейтинг IMDb из OMDb ---
async function pick(r) {
  els.searchResults.innerHTML = '';
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

    // Аниме определяем по жанру Animation (16) + языку — предзаполняем тип
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

    // Серия фильмов (коллекция TMDb) — «запекаем» список частей в запись,
    // чтобы публичный сайт мог показать ветку франшизы без запросов к API
    if (isMovie && details.belongs_to_collection) {
      try {
        const col = await tmdbFetch('/collection/' + details.belongs_to_collection.id);
        const parts = (col.parts || [])
          .filter(p => p.release_date)  // только вышедшие
          .sort((a, b) => a.release_date.localeCompare(b.release_date))
          .map(p => ({ tmdbId: p.id, title: p.title, year: Number(p.release_date.slice(0, 4)) || null }));
        if (parts.length > 1) current.collection = { id: col.id, name: col.name, parts };
      } catch (_) { /* коллекция недоступна — просто без неё */ }
    }

    setStatus(els.searchStatus,
      imdbRating === null && omdbKey ? 'Готово (рейтинг IMDb получить не удалось).' :
      !omdbKey ? 'Готово. Без ключа OMDb рейтинг IMDb не подтянут.' : '');
    renderSelected();
  } catch (err) {
    setStatus(els.searchStatus, 'Ошибка: ' + err.message, true);
  }
}

function renderSelected() {
  els.selPoster.src = current.poster;
  els.selTitle.textContent = current.title;
  els.selMeta.textContent = [current.originalTitle, current.year].filter(Boolean).join(' · ');
  els.selBadges.innerHTML =
    current.imdbRating ? `<span class="badge badge-imdb">IMDb ${current.imdbRating}</span>` : '';
  els.selDesc.textContent = current.description;
  els.myRating.value = '';
  els.myComment.value = '';
  els.myStatus.value = 'watched';
  els.jsonOutput.hidden = true;
  setStatus(els.resultStatus, '');
  els.selected.hidden = false;
  els.selected.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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

// --- Кнопка «Добавить в фильмотеку» (запись в data.json через GitHub API) ---
async function addToRepo() {
  if (!els.ghToken.value.trim()) { setStatus(els.resultStatus, 'Укажите GitHub-токен в разделе 1.', true); return; }
  if (!els.ghOwner.value.trim() || !els.ghRepo.value.trim()) { setStatus(els.resultStatus, 'Укажите владельца и репозиторий в разделе 1.', true); return; }

  const entry = buildEntry();

  setStatus(els.resultStatus, 'Сохраняю в GitHub…');
  try {
    // 1. Текущее содержимое data.json (нужен sha для обновления)
    const { data, sha } = await GH.loadData();

    // 2. Добавляем (или заменяем, если такой id уже есть)
    const idx = data.findIndex(i => i.id === entry.id);
    let replaced = false;
    if (idx >= 0) { data[idx] = entry; replaced = true; } else { data.unshift(entry); }

    // 3. Коммитим обновлённый файл
    await GH.saveData(data, sha, `${replaced ? 'Обновлён' : 'Добавлен'}: ${entry.title}`);

    setStatus(els.resultStatus,
      `✓ «${entry.title}» ${replaced ? 'обновлён' : 'добавлен'}! Сайт обновится через минуту.`);
    // Готовим форму к следующему добавлению
    els.searchInput.value = '';
    els.searchInput.focus();
    setTimeout(() => { els.selected.hidden = true; current = null; }, 1500);
  } catch (err) {
    setStatus(els.resultStatus, 'Ошибка: ' + err.message, true);
  }
}
els.addBtn.addEventListener('click', addToRepo);

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
    setStatus(els.resultStatus, 'Скопируйте запись из поля внизу страницы вручную.');
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

// --- Режим редактирования: admin.html?edit=<id> (переход со страницы фильма) ---
(async function initEditMode() {
  const editId = new URLSearchParams(location.search).get('edit');
  if (!editId) return;
  try {
    const data = await (await fetch('data.json?nocache=' + Date.now())).json();
    const item = data.find(i => i.id === editId);
    if (!item) {
      setStatus(els.searchStatus, 'Запись не найдена: ' + editId, true);
      return;
    }
    current = item;
    renderSelected();
    // Предзаполняем мои поля сохранёнными значениями (renderSelected их очищает)
    els.myRating.value = item.myRating ?? '';
    els.myComment.value = item.myComment || '';
    els.myStatus.value = item.status || 'watched';
    els.myType.value = item.type || 'film';
    setStatus(els.searchStatus, `Режим редактирования: «${item.title}». Измените поля и нажмите «Добавить» — запись обновится.`);
  } catch (err) {
    setStatus(els.searchStatus, 'Ошибка загрузки записи: ' + err.message, true);
  }
})();
