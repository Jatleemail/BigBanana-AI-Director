/**
 * 腾讯云 COS 上传服务
 * 将音频文件上传至 COS 并返回 CDN 公网 URL
 *
 * 部署时在 .env 文件中配置以下环境变量：
 *   TENCENT_COS_SECRET_ID   腾讯云 SecretId
 *   TENCENT_COS_SECRET_KEY  腾讯云 SecretKey
 *   TENCENT_COS_REGION      COS 区域（默认 ap-beijing）
 *   TENCENT_COS_BUCKET      COS 存储桶名称（含 APPID）
 *   TENCENT_COS_CDN_DOMAIN  CDN 加速域名
 */
import COS from 'cos-js-sdk-v5';

const SECRET_ID = process.env.TENCENT_COS_SECRET_ID || '';
const SECRET_KEY = process.env.TENCENT_COS_SECRET_KEY || '';
const REGION = process.env.TENCENT_COS_REGION || 'ap-beijing';
const BUCKET = process.env.TENCENT_COS_BUCKET || '';
const CDN_DOMAIN = process.env.TENCENT_COS_CDN_DOMAIN || '';

let cosInstance: COS | null = null;

const getCos = (): COS => {
  if (!SECRET_ID || !SECRET_KEY) {
    throw new Error('腾讯云 COS 凭据未配置，请在 .env 文件中设置 TENCENT_COS_SECRET_ID 和 TENCENT_COS_SECRET_KEY');
  }

  if (!cosInstance) {
    cosInstance = new COS({
      SecretId: SECRET_ID,
      SecretKey: SECRET_KEY,
    });
  }
  return cosInstance;
};

export const uploadAudioToCos = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const cos = getCos();
    const key = `audio-clone/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    cos.putObject(
      {
        Bucket: BUCKET,
        Region: REGION,
        Key: key,
        Body: file,
      },
      (err, data) => {
        if (err) {
          reject(new Error(`文件上传失败: ${err.message || String(err)}`));
          return;
        }

        const cdnUrl = `${CDN_DOMAIN.replace(/\/+$/, '')}/${key}`;
        resolve(cdnUrl);
      }
    );
  });
};
