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
  selExtras: document.getElementById('sel-extras'),
  selDesc: document.getElementById('sel-desc'),
  myRating: document.getElementById('my-rating'),
  myStatus: document.getElementById('my-status'),
  myPlanned: document.getElementById('my-planned'),
  myType: document.getElementById('my-type'),
  myComment: document.getElementById('my-comment'),
  copyBtn: document.getElementById('copy-json-btn'),
  downloadBtn: document.getElementById('download-btn'),
  addBtn: document.getElementById('add-btn'),
  resultStatus: document.getElementById('result-status'),
  jsonOutput: document.getElementById('json-output'),
  authForm: document.getElementById('auth-form'),
  authSession: document.getElementById('auth-session'),
  authEmail: document.getElementById('auth-email'),
  authPassword: document.getElementById('auth-password'),
  authUser: document.getElementById('auth-user'),
  authStatus: document.getElementById('auth-status'),
  loginBtn: document.getElementById('login-btn'),
  logoutBtn: document.getElementById('logout-btn')
};

let current = null;      // выбранное произведение (заготовка записи)
let searchTimer = null;  // дебаунс живого поиска
let lastQuery = '';

// --- Токены: сохраняем/восстанавливаем ---
els.tmdbToken.value = localStorage.getItem('tmdbToken') || '';
els.omdbToken.value = localStorage.getItem('omdbToken') || '';
els.tmdbToken.addEventListener('change', () => localStorage.setItem('tmdbToken', els.tmdbToken.value.trim()));
els.omdbToken.addEventListener('change', () => localStorage.setItem('omdbToken', els.omdbToken.value.trim()));

// --- Вход администратора (Supabase Auth) ---
async function refreshAuthUi() {
  const email = await DB.adminEmail();
  els.authForm.hidden = !!email;
  els.authSession.hidden = !email;
  if (email) els.authUser.textContent = '✓ Вы вошли как ' + email;
}

els.loginBtn.addEventListener('click', async () => {
  const email = els.authEmail.value.trim();
  const password = els.authPassword.value;
  if (!email || !password) {
    setStatus(els.authStatus, 'Введите email и пароль.', true);
    return;
  }
  setStatus(els.authStatus, 'Вхожу…');
  try {
    await DB.signIn(email, password);
    setStatus(els.authStatus, '');
    els.authPassword.value = '';
    refreshAuthUi();
  } catch (err) {
    setStatus(els.authStatus, 'Ошибка входа: ' + err.message, true);
  }
});
els.authPassword.addEventListener('keydown', e => { if (e.key === 'Enter') els.loginBtn.click(); });

els.logoutBtn.addEventListener('click', async () => {
  await DB.signOut();
  refreshAuthUi();
});

refreshAuthUi();

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

function slugCore(s) {
  return String(s || '').toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '');
}

// id записи: из оригинального названия; если оно не латиница/кириллица
// (например, японское) — из русского названия; в крайнем случае из tmdbId
function makeId(originalTitle, title, year, tmdbId) {
  const core = slugCore(originalTitle) || slugCore(title) || ('tmdb-' + tmdbId);
  return year ? `${core}-${year}` : core;
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

// Дополнительные данные: коллекция (для фильмов) или сезоны (для сериалов/аниме)
async function enrichExtras(entry, details, isMovie) {
  if (isMovie) {
    if (!details.belongs_to_collection) return;
    try {
      const col = await tmdbFetch('/collection/' + details.belongs_to_collection.id);
      const parts = (col.parts || [])
        .filter(p => p.release_date)  // только вышедшие
        .sort((a, b) => a.release_date.localeCompare(b.release_date))
        .map(p => ({ tmdbId: p.id, title: p.title, year: Number(p.release_date.slice(0, 4)) || null }));
      if (parts.length > 1) entry.collection = { id: col.id, name: col.name, parts };
    } catch (_) { /* коллекция недоступна — просто без неё */ }
  } else {
    const seasons = (details.seasons || [])
      .filter(s => s.season_number > 0)  // спецвыпуски (сезон 0) не показываем
      .map(s => ({
        seasonNumber: s.season_number,
        name: s.name || ('Сезон ' + s.season_number),
        year: s.air_date ? Number(s.air_date.slice(0, 4)) : null,
        episodes: s.episode_count || null
      }));
    if (seasons.length) entry.seasons = seasons;
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
      id: makeId(originalTitle, title, year, details.id),
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

    // Серия фильмов / сезоны сериала — «запекаем» в запись,
    // чтобы публичный сайт показывал их без запросов к API
    await enrichExtras(current, details, isMovie);

    setStatus(els.searchStatus,
      imdbRating === null && omdbKey ? 'Готово (рейтинг IMDb получить не удалось).' :
      !omdbKey ? 'Готово. Без ключа OMDb рейтинг IMDb не подтянут.' : '');
    renderSelected();
  } catch (err) {
    setStatus(els.searchStatus, 'Ошибка: ' + err.message, true);
  }
}

// Строка о подтянутых сезонах/серии — чтобы было видно, что данные на месте
function extrasText(entry) {
  if (entry.seasons && entry.seasons.length) return `📺 Сезонов: ${entry.seasons.length} — будут показаны на странице`;
  if (entry.collection && entry.collection.parts) return `🎞 Серия: ${entry.collection.name} (${entry.collection.parts.length} ч.)`;
  return '';
}

function renderSelected() {
  els.selPoster.src = current.poster;
  els.selTitle.textContent = current.title;
  els.selMeta.textContent = [current.originalTitle, current.year].filter(Boolean).join(' · ');
  els.selBadges.innerHTML =
    current.imdbRating ? `<span class="badge badge-imdb">IMDb ${current.imdbRating}</span>` : '';
  els.selExtras.textContent = extrasText(current);
  els.selDesc.textContent = current.description;
  els.myRating.value = '';
  els.myComment.value = '';
  els.myStatus.value = 'watched';
  els.myPlanned.checked = false;
  els.myStatus.disabled = false;
  els.jsonOutput.hidden = true;
  setStatus(els.resultStatus, '');
  els.selected.hidden = false;
  els.selected.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function buildEntry() {
  // Оценка строго в пределах 0–10
  const rating = els.myRating.value
    ? Math.max(0, Math.min(10, Number(els.myRating.value)))
    : null;
  return {
    ...current,
    type: els.myType.value,
    myRating: Number.isNaN(rating) ? null : rating,
    myComment: els.myComment.value.trim(),
    status: els.myPlanned.checked ? 'planned' : els.myStatus.value
  };
}

// «Буду смотреть» — отдельный статус: пока отмечено, обычный статус не действует
els.myPlanned.addEventListener('change', () => {
  els.myStatus.disabled = els.myPlanned.checked;
});

// --- Кнопка «Добавить в фильмотеку» (запись в базу, мгновенно) ---
async function addToDb() {
  if (!(await DB.isAdmin())) {
    setStatus(els.resultStatus, 'Сначала войдите (раздел 1) — без входа база не примет запись.', true);
    return;
  }
  const entry = buildEntry();
  setStatus(els.resultStatus, 'Сохраняю…');
  try {
    // Защита от дублей: если это произведение уже есть в базе (по tmdbId),
    // обновляем существующую запись, а не создаём вторую
    if (entry.tmdbId) {
      const existing = (await DB.loadAll())
        .find(i => i.tmdbId === entry.tmdbId && i.id !== entry.id);
      if (existing) entry.id = existing.id;
    }
    // «Сейчас смотрю» может быть только у одного фильма
    if (entry.status === 'watching') await DB.clearWatchingExcept(entry.id);
    await DB.upsert(entry);
    setStatus(els.resultStatus, `✓ «${entry.title}» сохранён — уже на сайте!`);
    // Готовим форму к следующему добавлению
    els.searchInput.value = '';
    els.searchInput.focus();
    setTimeout(() => { els.selected.hidden = true; current = null; }, 1500);
  } catch (err) {
    setStatus(els.resultStatus, 'Ошибка: ' + err.message, true);
  }
}
els.addBtn.addEventListener('click', addToDb);

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

// --- Кнопка «Скачать резервную копию» (весь каталог из базы в data.json) ---
els.downloadBtn.addEventListener('click', async () => {
  try {
    const data = await DB.loadAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'data.json';
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus(els.resultStatus, 'Резервная копия каталога скачана.');
  } catch (err) {
    setStatus(els.resultStatus, 'Ошибка: ' + err.message, true);
  }
});

// --- Режим редактирования: admin.html?edit=<id> (переход со страницы фильма) ---
(async function initEditMode() {
  const editId = new URLSearchParams(location.search).get('edit');
  if (!editId) return;
  try {
    const data = await DB.loadAll();
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
    els.myPlanned.checked = item.status === 'planned';
    els.myStatus.disabled = els.myPlanned.checked;
    els.myStatus.value = item.status === 'planned' ? 'watched' : (item.status || 'watched');
    els.myType.value = item.type || 'film';
    setStatus(els.searchStatus, `Режим редактирования: «${item.title}». Измените поля и нажмите «Добавить» — запись обновится.`);

    // Освежаем серию/сезоны из TMDb (если задан токен) — так у старых записей
    // появляются сезоны и новые части серий после простого «Редактировать → Добавить»
    if (els.tmdbToken.value.trim() && item.tmdbId) {
      try {
        const isMovie = item.type === 'film';
        const details = await tmdbFetch(`/${isMovie ? 'movie' : 'tv'}/${item.tmdbId}`);
        await enrichExtras(current, details, isMovie);
        els.selExtras.textContent = extrasText(current);
        setStatus(els.searchStatus, `Режим редактирования: «${item.title}». Сезоны/серия обновлены из TMDb — нажмите «Добавить», чтобы сохранить.`);
      } catch (_) { /* не критично — сохранится без обновления */ }
    }
  } catch (err) {
    setStatus(els.searchStatus, 'Ошибка загрузки записи: ' + err.message, true);
  }
})();
