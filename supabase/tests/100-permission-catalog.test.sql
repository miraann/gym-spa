-- The built-in roles every gym gets (app.role_templates, migration 20261010100000) and their
-- permissions.
begin;
select plan(9);

select set_eq(
  'select key from app.role_templates',
  array['owner', 'admin', 'branch_manager', 'receptionist', 'trainer', 'spa_therapist', 'accountant', 'cashier'],
  'the eight built-in roles exist'
);
select results_eq(
  $$ select name_ckb, name_en, name_ar from app.role_templates where key = 'owner' $$,
  $$ values ('خاوەن'::text, 'Owner'::text, 'المالك'::text) $$,
  'the gym''s top role is the Owner (خاوەن)'
);
select is_empty(
  $$ select key from app.role_templates where name_ckb ~ '[يكىة]' $$,
  'Kurdish role names use Sorani letters (ی ک ە), not Arabic ones'
);
select is_empty(
  $$ select key from app.role_templates where name_ar ~ '[یکەێۆڕڵ]' $$,
  'Arabic role names use Arabic letters, not Kurdish ones'
);
select is_empty(
  $$ select 1 from app.role_template_permissions where role_key = 'owner' $$,
  'the Owner''s permissions are not stored (it has all of them)'
);
select is(
  (select count(*)::integer from app.role_template_permissions where role_key = 'admin'),
  (select count(*)::integer from public.permissions),
  'Admin has every permission in the catalog'
);
select is_empty(
  $$ select tp.role_key, tier.lower
       from app.role_template_permissions tp
       join (values ('discount.apply.max_25', 'discount.apply.max_10'),
                    ('discount.apply.max_50', 'discount.apply.max_25'),
                    ('discount.apply.any', 'discount.apply.max_50')) as tier (higher, lower)
         on tier.higher = tp.permission_key
      where not exists (
        select 1 from app.role_template_permissions l where l.role_key = tp.role_key and l.permission_key = tier.lower
      ) $$,
  'a role with a discount limit also has every lower limit'
);
select is_empty(
  $$ select tp.role_key, tp.permission_key
       from app.role_template_permissions tp
      where tp.role_key in ('receptionist', 'trainer', 'spa_therapist', 'accountant', 'cashier')
        and not exists (
          select 1 from app.role_template_permissions m
           where m.role_key = 'branch_manager' and m.permission_key = tp.permission_key
        ) $$,
  'a branch manager has every permission of the front-desk roles, so they can give those roles'
);
select is_empty(
  $$ select 1 from public.roles where key = 'super_admin' $$,
  'no gym has a Super Admin role any more'
);

select * from finish();
rollback;
