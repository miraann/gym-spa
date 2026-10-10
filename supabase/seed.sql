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
