// Страница произведения: читает id из query-параметра и рисует детали.
// Для администратора (выполнен вход в админке) — панель управления:
// чекбокс «Сейчас смотрю», кнопки «Редактировать» и «Удалить».
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

// Ветка серии фильмов (если запись содержит коллекцию TMDb)
function collectionHtml(item, items) {
  const col = item.collection;
  if (!col || !Array.isArray(col.parts) || col.parts.length < 2) return '';
  const rows = col.parts.map((p, i) => {
    const inLib = items.find(x => x.tmdbId === p.tmdbId);
    const isCurrent = p.tmdbId === item.tmdbId;
    const label = `${i + 1}. ${escapeHtml(p.title)}${p.year ? ' (' + p.year + ')' : ''}`;
    if (inLib) {
      const badge = inLib.status === 'watching'
        ? '<span class="badge badge-watching">Смотрю</span>'
        : (inLib.myRating ? `<span class="badge badge-my">Моя ${inLib.myRating}</span>` : '<span class="badge badge-my">✓</span>');
      const here = isCurrent ? ' <span class="col-here">— вы здесь</span>' : '';
      return `<a class="col-part${isCurrent ? ' current' : ''}" href="film.html?id=${encodeURIComponent(inLib.id)}">${label} ${badge}${here}</a>`;
    }
    return `<div class="col-part missing">${label} <span class="badge badge-missing">не просмотрено</span></div>`;
  }).join('');
  return `<div class="film-collection"><h3>🎞 Серия: ${escapeHtml(col.name)}</h3>${rows}</div>`;
}

// Сетка сезонов (для сериалов и аниме)
function seasonsHtml(item) {
  const ss = item.seasons;
  if (!Array.isArray(ss) || !ss.length) return '';
  const cards = ss.map(s => {
    const defaultName = 'Сезон ' + s.seasonNumber;
    const extraName = s.name && s.name !== defaultName
      ? `<div class="season-name">${escapeHtml(s.name)}</div>` : '';
    const meta = [s.year, s.episodes ? s.episodes + ' сер.' : null].filter(Boolean).join(' · ');
    return `<div class="season-card">
      <div class="season-num">${defaultName}</div>
      ${extraName}
      <div class="season-meta">${meta}</div>
    </div>`;
  }).join('');
  return `<div class="film-collection"><h3>📺 Сезоны: ${ss.length}</h3><div class="seasons-grid">${cards}</div></div>`;
}

// Панель администратора — только при активном входе (сессия Supabase)
function adminPanelHtml(item, isAdmin) {
  if (!isAdmin) return '';
  return `
    <div class="admin-panel">
      <label class="admin-check">
        <input type="checkbox" id="watching-toggle" ${item.status === 'watching' ? 'checked' : ''}>
        Сейчас смотрю
      </label>
      <div class="admin-actions">
        <a class="btn-mini" href="admin.html?edit=${encodeURIComponent(item.id)}">✏ Редактировать</a>
        <button class="btn-mini danger" id="delete-btn">🗑 Удалить</button>
      </div>
      <div id="admin-status" class="admin-status" hidden></div>
    </div>`;
}

function setAdminStatus(msg, isError = false) {
  const el = document.getElementById('admin-status');
  if (!el) return;
  el.hidden = !msg;
  el.textContent = msg || '';
  el.classList.toggle('error', isError);
}

function wireAdminPanel(item) {
  const toggle = document.getElementById('watching-toggle');
  const delBtn = document.getElementById('delete-btn');
  if (!toggle) return;

  // Чекбокс «Сейчас смотрю» — мгновенно сохраняет статус в базе.
  // Активным может быть только один фильм: при включении статус
  // снимается со всех остальных записей автоматически.
  toggle.addEventListener('change', async () => {
    const newStatus = toggle.checked ? 'watching' : 'watched';
    toggle.disabled = true;
    setAdminStatus('Сохраняю…');
    try {
      if (newStatus === 'watching') await DB.clearWatchingExcept(item.id);
      item.status = newStatus;
      await DB.upsert(item);
      setAdminStatus(newStatus === 'watching'
        ? '✓ Статус: «Сейчас смотрю» — с предыдущего фильма снят.'
        : `✓ Статус: «${STATUS_LABELS[newStatus]}»`);
    } catch (err) {
      item.status = newStatus === 'watching' ? 'watched' : 'watching';
      toggle.checked = !toggle.checked; // откатываем визуально
      setAdminStatus('Ошибка: ' + err.message, true);
    }
    toggle.disabled = false;
  });

  // Удаление записи (с подтверждением)
  delBtn.addEventListener('click', async () => {
    if (!confirm(`Удалить «${item.title}» из фильмотеки?`)) return;
    delBtn.disabled = true;
    setAdminStatus('Удаляю…');
    try {
      await DB.remove(item.id);
      setAdminStatus('✓ Удалено. Возвращаю на главную…');
      setTimeout(() => { location.href = 'index.html'; }, 1200);
    } catch (err) {
      setAdminStatus('Ошибка: ' + err.message, true);
      delBtn.disabled = false;
    }
  });
}

async function init() {
  const el = document.getElementById('film');
  const id = new URLSearchParams(location.search).get('id');
  let items = [];
  try {
    items = await DB.loadAll();
  } catch (e) {
    el.innerHTML = '<p class="empty-msg">Не удалось загрузить каталог: ' + escapeHtml(e.message) + '</p>';
    return;
  }
  const item = items.find(i => i.id === id);
  if (!item) {
    el.innerHTML = '<p class="empty-msg">Произведение не найдено</p>';
    return;
  }

  const isAdmin = await DB.isAdmin();

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
        ${item.status === 'watching' ? '<span class="badge badge-watching">Смотрю</span>' : ''}
      </div>
      <p class="film-desc">${escapeHtml(item.description || '')}</p>
      ${item.myComment ? `<div class="film-comment"><b>Мой комментарий:</b><br>${escapeHtml(item.myComment)}</div>` : ''}
      ${collectionHtml(item, items)}
      ${seasonsHtml(item)}
      ${item.imdbId ? `<div class="film-links"><a href="https://www.imdb.com/title/${encodeURIComponent(item.imdbId)}/" target="_blank" rel="noopener">Страница на IMDb ↗</a></div>` : ''}
      ${adminPanelHtml(item, isAdmin)}
    </div>`;

  wireAdminPanel(item);
}

init();
