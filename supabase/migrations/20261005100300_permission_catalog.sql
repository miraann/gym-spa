-- The permission catalog for every module (so the permission matrix is complete from day one) and
-- the built-in roles. A migration, not seed data: production needs them too.
--
-- Adding a permission later: insert it here-style in a new migration, give it to the admin role
-- (Super Admin gets it automatically), and add its label to packages/i18n.
--
-- A role that has a higher discount limit also has every lower one (max_25 comes with max_10).
-- Someone can only give roles whose permissions they have, so a manager without max_10 couldn't
-- create receptionists.

insert into public.permissions (key, module, sort_order)
select p.key, p.module, p.sort_order * 10
  from (values
    ('dashboard.view', 'dashboard', 1),

    ('branches.manage', 'branches', 2),

    ('staff.view', 'staff', 3),
    ('staff.manage', 'staff', 4),
    ('roles.manage', 'staff', 5),

    ('devices.manage', 'devices', 6),
    ('sync.conflicts.resolve', 'devices', 7),

    ('settings.edit', 'settings', 8),
    ('backups.export', 'settings', 9),
    ('audit.view', 'settings', 10),

    ('members.view', 'members', 11),
    ('members.create', 'members', 12),
    ('members.edit', 'members', 13),
    ('members.delete', 'members', 14),
    ('members.medical.view', 'members', 15),
    ('members.import', 'members', 16),
    ('members.export', 'members', 17),
    ('cards.manage', 'members', 18),
    ('cards.blacklist', 'members', 19),

    ('plans.manage', 'subscriptions', 20),
    ('subscriptions.sell', 'subscriptions', 21),
    ('subscriptions.freeze', 'subscriptions', 22),
    ('subscriptions.change', 'subscriptions', 23),
    ('subscriptions.transfer', 'subscriptions', 24),
    ('subscriptions.cancel', 'subscriptions', 25),
    ('discount.apply.max_10', 'subscriptions', 26),
    ('discount.apply.max_25', 'subscriptions', 27),
    ('discount.apply.max_50', 'subscriptions', 28),
    ('discount.apply.any', 'subscriptions', 29),

    ('payments.view', 'payments', 30),
    ('payments.create', 'payments', 31),
    ('payments.refund', 'payments', 32),
    ('payments.void', 'payments', 33),

    ('checkin.perform', 'checkin', 34),
    ('checkin.manual', 'checkin', 35),
    ('checkin.override', 'checkin', 36),
    ('attendance.view', 'checkin', 37),
    ('attendance.void', 'checkin', 38),

    ('lockers.view', 'lockers', 39),
    ('lockers.assign', 'lockers', 40),
    ('lockers.manage', 'lockers', 41),

    ('spa.view', 'spa', 42),
    ('spa.book', 'spa', 43),
    ('spa.manage', 'spa', 44),

    ('classes.view', 'classes', 45),
    ('classes.book', 'classes', 46),
    ('classes.manage', 'classes', 47),
    ('pt.log', 'classes', 48),
    ('pt.manage', 'classes', 49),

    ('hr.view', 'hr', 50),
    ('hr.manage', 'hr', 51),

    ('pos.sell', 'shop', 52),
    ('products.manage', 'shop', 53),
    ('inventory.adjust', 'shop', 54),
    ('cash_register.operate', 'shop', 55),
    ('cash_register.view_all', 'shop', 56),

    ('notifications.send', 'notifications', 57),
    ('notifications.templates.manage', 'notifications', 58),

    ('reports.view', 'reports', 59),
    ('reports.financial.view', 'reports', 60),
    ('reports.export', 'reports', 61)
  ) as p (key, module, sort_order);

insert into public.roles (key, name_ckb, name_en, name_ar, is_system) values
  ('super_admin', 'بەڕێوەبەری باڵا', 'Super Admin', 'المدير العام', true),
  ('admin', 'بەڕێوەبەر', 'Admin', 'مدير النظام', true),
  ('branch_manager', 'بەڕێوەبەری لق', 'Branch Manager', 'مدير الفرع', true),
  ('receptionist', 'کارمەندی پێشوازی', 'Receptionist', 'موظف الاستقبال', true),
  ('trainer', 'ڕاهێنەر', 'Trainer', 'مدرب', true),
  ('spa_therapist', 'کارمەندی سپا', 'Spa Therapist', 'معالج السبا', true),
  ('accountant', 'ژمێریار', 'Accountant', 'محاسب', true),
  ('cashier', 'قاسەدار', 'Cashier', 'أمين الصندوق', true);

-- Super Admin has every permission without rows. Admin gets every permission in the catalog.
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
  from public.roles r
 cross join public.permissions p
 where r.key = 'admin';

insert into public.role_permissions (role_id, permission_key)
select r.id, rp.permission_key
  from (values
    ('branch_manager', 'dashboard.view'),
    ('branch_manager', 'staff.view'),
    ('branch_manager', 'staff.manage'),
    ('branch_manager', 'devices.manage'),
    ('branch_manager', 'sync.conflicts.resolve'),
    ('branch_manager', 'settings.edit'),
    ('branch_manager', 'members.view'),
    ('branch_manager', 'members.create'),
    ('branch_manager', 'members.edit'),
    ('branch_manager', 'members.delete'),
    ('branch_manager', 'members.medical.view'),
    ('branch_manager', 'members.import'),
    ('branch_manager', 'members.export'),
    ('branch_manager', 'cards.manage'),
    ('branch_manager', 'cards.blacklist'),
    ('branch_manager', 'subscriptions.sell'),
    ('branch_manager', 'subscriptions.freeze'),
    ('branch_manager', 'subscriptions.change'),
    ('branch_manager', 'subscriptions.transfer'),
    ('branch_manager', 'subscriptions.cancel'),
    ('branch_manager', 'discount.apply.max_10'),
    ('branch_manager', 'discount.apply.max_25'),
    ('branch_manager', 'payments.view'),
    ('branch_manager', 'payments.create'),
    ('branch_manager', 'payments.refund'),
    ('branch_manager', 'payments.void'),
    ('branch_manager', 'checkin.perform'),
    ('branch_manager', 'checkin.manual'),
    ('branch_manager', 'checkin.override'),
    ('branch_manager', 'attendance.view'),
    ('branch_manager', 'attendance.void'),
    ('branch_manager', 'lockers.view'),
    ('branch_manager', 'lockers.assign'),
    ('branch_manager', 'lockers.manage'),
    ('branch_manager', 'spa.view'),
    ('branch_manager', 'spa.book'),
    ('branch_manager', 'spa.manage'),
    ('branch_manager', 'classes.view'),
    ('branch_manager', 'classes.book'),
    ('branch_manager', 'classes.manage'),
    ('branch_manager', 'pt.log'),
    ('branch_manager', 'pt.manage'),
    ('branch_manager', 'hr.view'),
    ('branch_manager', 'pos.sell'),
    ('branch_manager', 'products.manage'),
    ('branch_manager', 'inventory.adjust'),
    ('branch_manager', 'cash_register.operate'),
    ('branch_manager', 'cash_register.view_all'),
    ('branch_manager', 'notifications.send'),
    ('branch_manager', 'reports.view'),
    ('branch_manager', 'reports.financial.view'),
    ('branch_manager', 'reports.export'),

    ('receptionist', 'dashboard.view'),
    ('receptionist', 'members.view'),
    ('receptionist', 'members.create'),
    ('receptionist', 'members.edit'),
    ('receptionist', 'cards.manage'),
    ('receptionist', 'subscriptions.sell'),
    ('receptionist', 'subscriptions.freeze'),
    ('receptionist', 'discount.apply.max_10'),
    ('receptionist', 'payments.view'),
    ('receptionist', 'payments.create'),
    ('receptionist', 'checkin.perform'),
    ('receptionist', 'checkin.manual'),
    ('receptionist', 'attendance.view'),
    ('receptionist', 'lockers.view'),
    ('receptionist', 'lockers.assign'),
    ('receptionist', 'spa.view'),
    ('receptionist', 'spa.book'),
    ('receptionist', 'classes.view'),
    ('receptionist', 'classes.book'),
    ('receptionist', 'pos.sell'),
    ('receptionist', 'cash_register.operate'),

    ('trainer', 'members.view'),
    ('trainer', 'members.medical.view'),
    ('trainer', 'attendance.view'),
    ('trainer', 'classes.view'),
    ('trainer', 'pt.log'),

    ('spa_therapist', 'members.view'),
    ('spa_therapist', 'spa.view'),
    ('spa_therapist', 'spa.book'),

    ('accountant', 'dashboard.view'),
    ('accountant', 'members.view'),
    ('accountant', 'payments.view'),
    ('accountant', 'payments.refund'),
    ('accountant', 'payments.void'),
    ('accountant', 'cash_register.view_all'),
    ('accountant', 'reports.view'),
    ('accountant', 'reports.financial.view'),
    ('accountant', 'reports.export'),

    ('cashier', 'members.view'),
    ('cashier', 'subscriptions.sell'),
    ('cashier', 'discount.apply.max_10'),
    ('cashier', 'payments.view'),
    ('cashier', 'payments.create'),
    ('cashier', 'pos.sell'),
    ('cashier', 'cash_register.operate')
  ) as rp (role_key, permission_key)
  join public.roles r on r.key = rp.role_key;
