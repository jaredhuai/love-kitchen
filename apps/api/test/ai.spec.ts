import { describe, expect, it, vi } from 'vitest';
import { AiProviderException } from '../src/infra/ai/ai-provider';
import { QwenProvider } from '../src/infra/ai/qwen.provider';
import { MockAiProvider } from '../src/infra/ai/mock-ai.provider';
import { AiService, RecommendationSchema } from '../src/modules/ai';

const valid = JSON.stringify({
  recommendations: [{ name: '番茄鸡蛋', reason: '现有食材适合', ingredients: ['番茄', '鸡蛋'] }],
});
const schemaInvalid = JSON.stringify({
  recommendations: [{ name: '', reason: '', ingredients: [] }],
});

describe('AI Provider structured output', () => {
  it('accepts valid structured output without repair', async () => {
    const provider = new MockAiProvider([valid]);
    await expect(
      provider.completeJson({ messages: [] }, RecommendationSchema),
    ).resolves.toMatchObject({ recommendations: [{ name: '番茄鸡蛋' }] });
    expect(provider.requests).toHaveLength(1);
  });

  it('repairs non-JSON output exactly once', async () => {
    const provider = new MockAiProvider(['not-json', valid]);
    await expect(
      provider.completeJson({ messages: [] }, RecommendationSchema),
    ).resolves.toBeTruthy();
    expect(provider.requests).toHaveLength(2);
  });

  it('repairs schema-invalid JSON exactly once', async () => {
    const provider = new MockAiProvider([schemaInvalid, valid]);
    await expect(
      provider.completeJson({ messages: [] }, RecommendationSchema),
    ).resolves.toBeTruthy();
    expect(provider.requests[1]?.temperature).toBe(0);
  });

  it('returns stable invalid-output error when repair also fails', async () => {
    const provider = new MockAiProvider(['bad', schemaInvalid]);
    await expect(
      provider.completeJson({ messages: [] }, RecommendationSchema),
    ).rejects.toMatchObject({ response: { code: 'AI_INVALID_STRUCTURED_OUTPUT' }, status: 502 });
  });

  it('returns stable empty-response error', async () => {
    const provider = new MockAiProvider(['']);
    await expect(
      provider.completeJson({ messages: [] }, RecommendationSchema),
    ).rejects.toMatchObject({ response: { code: 'AI_EMPTY_RESPONSE' }, status: 502 });
  });

  it.each([
    [{ status: 429 }, 'AI_RATE_LIMITED', 429],
    [{ status: 500 }, 'AI_UPSTREAM_UNAVAILABLE', 503],
    [{ name: 'AbortError' }, 'AI_TIMEOUT', 504],
  ])('maps upstream error %o to %s', async (upstream, code, status) => {
    const provider = configuredQwenRejecting(upstream);
    await expect(
      provider.completeJson({ messages: [] }, RecommendationSchema),
    ).rejects.toMatchObject({ response: { code }, status });
  });

  it('returns stable not-configured error without an external call', async () => {
    const provider = new QwenProvider({ get: vi.fn().mockReturnValue(undefined) } as never);
    await expect(
      provider.completeJson({ messages: [] }, RecommendationSchema),
    ).rejects.toMatchObject({ response: { code: 'AI_NOT_CONFIGURED' }, status: 503 });
  });

  it('calls Qwen with thinking and JSON output enabled', async () => {
    const provider = configuredQwenRejecting(new Error('unused'));
    const create = vi.fn().mockResolvedValue({ choices: [{ message: { content: valid } }] });
    (provider as unknown as { client: unknown }).client = { chat: { completions: { create } } };

    await provider.completeJson({ messages: [{ role: 'user', content: '推荐晚餐' }] }, RecommendationSchema);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'test-model',
        enable_thinking: true,
        response_format: { type: 'json_object' },
      }),
    );
  });
});

describe('AiService data boundary and persistence', () => {
  it('queries only the requested kitchen and persists only validated output', async () => {
    const provider = new MockAiProvider([valid]);
    const repository = {
      listDishes: vi.fn().mockResolvedValue([{ name: 'A厨房菜' }]),
      persistRecommendation: vi
        .fn()
        .mockResolvedValue({ id: '10000000-0000-4000-8000-000000000001' }),
    };
    const orchestrator = passthroughOrchestrator(provider);
    const service = new AiService(orchestrator as never, repository as never);
    await service.recommend('kitchen-a', 'user-a', { request: '清淡' }, 'request-key');
    expect(repository.listDishes).toHaveBeenCalledWith('kitchen-a');
    expect(provider.requests[0]?.messages[1]?.content).toContain('A厨房菜');
    expect(provider.requests[0]?.messages[1]?.content).not.toContain('kitchen-b');
    expect(repository.persistRecommendation).toHaveBeenCalledWith(
      'kitchen-a',
      'user-a',
      expect.objectContaining({ recommendations: expect.any(Array) }),
    );
  });

  it('does not persist when both structured outputs are invalid', async () => {
    const provider = new MockAiProvider(['bad', schemaInvalid]);
    const repository = {
      listDishes: vi.fn().mockResolvedValue([]),
      persistRecommendation: vi.fn(),
    };
    const service = new AiService(passthroughOrchestrator(provider) as never, repository as never);
    await expect(
      service.recommend('kitchen-a', 'user-a', {}, 'request-key'),
    ).rejects.toBeInstanceOf(AiProviderException);
    expect(repository.persistRecommendation).not.toHaveBeenCalled();
  });
});

function passthroughOrchestrator(provider: MockAiProvider) {
  return {
    execute: vi.fn(
      async (input: {
        request: Parameters<MockAiProvider['completeJson']>[0];
        schema: typeof RecommendationSchema;
        persist(result: unknown, degraded: boolean): Promise<unknown>;
      }) => {
        const result = await provider.completeJson(input.request, input.schema);
        await input.persist(result, false);
        return result;
      },
    ),
  };
}

function configuredQwenRejecting(error: unknown) {
  const provider = new QwenProvider({
    get: vi.fn((key: string) =>
      key === 'DASHSCOPE_API_KEY' ? 'test-key' : key === 'QWEN_MODEL' ? 'test-model' : undefined,
    ),
  } as never);
  const client = { chat: { completions: { create: vi.fn().mockRejectedValue(error) } } };
  (provider as unknown as { client: unknown }).client = client;
  return provider;
}
