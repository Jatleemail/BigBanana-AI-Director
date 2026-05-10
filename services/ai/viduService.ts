/**
 * Vidu 图片生成服务
 * 异步任务模式：创建任务 → 轮询状态 → 下载结果
 */

import { AspectRatio } from '../../types/model';
import { retryOperation } from './apiCore';

const VIDU_CREATE_ENDPOINT = '/ent/v2/reference2image';
const VIDU_TASK_ENDPOINT = '/ent/v2/tasks';
const VIDU_POLL_INTERVAL_MS = 3000;
const VIDU_POLL_MAX_ATTEMPTS = 120;
const VIDU_POLL_RETRY_MAX = 3;
export const VIDU_DEFAULT_RESOLUTION = '1080p';

const resolveViduApiBase = (_apiBase: string): string => {
  if (typeof window !== 'undefined') {
    return '/api/vidu-proxy';
  }
  return _apiBase;
};

const resolveMediaUrl = (url: string): string => {
  if (typeof window !== 'undefined') {
    return `/api/media-proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
};

export interface ViduGenerateOptions {
  prompt: string;
  referenceImages: string[];
  aspectRatio: AspectRatio;
  apiKey: string;
  apiBase: string;
  modelId: string;
  resolution?: string;
}

export const generateImageVidu = async (options: ViduGenerateOptions): Promise<string> => {
  const {
    prompt,
    referenceImages,
    aspectRatio,
    apiKey,
    apiBase,
    modelId,
    resolution = VIDU_DEFAULT_RESOLUTION,
  } = options;

  const requestBody: Record<string, unknown> = {
    model: modelId,
    prompt,
    aspect_ratio: aspectRatio,
    resolution,
  };

  if (referenceImages.length > 0) {
    requestBody.images = referenceImages.slice(0, 7);
  }

  // Step 1: Create task (with retry)
  const createData = await retryOperation(async () => {
    const res = await fetch(`${resolveViduApiBase(apiBase)}${VIDU_CREATE_ENDPOINT}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      let errorMessage = `Vidu create task failed: HTTP ${res.status}`;
      try {
        const errorData = await res.json();
        errorMessage = errorData.err_code || errorData.message || errorMessage;
      } catch {
        // ignore
      }
      throw new Error(`图片生成失败：${errorMessage}`);
    }

    return res.json();
  });

  const taskId = createData.task_id;
  if (!taskId) {
    throw new Error('图片生成失败：Vidu 未返回任务 ID');
  }

  // Step 2: Poll for result
  const taskUrl = `${resolveViduApiBase(apiBase)}${VIDU_TASK_ENDPOINT}/${taskId}/creations`;

  for (let attempt = 0; attempt < VIDU_POLL_MAX_ATTEMPTS; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, VIDU_POLL_INTERVAL_MS));

    let pollData: any;
    try {
      pollData = await retryOperation(async () => {
        const pollRes = await fetch(taskUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Token ${apiKey}`,
          },
        });

        if (!pollRes.ok) {
          const error = new Error(`Vidu poll failed: HTTP ${pollRes.status}`);
          (error as any).status = pollRes.status;
          throw error;
        }

        return pollRes.json();
      }, VIDU_POLL_RETRY_MAX);
    } catch (err: any) {
      // Abort early on non-retryable auth/access errors
      if (err?.status === 401 || err?.status === 403) {
        throw new Error(`图片生成失败：Vidu 鉴权失败 (HTTP ${err.status})，请检查 API Key 配置`);
      }
      console.warn(`[Vidu poll] Attempt ${attempt + 1}/${VIDU_POLL_MAX_ATTEMPTS} failed:`, err?.message);
      continue;
    }

    const state = pollData.state;

    if (state === 'success') {
      const creations = pollData.creations || [];
      if (creations.length === 0 || !creations[0].url) {
        throw new Error('图片生成失败：Vidu 任务完成但未返回图片');
      }

      // Step 3: Download image and convert to base64
      const imageUrl = creations[0].url;
      const imageRes = await fetch(resolveMediaUrl(imageUrl));
      if (!imageRes.ok) {
        throw new Error(`图片生成失败：下载结果图片失败 (HTTP ${imageRes.status})`);
      }

      const blob = await imageRes.blob();
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to convert image to base64'));
        reader.readAsDataURL(blob);
      });

      return base64;
    }

    if (state === 'failed') {
      const errCode = pollData.err_code || 'unknown';
      throw new Error(`图片生成失败：Vidu 任务失败 (错误码: ${errCode})`);
    }
  }

  throw new Error('图片生成失败：Vidu 任务超时，请稍后重试');
};
