import React from 'react';
import { CreditCard, ExternalLink, Loader2, RefreshCcw } from 'lucide-react';
import { NewApiPayMethod, NewApiSession, NewApiStatus, NewApiTopupInfo } from '../../services/newApiService';
import { formatPayableAmount, formatQuota } from './utils';
import { EmptyState, SectionCard, StatCard } from './ui';

interface BillingPanelProps {
  status: NewApiStatus | null;
  session: NewApiSession;
  topupInfo: NewApiTopupInfo | null;
  topupInfoLoading: boolean;
  walletLoading: boolean;
  paymentLoading: boolean;
  topupMethods: NewApiPayMethod[];
  selectedPaymentMethod: string;
  setSelectedPaymentMethod: React.Dispatch<React.SetStateAction<string>>;
  topupAmount: string;
  setTopupAmount: React.Dispatch<React.SetStateAction<string>>;
  payableAmount: number | null;
  redeemCode: string;
  setRedeemCode: React.Dispatch<React.SetStateAction<string>>;
  onEstimateAmount: () => Promise<void>;
  onOnlinePay: () => Promise<void>;
  onRedeemCode: () => Promise<void>;
  onRefreshProfile: () => Promise<void>;
}

export const BillingPanel: React.FC<BillingPanelProps> = ({
  status,
  session,
  topupInfo,
  topupInfoLoading,
  walletLoading,
  paymentLoading,
  topupMethods,
  selectedPaymentMethod,
  setSelectedPaymentMethod,
  topupAmount,
  setTopupAmount,
  payableAmount,
  redeemCode,
  setRedeemCode,
  onEstimateAmount,
  onOnlinePay,
  onRedeemCode,
  onRefreshProfile,
}) => {
  const amountOptions = topupInfo?.amount_options ?? [];
  const hasPaymentMethod = topupMethods.length > 0;

  return (
    <div className="space-y-6">
      <SectionCard
        title="充值与余额"
        description="把充值、预估支付金额、兑换码和余额刷新聚合到一个任务面板里，减少来回切换。"
        action={(
          <button
            onClick={() => void onRefreshProfile()}
            disabled={walletLoading}
            className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border-primary)] px-4 py-2.5 text-sm transition-colors hover:border-[var(--border-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-60"
          >
            {walletLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            刷新余额
          </button>
        )}
      >
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label="当前余额" value={formatQuota(session.user?.quota, status)} hint="支付完成后可在这里立即确认到账" />
          <StatCard label="累计消耗" value={formatQuota(session.user?.used_quota, status)} hint="帮助你判断近期使用强度" />
          <StatCard label="支付方式" value={topupMethods.length || 0} hint={topupInfoLoading ? '正在同步充值配置' : '当前可选支付方式数量'} />
        </div>
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <SectionCard title="在线充值" description="先选方式、再选金额、最后支付，流程更符合用户直觉。">
          {topupInfoLoading ? (
            <div className="flex min-h-[240px] items-center justify-center text-[var(--text-tertiary)]">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : !hasPaymentMethod && !status?.top_up_link ? (
            <EmptyState title="当前没有可用充值方式" description="如果你使用的是自建 new-api 实例，请先在后端配置支付渠道，或直接打开官方充值页。" />
          ) : (
            <div className="space-y-5">
              {hasPaymentMethod && (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {topupMethods.map((method) => (
                    <button
                      key={method.type}
                      onClick={() => setSelectedPaymentMethod(method.type)}
                      className={`rounded-2xl border px-4 py-4 text-left transition-colors ${selectedPaymentMethod === method.type ? 'border-[var(--accent)] bg-[var(--accent-bg)]' : 'border-[var(--border-primary)] bg-[var(--bg-secondary)] hover:border-[var(--border-secondary)] hover:bg-[var(--bg-hover)]'}`}
                    >
                      <div className="font-semibold">{method.name}</div>
                      <div className="mt-1 text-xs text-[var(--text-tertiary)]">{method.type}</div>
                      {method.min_topup && <div className="mt-3 text-xs text-[var(--text-tertiary)]">最低充值：{method.min_topup}</div>}
                    </button>
                  ))}
                </div>
              )}

              {amountOptions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {amountOptions.map((amount) => (
                    <button
                      key={amount}
                      onClick={() => setTopupAmount(String(amount))}
                      className={`rounded-full border px-4 py-2 text-sm transition-colors ${String(amount) === topupAmount ? 'border-[var(--accent)] bg-[var(--accent-bg)] text-[var(--accent-text)]' : 'border-[var(--border-primary)] text-[var(--text-secondary)] hover:border-[var(--border-secondary)] hover:text-[var(--text-primary)]'}`}
                    >
                      {amount}
                    </button>
                  ))}
                </div>
              )}

              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
                <input
                  value={topupAmount}
                  onChange={(event) => setTopupAmount(event.target.value)}
                  placeholder="输入充值数量，例如 10"
                  className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-3 outline-none transition-colors focus:border-[var(--accent)]"
                />
                <button
                  onClick={() => void onEstimateAmount()}
                  disabled={paymentLoading}
                  className="rounded-2xl border border-[var(--border-primary)] px-4 py-3 text-sm transition-colors hover:border-[var(--border-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-60"
                >
                  计算金额
                </button>
                <button
                  onClick={() => void onOnlinePay()}
                  disabled={paymentLoading || !hasPaymentMethod}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--btn-primary-bg)] px-4 py-3 text-sm font-medium text-[var(--btn-primary-text)] transition-colors hover:bg-[var(--btn-primary-hover)] disabled:opacity-60"
                >
                  {paymentLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                  立即支付
                </button>
              </div>

              <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-4">
                <div className="text-sm text-[var(--text-tertiary)]">预估支付金额</div>
                <div className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{formatPayableAmount(payableAmount, status)}</div>
                <div className="mt-2 text-sm text-[var(--text-tertiary)] leading-6">如果你的后端设置了不同的币种和汇率，这里会自动按照当前 EndPoint 的展示规则计算。</div>
              </div>

              {status?.top_up_link && (
                <a
                  href={status.top_up_link}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-[var(--accent-text)] hover:underline"
                >
                  <ExternalLink className="h-4 w-4" />
                  打开官方充值页
                </a>
              )}
            </div>
          )}
        </SectionCard>

        <div className="space-y-6">
          <SectionCard title="兑换码" description="适合运营活动或手动发放额度的场景。">
            <div className="space-y-3">
              <input
                value={redeemCode}
                onChange={(event) => setRedeemCode(event.target.value)}
                placeholder="输入兑换码"
                className="w-full rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-3 outline-none transition-colors focus:border-[var(--accent)]"
              />
              <button
                onClick={() => void onRedeemCode()}
                disabled={paymentLoading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border-primary)] px-4 py-3 transition-colors hover:border-[var(--border-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-60"
              >
                {paymentLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                立即兑换
              </button>
            </div>
          </SectionCard>

          <SectionCard title="使用提示" description="把操作说明放在旁边，避免用户一边充值一边找帮助。">
            <ul className="space-y-3 text-sm leading-6 text-[var(--text-secondary)]">
              <li>- 先计算金额，再点击支付，可以减少金额换算带来的疑惑。</li>
              <li>- 支付完成后建议点击“刷新余额”，确认额度是否到账。</li>
              <li>- 如果没有在线支付方式，可引导用户打开官方充值页。</li>
              {topupInfo?.min_topup !== undefined && <li>- 当前最小充值数量：{topupInfo.min_topup}</li>}
            </ul>
          </SectionCard>
        </div>
      </div>
    </div>
  );
};
