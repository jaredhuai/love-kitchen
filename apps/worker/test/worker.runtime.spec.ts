import { describe, expect, it, vi } from 'vitest';
import type { OutboxProcessor } from '../src/outbox.processor';
import { loadWorkerConfig } from '../src/worker.config';
import type { WorkerMaintenance } from '../src/worker.maintenance';
import { WorkerRuntime } from '../src/worker.runtime';

describe('WorkerRuntime', () => {
  it('coalesces overlapping ticks and drains at most the configured batch', async () => {
    let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const processOne = vi
      .fn()
      .mockImplementationOnce(async () => {
        await blocked;
        return true;
      })
      .mockResolvedValue(false);
    const collectOutboxMetrics = vi.fn().mockResolvedValue({
      pending: 0,
      processing: 0,
      dead: 0,
      oldestPendingAgeSeconds: 0,
      alerts: [],
      measuredAt: new Date().toISOString(),
    });
    const runtime = new WorkerRuntime(
      { processOne } as unknown as OutboxProcessor,
      { collectOutboxMetrics } as unknown as WorkerMaintenance,
      config(),
    );
    const first = runtime.tick();
    const overlapping = runtime.tick();
    expect(processOne).toHaveBeenCalledTimes(1);
    release?.();
    await Promise.all([first, overlapping]);
    expect(processOne).toHaveBeenCalledTimes(2);
    expect(collectOutboxMetrics).toHaveBeenCalledTimes(1);
    await runtime.stop();
  });

  it('waits for in-flight processing and cleanup during graceful stop', async () => {
    let releaseProcess: (() => void) | undefined;
    let releaseCleanup: (() => void) | undefined;
    const processOne = vi.fn().mockImplementation(
      async () =>
        new Promise<boolean>((resolve) => {
          releaseProcess = () => resolve(false);
        }),
    );
    const cleanupExpiredIdempotencyKeys = vi.fn().mockImplementation(
      async () =>
        new Promise<number>((resolve) => {
          releaseCleanup = () => resolve(0);
        }),
    );
    const purgeExpiredAiResponses = vi.fn().mockResolvedValue(0);
    const enqueueDueDomainEvents = vi.fn().mockResolvedValue(0);
    const collectOutboxMetrics = vi.fn().mockResolvedValue({
      pending: 0,
      processing: 0,
      dead: 0,
      oldestPendingAgeSeconds: 0,
      alerts: [],
      measuredAt: new Date().toISOString(),
    });
    const runtime = new WorkerRuntime(
      { processOne } as unknown as OutboxProcessor,
      {
        cleanupExpiredIdempotencyKeys,
        purgeExpiredAiResponses,
        enqueueDueDomainEvents,
        collectOutboxMetrics,
      } as unknown as WorkerMaintenance,
      config(),
    );
    void runtime.tick();
    void runtime.cleanup();
    let stopped = false;
    const stopping = runtime.stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    releaseProcess?.();
    releaseCleanup?.();
    await stopping;
    expect(stopped).toBe(true);
    expect(await runtime.tick()).toBeUndefined();
  });
});

function config() {
  return loadWorkerConfig({
    WORKER_BATCH_SIZE: '5',
    WORKER_POLL_INTERVAL_MS: '1000',
    IDEMPOTENCY_CLEANUP_INTERVAL_MS: '1000',
  } as NodeJS.ProcessEnv);
}
