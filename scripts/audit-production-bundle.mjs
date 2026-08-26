import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

function files(root) {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

const forbidden = [
  /GOOGLE_YOUTUBE_CLIENT_SECRET/u,
  /R2_SECRET_ACCESS_KEY/u,
  /ARCHIVE_MASTER_KEY/u,
  /TUBEMILESTONES_AUTOMATION_SECRET/u,
  /SUPABASE_SECRET_KEY/u,
  /SUPABASE_SERVICE_ROLE_KEY/u,
  /\bservice_role\b/u,
  /\bya29\.[A-Za-z0-9_-]{20,}/u,
  /\b1\/\/[A-Za-z0-9_-]{20,}/u,
];

const findings = [];
for (const path of files(resolve('dist'))) {
  if (!/\.(?:css|html|js|json|map|svg)$/u.test(path)) continue;
  const source = readFileSync(path, 'utf8');
  for (const pattern of forbidden) {
    if (pattern.test(source)) findings.push(`${path}: ${pattern.source}`);
  }
}

if (findings.length > 0) {
  throw new Error(
    `Forbidden backend credential material reached dist:\n${findings.join('\n')}`,
  );
}

console.log('Production bundle secret-boundary audit passed.');
