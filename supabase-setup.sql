-- Настройка базы «Моя фильмотека» в Supabase.
-- Выполнить один раз: Supabase Dashboard → SQL Editor → New query → вставить → Run.

-- 1. Таблица каталога
create table if not exists public.films (
  id text primary key,
  title text not null,
  original_title text,
  type text not null default 'film',
  year int,
  poster text,
  imdb_rating numeric,
  my_rating numeric,
  description text,
  my_comment text,
  status text not null default 'watched',
  date_added date not null default current_date,
  imdb_id text,
  tmdb_id bigint,
  collection jsonb
);

-- 2. Права: читать могут все (публичный сайт), писать — только вошедший админ
alter table public.films enable row level security;

drop policy if exists "public read" on public.films;
create policy "public read" on public.films
  for select using (true);

drop policy if exists "admin insert" on public.films;
create policy "admin insert" on public.films
  for insert to authenticated with check (true);

drop policy if exists "admin update" on public.films;
create policy "admin update" on public.films
  for update to authenticated using (true) with check (true);

drop policy if exists "admin delete" on public.films;
create policy "admin delete" on public.films
  for delete to authenticated using (true);

-- 3. Перенос текущего каталога (4 записи из data.json)
insert into public.films
  (id, title, original_title, type, year, poster, imdb_rating, my_rating, description, my_comment, status, date_added, imdb_id, tmdb_id, collection)
values
(
  'dune-2021', 'Дюна', 'Dune', 'film', 2021,
  'https://image.tmdb.org/t/p/w500/3hbXNclcHaj5KiF6kK41GBMjyFr.jpg',
  8, 9,
  $$Наследник знаменитого дома Атрейдесов Пол отправляется вместе с семьей на одну из самых опасных планет во Вселенной — Арракис. Здесь нет ничего, кроме песка, палящего солнца, гигантских чудовищ и основной причины межгалактических конфликтов — невероятно ценного ресурса, который называется меланж. В результате захвата власти Пол вынужден бежать и скрываться, и это становится началом его эпического путешествия. Враждебный мир Арракиса приготовил для него множество тяжелых испытаний, но только тот, кто готов взглянуть в глаза своему страху, достоин стать избранным.$$,
  'ЖОПЕС', 'watched', '2026-07-06', 'tt1160419', 438631,
  '{"id":726871,"name":"Дюна (коллекция)","parts":[{"tmdbId":438631,"title":"Дюна","year":2021},{"tmdbId":693134,"title":"Дюна: Часть вторая","year":2024}]}'::jsonb
),
(
  'inception-2010', 'Начало', 'Inception', 'film', 2010,
  'https://image.tmdb.org/t/p/w500/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg',
  8.8, 9.5,
  $$Кобб — талантливый вор, лучший из лучших в опасном искусстве извлечения: он крадёт ценные секреты из глубин подсознания во время сна. Но теперь ему предстоит обратная задача — не украсть идею, а внедрить её.$$,
  'Смотрел трижды, финал до сих пор спорный.', 'watched', '2026-06-30', 'tt1375666', 27205, null
),
(
  'breaking-bad-2008', 'Во все тяжкие', 'Breaking Bad', 'series', 2008,
  'https://image.tmdb.org/t/p/w500/ggFHVNu6YYI5L9pCfOacjizRGt.jpg',
  9.5, 10,
  $$Школьный учитель химии Уолтер Уайт узнаёт, что болен раком лёгких. Чтобы обеспечить семью, он начинает варить метамфетамин — и постепенно превращается из тихого семьянина в короля преступного мира.$$,
  'Лучший сериал, что я видел. Пересмотрю ещё не раз.', 'watched', '2026-07-02', 'tt0903747', 1396, null
),
(
  'attack-on-titan-2013', 'Атака титанов', 'Shingeki no Kyojin', 'anime', 2013,
  'https://image.tmdb.org/t/p/w500/hTP1DtLGFamjfu8WqjnuQdP1n4i.jpg',
  9.1, 8.5,
  $$Человечество укрылось за гигантскими стенами от титанов — огромных существ, пожирающих людей. Когда стена рушится, юный Эрен Йегер клянётся уничтожить их всех до единого.$$,
  'Начало мощное, смотрю дальше.', 'watching', '2026-07-05', 'tt2560140', 1429, null
)
on conflict (id) do nothing;
