/**
 * 腾讯云 COS 配置管理
 * 存储在 localStorage，通过 config-server 在多用户间同步
 */
import { syncToServer } from './modelRegistry';

export interface CosConfig {
  secretId: string;
  secretKey: string;
  region: string;
  bucket: string;
  cdnDomain: string;
}

const COS_CONFIG_KEY = 'bigbanana_cos_config';

const EMPTY_CONFIG: CosConfig = {
  secretId: '',
  secretKey: '',
  region: 'ap-beijing',
  bucket: '',
  cdnDomain: '',
};

export const getCosConfig = (): CosConfig => {
  try {
    const raw = localStorage.getItem(COS_CONFIG_KEY);
    if (raw) return { ...EMPTY_CONFIG, ...JSON.parse(raw) };
  } catch { /* corrupted data, fall through to default */ }
  return { ...EMPTY_CONFIG };
};

export const setCosConfig = (config: CosConfig): void => {
  localStorage.setItem(COS_CONFIG_KEY, JSON.stringify(config));
  syncToServer().catch(() => {});
};

export const hasCosConfig = (): boolean => {
  const cfg = getCosConfig();
  return !!(cfg.secretId && cfg.secretKey && cfg.bucket);
};

export const clearCosConfig = (): void => {
  localStorage.removeItem(COS_CONFIG_KEY);
  syncToServer().catch(() => {});
};
