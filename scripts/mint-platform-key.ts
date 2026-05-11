import dotenv from 'dotenv';
import path from 'path';

const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env';
dotenv.config({ path: path.resolve(process.cwd(), envFile), override: true, quiet: true });

async function main() {
  const { getPlatformBySlug, createPlatformApiKey } = await import('../server/db/platform-store');
  const slug = process.argv[2];
  const name = process.argv[3] ?? 'local-dev';
  if (!slug) {
    console.error('usage: npm run platform:key -- <platform-slug> [key-name]');
    process.exit(1);
  }
  const platform = await getPlatformBySlug(slug);
  if (!platform) {
    console.error(`platform not found: ${slug}. Start EdgeFlow once against the shared auth DB so self-heal can seed platform rows, or create it in /admin/platforms.`);
    process.exit(1);
  }
  const { publicKey, secret, record } = await createPlatformApiKey({
    platformId: platform.id,
    name,
  });
  console.log(JSON.stringify({
    platform: platform.slug,
    keyId: record.id,
    publicKey,
    secret,
  }, null, 2));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
