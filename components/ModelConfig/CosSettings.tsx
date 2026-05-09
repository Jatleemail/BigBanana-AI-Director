/**
 * 腾讯云 COS 配置组件
 * 配置保存在服务器端，多用户共享
 */

import React, { useState, useEffect } from 'react';
import { Cloud, Loader2, CheckCircle, AlertCircle, Trash2 } from 'lucide-react';
import { getCosConfig, setCosConfig, clearCosConfig, hasCosConfig } from '../../services/cosConfigStore';

interface CosSettingsProps {
  onRefresh: () => void;
}

const CosSettings: React.FC<CosSettingsProps> = ({ onRefresh }) => {
  const [secretId, setSecretId] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [region, setRegion] = useState('ap-beijing');
  const [bucket, setBucket] = useState('');
  const [cdnDomain, setCdnDomain] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    const cfg = getCosConfig();
    setSecretId(cfg.secretId);
    setSecretKey(cfg.secretKey);
    setRegion(cfg.region || 'ap-beijing');
    setBucket(cfg.bucket);
    setCdnDomain(cfg.cdnDomain);
    if (hasCosConfig()) {
      setSaveStatus('success');
      setSaveMessage('COS 已配置');
    }
  }, []);

  const handleSave = () => {
    if (!secretId.trim() || !secretKey.trim()) {
      setSaveStatus('error');
      setSaveMessage('SecretId 和 SecretKey 为必填项');
      return;
    }

    setIsSaving(true);
    setSaveStatus('idle');
    setSaveMessage('');

    try {
      setCosConfig({
        secretId: secretId.trim(),
        secretKey: secretKey.trim(),
        region: region.trim() || 'ap-beijing',
        bucket: bucket.trim(),
        cdnDomain: cdnDomain.trim(),
      });
      setSaveStatus('success');
      setSaveMessage('COS 配置已保存');
      onRefresh();
    } catch (error: any) {
      setSaveStatus('error');
      setSaveMessage(error.message || '保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = () => {
    setSecretId('');
    setSecretKey('');
    setRegion('ap-beijing');
    setBucket('');
    setCdnDomain('');
    setSaveStatus('idle');
    setSaveMessage('');
    clearCosConfig();
    onRefresh();
  };

  const inputClass = "w-full bg-[var(--bg-surface)] border border-[var(--border-primary)] text-[var(--text-primary)] px-4 py-3 text-sm rounded-lg focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-hover)] transition-all placeholder:text-[var(--text-muted)]";

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Cloud className="w-4 h-4 text-[var(--accent-text)]" />
          <label className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest">
            腾讯云 COS 配置
          </label>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[10px] text-[var(--text-tertiary)] font-bold mb-1.5 block">
              SecretId <span className="text-[var(--error-text)]">*</span>
            </label>
            <input
              type="text"
              value={secretId}
              onChange={(e) => { setSecretId(e.target.value); setSaveStatus('idle'); setSaveMessage(''); }}
              placeholder="输入腾讯云 SecretId..."
              className={inputClass}
              disabled={isSaving}
            />
          </div>

          <div>
            <label className="text-[10px] text-[var(--text-tertiary)] font-bold mb-1.5 block">
              SecretKey <span className="text-[var(--error-text)]">*</span>
            </label>
            <input
              type="password"
              value={secretKey}
              onChange={(e) => { setSecretKey(e.target.value); setSaveStatus('idle'); setSaveMessage(''); }}
              placeholder="输入腾讯云 SecretKey..."
              className={inputClass}
              disabled={isSaving}
            />
          </div>

          <div>
            <label className="text-[10px] text-[var(--text-tertiary)] font-bold mb-1.5 block">
              COS 区域 (Region)
            </label>
            <input
              type="text"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="ap-beijing"
              className={inputClass}
              disabled={isSaving}
            />
          </div>

          <div>
            <label className="text-[10px] text-[var(--text-tertiary)] font-bold mb-1.5 block">
              存储桶名称 (Bucket)
            </label>
            <input
              type="text"
              value={bucket}
              onChange={(e) => setBucket(e.target.value)}
              placeholder="your-bucket-1250000000"
              className={inputClass}
              disabled={isSaving}
            />
          </div>

          <div>
            <label className="text-[10px] text-[var(--text-tertiary)] font-bold mb-1.5 block">
              CDN 加速域名
            </label>
            <input
              type="text"
              value={cdnDomain}
              onChange={(e) => setCdnDomain(e.target.value)}
              placeholder="https://your-cdn-domain.com"
              className={inputClass}
              disabled={isSaving}
            />
          </div>

          {saveMessage && (
            <div className={`flex items-center gap-2 text-xs ${
              saveStatus === 'success' ? 'text-[var(--success-text)]' : 'text-[var(--error-text)]'
            }`}>
              {saveStatus === 'success' ? (
                <CheckCircle className="w-3.5 h-3.5" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5" />
              )}
              {saveMessage}
            </div>
          )}

          <div className="flex gap-3">
            {hasCosConfig() && (
              <button
                onClick={handleClear}
                className="flex-1 py-3 bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] text-xs font-bold uppercase tracking-wider transition-colors rounded-lg border border-[var(--border-primary)] flex items-center justify-center gap-2"
              >
                <Trash2 className="w-3 h-3" />
                清除配置
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={isSaving || !secretId.trim() || !secretKey.trim()}
              className="flex-1 py-3 bg-[var(--accent)] text-[var(--text-primary)] font-bold text-xs uppercase tracking-wider rounded-lg hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  保存中...
                </>
              ) : (
                '保存配置'
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 bg-[var(--bg-elevated)]/50 rounded-lg border border-[var(--border-primary)]">
        <h4 className="text-xs font-bold text-[var(--text-tertiary)] mb-2">使用说明</h4>
        <ul className="text-[10px] text-[var(--text-muted)] space-y-1 list-disc list-inside">
          <li>COS 配置用于声音克隆功能（上传参考音频到腾讯云 COS）</li>
          <li>SecretId 和 SecretKey 可在腾讯云访问管理控制台获取</li>
          <li>Bucket 名称需包含 APPID（格式：name-appid）</li>
          <li>配置保存后对所有访问用户生效</li>
        </ul>
      </div>
    </div>
  );
};

export default CosSettings;
