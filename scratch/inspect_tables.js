const { Client } = require('pg');
async function run() {
  const c = new Client('postgresql://postgres:postgres@localhost:5432/gebeyaos_branch');
  await c.connect();
  const tables = ['sync_outbox', 'sync_inbox', 'audit_logs', 'users'];
  for (const t of tables) {
    const res = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position", [t]);
    console.log(t, res.rows.map(x => x.column_name));
  }
  await c.end();
}
run().catch(console.error);

