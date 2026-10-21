-- Demo data for local development (loaded by `pnpm db:reset`, never in production). Kurdish first.
-- Staff accounts are created with `pnpm bootstrap:admin`, not here.

-- The demo gym (code demo), made like every gym: its roles and its first branch (B1) come with it.
select public.create_gym('demo', 'جیمی نموونە', 'لقی سەرەکی', 'Demo Gym', 'النادي التجريبي');

update public.branches
   set name_en = 'Main Branch', name_ar = 'الفرع الرئيسي', phone = '0770 000 0001', address = 'سلێمانی، شەقامی سالم'
 where code = 'B1' and gym_id = (select g.id from public.gyms g where g.code = 'demo');

insert into public.branches (gym_id, code, name_ckb, name_en, name_ar, phone, address)
select g.id, 'B2', 'لقی بەختیاری', 'Bakhtiari Branch', 'فرع بختياري', '0770 000 0002', 'سلێمانی، گەڕەکی بەختیاری'
  from public.gyms g
 where g.code = 'demo';

-- 200 members (spec §5), numbered 000001 to 000200 in order. Ids are md5('demo-member-<n>'), so
-- tests can find them. Every 25th has no phone of their own (a child: their parent's phone is the
-- emergency contact); a few are suspended, banned or archived; some have health info.
with names as (
  select
    array['ئارام', 'ڕێباز', 'هێمن', 'کاروان', 'شوان', 'دانا', 'سەردار', 'بەختیار', 'ئاسۆ', 'هەڤاڵ',
          'ژیار', 'گۆران', 'پشتیوان', 'ڕەوەند', 'چیا', 'زانا', 'ئازاد', 'نەوزاد', 'سیروان', 'هاوڕێ'] as male,
    array['ژیلا', 'شیلان', 'ڕۆژان', 'هێڤی', 'نازدار', 'بەفرین', 'چنار', 'دیلان', 'سۆما', 'شادی',
          'ڕووناک', 'لاڤین', 'تارا', 'نیگار', 'سارا', 'ڤیان', 'هانا', 'کوێستان', 'ئەڤین', 'بێریڤان'] as female,
    array['کەریم', 'محەمەد', 'عەلی', 'ئەحمەد', 'حەسەن', 'عومەر', 'ڕەشید', 'مستەفا', 'سەلیم', 'جەلال',
          'فەرهاد', 'ئیبراهیم', 'قادر', 'عەزیز', 'ڕەحیم', 'سەعید', 'تاهیر', 'خالید', 'جەمال', 'نووری'] as father
),
people as (
  select i, (i + 1) / 2 as k, i % 2 = 1 as is_male, i % 25 = 0 as is_child
    from generate_series(1, 200) as i
),
demo as (
  select g.id as gym_id,
         (select b.id from public.branches b where b.gym_id = g.id and b.code = 'B1') as b1,
         (select b.id from public.branches b where b.gym_id = g.id and b.code = 'B2') as b2
    from public.gyms g
   where g.code = 'demo'
)
insert into public.members (
  id, gym_id, branch_id, full_name, gender, phone, emergency_contact_name, emergency_phone,
  birth_date, preferred_language, address, referral_source, goals, notes, tags,
  status, status_reason, status_changed_at, created_at
)
select
  md5('demo-member-' || p.i)::uuid,
  d.gym_id,
  case when p.i % 3 = 0 then d.b2 else d.b1 end,
  concat_ws(' ',
    case when p.is_male then n.male[(p.k - 1) % 20 + 1] else n.female[(p.k - 1) % 20 + 1] end,
    n.father[((p.k - 1) / 20 + p.k) % 20 + 1],
    case when p.k % 3 = 0 then n.father[(p.k * 3) % 20 + 1] end),
  case when p.is_male then 'male' else 'female' end,
  case when not p.is_child
    then '+9647' || (array['5', '7', '8', '9'])[p.i % 4 + 1] || lpad((10000000 + p.i * 7919)::text, 8, '0') end,
  case when p.is_child or p.i % 4 = 0
    then n.father[((p.k - 1) / 20 + p.k) % 20 + 1] || ' ' || n.father[(p.k * 7) % 20 + 1] end,
  case when p.is_child or p.i % 4 = 0 then '+964770' || lpad((1000000 + p.i)::text, 7, '0') end,
  case when p.is_child then date '2012-01-01' + p.i * 13 % 1500 else date '1975-01-01' + p.i * 37 % 11000 end,
  (case when p.i % 17 = 0 then 'ar' when p.i % 23 = 0 then 'en' else 'ckb' end)::public.language_code,
  case when p.i % 2 = 0
    then (array['سلێمانی، گەڕەکی سەرچنار', 'سلێمانی، گەڕەکی بەختیاری', 'سلێمانی، شەقامی سالم',
                'سلێمانی، گەڕەکی ئازادی', 'سلێمانی، گەڕەکی ڕزگاری'])[p.i % 5 + 1] end,
  case when p.i % 3 <> 1
    then (array['friend', 'social_media', 'passing_by', 'advertisement', 'other'])[p.i % 5 + 1] end,
  case when p.i % 2 = 1
    then (array['کەمکردنەوەی کێش', 'زیادکردنی ماسوولکە', 'تەندروستیی گشتی', 'ئامادەبوون بۆ یاری'])[p.i % 4 + 1] end,
  case when p.i % 50 = 3 then 'حەز دەکات بەیانیان بێت' end,
  case p.i % 10
    when 0 then array['قوتابی']
    when 5 then array['خێزان']
    when 7 then array['قوتابی', 'ڕاهێنانی تایبەت']
    else '{}'::text[]
  end,
  case when p.i % 40 = 7 then 'suspended' when p.i % 67 = 13 then 'banned' when p.i % 30 = 29 then 'archived' else 'active' end,
  case
    when p.i % 40 = 7 then 'پێشێلکردنی یاساکانی جیم'
    when p.i % 67 = 13 then 'شەڕکردن لەگەڵ ئەندامێکی تر'
    when p.i % 30 = 29 then 'گواستییەوە بۆ شارێکی تر'
  end,
  case when p.i % 40 = 7 or p.i % 67 = 13 or p.i % 30 = 29 then now() - make_interval(days => p.i % 60) end,
  now() - make_interval(days => 400 - p.i * 2)
from people p
cross join names n
cross join demo d
order by p.i;

insert into public.member_health (id, gym_id, blood_type, medical_notes, injuries)
select md5('demo-member-' || i)::uuid,
       (select g.id from public.gyms g where g.code = 'demo'),
       case when i % 5 = 0 then (array['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'])[i % 8 + 1] end,
       case when i % 18 = 0 then (array['نەخۆشیی شەکرە', 'پەستانی خوێنی بەرز'])[i % 2 + 1] end,
       case when i % 9 = 0 then (array['ئازاری ئەژنۆ', 'ئازاری پشت', 'شکانی دەستی ڕاست پێش ساڵێک'])[i % 3 + 1] end
  from generate_series(1, 200) as i
 where i % 5 = 0 or i % 9 = 0;

-- NFC cards, with made-up UIDs: 7 bytes like the NTAG cards (04…), 4 bytes for every 7th member.
-- Each member's card has the id md5('demo-card-<n>'). Every 10th member (4, 14, 24, …) has no card
-- yet, so one can be given on the screens; an archived member's card ended with them. History:
-- members 11, 61, 111 and 161 lost a card before; member 21's card was stolen (blocked); member
-- 71's lost card was blocked later by a manager.
insert into public.nfc_cards (
  id, gym_id, member_id, uid, status, end_reason, ended_at, block_reason, blocked_at, created_at
)
select md5('demo-old-card-' || p.i)::uuid, m.gym_id, m.id,
       '04' || upper(substr(md5('demo-old-card-uid-' || p.i), 1, 12)),
       case when p.i in (21, 71) then 'blocked' else 'ended' end,
       case when p.i = 21 then 'stolen' else 'lost' end,
       m.created_at + interval '60 days',
       case when p.i = 71 then 'لەلای کەسێکی تر بینرا' end,
       case p.i when 21 then m.created_at + interval '60 days' when 71 then m.created_at + interval '63 days' end,
       m.created_at + interval '1 day'
  from generate_series(1, 200) as p (i)
  join public.members m on m.id = md5('demo-member-' || p.i)::uuid
 where p.i % 50 = 11 or p.i in (21, 71);

insert into public.nfc_cards (id, gym_id, member_id, uid, status, replaces_id, end_reason, ended_at, created_at)
select md5('demo-card-' || p.i)::uuid, m.gym_id, m.id,
       case when p.i % 7 = 0 then upper(substr(md5('demo-card-uid-' || p.i), 1, 8))
            else '04' || upper(substr(md5('demo-card-uid-' || p.i), 1, 12)) end,
       case when m.status = 'archived' then 'ended' else 'active' end,
       old.id,
       case when m.status = 'archived' then 'member_archived' end,
       case when m.status = 'archived' then greatest(m.status_changed_at, m.created_at + interval '1 day') end,
       m.created_at + case when old.id is null then interval '1 day' else interval '60 days' end
  from generate_series(1, 200) as p (i)
  join public.members m on m.id = md5('demo-member-' || p.i)::uuid
  left join public.nfc_cards old on old.id = md5('demo-old-card-' || p.i)::uuid
 where p.i % 10 <> 4;
