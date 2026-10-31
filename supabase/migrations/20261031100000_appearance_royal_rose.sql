-- The look of step D-5a (spec §8, D-5; approved by the user on 2026-10-31). Additions only:
-- app.is_valid_setting replaced with the same signature, accepting two new brand presets at the end,
-- royal and rose (packages/core BRAND_PRESETS; a test keeps both lists the same). Every other key
-- is unchanged.

create or replace function app.is_valid_setting(setting_key text, value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case setting_key
    -- Wrong PIN tries before the staff member must log in with their password again.
    when 'security.pin_max_attempts' then app.is_json_integer(value, 3, 10)
    -- Minutes without activity before the app locks.
    when 'security.idle_lock_minutes' then app.is_json_integer(value, 1, 240)
    -- The gym's brand color: a preset, or a custom color as lowercase #rrggbb.
    when 'appearance.brand_color' then jsonb_typeof(value) = 'string' and (value #>> '{}' = any (array['indigo', 'blue', 'purple', 'gray', 'midnight', 'gold', 'teal', 'royal', 'rose']) or value #>> '{}' ~ '^#[0-9a-f]{6}$')
    -- Corners: soft (the default), medium or sharp.
    when 'appearance.corner_style' then jsonb_typeof(value) = 'string' and value #>> '{}' in ('soft', 'medium', 'sharp')
    when 'appearance.logo' then app.is_valid_logo(value)
    -- Minutes after a visit in which another scan counts nothing (shown as "already in").
    when 'checkin.cooldown_minutes' then app.is_json_integer(value, 1, 720)
    -- Hours a visit counts as inside when nobody checks the member out.
    when 'checkin.visit_hours' then app.is_json_integer(value, 1, 24)
    -- 1: money owed now above checkin.debt_limit refuses entry; 0: it is only a warning.
    when 'checkin.deny_for_debt' then app.is_json_integer(value, 0, 1)
    -- Dinars a member may owe now and still come in, when checkin.deny_for_debt is 1.
    when 'checkin.debt_limit' then app.is_json_integer(value, 0, 1000000000)
    -- Dinars a rented locker costs per month; 0: not set, so lockers can't be rented yet.
    when 'lockers.rent_month_price' then app.is_json_integer(value, 0, 1000000000)
    -- Dinars charged for a lost locker key; 0: no fee.
    when 'lockers.lost_key_fee' then app.is_json_integer(value, 0, 1000000000)
    -- When each night the daily lockers not given back are released: minutes after midnight in
    -- Baghdad (180 = 03:00).
    when 'lockers.night_release_minute' then app.is_json_integer(value, 0, 1439)
    -- The hours the spa calendar shows (Baghdad time): from this hour until that one.
    when 'spa.calendar_from_hour' then app.is_json_integer(value, 0, 23)
    when 'spa.calendar_until_hour' then app.is_json_integer(value, 1, 24)
    -- The calendar's step in minutes.
    when 'spa.slot_minutes' then app.is_json_integer(value, 5, 60)
    -- Dinars a dollar is usually taken at; 0: none. It fills in a payment in dollars.
    when 'payments.usd_rate' then app.is_json_integer(value, 0, 10000000)
    -- The line at the bottom of every receipt, in the receipt's language.
    when 'receipts.footer_ckb' then jsonb_typeof(value) = 'string' and app.is_clean_text(value #>> '{}', 200)
    when 'receipts.footer_en' then jsonb_typeof(value) = 'string' and app.is_clean_text(value #>> '{}', 200)
    when 'receipts.footer_ar' then jsonb_typeof(value) = 'string' and app.is_clean_text(value #>> '{}', 200)
    else false
  end
$$;
