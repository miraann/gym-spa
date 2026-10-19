-- NOT A MIGRATION YET (supabase/pending-migrations is never pushed). Expand first, drop later:
-- apply this only after every client runs step 1e or newer (the web app is redeployed, and every
-- installed APK and EXE is updated), because older clients unlock with unlock_with_pin().
--
-- To apply: move this file to supabase/migrations/ with a new timestamp
-- (<yyyymmddhhmmss>_drop_unlock_with_pin.sql), change 230-devices-and-branches.test.sql to expect
-- the function gone (hasnt_function), run pnpm db:reset and pnpm db:test, then push it.

drop function public.unlock_with_pin(text, uuid);
