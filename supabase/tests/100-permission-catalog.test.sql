-- The built-in roles and their permissions (migration 20261005100300).
begin;
select plan(8);

select set_eq(
  'select key from public.roles where is_system',
  array['super_admin', 'admin', 'branch_manager', 'receptionist', 'trainer', 'spa_therapist', 'accountant', 'cashier'],
  'the eight built-in roles exist'
);
select is_empty(
  'select key from public.roles where is_system and (name_en is null or name_ar is null)',
  'every built-in role has Kurdish, English and Arabic names'
);
select is_empty(
  $$ select key from public.roles where name_ckb ~ '[يكىة]' $$,
  'Kurdish role names use Sorani letters (ی ک ە), not Arabic ones'
);
select is_empty(
  $$ select key from public.roles where name_ar ~ '[یکەێۆڕڵ]' $$,
  'Arabic role names use Arabic letters, not Kurdish ones'
);
select is_empty(
  $$ select 1 from public.role_permissions where role_id = tests.role('super_admin') $$,
  'Super Admin''s permissions are not stored (it has all of them)'
);
select is(
  (select count(*)::integer from public.role_permissions where role_id = tests.role('admin')),
  (select count(*)::integer from public.permissions),
  'Admin has every permission in the catalog'
);
select is_empty(
  $$ select r.key, tier.lower
       from public.role_permissions rp
       join public.roles r on r.id = rp.role_id
       join (values ('discount.apply.max_25', 'discount.apply.max_10'),
                    ('discount.apply.max_50', 'discount.apply.max_25'),
                    ('discount.apply.any', 'discount.apply.max_50')) as tier (higher, lower)
         on tier.higher = rp.permission_key
      where not exists (
        select 1 from public.role_permissions l where l.role_id = rp.role_id and l.permission_key = tier.lower
      ) $$,
  'a role with a discount limit also has every lower limit'
);
select is_empty(
  $$ select r.key from public.roles r
      where r.key in ('receptionist', 'trainer', 'spa_therapist', 'accountant', 'cashier')
        and not (app.role_permission_keys(r.id) <@ app.role_permission_keys(tests.role('branch_manager'))) $$,
  'a branch manager has every permission of the front-desk roles, so they can give those roles'
);

select * from finish();
rollback;
