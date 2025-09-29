// scripts/backup-supabase-storage.mjs
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const outDir = process.argv[2];
if (!outDir) {
  console.error('Usage: node scripts/backup-supabase-storage.mjs <output-dir>');
  process.exit(1);
}

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function listAllObjects(bucket, prefix = '') {
  const files = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const { data, error } = await supabase
      .storage
      .from(bucket)
      .list(prefix, { limit, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const item of data) {
      if (item.name === undefined) continue;
      if (item.id || item.metadata || item.updated_at) {
        // file
        files.push(path.posix.join(prefix, item.name));
      } else {
        // folder; recurse
        const sub = await listAllObjects(bucket, path.posix.join(prefix, item.name));
        files.push(...sub);
      }
    }
    if (data.length < limit) break;
    offset += data.length;
  }
  return files;
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  // List buckets
  const { data: buckets, error: bErr } = await supabase.storage.listBuckets();
  if (bErr) throw bErr;

  for (const b of buckets) {
    const bucketName = b.name;
    const bucketDir = path.join(outDir, bucketName);
    fs.mkdirSync(bucketDir, { recursive: true });
    console.log(`Backing up bucket: ${bucketName}`);

    const objects = await listAllObjects(bucketName);
    for (const objPath of objects) {
      const destPath = path.join(bucketDir, objPath);
      fs.mkdirSync(path.dirname(destPath), { recursive: true });

      const { data, error } = await supabase.storage.from(bucketName).download(objPath);
      if (error) {
        console.error(`  ✗ ${bucketName}/${objPath}: ${error.message}`);
        continue;
      }
      const arrayBuffer = await data.arrayBuffer();
      fs.writeFileSync(destPath, Buffer.from(arrayBuffer));
      console.log(`  ✓ ${bucketName}/${objPath}`);
    }
  }
  console.log('Storage backup complete.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
