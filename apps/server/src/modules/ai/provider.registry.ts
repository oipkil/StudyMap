import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { MockLanguageModelV4, simulateReadableStream as rawSimulateReadableStream } from 'ai/test';
import { LanguageModel } from 'ai';
import { prisma } from '../../lib/prisma.js';
import { decryptSecret } from '@ssg/shared';
import { createSafeAiFetch } from './ssrf.guard.js';
import { circuitBreaker } from './circuit-breaker.js';

/**
 * Chuẩn hóa chuỗi chunk của model giả lập theo giao thức AI SDK v7:
 * mỗi text-delta phải nằm giữa text-start / text-end cùng id (fullStream báo "text part not found" nếu thiếu).
 */
export function normalizeMockChunks(chunks: any[]): any[] {
  const out: any[] = [];
  const started = new Set<string>();
  const closeAll = () => {
    for (const id of started) out.push({ type: 'text-end', id });
    started.clear();
  };
  for (const c of chunks) {
    if (c?.type === 'text-delta') {
      const id = String(c.id ?? '0');
      if (!started.has(id)) {
        out.push({ type: 'text-start', id });
        started.add(id);
      }
      out.push(c);
      continue;
    }
    if (c?.type === 'finish' || c?.type === 'error') closeAll();
    out.push(c);
  }
  closeAll();
  return out;
}

export const simulateReadableStream = (opts: any) => rawSimulateReadableStream({ ...opts, chunks: normalizeMockChunks(opts.chunks || []) });

export interface ResolvedModelInfo {
  model: LanguageModel;
  modelConfigId: string;
  modelIdentifier: string;
  providerId: string;
  providerName: string;
  maxTokens: number;
  supportsTools: boolean;
  supportsStreaming: boolean;
  defaultTemperature: number;
}

// In-memory cache for resolved registry
let registryCacheTime = 0;

// Test override map for Mocking
const mockModelOverrides = new Map<string, LanguageModel>();

export function setMockModelOverride(modelIdentifier: string, model: LanguageModel) {
  mockModelOverrides.set(modelIdentifier, model);
}

export function clearMockModelOverrides() {
  mockModelOverrides.clear();
}

export function invalidateRegistryCache() {
  registryCacheTime = 0;
}

/**
 * Xây dựng default mock language model cho test
 */
export function createDefaultMockModel(customResponse?: string): LanguageModel {
  const text = customResponse || 'Xin chào! Mình là Trợ lý AI SSG, sẵn sàng gợi ý không gian học tập tuyệt vời cho bạn quanh ĐHQG-HCM.';
  return new MockLanguageModelV4({
    doGenerate: async () =>
      ({
        rawCall: { rawPrompt: null, rawSettings: {} },
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: {
          inputTokens: { total: 15, noCache: 15, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 25, text: 25, reasoning: 0 },
        },
        content: [{ type: 'text', text }],
        warnings: [],
      } as any),
    doStream: async () =>
      ({
        rawCall: { rawPrompt: null, rawSettings: {} },
        warnings: [],
        stream: simulateReadableStream({
          initialDelayInMs: 0,
          chunkDelayInMs: 15,
          chunks: [
            { type: 'text-delta', id: '1', delta: text.slice(0, Math.floor(text.length / 2)) },
            { type: 'text-delta', id: '1', delta: text.slice(Math.floor(text.length / 2)) },
            {
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage: {
                inputTokens: { total: 15, noCache: 15, cacheRead: 0, cacheWrite: 0 },
                outputTokens: { total: 25, text: 25, reasoning: 0 },
              },
            },
          ] as any,
        }),
      } as any),
  }) as unknown as LanguageModel;
}

/**
 * Khởi tạo provider instance thực tế từ DB
 */
function buildProviderInstance(provider: any) {
  const masterKey = process.env.ENCRYPTION_MASTER_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  let apiKey = '';
  try {
    apiKey = decryptSecret(
      {
        ciphertext: provider.encryptedApiKey,
        iv: provider.iv,
        authTag: provider.authTag,
      },
      masterKey
    );
  } catch (err) {
    console.error(`Không thể giải mã API key cho provider ${provider.name}:`, err);
    apiKey = 'dummy-key';
  }

  const safeFetch = createSafeAiFetch();

  switch (provider.adapterType) {
    case 'OPENAI':
      return createOpenAI({
        apiKey,
        baseURL: provider.baseUrl || undefined,
        fetch: safeFetch,
      });
    case 'ANTHROPIC':
      return createAnthropic({
        apiKey,
        baseURL: provider.baseUrl || undefined,
        fetch: safeFetch,
      });
    case 'GOOGLE':
      return createGoogleGenerativeAI({
        apiKey,
        baseURL: provider.baseUrl || undefined,
        fetch: safeFetch,
      });
    case 'OPENAI_COMPATIBLE':
      return createOpenAICompatible({
        name: provider.name,
        apiKey,
        baseURL: provider.baseUrl || 'https://api.openai.com/v1',
        fetch: safeFetch,
      });
    case 'MOCK':
    default:
      return (_modelId: string) => createDefaultMockModel();
  }
}

/**
 * Lấy model đã resolve theo Model Config ID hoặc Model Identifier
 */
export async function resolveAiModel(modelConfigIdOrName?: string): Promise<ResolvedModelInfo | null> {
  // 1. Tìm model config từ DB
  let modelConfig: any = null;
  if (modelConfigIdOrName) {
    modelConfig = await prisma.aIModelConfig.findFirst({
      where: {
        OR: [{ id: modelConfigIdOrName }, { modelId: modelConfigIdOrName }],
        provider: { isEnabled: true },
      },
      include: { provider: true },
    });
  }

  // 2. Nếu không chỉ định hoặc chưa tìm thấy, lấy model từ provider mặc định
  if (!modelConfig) {
    modelConfig = await prisma.aIModelConfig.findFirst({
      where: {
        provider: { isEnabled: true, isDefault: true },
      },
      include: { provider: true },
      orderBy: { provider: { sortOrder: 'asc' } },
    });
  }

  // 3. Nếu vẫn chưa có, lấy bất kỳ model nào đang bật
  if (!modelConfig) {
    modelConfig = await prisma.aIModelConfig.findFirst({
      where: { provider: { isEnabled: true } },
      include: { provider: true },
    });
  }

  if (!modelConfig) {
    if (modelConfigIdOrName && mockModelOverrides.has(modelConfigIdOrName)) {
      return {
        model: mockModelOverrides.get(modelConfigIdOrName)!,
        modelConfigId: modelConfigIdOrName,
        modelIdentifier: modelConfigIdOrName,
        providerId: 'mock-provider-id',
        providerName: 'Mock Provider',
        maxTokens: 2048,
        supportsTools: true,
        supportsStreaming: true,
        defaultTemperature: 0.7,
      };
    }
    return null;
  }

  // 4. Kiểm tra Circuit Breaker của provider
  if (!circuitBreaker.isAvailable(modelConfig.providerId)) {
    console.warn(`Provider ${modelConfig.provider.name} đang mở ngắt mạch (Circuit Open).`);
    return null;
  }

  // 5. Dựng model instance
  if (modelConfig.provider.adapterType === 'MOCK' || process.env.NODE_ENV === 'test') {
    const mockModel =
      mockModelOverrides.get(modelConfig.id) ||
      mockModelOverrides.get(modelConfig.modelId) ||
      (modelConfigIdOrName ? mockModelOverrides.get(modelConfigIdOrName) : undefined) ||
      createDefaultMockModel();

    return {
      model: mockModel,
      modelConfigId: modelConfig.id,
      modelIdentifier: modelConfig.modelId,
      providerId: modelConfig.providerId,
      providerName: modelConfig.provider.name,
      maxTokens: modelConfig.maxTokens,
      supportsTools: modelConfig.supportsTools,
      supportsStreaming: modelConfig.supportsStreaming,
      defaultTemperature: modelConfig.defaultTemperature,
    };
  }

  const providerInstance = buildProviderInstance(modelConfig.provider);
  const model = providerInstance(modelConfig.modelId);

  return {
    model,
    modelConfigId: modelConfig.id,
    modelIdentifier: modelConfig.modelId,
    providerId: modelConfig.providerId,
    providerName: modelConfig.provider.name,
    maxTokens: modelConfig.maxTokens,
    supportsTools: modelConfig.supportsTools,
    supportsStreaming: modelConfig.supportsStreaming,
    defaultTemperature: modelConfig.defaultTemperature,
  };
}
