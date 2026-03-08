import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, ArrowLeft, CreditCard, Key, Loader2, Power, RefreshCcw, Server, Shield, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAlert } from './GlobalAlert';
import { setGlobalApiKey } from '../services/aiService';
import {
  NewApiLog,
  NewApiLogStats,
  NewApiSession,
  NewApiStatus,
  NewApiToken,
  NewApiTopupInfo,
  bootstrapNewApiSession,
  clearNewApiSession,
  createNewApiToken,
  deleteNewApiToken,
  fetchNewApiStatus,
  getNewApiEndpoint,
  getNewApiLogs,
  getNewApiLogsStat,
  getNewApiSession,
  getNewApiSelf,
  getNewApiTokens,
  getNewApiTopupInfo,
  loginNewApiUser,
  logoutNewApiUser,
  redeemNewApiCode,
  registerNewApiUser,
  requestNewApiAmount,
  requestNewApiPay,
  sendNewApiVerificationCode,
  setNewApiEndpoint,
  updateNewApiTokenStatus,
  verifyNewApiTwoFactor,
} from '../services/newApiService';
import { AuthView } from './account-center/AuthView';
import { BillingPanel } from './account-center/BillingPanel';
import { AuthTab } from './account-center/internal';
import { LogsPanel } from './account-center/LogsPanel';
import { OverviewPanel } from './account-center/OverviewPanel';
import { AccountTab, LoginFormState, RegisterFormState, TokenFormState } from './account-center/types';
import {
  creditsToQuota,
  formatDateTimeInput,
  formatQuota,
  normalizePayMethods,
  submitPaymentForm,
  toUnixTimestamp,
  TOKEN_STATUS_DISABLED,
  TOKEN_STATUS_ENABLED,
} from './account-center/utils';
import { cardClassName, SectionCard, StatCard } from './account-center/ui';
import { TokensPanel } from './account-center/TokensPanel';

const createDefaultTokenForm = (): TokenFormState => ({
  name: 'BigBanana',
  unlimitedQuota: true,
  creditsLimit: '5',
  expiredAt: '',
});

const ACCOUNT_TABS = [
  { key: 'overview' as AccountTab, label: '总览', description: '看余额、状态和下一步动作', icon: User },
  { key: 'billing' as AccountTab, label: '充值', description: '充值、预估金额、兑换码', icon: CreditCard },
  { key: 'tokens' as AccountTab, label: '令牌', description: '创建和管理项目密钥', icon: Key },
  { key: 'logs' as AccountTab, label: '日志', description: '查看消费、错误与模型调用', icon: Activity },
];

const NewApiConsole: React.FC = () => {
  const navigate = useNavigate();
  const { showAlert } = useAlert();

  const [endpointInput, setEndpointInput] = useState(getNewApiEndpoint());
  const [activeEndpoint, setActiveEndpoint] = useState(getNewApiEndpoint());
  const [status, setStatus] = useState<NewApiStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  const [session, setSession] = useState<NewApiSession | null>(() => getNewApiSession());
  const [authTab, setAuthTab] = useState<AuthTab>('login');
  const [authLoading, setAuthLoading] = useState(false);
  const [needsTwoFactor, setNeedsTwoFactor] = useState(false);
  const [activeTab, setActiveTab] = useState<AccountTab>('overview');

  const [loginForm, setLoginForm] = useState<LoginFormState>({ username: '', password: '', twoFactorCode: '' });
  const [registerForm, setRegisterForm] = useState<RegisterFormState>({ username: '', email: '', verificationCode: '', password: '', confirmPassword: '', affCode: '' });

  const [verificationLoading, setVerificationLoading] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);

  const [topupInfo, setTopupInfo] = useState<NewApiTopupInfo | null>(null);
  const [topupInfoLoading, setTopupInfoLoading] = useState(false);
  const [payableAmount, setPayableAmount] = useState<number | null>(null);
  const [topupAmount, setTopupAmount] = useState('10');
  const [redeemCode, setRedeemCode] = useState('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);

  const [tokens, setTokens] = useState<NewApiToken[]>([]);
  const [tokensLoading, setTokensLoading] = useState(false);
  const [tokenPage, setTokenPage] = useState(1);
  const [tokenTotal, setTokenTotal] = useState(0);
  const [tokenPageSize] = useState(10);
  const [createTokenLoading, setCreateTokenLoading] = useState(false);
  const [tokenForm, setTokenForm] = useState<TokenFormState>(createDefaultTokenForm());

  const defaultStart = useMemo(() => formatDateTimeInput(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)), []);
  const defaultEnd = useMemo(() => formatDateTimeInput(new Date()), []);
  const [logType, setLogType] = useState(2);
  const [logStart, setLogStart] = useState(defaultStart);
  const [logEnd, setLogEnd] = useState(defaultEnd);
  const [logTokenName, setLogTokenName] = useState('');
  const [logModelName, setLogModelName] = useState('');
  const [logs, setLogs] = useState<NewApiLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logPage, setLogPage] = useState(1);
  const [logPageSize] = useState(20);
  const [logTotal, setLogTotal] = useState(0);
  const [logStats, setLogStats] = useState<NewApiLogStats | null>(null);

  const [profileLoaded, setProfileLoaded] = useState(false);
  const [topupLoaded, setTopupLoaded] = useState(false);
  const [tokensLoaded, setTokensLoaded] = useState(false);
  const [logsLoaded, setLogsLoaded] = useState(false);

  const sessionUserId = session?.userId ?? null;
  const topupMethods = useMemo(() => normalizePayMethods(topupInfo?.pay_methods).filter((item) => item?.name && item?.type), [topupInfo]);

  const resetWorkspaceState = useCallback(() => {
    setTopupInfo(null);
    setPayableAmount(null);
    setTopupAmount('10');
    setRedeemCode('');
    setSelectedPaymentMethod('');
    setTokens([]);
    setTokenPage(1);
    setTokenTotal(0);
    setTokenForm(createDefaultTokenForm());
    setLogs([]);
    setLogPage(1);
    setLogTotal(0);
    setLogStats(null);
    setProfileLoaded(false);
    setTopupLoaded(false);
    setTokensLoaded(false);
    setLogsLoaded(false);
    setActiveTab('overview');
  }, []);

  const loadStatusAndSession = useCallback(async (endpoint: string, silent = false) => {
    setStatusLoading(true);
    try {
      setStatus(await fetchNewApiStatus(endpoint));
    } catch (error) {
      setStatus(null);
      if (!silent) {
        showAlert(error instanceof Error ? error.message : '获取 new-api 状态失败', { type: 'error' });
      }
    }

    try {
      setSession(await bootstrapNewApiSession(endpoint));
    } catch {
      setSession(null);
    } finally {
      setStatusLoading(false);
    }
  }, [showAlert]);

  const refreshProfile = useCallback(async () => {
    setWalletLoading(true);
    try {
      const user = await getNewApiSelf(activeEndpoint);
      setSession((current) => current ? { ...current, user, username: user.username } : current);
      setProfileLoaded(true);
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '刷新账户信息失败', { type: 'error' });
      throw error;
    } finally {
      setWalletLoading(false);
    }
  }, [activeEndpoint, showAlert]);

  const loadTopupInfo = useCallback(async () => {
    setTopupInfoLoading(true);
    try {
      const info = await getNewApiTopupInfo();
      const methods = normalizePayMethods(info.pay_methods).filter((item) => item?.name && item?.type);
      setTopupInfo(info);
      setSelectedPaymentMethod((current) => current || methods[0]?.type || '');
      if ((info.amount_options?.length || 0) > 0) {
        setTopupAmount((current) => current || String(info.amount_options?.[0] ?? '10'));
      }
      setTopupLoaded(true);
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '获取充值配置失败', { type: 'error' });
      throw error;
    } finally {
      setTopupInfoLoading(false);
    }
  }, [showAlert]);

  const loadTokens = useCallback(async (page = 1) => {
    setTokensLoading(true);
    try {
      const payload = await getNewApiTokens(page, tokenPageSize);
      setTokens(payload.items || []);
      setTokenPage(payload.page || page);
      setTokenTotal(payload.total || 0);
      setTokensLoaded(true);
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '获取令牌列表失败', { type: 'error' });
      throw error;
    } finally {
      setTokensLoading(false);
    }
  }, [showAlert, tokenPageSize]);

  const loadLogs = useCallback(async (page = 1) => {
    setLogsLoading(true);
    try {
      const startTimestamp = toUnixTimestamp(logStart);
      const endTimestamp = toUnixTimestamp(logEnd);
      const [pageData, statsData] = await Promise.all([
        getNewApiLogs({ page, pageSize: logPageSize, type: logType, tokenName: logTokenName, modelName: logModelName, startTimestamp, endTimestamp }),
        getNewApiLogsStat({ type: logType, tokenName: logTokenName, modelName: logModelName, startTimestamp, endTimestamp }),
      ]);
      setLogs(pageData.items || []);
      setLogPage(pageData.page || page);
      setLogTotal(pageData.total || 0);
      setLogStats(statsData);
      setLogsLoaded(true);
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '获取使用日志失败', { type: 'error' });
      throw error;
    } finally {
      setLogsLoading(false);
    }
  }, [logEnd, logModelName, logPageSize, logStart, logTokenName, logType, showAlert]);

  useEffect(() => {
    loadStatusAndSession(activeEndpoint, true).catch(() => undefined);
  }, [activeEndpoint, loadStatusAndSession]);

  useEffect(() => {
    if (!sessionUserId) {
      resetWorkspaceState();
      return;
    }
    if (!profileLoaded) {
      refreshProfile().catch(() => undefined);
      return;
    }
    if (activeTab === 'billing' && !topupLoaded) {
      loadTopupInfo().catch(() => undefined);
      return;
    }
    if (activeTab === 'tokens' && !tokensLoaded) {
      loadTokens(1).catch(() => undefined);
      return;
    }
    if (activeTab === 'logs' && !logsLoaded) {
      loadLogs(1).catch(() => undefined);
    }
  }, [sessionUserId, activeTab, profileLoaded, topupLoaded, tokensLoaded, logsLoaded, refreshProfile, loadTopupInfo, loadTokens, loadLogs, resetWorkspaceState]);

  const handleSaveEndpoint = async () => {
    try {
      const nextEndpoint = setNewApiEndpoint(endpointInput);
      clearNewApiSession();
      resetWorkspaceState();
      setSession(null);
      setNeedsTwoFactor(false);
      setActiveEndpoint(nextEndpoint);
      showAlert('EndPoint 已保存，登录态已按新地址重新初始化。', { type: 'success' });
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '保存 EndPoint 失败', { type: 'error' });
    }
  };

  const handleLogin = async () => {
    if (!loginForm.username.trim() || !loginForm.password.trim()) {
      showAlert('请输入用户名和密码。', { type: 'warning' });
      return;
    }
    if (status?.turnstile_check) {
      showAlert('当前 EndPoint 开启了 Turnstile 校验，本页暂未接入该组件，请先在 new-api 原站登录或关闭 Turnstile。', { type: 'warning' });
      return;
    }
    setAuthLoading(true);
    try {
      const result = await loginNewApiUser({ username: loginForm.username.trim(), password: loginForm.password }, activeEndpoint);
      if (result.requireTwoFactor) {
        setNeedsTwoFactor(true);
        showAlert('该账号开启了 2FA，请继续输入一次性验证码。', { type: 'info' });
        return;
      }
      resetWorkspaceState();
      setNeedsTwoFactor(false);
      setSession(result.session || null);
      showAlert('登录成功。', { type: 'success' });
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '登录失败', { type: 'error' });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleVerifyTwoFactor = async () => {
    if (!loginForm.twoFactorCode.trim()) {
      showAlert('请输入 2FA 验证码。', { type: 'warning' });
      return;
    }
    setAuthLoading(true);
    try {
      const result = await verifyNewApiTwoFactor(loginForm.twoFactorCode.trim(), activeEndpoint);
      resetWorkspaceState();
      setNeedsTwoFactor(false);
      setSession(result.session || null);
      showAlert('登录成功。', { type: 'success' });
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '2FA 校验失败', { type: 'error' });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!registerForm.username.trim()) {
      showAlert('请输入用户名。', { type: 'warning' });
      return;
    }
    if (registerForm.password.length < 8) {
      showAlert('密码长度至少 8 位。', { type: 'warning' });
      return;
    }
    if (registerForm.password !== registerForm.confirmPassword) {
      showAlert('两次输入的密码不一致。', { type: 'warning' });
      return;
    }
    if (status?.email_verification && (!registerForm.email.trim() || !registerForm.verificationCode.trim())) {
      showAlert('当前 EndPoint 开启了邮箱验证，请填写邮箱和验证码。', { type: 'warning' });
      return;
    }
    if (status?.turnstile_check) {
      showAlert('当前 EndPoint 开启了 Turnstile 校验，本页暂未接入该组件，请先在 new-api 原站注册或关闭 Turnstile。', { type: 'warning' });
      return;
    }
    setAuthLoading(true);
    try {
      await registerNewApiUser({
        username: registerForm.username.trim(),
        password: registerForm.password,
        email: registerForm.email.trim() || undefined,
        verification_code: registerForm.verificationCode.trim() || undefined,
        aff_code: registerForm.affCode.trim() || undefined,
      }, activeEndpoint);
      setAuthTab('login');
      setLoginForm((current) => ({ ...current, username: registerForm.username.trim(), password: '' }));
      showAlert('注册成功，请直接登录。', { type: 'success' });
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '注册失败', { type: 'error' });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSendVerificationCode = async () => {
    if (!registerForm.email.trim()) {
      showAlert('请先填写邮箱地址。', { type: 'warning' });
      return;
    }
    if (status?.turnstile_check) {
      showAlert('当前 EndPoint 开启了 Turnstile 校验，本页暂未接入该组件。', { type: 'warning' });
      return;
    }
    setVerificationLoading(true);
    try {
      await sendNewApiVerificationCode(registerForm.email.trim(), activeEndpoint);
      showAlert('验证码已发送，请检查邮箱。', { type: 'success' });
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '验证码发送失败', { type: 'error' });
    } finally {
      setVerificationLoading(false);
    }
  };

  const handleLogout = async () => {
    setAuthLoading(true);
    try {
      await logoutNewApiUser();
      clearNewApiSession();
      resetWorkspaceState();
      setNeedsTwoFactor(false);
      setSession(null);
      showAlert('已退出登录。', { type: 'success' });
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '退出登录失败', { type: 'error' });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleEstimateAmount = async () => {
    const amountValue = Number(topupAmount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      showAlert('请输入正确的充值数量。', { type: 'warning' });
      return;
    }
    setPaymentLoading(true);
    try {
      setPayableAmount(await requestNewApiAmount(amountValue));
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '获取支付金额失败', { type: 'error' });
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleOnlinePay = async () => {
    const amountValue = Number(topupAmount);
    if (!selectedPaymentMethod) {
      showAlert('请选择支付方式。', { type: 'warning' });
      return;
    }
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      showAlert('请输入正确的充值数量。', { type: 'warning' });
      return;
    }
    setPaymentLoading(true);
    try {
      const { url, params } = await requestNewApiPay(amountValue, selectedPaymentMethod);
      if (!url) throw new Error('支付链接为空');
      submitPaymentForm(url, params);
      showAlert('支付页面已在新窗口中拉起。支付完成后可点击刷新余额。', { type: 'success' });
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '拉起支付失败', { type: 'error' });
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleRedeemCode = async () => {
    if (!redeemCode.trim()) {
      showAlert('请输入兑换码。', { type: 'warning' });
      return;
    }
    setPaymentLoading(true);
    try {
      const quota = await redeemNewApiCode(redeemCode.trim());
      setRedeemCode('');
      await refreshProfile();
      showAlert(`兑换成功，到账额度：${formatQuota(quota, status)}。`, { type: 'success' });
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '兑换失败', { type: 'error' });
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleCreateToken = async () => {
    if (!tokenForm.name.trim()) {
      showAlert('请输入令牌名称。', { type: 'warning' });
      return;
    }
    const creditsLimit = Number(tokenForm.creditsLimit || '0');
    if (!tokenForm.unlimitedQuota && (!Number.isFinite(creditsLimit) || creditsLimit < 0)) {
      showAlert('请输入正确的额度上限。', { type: 'warning' });
      return;
    }
    setCreateTokenLoading(true);
    try {
      await createNewApiToken({
        name: tokenForm.name.trim(),
        unlimited_quota: tokenForm.unlimitedQuota,
        remain_quota: tokenForm.unlimitedQuota ? 0 : creditsToQuota(creditsLimit, status),
        expired_time: tokenForm.expiredAt ? Math.floor(Date.parse(tokenForm.expiredAt) / 1000) : -1,
      });
      await loadTokens(1);
      setTokenForm(createDefaultTokenForm());
      showAlert('令牌已创建，请在列表中复制或直接设为当前创作 Key。', { type: 'success' });
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '创建令牌失败', { type: 'error' });
    } finally {
      setCreateTokenLoading(false);
    }
  };

  const handleToggleToken = async (token: NewApiToken) => {
    const nextStatus = token.status === TOKEN_STATUS_ENABLED ? TOKEN_STATUS_DISABLED : TOKEN_STATUS_ENABLED;
    setTokensLoading(true);
    try {
      await updateNewApiTokenStatus(token.id, nextStatus);
      await loadTokens(tokenPage);
      showAlert(nextStatus === TOKEN_STATUS_ENABLED ? '令牌已启用。' : '令牌已禁用。', { type: 'success' });
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '更新令牌状态失败', { type: 'error' });
    } finally {
      setTokensLoading(false);
    }
  };

  const handleDeleteToken = async (token: NewApiToken) => {
    showAlert(`确定删除令牌「${token.name}」吗？`, {
      type: 'warning',
      showCancel: true,
      onConfirm: async () => {
        try {
          await deleteNewApiToken(token.id);
          await loadTokens(Math.max(1, tokenPage));
          showAlert('令牌已删除。', { type: 'success' });
        } catch (error) {
          showAlert(error instanceof Error ? error.message : '删除令牌失败', { type: 'error' });
        }
      },
    });
  };

  const handleCopyToken = async (token: NewApiToken) => {
    await navigator.clipboard.writeText(`sk-${token.key}`);
    showAlert('令牌已复制到剪贴板。', { type: 'success' });
  };

  const handleUseTokenInProject = (token: NewApiToken) => {
    const fullKey = `sk-${token.key}`;
    localStorage.setItem('antsk_api_key', fullKey);
    setGlobalApiKey(fullKey);
    showAlert('已将该令牌设为当前项目的全局 API Key。', { type: 'success' });
  };

  const currentTab = ACCOUNT_TABS.find((item) => item.key === activeTab) || ACCOUNT_TABS[0];

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
      <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]">
              <ArrowLeft className="h-4 w-4" /> 返回
            </button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">账号中心</h1>
              <p className="mt-2 text-sm text-[var(--text-tertiary)]">把登录、充值、令牌和日志拆成独立任务模块，让用户每次只完成一件事。</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => void loadStatusAndSession(activeEndpoint)} className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border-primary)] px-4 py-2.5 text-sm transition-colors hover:border-[var(--border-secondary)] hover:bg-[var(--bg-hover)]">
              {statusLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />} 刷新状态
            </button>
            {session && (
              <button onClick={() => void handleLogout()} disabled={authLoading} className="inline-flex items-center gap-2 rounded-2xl border border-rose-500/30 px-4 py-2.5 text-sm text-rose-400 transition-colors hover:bg-rose-500/10 disabled:opacity-60">
                <Power className="h-4 w-4" /> 退出登录
              </button>
            )}
          </div>
        </header>

        {!session ? (
          <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <div className="space-y-6">
              <SectionCard title="先连接你的计费后端" description="账号能力已经与当前项目融合，但 EndPoint 仍然保持可配置，方便你切换不同的 new-api 实例。">
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 lg:flex-row">
                    <input value={endpointInput} onChange={(event) => setEndpointInput(event.target.value)} placeholder="https://api.antsk.cn" className="w-full rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-3 font-mono outline-none transition-colors focus:border-[var(--accent)]" />
                    <button onClick={() => void handleSaveEndpoint()} className="rounded-2xl bg-[var(--btn-primary-bg)] px-5 py-3 text-sm font-medium text-[var(--btn-primary-text)] transition-colors hover:bg-[var(--btn-primary-hover)]">保存并连接</button>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <StatCard label="System" value={status?.system_name || '未连接'} hint="当前接入的服务实例" />
                    <StatCard label="Version" value={status?.version || '—'} hint="用于确认后端版本" />
                    <StatCard label="注册方式" value={status?.email_verification ? '邮箱验证码' : '直接注册'} hint={status?.turnstile_check ? '当前开启 Turnstile' : '当前未开启 Turnstile'} />
                  </div>
                </div>
              </SectionCard>
              <SectionCard title="接入逻辑说明" description="从产品体验上，用户不应该被迫理解后端控制台。">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-4">
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--accent-bg)] text-[var(--accent-text)]"><Shield className="h-5 w-5" /></div>
                    <div className="mt-4 font-semibold">同源代理托管会话</div>
                    <div className="mt-2 text-sm leading-6 text-[var(--text-tertiary)]">登录成功后，浏览器只保存本站会话，不需要再跳去 new-api 控制台完成后续操作。</div>
                  </div>
                  <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-4">
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--accent-bg)] text-[var(--accent-text)]"><Server className="h-5 w-5" /></div>
                    <div className="mt-4 font-semibold">EndPoint 独立配置</div>
                    <div className="mt-2 text-sm leading-6 text-[var(--text-tertiary)]">把连接配置和账号任务拆开后，普通用户只需关注登录与使用，高级用户再处理实例切换。</div>
                  </div>
                </div>
              </SectionCard>
            </div>
            <AuthView
              status={status}
              authTab={authTab}
              setAuthTab={setAuthTab}
              needsTwoFactor={needsTwoFactor}
              authLoading={authLoading}
              verificationLoading={verificationLoading}
              loginForm={loginForm}
              setLoginForm={setLoginForm}
              registerForm={registerForm}
              setRegisterForm={setRegisterForm}
              onLogin={handleLogin}
              onVerifyTwoFactor={handleVerifyTwoFactor}
              onRegister={handleRegister}
              onSendVerificationCode={handleSendVerificationCode}
            />
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
              <div className={`${cardClassName} p-5`}>
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-bg)] text-[var(--accent-text)]"><User className="h-6 w-6" /></div>
                <div className="mt-4 text-lg font-semibold">{session.username}</div>
                <div className="mt-1 text-sm text-[var(--text-tertiary)]">当前账号已接入项目内工作流</div>
                <div className="mt-5 grid gap-3">
                  <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-3"><div className="text-xs uppercase tracking-[0.24em] text-[var(--text-tertiary)]">余额</div><div className="mt-2 text-xl font-semibold">{formatQuota(session.user?.quota, status)}</div></div>
                  <div className="rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-3"><div className="text-xs uppercase tracking-[0.24em] text-[var(--text-tertiary)]">EndPoint</div><div className="mt-2 break-all text-sm text-[var(--text-secondary)]">{activeEndpoint}</div></div>
                </div>
              </div>
              <div className={`${cardClassName} p-3`}>
                {ACCOUNT_TABS.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.key;
                  return (
                    <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`flex w-full items-start gap-3 rounded-2xl px-4 py-3 text-left transition-colors ${isActive ? 'bg-[var(--accent-bg)] text-[var(--accent-text)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'}`}>
                      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
                      <span><span className="block font-medium">{tab.label}</span><span className={`mt-1 block text-xs leading-5 ${isActive ? 'text-[var(--accent-text)]/80' : 'text-[var(--text-tertiary)]'}`}>{tab.description}</span></span>
                    </button>
                  );
                })}
              </div>
            </aside>

            <main className="min-w-0 space-y-6">
              <SectionCard title={currentTab.label} description={currentTab.description}>
                <div className="text-sm leading-6 text-[var(--text-tertiary)]">现在每个模块只承载一个明确任务：总览负责认知、充值负责到账、令牌负责密钥管理、日志负责复盘与排错。</div>
              </SectionCard>

              {activeTab === 'overview' && <OverviewPanel status={status} session={session} endpointInput={endpointInput} setEndpointInput={setEndpointInput} statusLoading={statusLoading} walletLoading={walletLoading} onSaveEndpoint={handleSaveEndpoint} onRefreshProfile={refreshProfile} onTabChange={setActiveTab} />}
              {activeTab === 'billing' && <BillingPanel status={status} session={session} topupInfo={topupInfo} topupInfoLoading={topupInfoLoading} walletLoading={walletLoading} paymentLoading={paymentLoading} topupMethods={topupMethods} selectedPaymentMethod={selectedPaymentMethod} setSelectedPaymentMethod={setSelectedPaymentMethod} topupAmount={topupAmount} setTopupAmount={setTopupAmount} payableAmount={payableAmount} redeemCode={redeemCode} setRedeemCode={setRedeemCode} onEstimateAmount={handleEstimateAmount} onOnlinePay={handleOnlinePay} onRedeemCode={handleRedeemCode} onRefreshProfile={refreshProfile} />}
              {activeTab === 'tokens' && <TokensPanel status={status} tokens={tokens} tokensLoading={tokensLoading} tokenPage={tokenPage} tokenTotal={tokenTotal} tokenPageSize={tokenPageSize} createTokenLoading={createTokenLoading} tokenForm={tokenForm} setTokenForm={setTokenForm} onCreateToken={handleCreateToken} onRefreshTokens={() => loadTokens(tokenPage)} onPageChange={loadTokens} onToggleToken={handleToggleToken} onDeleteToken={handleDeleteToken} onCopyToken={handleCopyToken} onUseTokenInProject={handleUseTokenInProject} />}
              {activeTab === 'logs' && <LogsPanel status={status} logs={logs} logsLoading={logsLoading} logStats={logStats} logType={logType} setLogType={setLogType} logStart={logStart} setLogStart={setLogStart} logEnd={logEnd} setLogEnd={setLogEnd} logTokenName={logTokenName} setLogTokenName={setLogTokenName} logModelName={logModelName} setLogModelName={setLogModelName} logPage={logPage} logPageSize={logPageSize} logTotal={logTotal} onSearch={() => loadLogs(1)} onPageChange={loadLogs} />}
            </main>
          </div>
        )}
      </div>
    </div>
  );
};

export default NewApiConsole;
