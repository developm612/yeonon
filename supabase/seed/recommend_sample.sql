-- =====================================================================
-- AI 추천 테스트용 샘플 데이터 (마이그레이션과 별개)
-- 마이그레이션 1~9번을 모두 실행한 뒤 Supabase SQL Editor에서 실행한다. 다시 실행하면 지우고 새로 만든다.
--
-- 만드는 것 (모두 is_sample = true):
--   · 샘플 지기 1명 (로그인할 수 없는 계정 — auth.users에 비밀번호·Google 연결 없음)
--   · 테마가 다른 공개 루트 12개 + 정류장
--   · 매일 10:00–21:00 가능 시간(오늘부터 14일) → 앞으로 2주 슬롯
-- 임베딩은 여기서 만들지 않는다. 실행 후 /admin/recommendations에서 [임베딩 백필]을 누른다(키가 있을 때).
--
-- ⚠ 공개 루트라서 /routes와 추천 결과에 실제로 보인다. 실제 운영 DB에서는 테스트가 끝나면
--   supabase/seed/recommend_sample_cleanup.sql 로 바로 지운다.
-- =====================================================================

begin;

-- 다시 실행할 때: 이전 샘플을 지운다 (계정을 지우면 프로필·지기 프로필·루트·정류장·가능 시간·슬롯이 함께 지워진다)
delete from auth.users where id in (select id from public.profiles where is_sample);
delete from auth.users where id = '5a3b1e00-0000-4000-8000-000000000001';

-- 1. 샘플 지기 계정 (가입 트리거가 profiles 행을 만든다)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values (
  '00000000-0000-0000-0000-000000000000', '5a3b1e00-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'sample-jigi@yeonon.invalid', '', now(),
  '{"provider": "sample", "providers": [], "is_sample": true}', '{"full_name": "Sample Jigi"}', now(), now(),
  '', '', '', ''
);

update public.profiles
   set role = 'jigi', display_name = '샘플지기', locale = 'ko', languages = '{English,Korean,Japanese}',
       terms_agreed_at = now(), privacy_agreed_at = now(), adult_confirmed_at = now(), is_sample = true
 where id = '5a3b1e00-0000-4000-8000-000000000001';

insert into public.jigi_profiles (user_id, headline, bio, languages, confirm_mode, is_active, is_sample)
values (
  '5a3b1e00-0000-4000-8000-000000000001',
  'Seongsu local for 10 years',
  'Sample profile for testing recommendations.',
  '{English,Korean,Japanese}', 'manual', true, true
);

-- 2. 공개 루트 12개
insert into public.routes (
  id, jigi_id, title, summary, tags, vibe, duration_minutes, meeting_point_note, area,
  max_party_size, languages, list_price, status, submitted_at, published_at, is_sample
)
select r.id::uuid, '5a3b1e00-0000-4000-8000-000000000001', r.title, r.summary, r.tags::text[], r.vibe, r.duration,
       r.meeting, r.area, r.party, r.langs::text[], r.price, 'published', now(), now(), true
from (values
  ('5a3b1e00-0000-4000-8000-000000000101', 'Hidden cafés of Seongsu', 'Three quiet coffee bars locals love, from a tiny roastery to a rooftop with a view.',
   '{cafe,bakery,healing}', 'slow', 180, 'Seongsu Station exit 3', 'seongsu2', 4, '{English,Korean}', 45000),
  ('5a3b1e00-0000-4000-8000-000000000102', 'Vintage & thrift hunt', 'Dig through second-hand racks and indie vintage shops tucked behind the shoe factories.',
   '{vintage,fashion,design}', 'active', 180, 'Seongsu Station exit 4', 'seongsu2', 3, '{English,Korean,Japanese}', 45000),
  ('5a3b1e00-0000-4000-8000-000000000103', 'Pop-up store sprint', 'Catch this week''s brand pop-ups in Seongsu and skip the longest lines with a local plan.',
   '{popup,fashion,beauty}', 'active', 150, 'Seongsu Station exit 2', 'seongsu1', 4, '{English,Korean,Chinese}', 40000),
  ('5a3b1e00-0000-4000-8000-000000000104', 'Seongsu local eats', 'Hearty Korean lunch spots and a market snack crawl where neighbors actually eat.',
   '{korean-food,street-food,market}', 'active', 180, 'Ttukseom Station exit 1', 'ttukseom', 4, '{English,Korean}', 50000),
  ('5a3b1e00-0000-4000-8000-000000000105', 'Seoul Forest slow walk', 'An easy walk through Seoul Forest, the deer park and a quiet tea stop by the trees.',
   '{healing,river,photo}', 'slow', 120, 'Seoul Forest Station exit 3', 'seoul-forest', 6, '{English,Korean,Japanese}', 30000),
  ('5a3b1e00-0000-4000-8000-000000000106', 'Photo walk: red brick lanes', 'Shoot the red brick warehouses, murals and golden-hour alleys with tips on angles.',
   '{photo,art,design}', 'slow', 150, 'Seongsu Station exit 1', 'seongsu1', 3, '{English,Korean}', 40000),
  ('5a3b1e00-0000-4000-8000-000000000107', 'Craft workshop afternoon', 'Make your own leather keyring and try a small pottery class in a local studio.',
   '{workshop,design,art}', 'slow', 210, 'Seongsu Station exit 3', 'seongsu2', 2, '{English,Korean}', 60000),
  ('5a3b1e00-0000-4000-8000-000000000108', 'Night views by the Han', 'Sunset at Ttukseom, city lights on the river and a late snack on the way back.',
   '{night-view,river,street-food}', 'slow', 150, 'Ttukseom Resort Station exit 2', 'ttukseom', 5, '{English,Korean,Chinese}', 40000),
  ('5a3b1e00-0000-4000-8000-000000000109', 'Bakery hopping', 'Four bakeries in one afternoon: salt bread, croissants and a famous cream bun.',
   '{bakery,cafe,korean-food}', 'active', 150, 'Seongsu Station exit 4', 'seongsu2', 4, '{English,Korean,Japanese}', 35000),
  ('5a3b1e00-0000-4000-8000-000000000110', 'Galleries & design shops', 'Small free galleries, a design bookstore and a stationery shop with local brands.',
   '{art,design,cafe}', 'slow', 180, 'Seongsu Station exit 1', 'seongsu1', 4, '{English,Korean}', 45000),
  ('5a3b1e00-0000-4000-8000-000000000111', 'Craft beer evening', 'Three craft beer taprooms in old factory buildings, with bar snacks between.',
   '{bar,night-view,street-food}', 'active', 180, 'Seongsu Station exit 3', 'seongsu2', 4, '{English,Korean}', 50000),
  ('5a3b1e00-0000-4000-8000-000000000112', 'Vegan cafés & market', 'Plant-based brunch, a zero-waste shop and a slow walk through a weekend market.',
   '{vegan,market,healing}', 'slow', 180, 'Seoul Forest Station exit 5', 'seoul-forest', 3, '{English,Korean,Spanish}', 45000)
) as r(id, title, summary, tags, vibe, duration, meeting, area, party, langs, price);

-- 3. 정류장 (머무는 시간 합 + 이동 15분씩 ≤ 소요 시간)
insert into public.route_stops (route_id, order_no, place_name, area, stay_minutes, activity, tip, tags)
select s.route_id::uuid, s.n, s.place, s.area, s.stay, s.activity, s.tip, s.tags::text[]
from (values
  ('5a3b1e00-0000-4000-8000-000000000101', 1, 'Tiny roastery', 'seongsu2', 50, 'Hand-drip tasting at a six-seat roastery.', 'Ask for the seasonal single origin.', '{cafe}'),
  ('5a3b1e00-0000-4000-8000-000000000101', 2, 'Salt bread bakery', 'seongsu2', 30, 'Grab warm salt bread to share.', null, '{bakery}'),
  ('5a3b1e00-0000-4000-8000-000000000101', 3, 'Rooftop café', 'seongsu1', 60, 'Slow coffee on a quiet rooftop over the lanes.', 'Sit by the window side.', '{cafe,healing}'),

  ('5a3b1e00-0000-4000-8000-000000000102', 1, 'Basement thrift store', 'seongsu2', 50, 'Dig through racks of 90s jackets and denim.', 'Prices drop on weekdays.', '{vintage}'),
  ('5a3b1e00-0000-4000-8000-000000000102', 2, 'Indie vintage boutique', 'seongsu2', 40, 'Curated vintage from Japan and Europe.', null, '{vintage,fashion}'),
  ('5a3b1e00-0000-4000-8000-000000000102', 3, 'Shoe factory street', 'seongsu1', 50, 'See handmade shoe workshops and local labels.', null, '{design,fashion}'),

  ('5a3b1e00-0000-4000-8000-000000000103', 1, 'Brand pop-up hall', 'seongsu1', 40, 'Visit the biggest pop-up of the week.', 'Come early to skip the line.', '{popup}'),
  ('5a3b1e00-0000-4000-8000-000000000103', 2, 'K-beauty concept store', 'seongsu2', 40, 'Try new skincare and makeup testers.', null, '{beauty,popup}'),
  ('5a3b1e00-0000-4000-8000-000000000103', 3, 'Sneaker pop-up', 'seongsu2', 30, 'Limited sneaker drops and photo zones.', null, '{fashion,popup}'),

  ('5a3b1e00-0000-4000-8000-000000000104', 1, 'Gukbap lunch spot', 'ttukseom', 50, 'Warm pork rice soup at a 30-year-old shop.', null, '{korean-food}'),
  ('5a3b1e00-0000-4000-8000-000000000104', 2, 'Neighborhood market', 'ttukseom', 50, 'Taste tteokbokki, hotteok and fish cakes.', 'Bring cash for the stalls.', '{market,street-food}'),
  ('5a3b1e00-0000-4000-8000-000000000104', 3, 'Makgeolli bar', 'seongsu2', 40, 'Try rice wine with a savory pancake.', null, '{korean-food}'),

  ('5a3b1e00-0000-4000-8000-000000000105', 1, 'Seoul Forest deer park', 'seoul-forest', 40, 'Walk the paths and meet the deer.', null, '{river,healing}'),
  ('5a3b1e00-0000-4000-8000-000000000105', 2, 'Tea house by the trees', 'seoul-forest', 50, 'Slow tea break in a quiet garden.', 'Ask for the barley tea.', '{healing}'),

  ('5a3b1e00-0000-4000-8000-000000000106', 1, 'Red brick warehouse lane', 'seongsu1', 40, 'Shoot textures, doors and old factory signs.', 'Best light after 4pm.', '{photo}'),
  ('5a3b1e00-0000-4000-8000-000000000106', 2, 'Mural alley', 'seongsu2', 30, 'Street art and quiet corners for portraits.', null, '{photo,art}'),
  ('5a3b1e00-0000-4000-8000-000000000106', 3, 'Design store terrace', 'seongsu1', 30, 'Golden-hour shots from a design store terrace.', null, '{design,photo}'),

  ('5a3b1e00-0000-4000-8000-000000000107', 1, 'Leather studio', 'seongsu2', 80, 'Make a leather keyring with your initials.', null, '{workshop}'),
  ('5a3b1e00-0000-4000-8000-000000000107', 2, 'Pottery class', 'seongsu2', 80, 'Shape a small cup on the wheel.', 'Wear clothes that can get dusty.', '{workshop,art}'),
  ('5a3b1e00-0000-4000-8000-000000000107', 3, 'Stationery shop', 'seongsu1', 20, 'Browse notebooks and pens by local brands.', null, '{design}'),

  ('5a3b1e00-0000-4000-8000-000000000108', 1, 'Ttukseom riverside', 'ttukseom', 50, 'Sunset by the Han River with the city skyline.', null, '{river,night-view}'),
  ('5a3b1e00-0000-4000-8000-000000000108', 2, 'River viewpoint', 'ttukseom', 40, 'See the bridges light up after dark.', 'Bring a light jacket.', '{night-view}'),
  ('5a3b1e00-0000-4000-8000-000000000108', 3, 'Late-night snack street', 'seongsu2', 30, 'Tteokbokki and odeng from a night stall.', null, '{street-food}'),

  ('5a3b1e00-0000-4000-8000-000000000109', 1, 'Salt bread bakery', 'seongsu2', 20, 'Famous salt bread fresh from the oven.', null, '{bakery}'),
  ('5a3b1e00-0000-4000-8000-000000000109', 2, 'Croissant atelier', 'seongsu2', 30, 'Flaky croissants and a short coffee.', null, '{bakery,cafe}'),
  ('5a3b1e00-0000-4000-8000-000000000109', 3, 'Cream bun shop', 'seongsu1', 20, 'The cream bun locals line up for.', 'It sells out by 3pm.', '{bakery}'),
  ('5a3b1e00-0000-4000-8000-000000000109', 4, 'Rice cake café', 'seongsu1', 30, 'Modern Korean rice cakes with tea.', null, '{korean-food,cafe}'),

  ('5a3b1e00-0000-4000-8000-000000000110', 1, 'Small free gallery', 'seongsu1', 40, 'A rotating show by young Korean artists.', null, '{art}'),
  ('5a3b1e00-0000-4000-8000-000000000110', 2, 'Design bookstore', 'seongsu1', 40, 'Art books, zines and design magazines.', null, '{design,art}'),
  ('5a3b1e00-0000-4000-8000-000000000110', 3, 'Gallery café', 'seongsu2', 50, 'Coffee among paintings in a converted factory.', null, '{cafe,art}'),

  ('5a3b1e00-0000-4000-8000-000000000111', 1, 'Factory taproom', 'seongsu2', 50, 'Local craft IPAs in an old printing factory.', null, '{bar}'),
  ('5a3b1e00-0000-4000-8000-000000000111', 2, 'Street snack stop', 'seongsu2', 20, 'Grilled skewers between bars.', null, '{street-food}'),
  ('5a3b1e00-0000-4000-8000-000000000111', 3, 'Rooftop bar', 'seongsu1', 60, 'Night views over Seongsu with a final pint.', 'Reserve a seat on weekends.', '{bar,night-view}'),

  ('5a3b1e00-0000-4000-8000-000000000112', 1, 'Plant-based brunch', 'seoul-forest', 60, 'Vegan brunch plates and oat lattes.', null, '{vegan}'),
  ('5a3b1e00-0000-4000-8000-000000000112', 2, 'Zero-waste shop', 'seoul-forest', 30, 'Refill station and eco goods.', null, '{healing}'),
  ('5a3b1e00-0000-4000-8000-000000000112', 3, 'Weekend market', 'seongsu2', 50, 'Local farmers and makers market.', null, '{market,vegan}')
) as s(route_id, n, place, area, stay, activity, tip, tags);

-- 4. 가능 시간: 오늘부터 14일 동안 매일 10:00–21:00 → 슬롯 생성
insert into public.availability_rules (jigi_id, weekday, start_time, end_time, valid_from, valid_to)
select '5a3b1e00-0000-4000-8000-000000000001', d, '10:00', '21:00',
       (now() at time zone 'Asia/Seoul')::date, (now() at time zone 'Asia/Seoul')::date + 13
from generate_series(0, 6) d;

select public.refresh_jigi_slots('5a3b1e00-0000-4000-8000-000000000001');

commit;

-- 확인
select r.title, r.tags, r.languages, r.max_party_size,
       (select count(*) from public.slots s where s.route_id = r.id and s.status = 'open') as open_slots
from public.routes r where r.is_sample order by r.title;
