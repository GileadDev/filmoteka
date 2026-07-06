// Работа с базой Supabase: чтение каталога и добавление/обновление/удаление.
// SUPABASE_URL и anon-ключ ПУБЛИЧНЫ по дизайну — их можно спокойно коммитить:
// право записи защищено RLS-политиками на стороне базы, писать может только
// вошедший администратор. Посетители могут только читать.
const SUPABASE_URL = 'https://gbafmduojewtdfenmcex.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_95BW467GBZbQs--j2G4-zw_b9WFkh82';

const DB = (() => {
  const CONFIGURED = !SUPABASE_URL.startsWith('__');
  const client = CONFIGURED ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

  function requireConfig() {
    if (!CONFIGURED) throw new Error('база ещё не настроена (js/db.js)');
  }

  // Строка базы (snake_case) -> объект приложения (camelCase)
  function rowToItem(r) {
    return {
      id: r.id,
      title: r.title,
      originalTitle: r.original_title,
      type: r.type,
      year: r.year,
      poster: r.poster,
      imdbRating: r.imdb_rating === null ? null : Number(r.imdb_rating),
      myRating: r.my_rating === null ? null : Number(r.my_rating),
      description: r.description,
      myComment: r.my_comment,
      status: r.status,
      dateAdded: r.date_added,
      imdbId: r.imdb_id,
      tmdbId: r.tmdb_id,
      collection: r.collection
    };
  }

  function itemToRow(i) {
    return {
      id: i.id,
      title: i.title,
      original_title: i.originalTitle || null,
      type: i.type,
      year: i.year || null,
      poster: i.poster || null,
      imdb_rating: i.imdbRating ?? null,
      my_rating: i.myRating ?? null,
      description: i.description || null,
      my_comment: i.myComment || null,
      status: i.status,
      date_added: i.dateAdded,
      imdb_id: i.imdbId || null,
      tmdb_id: i.tmdbId || null,
      collection: i.collection || null
    };
  }

  // Весь каталог (новые сверху)
  async function loadAll() {
    requireConfig();
    const { data, error } = await client.from('films')
      .select('*')
      .order('date_added', { ascending: false })
      .order('title', { ascending: true });
    if (error) throw new Error('база: ' + error.message);
    return (data || []).map(rowToItem);
  }

  // Добавить или обновить запись (по id)
  async function upsert(item) {
    requireConfig();
    const { error } = await client.from('films').upsert(itemToRow(item));
    if (error) throw new Error('сохранение: ' + error.message);
  }

  // Удалить запись
  async function remove(id) {
    requireConfig();
    const { error } = await client.from('films').delete().eq('id', id);
    if (error) throw new Error('удаление: ' + error.message);
  }

  // «Сейчас смотрю» может быть только у одного фильма:
  // снимает статус watching со всех записей, кроме указанной
  async function clearWatchingExcept(id) {
    requireConfig();
    const { error } = await client.from('films')
      .update({ status: 'watched' })
      .eq('status', 'watching')
      .neq('id', id);
    if (error) throw new Error('смена статуса: ' + error.message);
  }

  // --- Авторизация администратора ---
  async function signIn(email, password) {
    requireConfig();
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }

  async function signOut() {
    if (client) await client.auth.signOut();
  }

  async function isAdmin() {
    if (!client) return false;
    const { data } = await client.auth.getSession();
    return !!(data && data.session);
  }

  async function adminEmail() {
    if (!client) return null;
    const { data } = await client.auth.getSession();
    return data && data.session ? data.session.user.email : null;
  }

  return { loadAll, upsert, remove, clearWatchingExcept, signIn, signOut, isAdmin, adminEmail };
})();
