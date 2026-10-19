# Pending migrations

Changes that remove or change something older clients still use. They wait here until every
client is updated, then move into `../migrations/` with a new timestamp (CLAUDE.md → Database
rules, "Expand first, drop later"). Nothing in this folder is ever pushed or run by the CLI.

| File | Waits for | Then |
|---|---|---|
| `drop_unlock_with_pin.sql` | every web app, APK and EXE on step 1e or newer (they unlock with `unlock_on_device()`) | move in, and change `230-devices-and-branches.test.sql` to expect the function gone |
