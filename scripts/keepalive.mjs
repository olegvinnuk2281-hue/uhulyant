const raw = String(process.env.KEEPALIVE_URL || '').trim();
if (!raw) {
  console.error('Set KEEPALIVE_URL to the public base URL of the game server.');
  process.exit(1);
}

let healthUrl;
try {
  const base = new URL(raw);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if ((!local && base.protocol !== 'https:') || (local && !['http:', 'https:'].includes(base.protocol))) {
    throw new Error('Use HTTPS for a public server URL.');
  }
  if (base.username || base.password || base.search || base.hash) {
    throw new Error('KEEPALIVE_URL must be a base URL without credentials or query parameters.');
  }
  healthUrl = new URL('/healthz', base);
} catch (error) {
  console.error(`Invalid KEEPALIVE_URL: ${error.message}`);
  process.exit(1);
}

const intervalMs = 10 * 60 * 1000;
const once = process.argv.includes('--once');
async function ping() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(healthUrl, { signal: controller.signal, headers: { 'user-agent': 'Uhilyant-keepalive/1.0' } });
    if (!response.ok) throw new Error(`health check returned HTTP ${response.status}`);
    console.log(`${new Date().toISOString()} server healthy (${response.status})`);
  } catch (error) {
    console.error(`${new Date().toISOString()} health check failed: ${error.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

await ping();
if (!once) setInterval(ping, intervalMs);
