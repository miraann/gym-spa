// Local PowerSync (supabase/powersync/docker-compose.yaml): `node scripts/powersync.mjs start|stop`.
//
// Its storage lives in memory, so every start begins clean and re-reads the database. Each start
// creates a new replication slot, so leftover inactive slots are dropped first: an unused slot
// makes Postgres keep its write-ahead log forever.
import { execFileSync } from 'node:child_process';

const compose = ['compose', '-f', 'powersync/docker-compose.yaml'];
const run = (args) => execFileSync('docker', args, { stdio: 'inherit' });

const command = process.argv[2];
if (command === 'start') {
  run([...compose, 'down']);
  run([
    'exec',
    'supabase_db_gym-spa',
    'psql',
    '-U',
    'postgres',
    '-q',
    '-c',
    "select pg_drop_replication_slot(slot_name) from pg_replication_slots where slot_name like 'powersync%' and not active",
  ]);
  run([...compose, 'up', '-d', '--wait']);
  console.log('PowerSync is running at http://localhost:54380');
} else if (command === 'stop') {
  run([...compose, 'down']);
} else {
  console.error('Usage: node scripts/powersync.mjs start|stop');
  process.exit(1);
}
