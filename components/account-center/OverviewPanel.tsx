import React from 'react';
import { Activity, CreditCard, Key, Loader2, RefreshCcw, Save, Server } from 'lucide-react';
import { NewApiSession, NewApiStatus } from '../../services/newApiService';
import { AccountTab } from './types';
import { formatQuota } from './utils';
import { SectionCard, StatCard } from './ui';

interface OverviewPanelProps {
  status: NewApiStatus | null;
  session: NewApiSession;
  endpointInput: string;
  setEndpointInput: React.Dispatch<React.SetStateAction<string>>;
  statusLoading: boolean;
  walletLoading: boolean;
  onSaveEndpoint: () => Promise<void>;
  onRefreshProfile: () => Promise<void>;
  onTabChange: (tab: AccountTab) => void;
}

export const OverviewPanel: React.FC<OverviewPanelProps> = ({
  status,
  session,
  endpointInput,
  setEndpointInput,
  statusLoading,
  walletLoading,
  onSaveEndpoint,
  onRefreshProfile,
  onTabChange,
}) => {
  const user = session.user;

  return (
    <div className="space-y-6">
      <SectionCard
        title="账号总览"
        description="把最常用的信息和动作放在第一屏，进入页面先看到余额、连接状态和下一步。"
        action={(
          <button
            onClick={() => void onRefreshProfile()}
            disabled={walletLoading}
            className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border-primary)] px-4 py-2.5 text-sm transition-colors hover:border-[var(--border-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-60"
          >
            {walletLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            刷新账户
          </button>
        )}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="当前余额" value={formatQuota(user?.quota, status)} hint="用于当前账号可消费额度" />
          <StatCard label="累计消耗" value={formatQuota(user?.used_quota, status)} hint="便于快速判断最近使用情况" />
          <StatCard label="请求次数" value={user?.request_count ?? 0} hint="来自当前账号累计调用记录" />
          <StatCard label="当前节点" value={status?.system_name || '未连接'} hint={status?.server_address || session.endpoint} />
        </div>
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard title="快捷动作" description="高频动作不需要再下翻整页寻找。">
          <div className="grid gap-4 md:grid-cols-3">
            <button onClick={() => onTabChange('billing')} className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-4 text-left transition-colors hover:border-[var(--border-secondary)] hover:bg-[var(--bg-hover)]">
              <CreditCard className="h-5 w-5 text-[var(--accent-text)]" />
              <div className="mt-4 font-semibold">去充值</div>
              <div className="mt-2 text-sm leading-6 text-[var(--text-tertiary)]">余额不足时直接进入充值与兑换模块。</div>
            </button>
            <button onClick={() => onTabChange('tokens')} className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-4 text-left transition-colors hover:border-[var(--border-secondary)] hover:bg-[var(--bg-hover)]">
              <Key className="h-5 w-5 text-[var(--accent-text)]" />
              <div className="mt-4 font-semibold">管理令牌</div>
              <div className="mt-2 text-sm leading-6 text-[var(--text-tertiary)]">创建新密钥，或把现有密钥一键回填到当前项目。</div>
            </button>
            <button onClick={() => onTabChange('logs')} className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-4 text-left transition-colors hover:border-[var(--border-secondary)] hover:bg-[var(--bg-hover)]">
              <Activity className="h-5 w-5 text-[var(--accent-text)]" />
              <div className="mt-4 font-semibold">查看日志</div>
              <div className="mt-2 text-sm leading-6 text-[var(--text-tertiary)]">快速定位消费、错误和模型使用情况。</div>
            </button>
          </div>
        </SectionCard>

        <SectionCard title="连接设置" description="把云端 EndPoint 放在独立模块里，避免和登录、充值等操作混在一起。">
          <div className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row">
              <input
                value={endpointInput}
                onChange={(event) => setEndpointInput(event.target.value)}
                placeholder="https://api.antsk.cn"
                className="w-full rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-3 font-mono outline-none transition-colors focus:border-[var(--accent)]"
              />
              <button
                onClick={() => void onSaveEndpoint()}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--btn-primary-bg)] px-5 py-3 text-sm font-medium text-[var(--btn-primary-text)] transition-colors hover:bg-[var(--btn-primary-hover)]"
              >
                <Save className="h-4 w-4" />
                保存 EndPoint
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <StatCard label="System" value={status?.system_name || '未连接'} hint="当前已接入的计费服务" />
              <StatCard label="Version" value={status?.version || '—'} hint="用于快速确认线上版本" />
              <StatCard label="Session" value={session.username} hint={statusLoading ? '正在同步会话状态' : '当前页面已使用本站代理托管登录态'} />
            </div>

            {status?.turnstile_check && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
                当前 EndPoint 开启了 Turnstile，本页还未嵌入对应组件。如果你希望用户完全在此页完成登录/注册，建议先关闭 Turnstile。
              </div>
            )}

            <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-4 text-sm text-[var(--text-secondary)] leading-7">
              <div className="inline-flex items-center gap-2 font-medium text-[var(--text-primary)]">
                <Server className="h-4 w-4 text-[var(--accent-text)]" />
                为什么要把 EndPoint 单独拿出来
              </div>
              <div className="mt-2 text-[var(--text-tertiary)]">
                账号管理和连接配置是两条不同任务流：用户日常使用时主要看余额、令牌和日志；只有管理员或高级用户才会偶尔切换后端地址。
              </div>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
};
