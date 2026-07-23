import { PrismaClient } from '@prisma/client';
import { OutboxProcessor } from './outbox.processor';
import { loadWorkerConfig } from './worker.config';
import { WorkerMaintenance } from './worker.maintenance';
import { WorkerRuntime } from './worker.runtime';

const prisma = new PrismaClient();
const config = loadWorkerConfig();
const processor = new OutboxProcessor(
  prisma,
  config.WORKER_MAX_ATTEMPTS,
  undefined,
  config.WORKER_LEASE_MS,
);
const maintenance = new WorkerMaintenance(
  prisma,
  {
    backlog: config.OUTBOX_BACKLOG_ALERT_THRESHOLD,
    dead: config.OUTBOX_DEAD_ALERT_THRESHOLD,
    oldestPendingSeconds: config.OUTBOX_OLDEST_PENDING_ALERT_SECONDS,
  },
  config.REMINDER_TIMEZONE,
);
const runtime = new WorkerRuntime(processor, maintenance, config);
runtime.start();

async function shutdown() {
  await runtime.stop();
  await prisma.$disconnect();
}
process.once('SIGTERM', () => {
  void shutdown();
});
process.once('SIGINT', () => {
  void shutdown();
});
