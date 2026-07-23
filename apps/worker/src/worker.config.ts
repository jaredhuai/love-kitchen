import { z } from 'zod';

const PositiveInteger = z.coerce.number().int().positive();
const NonNegativeInteger = z.coerce.number().int().nonnegative();

const WorkerEnvironment = z
  .object({
    WORKER_POLL_INTERVAL_MS: PositiveInteger.default(1_000),
    WORKER_LEASE_MS: PositiveInteger.default(300_000),
    WORKER_MAX_ATTEMPTS: PositiveInteger.default(5),
    WORKER_BATCH_SIZE: PositiveInteger.default(100),
    IDEMPOTENCY_CLEANUP_INTERVAL_MS: PositiveInteger.default(3_600_000),
    IDEMPOTENCY_CLEANUP_BATCH_SIZE: PositiveInteger.default(1_000),
    OUTBOX_BACKLOG_ALERT_THRESHOLD: NonNegativeInteger.default(1_000),
    OUTBOX_DEAD_ALERT_THRESHOLD: NonNegativeInteger.default(1),
    OUTBOX_OLDEST_PENDING_ALERT_SECONDS: NonNegativeInteger.default(300),
    REMINDER_TIMEZONE: z.string().min(1).default('Australia/Sydney'),
  })
  .passthrough();

export type WorkerConfig = z.infer<typeof WorkerEnvironment>;

export function loadWorkerConfig(environment: NodeJS.ProcessEnv = process.env): WorkerConfig {
  return WorkerEnvironment.parse(environment);
}
