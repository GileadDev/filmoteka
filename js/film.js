// Страница произведения: читает id из query-параметра и рисует детали.
// Для администратора (есть GitHub-токен в localStorage) — панель управления:
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

// Панель администратора — только при наличии GitHub-токена в этом браузере
function adminPanelHtml(item) {
  if (!GH.isAdmin()) return '';
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

  // Чекбокс «Сейчас смотрю» — переключает статус записи в data.json
  toggle.addEventListener('change', async () => {
    const newStatus = toggle.checked ? 'watching' : 'watched';
    toggle.disabled = true;
    setAdminStatus('Сохраняю статус…');
    try {
      const { data, sha } = await GH.loadData();
      const rec = data.find(i => i.id === item.id);
      if (!rec) throw new Error('запись не найдена в data.json');
      rec.status = newStatus;
      await GH.saveData(data, sha, `Обновлён: ${item.title} (статус: ${newStatus})`);
      item.status = newStatus;
      setAdminStatus(`✓ Статус: «${STATUS_LABELS[newStatus]}». Сайт обновится через минуту.`);
    } catch (err) {
      toggle.checked = !toggle.checked; // откатываем визуально
      setAdminStatus('Ошибка: ' + err.message, true);
    }
    toggle.disabled = false;
  });

  // Удаление записи из data.json (с подтверждением)
  delBtn.addEventListener('click', async () => {
    if (!confirm(`Удалить «${item.title}» из фильмотеки?`)) return;
    delBtn.disabled = true;
    setAdminStatus('Удаляю…');
    try {
      const { data, sha } = await GH.loadData();
      const rest = data.filter(i => i.id !== item.id);
      if (rest.length === data.length) throw new Error('запись не найдена в data.json');
      await GH.saveData(rest, sha, `Удалён: ${item.title}`);
      setAdminStatus('✓ Удалено. Возвращаю на главную…');
      setTimeout(() => { location.href = 'index.html'; }, 1500);
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
        ${item.status === 'watching' ? '<span class="badge badge-watching">Смотрю</span>' : ''}
      </div>
      <p class="film-desc">${escapeHtml(item.description || '')}</p>
      ${item.myComment ? `<div class="film-comment"><b>Мой комментарий:</b><br>${escapeHtml(item.myComment)}</div>` : ''}
      ${collectionHtml(item, items)}
      ${item.imdbId ? `<div class="film-links"><a href="https://www.imdb.com/title/${encodeURIComponent(item.imdbId)}/" target="_blank" rel="noopener">Страница на IMDb ↗</a></div>` : ''}
      ${adminPanelHtml(item)}
    </div>`;

  wireAdminPanel(item);
}

init();
