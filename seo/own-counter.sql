-- ─────────────────────────────────────────────────────────────────────
-- Свой счётчик сайта: таблица событий в Supabase.
-- Выполнить один раз в SQL Editor проекта, затем вписать URL и anon-ключ
-- в ~/.claude/secrets/site-analytics.env и пересобрать сайт.
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.site_events (
  id           bigserial primary key,
  created_at   timestamptz not null default now(),
  event        text not null,
  path         text,
  page_type    text,
  title        text,
  referrer     text,
  visitor_id   text,
  session_id   text,
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  utm_content  text,
  screen_w     int,
  params       jsonb
);

create index if not exists site_events_created_idx on public.site_events (created_at desc);
create index if not exists site_events_path_idx    on public.site_events (path);
create index if not exists site_events_event_idx   on public.site_events (event);

alter table public.site_events enable row level security;

-- Страница может ТОЛЬКО добавлять события. Читать их анонимно нельзя —
-- иначе публичный ключ отдал бы всю статистику любому желающему.
drop policy if exists "site can insert events" on public.site_events;
create policy "site can insert events"
  on public.site_events for insert to anon
  with check (true);

-- Сводка по дням: сколько визитов, читателей, кликов в Telegram.
create or replace view public.site_daily as
select
  date_trunc('day', created_at)                                   as day,
  count(*) filter (where event = 'pageview')                      as pageviews,
  count(distinct visitor_id)                                      as visitors,
  count(*) filter (where event = 'read_complete')                 as read_complete,
  count(*) filter (where event = 'tg_click')                      as tg_clicks,
  round(100.0 * count(*) filter (where event = 'tg_click')
        / nullif(count(*) filter (where event = 'pageview'), 0), 2) as tg_ctr
from public.site_events
group by 1
order by 1 desc;

-- Какие статьи реально дочитывают и с каких уходят в канал.
create or replace view public.site_pages as
select
  path,
  count(*) filter (where event = 'pageview')      as pageviews,
  count(*) filter (where event = 'scroll_75')     as scroll_75,
  count(*) filter (where event = 'read_complete') as read_complete,
  count(*) filter (where event = 'tg_click')      as tg_clicks
from public.site_events
where path is not null
group by 1
order by 2 desc;
