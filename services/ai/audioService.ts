/**
 * 配音生成服务
 * 默认通过 Chat Completions 的 audio 输出能力生成配音，
 * 同时兼容自定义 endpoint 指向 /v1/audio/speech 的场景。
 */

import { AudioOutputFormat } from '../../types/model';
import {
  retryOperation,
  checkApiKey,
  getApiBase,
  resolveModel,
  resolveRequestModel,
  parseHttpError,
} from './apiCore';

export type DubbingMode = 'narration' | 'dialogue';

export interface GenerateDubbingAudioOptions {
  text: string;
  model?: string;
  mode?: DubbingMode;
  language?: string;
  voice?: string;
  format?: AudioOutputFormat;
  temperature?: number;
  timeoutMs?: number;
}

export interface GenerateDubbingAudioResult {
  audioDataUrl: string;
  transcript: string;
  usedModel: string;
  usedVoice: string;
  usedFormat: AudioOutputFormat;
}

const DEFAULT_AUDIO_MODEL = 'gpt-audio-1.5';
const DEFAULT_TIMEOUT_MS = 180000;

const getMimeType = (format: AudioOutputFormat): string => {
  if (format === 'mp3') return 'audio/mpeg';
  return 'audio/wav';
};

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string) || '');
    reader.onerror = () => reject(new Error('配音结果读取失败'));
    reader.readAsDataURL(blob);
  });

const buildPromptText = (text: string, mode: DubbingMode, language: string): string => {
  const styleInstruction =
    mode === 'narration'
      ? `请使用自然、克制的${language}旁白语气朗读以下内容，保持节奏稳定，不要添加额外文本。`
      : `请使用有情绪但不过度夸张的${language}对白语气朗读以下内容，保持语义清晰，不要添加额外文本。`;
  return `${styleInstruction}\n\n${text}`;
};

const extractTextFromMessageContent = (content: any): string => {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => (typeof item?.text === 'string' ? item.text : ''))
      .filter(Boolean)
      .join('\n');
  }
  return '';
};

const resolveViduApiBase = (apiBase: string): string => {
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return '/api/vidu-proxy';
  }
  return apiBase;
};

const resolveViduDownloadUrl = (url: string): string => {
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return `/api/media-proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
};

const callViduTtsEndpoint = async (
  apiBase: string,
  endpoint: string,
  apiKey: string,
  promptText: string,
  voice: string,
  timeoutMs: number
): Promise<string> => {
  const effectiveApiBase = resolveViduApiBase(apiBase);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await retryOperation(async () => {
      const res = await fetch(`${effectiveApiBase}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${apiKey}`,
        },
        body: JSON.stringify({
          text: promptText,
          voice_setting_voice_id: voice,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw await parseHttpError(res);
      }

      return res;
    });

    const data = await response.json();

    if (data.state === 'failed') {
      throw new Error('Vidu 语音合成任务失败');
    }

    const fileUrl: string | undefined = data.file_url;
    if (!fileUrl) {
      throw new Error('Vidu 语音合成未返回音频文件 URL');
    }

    const audioRes = await fetch(resolveViduDownloadUrl(fileUrl));
    if (!audioRes.ok) {
      throw new Error(`Vidu 音频文件下载失败 (HTTP ${audioRes.status})`);
    }

    const blob = await audioRes.blob();
    return blobToDataUrl(blob);
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error(`配音请求超时 (${Math.floor(timeoutMs / 1000)} 秒)`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

const generateVoiceId = (): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `clone_${timestamp}${random}`;
};

export interface CloneVoiceViduOptions {
  audioUrl: string;
  text: string;
  apiKey: string;
  apiBase: string;
  voice?: string;
  timeoutMs?: number;
}

const callCloneViduEndpoint = async (
  apiBase: string,
  apiKey: string,
  audioUrl: string,
  text: string,
  voice: string,
  timeoutMs: number
): Promise<string> => {
  const effectiveApiBase = resolveViduApiBase(apiBase);
  const voiceId = generateVoiceId();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await retryOperation(async () => {
      const res = await fetch(`${effectiveApiBase}/ent/v2/audio-clone`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${apiKey}`,
        },
        body: JSON.stringify({
          audio_url: audioUrl,
          voice_id: voiceId,
          text,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw await parseHttpError(res);
      }

      return res;
    });

    const data = await response.json();

    if (data.state !== 'success') {
      throw new Error(`Vidu 声音克隆任务未成功 (状态: ${data.state || 'unknown'})`);
    }

    const demoAudioUrl: string | undefined = data.demo_audio;
    if (!demoAudioUrl) {
      throw new Error('Vidu 声音克隆未返回试听音频 URL');
    }

    const audioRes = await fetch(resolveViduDownloadUrl(demoAudioUrl));
    if (!audioRes.ok) {
      throw new Error(`克隆音频下载失败 (HTTP ${audioRes.status})`);
    }

    const blob = await audioRes.blob();
    return blobToDataUrl(blob);
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error(`声音克隆请求超时 (${Math.floor(timeoutMs / 1000)} 秒)`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

export const cloneVoiceVidu = async (
  options: CloneVoiceViduOptions
): Promise<GenerateDubbingAudioResult> => {
  const rawText = String(options.text || '').trim();
  if (!rawText) {
    throw new Error('配音文本不能为空');
  }

  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const usedVoice = options.voice || 'default';

  const audioDataUrl = await callCloneViduEndpoint(
    options.apiBase,
    options.apiKey,
    options.audioUrl,
    rawText,
    usedVoice,
    timeoutMs
  );

  return {
    audioDataUrl,
    transcript: rawText,
    usedModel: 'vidu-audio-tts',
    usedVoice,
    usedFormat: 'mp3',
  };
};

const callSpeechEndpoint = async (
  apiBase: string,
  endpoint: string,
  apiKey: string,
  model: string,
  promptText: string,
  voice: string,
  format: AudioOutputFormat,
  timeoutMs: number
): Promise<string> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await retryOperation(async () => {
      const res = await fetch(`${apiBase}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          voice,
          input: promptText,
          response_format: format,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw await parseHttpError(res);
      }

      return res;
    });

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const payload = await response.json();
      const base64Audio = payload?.audio || payload?.data || '';
      if (!base64Audio) {
        throw new Error('配音接口未返回音频数据');
      }
      return `data:${getMimeType(format)};base64,${base64Audio}`;
    }

    const audioBlob = await response.blob();
    return blobToDataUrl(audioBlob);
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error(`配音请求超时 (${Math.floor(timeoutMs / 1000)} 秒)`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

/**
 * 生成配音音频
 */
export const generateDubbingAudio = async (
  options: GenerateDubbingAudioOptions
): Promise<GenerateDubbingAudioResult> => {
  const rawText = String(options.text || '').trim();
  if (!rawText) {
    throw new Error('配音文本不能为空');
  }

  const requestedModel = options.model || DEFAULT_AUDIO_MODEL;
  const resolvedAudioModel = resolveModel('audio', requestedModel);
  const usedModel =
    resolveRequestModel('audio', requestedModel) ||
    resolvedAudioModel?.apiModel ||
    resolvedAudioModel?.id ||
    DEFAULT_AUDIO_MODEL;

  const params = (resolvedAudioModel?.params || {}) as any;
  const usedVoice = (options.voice || params.defaultVoice || 'alloy').trim() || 'alloy';
  const usedFormat = (options.format || params.outputFormat || 'wav') as AudioOutputFormat;
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const mode = options.mode || 'narration';
  const language = options.language || '中文';
  const temperature = Number.isFinite(options.temperature) ? Number(options.temperature) : 0.6;
  const endpoint = resolvedAudioModel?.endpoint || '/v1/chat/completions';

  const apiKey = checkApiKey('audio', requestedModel);
  const apiBase = getApiBase('audio', requestedModel);
  const promptText = buildPromptText(rawText, mode, language);

  if (endpoint.includes('/audio/speech')) {
    const audioDataUrl = await callSpeechEndpoint(
      apiBase,
      endpoint,
      apiKey,
      usedModel,
      promptText,
      usedVoice,
      usedFormat,
      timeoutMs
    );

    return {
      audioDataUrl,
      transcript: rawText,
      usedModel,
      usedVoice,
      usedFormat,
    };
  }

  if (endpoint.includes('/ent/v2/audio-tts')) {
    const audioDataUrl = await callViduTtsEndpoint(
      apiBase,
      endpoint,
      apiKey,
      rawText,
      usedVoice,
      timeoutMs
    );

    return {
      audioDataUrl,
      transcript: rawText,
      usedModel,
      usedVoice,
      usedFormat,
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await retryOperation(async () => {
      const res = await fetch(`${apiBase}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: usedModel,
          modalities: ['text', 'audio'],
          audio: {
            voice: usedVoice,
            format: usedFormat,
          },
          messages: [
            {
              role: 'user',
              content: promptText,
            },
          ],
          temperature,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw await parseHttpError(res);
      }
      return res;
    });

    const data = await response.json();
    const message = data?.choices?.[0]?.message;
    const audioPayload = message?.audio;
    const audioBase64 = audioPayload?.data;
    const transcript =
      audioPayload?.transcript ||
      extractTextFromMessageContent(message?.content) ||
      rawText;

    if (!audioBase64) {
      throw new Error('模型未返回音频数据，请检查当前模型是否支持音频输出');
    }

    return {
      audioDataUrl: `data:${getMimeType(usedFormat)};base64,${audioBase64}`,
      transcript,
      usedModel,
      usedVoice,
      usedFormat,
    };
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error(`配音请求超时 (${Math.floor(timeoutMs / 1000)} 秒)`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

