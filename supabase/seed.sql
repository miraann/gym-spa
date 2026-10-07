-- Demo data for local development (loaded by `pnpm db:reset`, never in production). Kurdish first.
-- Staff accounts are created with `pnpm bootstrap:admin`, not here.

insert into public.branches (id, code, name_ckb, name_en, name_ar, phone, address) values
  ('b1000000-0000-4000-8000-000000000001', 'B1', 'لقی سەرەکی', 'Main Branch', 'الفرع الرئيسي',
   '0770 000 0001', 'سلێمانی، شەقامی سالم'),
  ('b2000000-0000-4000-8000-000000000002', 'B2', 'لقی بەختیاری', 'Bakhtiari Branch', 'فرع بختياري',
   '0770 000 0002', 'سلێمانی، گەڕەکی بەختیاری');

-- PowerSync's replication role (created without a password by a migration). This password is for
-- local development only; the cloud project gets its own (README → PowerSync).
alter role powersync_role with login password 'powersync-local-dev';
