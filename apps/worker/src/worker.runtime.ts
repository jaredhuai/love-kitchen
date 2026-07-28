import { OutboxProcessor } from './outbox.processor';
import { WorkerMaintenance } from './worker.maintenance';
import type { WorkerConfig } from './worker.config';

export class WorkerRuntime {
  private timer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  private inFlight: Promise<void> | undefined;
  private cleanupInFlight: Promise<void> | undefined;
  private stopped = false;

  constructor(
    private readonly processor: OutboxProcessor,
    private readonly maintenance: WorkerMaintenance,
    private readonly config: WorkerConfig,
  ) {}

  start() {
    this.stopped = false;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.config.WORKER_POLL_INTERVAL_MS);
    this.cleanupTimer = setInterval(() => {
      void this.cleanup();
    }, this.config.IDEMPOTENCY_CLEANUP_INTERVAL_MS);
    void this.tick();
    void this.cleanup();
  }

  tick(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.drain().finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  cleanup(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.cleanupInFlight) return this.cleanupInFlight;
    const now = new Date();
    this.cleanupInFlight = Promise.all([
      this.maintenance.cleanupExpiredIdempotencyKeys(
        now,
        this.config.IDEMPOTENCY_CLEANUP_BATCH_SIZE,
      ),
      this.maintenance.enqueueDueDomainEvents(now),
    ])
      .then(() => undefined)
      .finally(() => {
        this.cleanupInFlight = undefined;
      });
    return this.cleanupInFlight;
  }

  async stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    await Promise.all([this.inFlight, this.cleanupInFlight]);
  }

  private async drain() {
    for (let processed = 0; processed < this.config.WORKER_BATCH_SIZE; processed += 1) {
      if (!(await this.processor.processOne())) break;
    }
    const metrics = await this.maintenance.collectOutboxMetrics();
    process.stdout.write(`${JSON.stringify({ type: 'worker.metrics', ...metrics })}\n`);
  }
}
