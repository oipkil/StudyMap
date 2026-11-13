import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { requireAuth, requireRole } from '../../middleware/authGuard.js';
import { validateBody } from '../../middleware/validate.js';
import { ErrorCode, encryptSecret, decryptSecret, maskApiKey } from '@ssg/shared';
import { validateAiBaseUrl, createSafeAiFetch } from '../ai/ssrf.guard.js';
import { circuitBreaker } from '../ai/circuit-breaker.js';
import { invalidateRegistryCache } from '../ai/provider.registry.js';
import { abortConversationAttempts } from '../ai/chat.streamer.js';
import { getSocketServer } from '../../socket/index.js';
import { MessageRole, AIMessageStatus, ConversationStatus, SupportStatus, AIProviderType } from '@prisma/client';

const router = Router();
router.use(requireAuth, requireRole('ADMIN'));

const masterKey = process.env.ENCRYPTION_MASTER_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

// =========================================================================
// 1. PROVIDERS & MODELS MANAGEMENT
// =========================================================================
router.get('/providers', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const providers = await prisma.aIProviderConfig.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { models: true },
    });

    const data = providers.map((p) => {
      const circuit = circuitBreaker.getStatus(p.id);
      return {
        id: p.id,
        name: p.name,
        adapterType: p.adapterType,
        baseUrl: p.baseUrl,
        maskedApiKey: maskApiKey(p.encryptedApiKey), // Trả về dạng che
        isEnabled: p.isEnabled,
        isDefault: p.isDefault,
        sortOrder: p.sortOrder,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        models: p.models,
        circuitStatus: {
          state: circuit.state,
          consecutiveFailures: circuit.consecutiveFailures,
          openUntil: circuit.openUntil,
          lastFailureAt: circuit.lastFailureAt,
          lastSuccessAt: circuit.lastSuccessAt,
        },
      };
    });

    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

const CreateProviderSchema = z.object({
  name: z.string().min(2).max(50),
  adapterType: z.nativeEnum(AIProviderType),
  baseUrl: z.string().optional(),
  apiKey: z.string().min(1),
  isEnabled: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  models: z.array(
    z.object({
      modelId: z.string().min(1),
      displayName: z.string().min(1),
      maxTokens: z.number().default(2048),
      supportsTools: z.boolean().default(true),
      supportsStreaming: z.boolean().default(true),
      defaultTemperature: z.number().default(0.7),
    })
  ).default([]),
});

router.post('/providers', validateBody(CreateProviderSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, adapterType, baseUrl, apiKey, isEnabled, isDefault, models } = req.body;

    // 1. SSRF check trên baseUrl nếu có
    if (baseUrl) {
      const ssrfCheck = await validateAiBaseUrl(baseUrl);
      if (!ssrfCheck.valid) {
        return res.status(400).json({
          success: false,
          errorCode: ErrorCode.VALIDATION_ERROR,
          message: `Địa chỉ Base URL bị từ chối do chính sách bảo mật SSRF: ${ssrfCheck.error}`,
        });
      }
    }

    // 2. Mã hóa API Key bằng AES-256-GCM
    const encrypted = encryptSecret(apiKey, masterKey);

    // 3. Nếu đặt làm default -> gỡ default cũ
    if (isDefault) {
      await prisma.aIProviderConfig.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const provider = await prisma.aIProviderConfig.create({
      data: {
        name,
        adapterType,
        baseUrl: baseUrl || null,
        encryptedApiKey: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        isEnabled,
        isDefault,
        models: {
          create: models.map((m: any) => ({
            modelId: m.modelId,
            displayName: m.displayName,
            maxTokens: m.maxTokens,
            supportsTools: m.supportsTools,
            supportsStreaming: m.supportsStreaming,
            defaultTemperature: m.defaultTemperature,
          })),
        },
      },
      include: { models: true },
    });

    invalidateRegistryCache();

    // Ghi Audit Log
    await prisma.auditLog.create({
      data: {
        adminUserId: req.user!.id,
        action: 'CREATE_AI_PROVIDER',
        targetEntity: 'AIProviderConfig',
        targetId: provider.id,
        details: { name, adapterType, modelsCount: models.length },
      },
    });

    return res.status(201).json({
      success: true,
      data: {
        id: provider.id,
        name: provider.name,
        maskedApiKey: maskApiKey(provider.encryptedApiKey),
        isEnabled: provider.isEnabled,
        isDefault: provider.isDefault,
        models: provider.models,
      },
      message: 'Đã thêm nhà cung cấp AI thành công',
    });
  } catch (err) {
    next(err);
  }
});

router.put('/providers/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { name, isEnabled, isDefault, apiKey, baseUrl } = req.body;

    const existing = await prisma.aIProviderConfig.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy nhà cung cấp' });
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (isEnabled !== undefined) updateData.isEnabled = isEnabled;
    if (baseUrl !== undefined) {
      if (baseUrl) {
        const ssrfCheck = await validateAiBaseUrl(baseUrl);
        if (!ssrfCheck.valid) {
          return res.status(400).json({
            success: false,
            errorCode: ErrorCode.VALIDATION_ERROR,
            message: `SSRF Blocked: ${ssrfCheck.error}`,
          });
        }
      }
      updateData.baseUrl = baseUrl || null;
    }

    if (isDefault) {
      await prisma.aIProviderConfig.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
      updateData.isDefault = true;
    }

    // Key Rotation nếu có nhập key mới
    if (apiKey) {
      const encrypted = encryptSecret(apiKey, masterKey);
      updateData.encryptedApiKey = encrypted.ciphertext;
      updateData.iv = encrypted.iv;
      updateData.authTag = encrypted.authTag;
    }

    const updated = await prisma.aIProviderConfig.update({
      where: { id },
      data: updateData,
      include: { models: true },
    });

    invalidateRegistryCache();

    await prisma.auditLog.create({
      data: {
        adminUserId: req.user!.id,
        action: 'UPDATE_AI_PROVIDER',
        targetEntity: 'AIProviderConfig',
        targetId: id,
        details: { updatedFields: Object.keys(updateData) },
      },
    });

    return res.json({ success: true, data: updated, message: 'Đã cập nhật cấu hình nhà cung cấp' });
  } catch (err) {
    next(err);
  }
});

router.delete('/providers/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const provider = await prisma.aIProviderConfig.findUnique({
      where: { id },
      include: { models: { select: { id: true, displayName: true } } },
    });
    if (!provider) {
      return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy nhà cung cấp' });
    }

    // Model của provider đang được tác vụ dùng làm model chính/dự phòng hoặc đã có lịch sử attempt
    // -> xoá sẽ vi phạm khoá ngoại (ai_task_configs_activeModelId_fkey). Chặn sớm và hướng dẫn thay vì để Prisma ném lỗi.
    const modelIds = provider.models.map((m) => m.id);
    const [tasksUsing, attemptCount] = await Promise.all([
      prisma.aITaskConfig.findMany({
        where: { OR: [{ activeModelId: { in: modelIds } }, { fallbackModelId: { in: modelIds } }] },
        select: { taskType: true },
      }),
      prisma.aIAttempt.count({ where: { modelId: { in: modelIds } } }),
    ]);
    if (tasksUsing.length > 0 || attemptCount > 0) {
      const reasons: string[] = [];
      if (tasksUsing.length > 0) {
        reasons.push(`đang là model chính/dự phòng của tác vụ: ${tasksUsing.map((t) => t.taskType).join(', ')}`);
      }
      if (attemptCount > 0) reasons.push(`đã có ${attemptCount} lượt gọi AI ghi nhận với model của nhà cung cấp này`);
      return res.status(409).json({
        success: false,
        errorCode: ErrorCode.CONFLICT,
        message: `Không thể xóa nhà cung cấp "${provider.name}" vì ${reasons.join(' và ')}. Hãy đổi model của tác vụ sang nhà cung cấp khác rồi xóa, hoặc tắt (isEnabled = false) nhà cung cấp này để giữ lịch sử.`,
      });
    }

    await prisma.aIProviderConfig.delete({ where: { id } });
    invalidateRegistryCache();
    return res.json({ success: true, message: 'Đã xóa nhà cung cấp' });
  } catch (err) {
    next(err);
  }
});

// ---- Đồng bộ / thêm / xoá model của một provider ----

const DEFAULT_LIST_ENDPOINTS: Record<string, string> = {
  OPENAI: 'https://api.openai.com/v1',
  ANTHROPIC: 'https://api.anthropic.com/v1',
  GOOGLE: 'https://generativelanguage.googleapis.com/v1beta',
};

function decryptProviderKey(provider: { encryptedApiKey: string; iv: string; authTag: string }): string {
  return decryptSecret({ ciphertext: provider.encryptedApiKey, iv: provider.iv, authTag: provider.authTag }, masterKey);
}

type RemoteModel = { modelId: string; displayName: string };

/**
 * Gọi endpoint liệt kê model của nhà cung cấp qua safe fetch (SSRF guard + chặn redirect).
 * Chỉ hỗ trợ các adapter có endpoint liệt kê đã biết; MOCK không có.
 */
async function fetchRemoteModels(
  adapterType: AIProviderType,
  baseUrl: string | null,
  apiKey: string,
): Promise<RemoteModel[]> {
  const safeFetch = createSafeAiFetch();
  const base = (baseUrl || DEFAULT_LIST_ENDPOINTS[adapterType] || '').replace(/\/+$/, '');
  if (!base) throw new Error('Adapter này không có endpoint liệt kê model; hãy nhập model thủ công.');

  const tryJson = async (url: string, headers: Record<string, string>) => {
    const r = await safeFetch(url, { headers, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status });
    return r.json() as Promise<any>;
  };

  switch (adapterType) {
    case 'OPENAI':
    case 'OPENAI_COMPATIBLE': {
      const headers = { Authorization: `Bearer ${apiKey}` };
      let json: any;
      try {
        json = await tryJson(`${base}/models`, headers);
      } catch (err: any) {
        // Một số endpoint OpenAI-compatible chỉ phục vụ dưới /v1
        if (err.status === 404 && !/\/v1$/.test(base)) json = await tryJson(`${base}/v1/models`, headers);
        else throw err;
      }
      return (json.data ?? []).map((m: any) => ({ modelId: String(m.id), displayName: String(m.id) }));
    }
    case 'ANTHROPIC': {
      const json = await tryJson(`${base}/models`, { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' });
      return (json.data ?? []).map((m: any) => ({ modelId: String(m.id), displayName: String(m.display_name || m.id) }));
    }
    case 'GOOGLE': {
      const json = await tryJson(`${base}/models`, { 'x-goog-api-key': apiKey });
      return (json.models ?? [])
        .filter((m: any) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
        .map((m: any) => ({
          modelId: String(m.name).replace(/^models\//, ''),
          displayName: String(m.displayName || m.name),
        }));
    }
    default:
      throw new Error('Adapter này không hỗ trợ đồng bộ model từ API; hãy nhập model thủ công.');
  }
}

router.post('/providers/:id/sync-models', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const provider = await prisma.aIProviderConfig.findUnique({ where: { id }, include: { models: true } });
    if (!provider) {
      return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy nhà cung cấp' });
    }
    if (provider.baseUrl) {
      const ssrfCheck = await validateAiBaseUrl(provider.baseUrl);
      if (!ssrfCheck.valid) {
        return res.status(400).json({ success: false, errorCode: ErrorCode.VALIDATION_ERROR, message: `Base URL bị chặn: ${ssrfCheck.error}` });
      }
    }

    let remote: RemoteModel[];
    try {
      remote = await fetchRemoteModels(provider.adapterType, provider.baseUrl, decryptProviderKey(provider));
    } catch (err: any) {
      // Không trả nguyên văn lỗi upstream (có thể chứa URL/khoá); chỉ trả mã HTTP hoặc lý do ngắn.
      const reason = err.status ? `nhà cung cấp trả về HTTP ${err.status}` : (err.message || '').startsWith('SSRF') ? 'URL bị chặn bởi SSRF guard' : (err.message || 'không kết nối được');
      return res.status(502).json({
        success: false,
        errorCode: ErrorCode.PROVIDER_UNAVAILABLE,
        message: `Không lấy được danh sách model: ${reason}. Kiểm tra API key/Base URL hoặc nhập model thủ công.`,
      });
    }

    const existing = new Set(provider.models.map((m) => m.modelId));
    const toCreate = remote.filter((m) => !existing.has(m.modelId));
    if (toCreate.length > 0) {
      await prisma.aIModelConfig.createMany({
        data: toCreate.map((m) => ({ providerId: id, modelId: m.modelId, displayName: m.displayName })),
        skipDuplicates: true,
      });
    }
    invalidateRegistryCache();

    await prisma.auditLog.create({
      data: {
        adminUserId: req.user!.id,
        action: 'SYNC_AI_PROVIDER_MODELS',
        targetEntity: 'AIProviderConfig',
        targetId: id,
        details: { remoteCount: remote.length, added: toCreate.length },
      },
    });

    const models = await prisma.aIModelConfig.findMany({ where: { providerId: id }, orderBy: { modelId: 'asc' } });
    return res.json({
      success: true,
      data: { models, added: toCreate.length, remoteCount: remote.length },
      message: toCreate.length > 0 ? `Đã thêm ${toCreate.length} model mới (${remote.length} model từ API)` : `Không có model mới (${remote.length} model từ API đã có sẵn)`,
    });
  } catch (err) {
    next(err);
  }
});

const AddModelSchema = z.object({
  modelId: z.string().trim().min(1).max(200),
  displayName: z.string().trim().min(1).max(200).optional(),
});

router.post('/providers/:id/models', validateBody(AddModelSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { modelId, displayName } = req.body as z.infer<typeof AddModelSchema>;
    const provider = await prisma.aIProviderConfig.findUnique({ where: { id } });
    if (!provider) {
      return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy nhà cung cấp' });
    }
    const dup = await prisma.aIModelConfig.findUnique({ where: { providerId_modelId: { providerId: id, modelId } } });
    if (dup) {
      return res.status(409).json({ success: false, errorCode: ErrorCode.CONFLICT, message: `Model "${modelId}" đã tồn tại ở nhà cung cấp này` });
    }
    const created = await prisma.aIModelConfig.create({ data: { providerId: id, modelId, displayName: displayName || modelId } });
    invalidateRegistryCache();
    return res.status(201).json({ success: true, data: created, message: 'Đã thêm model' });
  } catch (err) {
    next(err);
  }
});

router.delete('/providers/:id/models/:modelConfigId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, modelConfigId } = req.params as { id: string; modelConfigId: string };
    const model = await prisma.aIModelConfig.findFirst({ where: { id: modelConfigId, providerId: id } });
    if (!model) {
      return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy model' });
    }
    const [taskRefs, attemptCount] = await Promise.all([
      prisma.aITaskConfig.count({ where: { OR: [{ activeModelId: modelConfigId }, { fallbackModelId: modelConfigId }] } }),
      prisma.aIAttempt.count({ where: { modelId: modelConfigId } }),
    ]);
    if (taskRefs > 0 || attemptCount > 0) {
      return res.status(409).json({
        success: false,
        errorCode: ErrorCode.CONFLICT,
        message: `Không thể xóa model "${model.displayName}": ${taskRefs > 0 ? 'đang được tác vụ dùng làm model chính/dự phòng' : ''}${taskRefs > 0 && attemptCount > 0 ? ' và ' : ''}${attemptCount > 0 ? `đã có ${attemptCount} lượt gọi ghi nhận` : ''}. Đổi model của tác vụ trước khi xóa.`,
      });
    }
    await prisma.aIModelConfig.delete({ where: { id: modelConfigId } });
    invalidateRegistryCache();
    return res.json({ success: true, message: 'Đã xóa model' });
  } catch (err) {
    next(err);
  }
});

// Test kết nối AI Provider có SSRF guard
router.post('/providers/test-connection', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { baseUrl, apiKey } = req.body;
    if (baseUrl) {
      const ssrfCheck = await validateAiBaseUrl(baseUrl);
      if (!ssrfCheck.valid) {
        return res.status(400).json({
          success: false,
          errorCode: ErrorCode.VALIDATION_ERROR,
          message: `Không thể kiểm tra kết nối do vi phạm SSRF: ${ssrfCheck.error}`,
        });
      }
    }

    // Ping thử nghiệm với safe fetch
    if (baseUrl) {
      const safeFetch = createSafeAiFetch();
      try {
        const pingRes = await safeFetch(`${baseUrl}/models`, {
          headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
          signal: AbortSignal.timeout(5000),
        });
        return res.json({
          success: pingRes.ok,
          status: pingRes.status,
          message: pingRes.ok ? 'Kết nối tới endpoint AI thành công' : `Endpoint trả về mã lỗi HTTP ${pingRes.status}`,
        });
      } catch (err: any) {
        return res.json({
          success: false,
          message: `Kiểm tra kết nối thất bại: ${err.message}`,
        });
      }
    }

    return res.json({ success: true, message: 'Kiểm tra cấu hình hợp lệ' });
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// 2. TASK CONFIGS & VERSIONING
// =========================================================================
router.get('/task-configs', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const configs = await prisma.aITaskConfig.findMany({
      include: {
        activeModel: { include: { provider: true } },
        versions: { orderBy: { version: 'desc' } },
      },
    });

    return res.json({ success: true, data: configs });
  } catch (err) {
    next(err);
  }
});

const UpdateTaskConfigSchema = z.object({
  activeModelId: z.string().optional(),
  fallbackModelId: z.string().optional().nullable(),
  systemPrompt: z.string().min(10).max(5000).optional(),
  maxPlacesInAnswer: z.number().min(1).max(10).optional(),
  toolAllowlist: z.array(z.string()).optional(),
});

router.put('/task-configs/:id', validateBody(UpdateTaskConfigSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { activeModelId, fallbackModelId, systemPrompt, maxPlacesInAnswer, toolAllowlist } = req.body;

    const current = await prisma.aITaskConfig.findUnique({
      where: { id },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });

    if (!current) {
      return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy cấu hình tác vụ' });
    }

    const nextVersionNum = current.promptVersion + 1;
    const targetModelId = activeModelId || current.activeModelId;
    const targetPrompt = systemPrompt || current.systemPrompt;
    const targetTools = toolAllowlist || current.toolAllowlist;

    // Giao dịch tạo version mới bất biến
    const updated = await prisma.$transaction(async (tx) => {
      const version = await tx.aITaskConfigVersion.create({
        data: {
          taskConfigId: id,
          version: nextVersionNum,
          modelId: targetModelId,
          systemPrompt: targetPrompt,
          toolAllowlist: targetTools,
        },
      });

      const config = await tx.aITaskConfig.update({
        where: { id },
        data: {
          activeModelId: targetModelId,
          fallbackModelId: fallbackModelId !== undefined ? fallbackModelId : current.fallbackModelId,
          systemPrompt: targetPrompt,
          maxPlacesInAnswer: maxPlacesInAnswer || current.maxPlacesInAnswer,
          toolAllowlist: targetTools,
          promptVersion: nextVersionNum,
        },
        include: { activeModel: true, versions: { orderBy: { version: 'desc' } } },
      });

      return { config, version };
    });

    await prisma.auditLog.create({
      data: {
        adminUserId: req.user!.id,
        action: 'UPDATE_AI_TASK_CONFIG',
        targetEntity: 'AITaskConfig',
        targetId: id,
        details: { version: nextVersionNum, taskType: current.taskType },
      },
    });

    return res.json({
      success: true,
      data: updated.config,
      message: `Đã cập nhật cấu hình tác vụ và tạo phiên bản bất biến v${nextVersionNum}`,
    });
  } catch (err) {
    next(err);
  }
});

// Rollback về version cũ
router.post('/task-configs/:id/rollback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { targetVersion } = req.body;

    const versionRecord = await prisma.aITaskConfigVersion.findUnique({
      where: { taskConfigId_version: { taskConfigId: id, version: targetVersion } },
    });

    if (!versionRecord) {
      return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: `Không tìm thấy phiên bản v${targetVersion}` });
    }

    const current = await prisma.aITaskConfig.findUnique({ where: { id } });
    const nextVersionNum = (current?.promptVersion || 1) + 1;

    const updated = await prisma.$transaction(async (tx) => {
      await tx.aITaskConfigVersion.create({
        data: {
          taskConfigId: id,
          version: nextVersionNum,
          modelId: versionRecord.modelId,
          systemPrompt: versionRecord.systemPrompt,
          toolAllowlist: versionRecord.toolAllowlist,
        },
      });

      return tx.aITaskConfig.update({
        where: { id },
        data: {
          activeModelId: versionRecord.modelId,
          systemPrompt: versionRecord.systemPrompt,
          toolAllowlist: versionRecord.toolAllowlist,
          promptVersion: nextVersionNum,
        },
      });
    });

    return res.json({
      success: true,
      data: updated,
      message: `Đã khôi phục về nội dung của v${targetVersion} và lưu thành phiên bản mới v${nextVersionNum}`,
    });
  } catch (err) {
    next(err);
  }
});

// =========================================================================
// 3. CONVERSATIONS AUDIT & HUMAN SUPPORT
// =========================================================================
router.get('/conversations', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // Chỉ trả về metadata quan sát (thời gian, user, model, token, latency, feedback, status)
    const conversations = await prisma.aIConversation.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 50,
      include: {
        user: { select: { id: true, username: true, email: true } },
        supportCase: true,
        messages: {
          orderBy: { sequenceNumber: 'desc' },
          take: 1,
          include: {
            attempts: {
              take: 1,
              orderBy: { attemptNumber: 'desc' },
              include: { model: { select: { displayName: true } } },
            },
          },
        },
      },
    });

    const data = conversations.map((c) => {
      const lastMsg = c.messages[0];
      const lastAttempt = lastMsg?.attempts[0];
      return {
        id: c.id,
        title: c.title,
        status: c.status,
        updatedAt: c.updatedAt,
        user: c.user,
        supportCase: c.supportCase,
        lastModelUsed: lastAttempt?.model?.displayName || 'N/A',
        totalTokens: (lastAttempt?.promptTokens || 0) + (lastAttempt?.completionTokens || 0),
        feedback: lastMsg?.feedback || null,
      };
    });

    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// Mở xem nội dung hội thoại (Bắt buộc nhập lý do & ghi AuditLog)
router.post('/conversations/:id/view-content', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { purpose } = req.body;

    if (!purpose || typeof purpose !== 'string' || purpose.trim().length < 5) {
      return res.status(400).json({
        success: false,
        errorCode: ErrorCode.VALIDATION_ERROR,
        message: 'Bắt buộc nhập lý do kiểm tra / xử lý vé hỗ trợ (tối thiểu 5 ký tự)',
      });
    }

    const conversation = await prisma.aIConversation.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, username: true, email: true } },
        messages: {
          orderBy: { sequenceNumber: 'asc' },
          include: {
            attempts: {
              orderBy: { attemptNumber: 'desc' },
              take: 1,
              include: { model: { select: { displayName: true } } },
            },
          },
        },
      },
    });

    if (!conversation) {
      return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy hội thoại' });
    }

    // GHI AUDIT LOG BẮT BUỘC
    await prisma.auditLog.create({
      data: {
        adminUserId: req.user!.id,
        action: 'VIEW_CHAT_CONTENT',
        targetEntity: 'AIConversation',
        targetId: id,
        details: { purpose, userId: conversation.user.id },
      },
    });

    return res.json({
      success: true,
      data: conversation,
    });
  } catch (err) {
    next(err);
  }
});

// Admin phản hồi trực tiếp (Human Active Mode)
router.post('/conversations/:id/reply-human', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const { content } = req.body;

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ success: false, message: 'Nội dung tin nhắn không được để trống' });
    }

    const conversation = await prisma.aIConversation.findUnique({
      where: { id },
      include: { supportCase: true },
    });

    if (!conversation) {
      return res.status(404).json({ success: false, errorCode: ErrorCode.NOT_FOUND, message: 'Không tìm thấy hội thoại' });
    }

    // A5: Abort active AI attempt nếu có
    await abortConversationAttempts(id);

    const messageCount = await prisma.aIMessage.count({ where: { conversationId: id } });

    // Tạo tin nhắn với role ADMIN
    const adminMessage = await prisma.aIMessage.create({
      data: {
        conversationId: id,
        role: MessageRole.ADMIN,
        content,
        sequenceNumber: messageCount + 1,
        status: AIMessageStatus.COMPLETED,
      },
    });

    // Cập nhật trạng thái hội thoại và support case
    await prisma.aIConversation.update({
      where: { id },
      data: { status: ConversationStatus.HUMAN_ACTIVE },
    });

    if (conversation.supportCase) {
      await prisma.supportCase.update({
        where: { id: conversation.supportCase.id },
        data: {
          status: SupportStatus.HUMAN_ACTIVE,
          assignedAdminId: req.user!.id,
        },
      });
    }

    // Phát socket cho user
    const io = getSocketServer();
    if (io) {
      io.to(`user:${conversation.userId}`).emit('chat.message.human', {
        conversationId: id,
        message: adminMessage,
        adminName: req.user!.username,
      });
    }

    return res.json({
      success: true,
      data: adminMessage,
      message: 'Đã gửi phản hồi hỗ trợ trực tiếp từ quản trị viên',
    });
  } catch (err) {
    next(err);
  }
});

// Trả lại chế độ AI
router.post('/conversations/:id/return-to-ai', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    await prisma.aIConversation.update({
      where: { id },
      data: { status: ConversationStatus.AI_ACTIVE },
    });

    const io = getSocketServer();
    const conv = await prisma.aIConversation.findUnique({ where: { id } });
    if (io && conv) {
      io.to(`user:${conv.userId}`).emit('chat.mode.changed', {
        conversationId: id,
        status: ConversationStatus.AI_ACTIVE,
      });
    }

    return res.json({ success: true, message: 'Đã chuyển hội thoại về Trợ lý AI tự động' });
  } catch (err) {
    next(err);
  }
});

export default router;
