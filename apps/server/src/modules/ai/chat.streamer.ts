import { streamText, stepCountIs, LanguageModel } from 'ai';
import { prisma } from '../../lib/prisma.js';
import { Server } from 'socket.io';
import { AIMessageStatus, MessageRole, AITaskType, ConversationStatus } from '@prisma/client';
import { resolveAiModel } from './provider.registry.js';
import { allAiTools } from './tools/place.tools.js';
import {
  acquireUserGenerationLock,
  releaseUserGenerationLock,
  checkAiQuota,
  recordAiUsage,
} from './quota.service.js';
import { circuitBreaker } from './circuit-breaker.js';

// Map lưu trữ active AbortControllers theo attemptId
const activeAbortControllers = new Map<string, AbortController>();

export function abortAiAttempt(attemptId: string): boolean {
  const controller = activeAbortControllers.get(attemptId);
  if (controller) {
    controller.abort();
    activeAbortControllers.delete(attemptId);
    return true;
  }
  return false;
}

export async function abortConversationAttempts(conversationId: string): Promise<void> {
  const streamingMessages = await prisma.aIMessage.findMany({
    where: { conversationId, status: AIMessageStatus.STREAMING },
    include: { attempts: true },
  });
  for (const msg of streamingMessages) {
    for (const att of msg.attempts) {
      abortAiAttempt(att.id);
    }
  }
}

export function sanitizeAiError(err: any): { errorCode: string; safeMessage: string; sanitizedLog: string } {
  const raw = String(err?.message || err || '');
  // Che khóa API và URLs trong chuỗi log
  const sanitizedLog = raw
    .replace(/sk-[a-zA-Z0-9_-]+/g, 'sk-***')
    .replace(/https?:\/\/[^\s"'<>]+/g, '[URL]');

  if (/timeout|timed out|ETIMEDOUT/i.test(raw)) {
    return {
      errorCode: 'PROVIDER_TIMEOUT',
      safeMessage: 'Yêu cầu tới nhà cung cấp AI bị quá thời gian phản hồi. Vui lòng thử lại sau.',
      sanitizedLog,
    };
  }
  if (/quota|rate limit|429/i.test(raw)) {
    return {
      errorCode: 'QUOTA_EXCEEDED',
      safeMessage: 'Đã vượt hạn mức sử dụng AI trong ngày.',
      sanitizedLog,
    };
  }
  if (/unavailable|circuit|503|502|ECONNREFUSED/i.test(raw)) {
    return {
      errorCode: 'PROVIDER_UNAVAILABLE',
      safeMessage: 'Nhà cung cấp AI đang tạm thời không khả dụng. Vui lòng thử lại sau.',
      sanitizedLog,
    };
  }
  if (/abort|cancel/i.test(raw)) {
    return {
      errorCode: 'STOPPED',
      safeMessage: 'Phản hồi đã được dừng theo yêu cầu.',
      sanitizedLog,
    };
  }
  return {
    errorCode: 'PROCESSING_FAILED',
    safeMessage: 'Không thể tạo phản hồi từ Trợ lý AI lúc này. Vui lòng thử lại.',
    sanitizedLog,
  };
}

export interface StreamChatOptions {
  io: Server;
  conversationId: string;
  userId: string;
  userRole: string;
  content: string;
  idempotencyKey: string;
  currentPlaceId?: string;
  customTaskType?: AITaskType;
}

export async function handleStreamChat({
  io,
  conversationId,
  userId,
  userRole,
  content,
  idempotencyKey,
  currentPlaceId,
  customTaskType = AITaskType.STUDENT_CHAT,
}: StreamChatOptions) {
  // 1. Kiểm tra quyền riêng tư (Privacy Consent)
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.aiPrivacyConsentAccepted) {
    throw {
      statusCode: 403,
      errorCode: 'PRIVACY_CONSENT_REQUIRED',
      message: 'Bạn cần đồng ý với điều khoản quyền riêng tư trước khi sử dụng Trợ lý AI.',
    };
  }

  // 2. Kiểm tra Idempotency
  const existingAttempt = await prisma.aIAttempt.findUnique({
    where: { idempotencyKey },
    include: { message: true },
  });
  if (existingAttempt) {
    return {
      isExisting: true,
      message: existingAttempt.message,
      attempt: existingAttempt,
    };
  }

  // 3. Kiểm tra trạng thái Human Handoff của hội thoại
  const conversation = await prisma.aIConversation.findUnique({
    where: { id: conversationId },
  });
  if (!conversation) {
    throw { statusCode: 404, errorCode: 'NOT_FOUND', message: 'Hội thoại không tồn tại' };
  }

  // 4. Kiểm tra Quota
  const quotaCheck = await checkAiQuota(userId, userRole);
  if (!quotaCheck.allowed) {
    throw {
      statusCode: 429,
      errorCode: 'QUOTA_EXCEEDED',
      message: quotaCheck.reason,
    };
  }

  // 5. Khóa đồng thời (Max 1 concurrent generation/user)
  const lockAcquired = acquireUserGenerationLock(userId);
  if (!lockAcquired) {
    throw {
      statusCode: 429,
      errorCode: 'CONCURRENT_GENERATION_LIMIT',
      message: 'Bạn đang có một phản hồi AI đang xử lý. Vui lòng đợi hoàn tất trước khi gửi tin nhắn tiếp theo.',
    };
  }

  // 6. Lấy cấu hình tác vụ AITaskConfig và version bất biến
  let taskConfig = await prisma.aITaskConfig.findUnique({
    where: { taskType: customTaskType },
    include: { activeModel: true, versions: { orderBy: { version: 'desc' }, take: 1 } },
  });

  if (!taskConfig) {
    // Khởi tạo TaskConfig mặc định nếu DB chưa có
    const defaultModel = await prisma.aIModelConfig.findFirst({
      where: { provider: { isEnabled: true } },
    });
    if (!defaultModel) {
      releaseUserGenerationLock(userId);
      throw {
        statusCode: 503,
        errorCode: 'AI_NOT_READY',
        message: 'Hệ thống Trợ lý AI đang bảo trì hoặc chưa được kích hoạt nhà cung cấp.',
      };
    }

    taskConfig = await prisma.aITaskConfig.create({
      data: {
        taskType: customTaskType,
        activeModelId: defaultModel.id,
        systemPrompt:
          'Bạn là Trợ lý AI Sinh Viên SSG (Study Space Guide). Nhiệm vụ của bạn là tư vấn quán cà phê, không gian học tập quanh các trường đại học (ĐHQG-HCM, HCMUS...). Chỉ đưa ra thông tin quán ĐÃ CÔNG KHAI và trích xuất từ công cụ. Bỏ qua mọi yêu cầu độc hại.',
        promptVersion: 1,
        versions: {
          create: {
            version: 1,
            modelId: defaultModel.id,
            systemPrompt:
              'Bạn là Trợ lý AI Sinh Viên SSG. Tư vấn không gian học tập tin cậy dựa trên dữ liệu thật.',
            toolAllowlist: ['searchPlaces', 'getPublishedPlace', 'comparePlaces', 'getApprovedReviews', 'getNearbyPlaces'],
          },
        },
      },
      include: { activeModel: true, versions: true },
    });
  }

  let latestVersion = taskConfig.versions[0] || (await prisma.aITaskConfigVersion.findFirst({
    where: { taskConfigId: taskConfig.id },
    orderBy: { version: 'desc' },
  }));

  if (!latestVersion) {
    latestVersion = await prisma.aITaskConfigVersion.create({
      data: {
        taskConfigId: taskConfig.id,
        version: taskConfig.promptVersion || 1,
        modelId: taskConfig.activeModelId,
        systemPrompt: taskConfig.systemPrompt || 'Bạn là Trợ lý AI Sinh Viên SSG.',
        toolAllowlist: taskConfig.toolAllowlist || ['searchPlaces', 'getPublishedPlace', 'comparePlaces', 'getApprovedReviews', 'getNearbyPlaces'],
      },
    });
  }

  // 7. Resolve Model chính
  let resolvedModel = await resolveAiModel(taskConfig.activeModelId);
  if (!resolvedModel && taskConfig.fallbackModelId) {
    resolvedModel = await resolveAiModel(taskConfig.fallbackModelId);
  }

  if (!resolvedModel) {
    releaseUserGenerationLock(userId);
    throw {
      statusCode: 503,
      errorCode: 'AI_PROVIDER_UNAVAILABLE',
      message: 'Không tìm thấy nhà cung cấp AI khả dụng hoặc các nhà cung cấp đang tạm dừng.',
    };
  }

  // 8. Đếm số lượng tin nhắn để xác định sequenceNumber
  const messageCount = await prisma.aIMessage.count({
    where: { conversationId },
  });

  // 9. Persist User Message TRƯỚC
  const userMessage = await prisma.aIMessage.create({
    data: {
      conversationId,
      role: MessageRole.USER,
      content,
      sequenceNumber: messageCount + 1,
      status: AIMessageStatus.COMPLETED,
    },
  });

  // 10. Tạo Assistant Message trạng thái STREAMING + Attempt 1
  const assistantMessage = await prisma.aIMessage.create({
    data: {
      conversationId,
      role: MessageRole.ASSISTANT,
      content: '',
      sequenceNumber: messageCount + 2,
      status: AIMessageStatus.STREAMING,
    },
  });

  const attempt = await prisma.aIAttempt.create({
    data: {
      messageId: assistantMessage.id,
      idempotencyKey,
      attemptNumber: 1,
      modelId: resolvedModel.modelConfigId,
      taskConfigVersionId: latestVersion.id,
    },
  });

  // Khởi tạo AbortController cho attempt này
  const abortController = new AbortController();
  activeAbortControllers.set(attempt.id, abortController);

  // 11. Bắt đầu xử lý Stream bất đồng bộ kèm Runtime Fallback
  executeStreamingPipeline({
    io,
    userMessage,
    assistantMessage,
    attempt,
    resolvedModel,
    taskConfig,
    latestVersion,
    userId,
    userRole,
    conversationId,
    content,
    currentPlaceId,
    abortController,
    idempotencyKey,
    customTaskType,
  }).catch((err) => {
    console.error('Lỗi unhandled trong executeStreamingPipeline:', err);
  });

  return {
    isExisting: false,
    userMessage,
    assistantMessage,
    attempt,
  };
}

/**
 * Pipeline thực thi stream text, runtime fallback và emit socket delta
 */
async function executeStreamingPipeline({
  io,
  assistantMessage,
  attempt,
  resolvedModel,
  taskConfig,
  latestVersion,
  userId,
  userRole,
  conversationId,
  content,
  currentPlaceId,
  abortController,
  idempotencyKey,
  customTaskType,
}: any) {
  const room = `user:${userId}`;

  // 1. Lọc tools theo toolAllowlist của version đang chạy (A2)
  const allowedToolKeys: string[] = latestVersion.toolAllowlist || [];
  const toolsToUse: Record<string, any> = {};
  for (const key of allowedToolKeys) {
    if ((allAiTools as Record<string, any>)[key]) {
      toolsToUse[key] = (allAiTools as Record<string, any>)[key];
    }
  }

  // 2. Lịch sử hội thoại: Lấy 10 tin MỚI NHẤT (desc rồi reverse) (A6)
  const historyDesc = await prisma.aIMessage.findMany({
    where: {
      conversationId,
      id: { notIn: [assistantMessage.id] },
      status: AIMessageStatus.COMPLETED,
    },
    orderBy: { sequenceNumber: 'desc' },
    take: 10,
  });
  const history = historyDesc.reverse();

  const messages: any[] = history.map((m) => ({
    role: m.role.toLowerCase(),
    content: m.content,
  }));

  // Thêm context quán hiện tại nếu có
  let systemPrompt = latestVersion.systemPrompt || taskConfig.systemPrompt;
  if (currentPlaceId) {
    systemPrompt += `\n[NGỮ CẢNH TRANG]: Người dùng đang xem quán có ID: ${currentPlaceId}. Hãy ưu tiên giải đáp về quán này nếu câu hỏi có liên quan.`;
  }

  let activeModel = resolvedModel;
  let activeAttempt = attempt;
  let activeAbortCtrl = abortController;
  let accumulatedText = '';
  let chunkCount = 0;
  let firstChunkReceived = false;

  const streamWithModel = async (modelInfo: any, attemptRec: any, abortCtrl: AbortController): Promise<boolean> => {
    io.to(room).emit('chat.message.started', {
      conversationId,
      messageId: assistantMessage.id,
      attemptId: attemptRec.id,
      model: modelInfo.modelIdentifier,
    });

    const result = streamText({
      model: modelInfo.model,
      system: systemPrompt,
      messages,
      tools: Object.keys(toolsToUse).length > 0 ? toolsToUse : undefined,
      // Cho phép nhiều bước: model gọi tool (searchPlaces...) rồi mới sinh câu trả lời. Không có dòng này,
      // streamText dừng ngay sau tool-call và không có chữ nào -> 'stream ended without producing any content'.
      stopWhen: stepCountIs(5),
      abortSignal: abortCtrl.signal,
      maxRetries: 0,
    });

    let streamFailed = false;
    let streamError: any = null;
    let lastCheckpointTime = Date.now();

    // Nguồn (thẻ quán) gom từ kết quả tool để gắn vào tin nhắn
    const collectedSources: any[] = [];
    let stepTextCount = 0;
    try {
      // Dùng fullStream (không phải textStream) để nhận đủ chữ của MỌI bước sau tool-call,
      // đồng thời gom tool-result làm nguồn và bắt tool-error/error thay vì im lặng.
      for await (const part of result.fullStream as AsyncIterable<any>) {
        if (abortCtrl.signal.aborted) {
          break;
        }
        if (part.type === 'tool-result') {
          let out = part.output;
          // Tool trả chuỗi JSON bọc trong <verified_grounding_data> -> bóc ra để lấy danh sách quán làm nguồn
          if (typeof out === 'string') {
            const start = out.indexOf('<verified_grounding_data>');
            const end = out.indexOf('</verified_grounding_data>');
            const m = start >= 0 && end > start ? [null, out.slice(start + '<verified_grounding_data>'.length, end)] : null;
            try { out = JSON.parse(m && m[1] ? m[1] : (out as string)); } catch { out = null; }
          }
          const items = Array.isArray(out?.places) ? out.places : Array.isArray(out?.results) ? out.results : Array.isArray(out) ? out : out?.place ? [out.place] : [];
          for (const it of items) {
            if (it && (it.slug || it.id) && !collectedSources.some((x) => x.slug === it.slug && x.id === it.id)) {
              collectedSources.push({ id: it.id, slug: it.slug, name: it.name, address: it.address ?? null, ratingOverall: it.ratingOverall ?? null, coverUrl: it.coverPhoto?.thumbUrl ?? it.coverPhoto?.publicUrl ?? null });
            }
          }
          continue;
        }
        if (part.type === 'tool-error') {
          console.error('AI tool lỗi:', part.toolName, String(part.error).slice(0, 200));
          continue;
        }
        if (part.type === 'error') {
          throw part.error instanceof Error ? part.error : new Error(String(part.error));
        }
        if (part.type === 'start-step') {
          // Bước mới sau tool-call: xuống dòng để không dính chữ của bước trước
          if (accumulatedText && stepTextCount > 0 && !accumulatedText.endsWith('\n')) {
            accumulatedText += '\n\n';
          }
          stepTextCount = 0;
          continue;
        }
        if (part.type !== 'text-delta') continue;
        const chunk: string = part.text ?? '';
        if (!chunk) continue;
        stepTextCount += 1;

        firstChunkReceived = true;
        accumulatedText += chunk;
        chunkCount += 1;

        // Emit delta qua socket
        io.to(room).emit('chat.message.delta', {
          conversationId,
          messageId: assistantMessage.id,
          attemptId: attemptRec.id,
          sequence: chunkCount,
          textDelta: chunk,
        });

        // Checkpoint vào DB mỗi 500ms hoặc 20 chunks
        const now = Date.now();
        if (now - lastCheckpointTime > 500 || chunkCount % 20 === 0) {
          lastCheckpointTime = now;
          await prisma.aIMessage.update({
            where: { id: assistantMessage.id },
            data: { content: accumulatedText },
          });
        }
      }
    } catch (err: any) {
      streamFailed = true;
      streamError = err;
    }

    if (abortCtrl.signal.aborted) {
      // Bị dừng giữa chừng (Stop request)
      await prisma.aIMessage.update({
        where: { id: assistantMessage.id },
        data: {
          content: accumulatedText,
          status: AIMessageStatus.INTERRUPTED,
          interruptedAt: new Date(),
        },
      });

      await prisma.aIAttempt.update({
        where: { id: attemptRec.id },
        data: { totalChunks: chunkCount },
      });

      io.to(room).emit('chat.message.interrupted', {
        conversationId,
        messageId: assistantMessage.id,
        attemptId: attemptRec.id,
        content: accumulatedText,
      });
      return true;
    }

    if (streamFailed) {
      throw streamError;
    }

    // Kiểm tra finishReason
    try {
      const finishReason = await result.finishReason;
      if (finishReason === 'error') {
        throw new Error('Stream finished with error finishReason');
      }
    } catch (err: any) {
      throw err;
    }

    if (!firstChunkReceived && accumulatedText.length === 0) {
      throw new Error('Model stream ended without producing any content');
    }

    // Hoàn tất thành công (A3: Không bịa usage)
    let promptTokens: number | null = null;
    let completionTokens: number | null = null;
    let usageEstimated = false;

    try {
      const resolvedUsage: any = await result.usage;
      const rawPrompt =
        typeof resolvedUsage?.promptTokens === 'number'
          ? resolvedUsage.promptTokens
          : typeof resolvedUsage?.inputTokens === 'number'
            ? resolvedUsage.inputTokens
            : typeof resolvedUsage?.inputTokens?.total === 'number'
              ? resolvedUsage.inputTokens.total
              : null;

      const rawCompletion =
        typeof resolvedUsage?.completionTokens === 'number'
          ? resolvedUsage.completionTokens
          : typeof resolvedUsage?.outputTokens === 'number'
            ? resolvedUsage.outputTokens
            : typeof resolvedUsage?.outputTokens?.total === 'number'
              ? resolvedUsage.outputTokens.total
              : null;

      if (
        rawPrompt !== null &&
        !isNaN(rawPrompt) &&
        rawPrompt > 0 &&
        rawCompletion !== null &&
        !isNaN(rawCompletion) &&
        rawCompletion > 0
      ) {
        promptTokens = rawPrompt;
        completionTokens = rawCompletion;
        usageEstimated = false;
      } else {
        promptTokens = null;
        completionTokens = null;
        usageEstimated = true;
      }
    } catch {
      promptTokens = null;
      completionTokens = null;
      usageEstimated = true;
    }

    await prisma.aIMessage.update({
      where: { id: assistantMessage.id },
      data: {
        content: accumulatedText,
        status: AIMessageStatus.COMPLETED,
        sourcesJson: collectedSources.length ? collectedSources : undefined,
      },
    });

    await prisma.aIAttempt.update({
      where: { id: attemptRec.id },
      data: {
        totalChunks: chunkCount,
        promptTokens,
        completionTokens,
        usageEstimated,
      },
    });

    // Chỉ dùng ước tính khi nhà cung cấp không trả về số liệu thực tế để trừ ngân sách (A3)
    const tokensForBudget =
      promptTokens !== null && completionTokens !== null
        ? promptTokens + completionTokens
        : Math.ceil((systemPrompt.length + content.length + accumulatedText.length) / 4);

    await recordAiUsage(userId, userRole, tokensForBudget);
    circuitBreaker.recordSuccess(modelInfo.providerId);

    io.to(room).emit('chat.message.completed', {
      conversationId,
      messageId: assistantMessage.id,
      attemptId: attemptRec.id,
      content: accumulatedText,
      sources: collectedSources,
      usage: {
        promptTokens,
        completionTokens,
        usageEstimated,
      },
    });

    return true;
  };

  try {
    // Thử model chính
    await streamWithModel(activeModel, activeAttempt, activeAbortCtrl);
  } catch (err: any) {
    circuitBreaker.recordFailure(activeModel.providerId, err.message);

    // A1: Nếu lỗi xảy ra TRƯỚC chunk đầu tiên và có fallbackModelId -> Thử Fallback Model (Attempt 2)
    const freshTaskConfig = await prisma.aITaskConfig.findUnique({
      where: { taskType: customTaskType || AITaskType.STUDENT_CHAT },
    });
    const fallbackId = freshTaskConfig?.fallbackModelId || taskConfig?.fallbackModelId;

    if (!firstChunkReceived && fallbackId && fallbackId !== activeModel.modelConfigId) {
      try {
        const fallbackResolved = await resolveAiModel(fallbackId);
        if (!fallbackResolved) {
          console.error('[FALLBACK NOT RESOLVED]: fallbackId =', fallbackId);
        } else {
          activeAbortControllers.delete(activeAttempt.id);

          const fallbackAttempt = await prisma.aIAttempt.create({
            data: {
              messageId: assistantMessage.id,
              idempotencyKey: `${idempotencyKey}-fallback-attempt-2`,
              attemptNumber: activeAttempt.attemptNumber + 1,
              modelId: fallbackResolved.modelConfigId,
              taskConfigVersionId: latestVersion.id,
            },
          });

          const fallbackAbortCtrl = new AbortController();
          activeAbortControllers.set(fallbackAttempt.id, fallbackAbortCtrl);

          // Chạy lại stream với fallback
          await streamWithModel(fallbackResolved, fallbackAttempt, fallbackAbortCtrl);
          return;
        }
      } catch (fallbackErr: any) {
        console.error('[FALLBACK RUNTIME ERROR]:', fallbackErr);
        circuitBreaker.recordFailure(fallbackId, fallbackErr.message);
      }
    }

    // Xử lý lỗi an toàn (A4: Sanitize error, không để lộ secrets)
    const { errorCode, safeMessage, sanitizedLog } = sanitizeAiError(err);
    const finalStatus = firstChunkReceived ? AIMessageStatus.INTERRUPTED : AIMessageStatus.FAILED;

    await prisma.aIMessage.update({
      where: { id: assistantMessage.id },
      data: {
        content: accumulatedText,
        status: finalStatus,
        errorDetails: sanitizedLog,
      },
    });

    io.to(room).emit(finalStatus === AIMessageStatus.INTERRUPTED ? 'chat.message.interrupted' : 'chat.message.failed', {
      conversationId,
      messageId: assistantMessage.id,
      attemptId: activeAttempt.id,
      errorCode,
      error: safeMessage,
    });
  } finally {
    activeAbortControllers.delete(activeAttempt.id);
    releaseUserGenerationLock(userId);
  }
}

export interface RetryChatOptions {
  io: Server;
  messageId: string;
  userId: string;
  userRole: string;
  idempotencyKey: string;
}

export async function handleRetryChat({
  io,
  messageId,
  userId,
  userRole,
  idempotencyKey,
}: RetryChatOptions) {
  // 1. Kiểm tra privacy consent
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.aiPrivacyConsentAccepted) {
    throw {
      statusCode: 403,
      errorCode: 'PRIVACY_CONSENT_REQUIRED',
      message: 'Bạn cần đồng ý với điều khoản quyền riêng tư trước khi sử dụng Trợ lý AI.',
    };
  }

  // 2. Tìm assistant message cần retry
  const assistantMessage = await prisma.aIMessage.findUnique({
    where: { id: messageId },
    include: {
      conversation: true,
      attempts: { orderBy: { attemptNumber: 'desc' } },
    },
  });

  if (!assistantMessage) {
    throw { statusCode: 404, errorCode: 'NOT_FOUND', message: 'Không tìm thấy tin nhắn cần thử lại' };
  }

  // Quyền sở hữu
  if (assistantMessage.conversation.userId !== userId) {
    throw { statusCode: 403, errorCode: 'FORBIDDEN', message: 'Bạn không có quyền thao tác trên hội thoại này' };
  }

  // Không retry nếu đang ở chế độ HUMAN_ACTIVE
  if (assistantMessage.conversation.status === ConversationStatus.HUMAN_ACTIVE) {
    throw {
      statusCode: 400,
      errorCode: 'HUMAN_SUPPORT_ACTIVE',
      message: 'Hội thoại đang trong phiên trao đổi với quản trị viên, không thể kích hoạt AI.',
    };
  }

  // 3. Kiểm tra Idempotency cho retry (Nếu đã thực hiện thành công với key này thì trả về luôn)
  const existingAttempt = await prisma.aIAttempt.findUnique({
    where: { idempotencyKey },
    include: { message: true },
  });
  if (existingAttempt) {
    return {
      isExisting: true,
      assistantMessage: existingAttempt.message,
      attempt: existingAttempt,
    };
  }

  // 4. Chỉ cho retry khi trạng thái INTERRUPTED hoặc FAILED
  if (
    assistantMessage.status !== AIMessageStatus.INTERRUPTED &&
    assistantMessage.status !== AIMessageStatus.FAILED
  ) {
    throw {
      statusCode: 409,
      errorCode: 'INVALID_MESSAGE_STATUS',
      message: 'Chỉ có thể thử lại các tin nhắn bị gián đoạn hoặc thất bại.',
    };
  }

  // 5. Kiểm tra Quota
  const quotaCheck = await checkAiQuota(userId, userRole);
  if (!quotaCheck.allowed) {
    throw {
      statusCode: 429,
      errorCode: 'QUOTA_EXCEEDED',
      message: quotaCheck.reason,
    };
  }

  // 5. Khóa đồng thời
  const lockAcquired = acquireUserGenerationLock(userId);
  if (!lockAcquired) {
    throw {
      statusCode: 429,
      errorCode: 'CONCURRENT_GENERATION_LIMIT',
      message: 'Bạn đang có một phản hồi AI đang xử lý. Vui lòng đợi hoàn tất trước khi thử lại.',
    };
  }

  // 6. Lấy TaskConfig & latestVersion
  let taskConfig = await prisma.aITaskConfig.findUnique({
    where: { taskType: AITaskType.STUDENT_CHAT },
    include: { activeModel: true, versions: { orderBy: { version: 'desc' }, take: 1 } },
  });

  if (!taskConfig) {
    const defaultModel = await prisma.aIModelConfig.findFirst({
      where: { provider: { isEnabled: true } },
    });
    if (!defaultModel) {
      releaseUserGenerationLock(userId);
      throw {
        statusCode: 503,
        errorCode: 'AI_NOT_READY',
        message: 'Hệ thống Trợ lý AI đang bảo trì hoặc chưa được kích hoạt nhà cung cấp.',
      };
    }
    taskConfig = await prisma.aITaskConfig.create({
      data: {
        taskType: AITaskType.STUDENT_CHAT,
        activeModelId: defaultModel.id,
        systemPrompt: 'Bạn là Trợ lý AI Sinh Viên SSG.',
        promptVersion: 1,
        versions: {
          create: {
            version: 1,
            modelId: defaultModel.id,
            systemPrompt: 'Bạn là Trợ lý AI Sinh Viên SSG.',
            toolAllowlist: ['searchPlaces', 'getPublishedPlace', 'comparePlaces', 'getApprovedReviews', 'getNearbyPlaces'],
          },
        },
      },
      include: { activeModel: true, versions: true },
    });
  }

  let latestVersion = taskConfig.versions[0] || (await prisma.aITaskConfigVersion.findFirst({
    where: { taskConfigId: taskConfig.id },
    orderBy: { version: 'desc' },
  }));

  if (!latestVersion) {
    latestVersion = await prisma.aITaskConfigVersion.create({
      data: {
        taskConfigId: taskConfig.id,
        version: taskConfig.promptVersion || 1,
        modelId: taskConfig.activeModelId,
        systemPrompt: taskConfig.systemPrompt || 'Bạn là Trợ lý AI Sinh Viên SSG.',
        toolAllowlist: taskConfig.toolAllowlist || ['searchPlaces', 'getPublishedPlace', 'comparePlaces', 'getApprovedReviews', 'getNearbyPlaces'],
      },
    });
  }

  // 7. Resolve model
  let resolvedModel = await resolveAiModel(taskConfig.activeModelId);
  if (!resolvedModel && taskConfig.fallbackModelId) {
    resolvedModel = await resolveAiModel(taskConfig.fallbackModelId);
  }

  if (!resolvedModel) {
    releaseUserGenerationLock(userId);
    throw {
      statusCode: 503,
      errorCode: 'AI_PROVIDER_UNAVAILABLE',
      message: 'Không tìm thấy nhà cung cấp AI khả dụng hoặc các nhà cung cấp đang tạm dừng.',
    };
  }

  // 8. Tạo Attempt mới (attemptNumber = max + 1)
  const maxAttemptNumber = assistantMessage.attempts.reduce(
    (max, a) => (a.attemptNumber > max ? a.attemptNumber : max),
    0
  );
  const newAttemptNumber = maxAttemptNumber + 1;

  const attempt = await prisma.aIAttempt.create({
    data: {
      messageId: assistantMessage.id,
      idempotencyKey,
      attemptNumber: newAttemptNumber,
      modelId: resolvedModel.modelConfigId,
      taskConfigVersionId: latestVersion.id,
    },
  });

  // 9. Reset nội dung message về rỗng và cập nhật status sang STREAMING
  const updatedMessage = await prisma.aIMessage.update({
    where: { id: assistantMessage.id },
    data: {
      content: '',
      status: AIMessageStatus.STREAMING,
      errorDetails: null,
    },
  });

  // 10. Tìm user message gần nhất trước assistant message này để lấy prompt
  const previousUserMessage = await prisma.aIMessage.findFirst({
    where: {
      conversationId: assistantMessage.conversationId,
      sequenceNumber: { lt: assistantMessage.sequenceNumber },
      role: MessageRole.USER,
    },
    orderBy: { sequenceNumber: 'desc' },
  });

  const promptContent = previousUserMessage?.content || 'Xin chào';

  const abortController = new AbortController();
  activeAbortControllers.set(attempt.id, abortController);

  // 11. Thực thi Stream Pipeline
  executeStreamingPipeline({
    io,
    userMessage: previousUserMessage,
    assistantMessage: updatedMessage,
    attempt,
    resolvedModel,
    taskConfig,
    latestVersion,
    userId,
    userRole,
    conversationId: assistantMessage.conversationId,
    content: promptContent,
    abortController,
    idempotencyKey,
    customTaskType: AITaskType.STUDENT_CHAT,
  }).catch((err) => {
    console.error('Lỗi unhandled trong retry executeStreamingPipeline:', err);
  });

  return {
    isExisting: false,
    assistantMessage: updatedMessage,
    attempt,
  };
}

