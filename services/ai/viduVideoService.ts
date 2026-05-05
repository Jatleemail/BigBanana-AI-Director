/**
 * Vidu 视频生成服务
 * 异步任务模式：创建任务 → 轮询状态 → 下载结果
 * 支持图生视频 (img2video) 和首尾帧视频 (start-end2video)
 */

import { AspectRatio } from '../../types/model';
import { retryOperation } from './apiCore';

const VIDU_IMG2VIDEO_ENDPOINT = '/ent/v2/img2video';
const VIDU_STARTEND2VIDEO_ENDPOINT = '/ent/v2/start-end2video';
const VIDU_TASK_ENDPOINT = '/ent/v2/tasks';
const VIDU_POLL_INTERVAL_MS = 3000;
const VIDU_POLL_MAX_ATTEMPTS = 120;
const VIDU_POLL_RETRY_MAX = 3;
const VIDU_DEFAULT_RESOLUTION = '720p';

const resolveViduApiBase = (apiBase: string): string => {
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return '/api/vidu-proxy';
  }
  return apiBase;
};

const resolveMediaUrl = (url: string): string => {
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return `/api/media-proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
};

export interface ViduVideoGenerateOptions {
  prompt: string;
  startImage: string;
  endImage?: string;
  aspectRatio: AspectRatio;
  duration: number;
  resolution?: string;
  apiKey: string;
  apiBase: string;
  modelId: string;
}

export const generateVideoVidu = async (options: ViduVideoGenerateOptions): Promise<string> => {
  const {
    prompt,
    startImage,
    endImage,
    aspectRatio,
    duration,
    resolution = VIDU_DEFAULT_RESOLUTION,
    apiKey,
    apiBase,
    modelId,
  } = options;

  if (!startImage) {
    throw new Error('视频生成失败：Vidu 视频生成需要提供首帧图片');
  }

  const isStartEndMode = !!endImage;
  const effectiveApiBase = resolveViduApiBase(apiBase);
  const createEndpoint = isStartEndMode
    ? `${effectiveApiBase}${VIDU_STARTEND2VIDEO_ENDPOINT}`
    : `${effectiveApiBase}${VIDU_IMG2VIDEO_ENDPOINT}`;

  const images = isStartEndMode
    ? [startImage, endImage]
    : [startImage];

  // Step 1: Create task (with retry)
  const createData = await retryOperation(async () => {
    const res = await fetch(createEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        prompt,
        images,
        duration,
        aspect_ratio: aspectRatio,
        resolution,
      }),
    });

    if (!res.ok) {
      let errorMessage = `Vidu create task failed: HTTP ${res.status}`;
      try {
        const errorData = await res.json();
        errorMessage = errorData.err_code || errorData.message || errorMessage;
      } catch {
        // ignore
      }
      throw new Error(`视频生成失败：${errorMessage}`);
    }

    return res.json();
  });

  const taskId = createData.task_id;
  if (!taskId) {
    throw new Error('视频生成失败：Vidu 未返回任务 ID');
  }

  // Step 2: Poll for result
  const taskUrl = `${effectiveApiBase}${VIDU_TASK_ENDPOINT}/${taskId}/creations`;

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
      if (err?.status === 401 || err?.status === 403) {
        throw new Error(`视频生成失败：Vidu 鉴权失败 (HTTP ${err.status})，请检查 API Key 配置`);
      }
      console.warn(`[Vidu video poll] Attempt ${attempt + 1}/${VIDU_POLL_MAX_ATTEMPTS} failed:`, err?.message);
      continue;
    }

    const state = pollData.state;

    if (state === 'success') {
      const creations = pollData.creations || [];
      if (creations.length === 0 || !creations[0].url) {
        throw new Error('视频生成失败：Vidu 任务完成但未返回视频');
      }

      // Step 3: Download video and convert to base64
      const videoUrl = creations[0].url;
      const videoRes = await fetch(resolveMediaUrl(videoUrl));
      if (!videoRes.ok) {
        throw new Error(`视频生成失败：下载结果视频失败 (HTTP ${videoRes.status})`);
      }

      const blob = await videoRes.blob();
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to convert video to base64'));
        reader.readAsDataURL(blob);
      });

      return base64;
    }

    if (state === 'failed') {
      const errCode = pollData.err_code || 'unknown';
      throw new Error(`视频生成失败：Vidu 任务失败 (错误码: ${errCode})`);
    }
  }

  throw new Error('视频生成失败：Vidu 视频任务超时，请稍后重试');
};
