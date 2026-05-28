require('dotenv').config();
const { Pool } = require('pg');
const p = new Pool({
  host: process.env.AUTH_DB_HOST,
  port: +process.env.AUTH_DB_PORT,
  database: process.env.AUTH_DB_NAME,
  user: process.env.AUTH_DB_USER,
  password: process.env.AUTH_DB_PASSWORD,
});

let last = 0;

const q = () =>
  p.query(
    'SELECT id,created_at,event_type,provider,success,ip_address,failure_reason,user_id FROM auth_logs WHERE id>$1 ORDER BY id ASC',
    [last]
  ).then(r => {
    for (const x of r.rows) {
      last = x.id;
      console.log(
        new Date(x.created_at).toISOString(),
        '#' + x.id,
        x.event_type,
        'success=' + x.success,
        x.provider || '-',
        x.ip_address || '-',
        x.user_id || '-',
        x.failure_reason ? 'reason=' + x.failure_reason : ''
      );
    }
  }).catch(e => console.error('[poll]', e.message));

p.query('SELECT COALESCE(MAX(id),0) m FROM auth_logs').then(r => {
  last = r.rows[0].m;
  console.error('[watch] tailing auth_logs from id=' + last + ' every 2s - Ctrl+C to stop');
  setInterval(q, 2000);
}).catch(e => {
  console.error(e.message);
  process.exit(1);
});