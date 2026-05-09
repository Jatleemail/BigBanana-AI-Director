/**
 * 腾讯云 COS 上传服务
 * 将音频文件上传至 COS 并返回 CDN 公网 URL
 *
 * COS 配置通过模型配置页面的"腾讯云COS"选项卡设置，
 * 存储在服务器端 config.json 中，多用户共享。
 */
import COS from 'cos-js-sdk-v5';
import { getCosConfig } from './cosConfigStore';

let cosInstance: COS | null = null;
let cosInstanceKey = ''; // 用于检测配置变更时重建实例

const getCos = (): COS => {
  const cfg = getCosConfig();

  if (!cfg.secretId || !cfg.secretKey) {
    throw new Error('腾讯云 COS 凭据未配置，请在模型配置页面的"腾讯云COS"选项卡中设置 SecretId 和 SecretKey');
  }

  const key = `${cfg.secretId}:${cfg.secretKey}`;
  if (!cosInstance || cosInstanceKey !== key) {
    cosInstance = new COS({
      SecretId: cfg.secretId,
      SecretKey: cfg.secretKey,
    });
    cosInstanceKey = key;
  }
  return cosInstance;
};

export const uploadAudioToCos = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const cos = getCos();
    const cfg = getCosConfig();
    const key = `audio-clone/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    cos.putObject(
      {
        Bucket: cfg.bucket,
        Region: cfg.region,
        Key: key,
        Body: file,
      },
      (err, data) => {
        if (err) {
          reject(new Error(`文件上传失败: ${err.message || String(err)}`));
          return;
        }

        const cdnUrl = `${cfg.cdnDomain.replace(/\/+$/, '')}/${key}`;
        resolve(cdnUrl);
      }
    );
  });
};
