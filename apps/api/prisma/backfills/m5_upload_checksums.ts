import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

const prisma = new PrismaClient();
const root = resolve(process.env.UPLOAD_LOCAL_DIR ?? './uploads');

function safePath(key: string) {
  const path = resolve(root, key);
  const child = relative(root, path);
  if (!child || child.startsWith('..') || isAbsolute(child))
    throw new Error(`Unsafe storage key: ${key}`);
  return path;
}

async function main() {
  const files = await prisma.uploadFile.findMany({
    where: { storageDriver: 'LOCAL', checksum: null },
    select: { id: true, storageKey: true },
  });
  let updated = 0;
  for (const file of files) {
    const checksum = createHash('sha256')
      .update(await readFile(safePath(file.storageKey)))
      .digest('hex');
    const result = await prisma.uploadFile.updateMany({
      where: { id: file.id, checksum: null },
      data: { checksum },
    });
    updated += result.count;
  }
  process.stdout.write(`${JSON.stringify({ candidates: files.length, updated })}\n`);
}

main().finally(() => prisma.$disconnect());
