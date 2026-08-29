import * as React from 'react';

import { GoogleSignInButton } from '@/components/google-sign-in-button';
import { TurnstileWidget } from '@/components/turnstile';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useConfig } from '@/hooks/use-config';
import { getSecurityHeaders } from '@/lib/api';
import { setToken, setUser } from '@/lib/auth';

type LoginMode = 'email' | 'qq';

type QqBotStatus = {
	configured: boolean;
	available: boolean;
	reason?: string;
	bot_qq?: string;
	version?: string;
};

const QQ_CHAT_URL = 'https://qm.qq.com/q/Xz1Vy4UgQE';

function copyCodeAndOpenQq(code: string) {
	navigator.clipboard?.writeText(code).catch(() => {});
	window.location.href = QQ_CHAT_URL;
}

export function LoginPage() {
	const { config } = useConfig();
	const [loginMode, setLoginMode] = React.useState<LoginMode>('email');
	const [email, setEmail] = React.useState('');
	const [password, setPassword] = React.useState('');
	const [totpCode, setTotpCode] = React.useState('');
	const [turnstileToken, setTurnstileToken] = React.useState('');
	const [turnstileResetKey, setTurnstileResetKey] = React.useState(0);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState('');
	const [qqStatus, setQqStatus] = React.useState<QqBotStatus | null>(null);
	const [qqStatusLoading, setQqStatusLoading] = React.useState(false);
	const [qqSessionId, setQqSessionId] = React.useState('');
	const [qqCode, setQqCode] = React.useState('');
	const [qqNumber, setQqNumber] = React.useState('');
	const [qqPassword, setQqPassword] = React.useState('');
	const [qqTotpCode, setQqTotpCode] = React.useState('');
	const [qqPollText, setQqPollText] = React.useState('');
	const totpCodeRef = React.useRef('');

	React.useEffect(() => {
		totpCodeRef.current = totpCode;
	}, [totpCode]);

	const enabled = !!config?.turnstile_enabled;
	const siteKey = config?.turnstile_site_key || '';
	const turnstileActive = enabled && !!siteKey;
	const googleLoginEnabled = !!config?.google_login_enabled && !!config.google_client_id;
	const qqAvailable = !!qqStatus?.available;

	const completeLogin = React.useCallback((data: any) => {
		setUser(data.user);
		setToken(data.token);
		window.location.href = '/';
	}, []);

	const resetTurnstile = React.useCallback(() => {
		setTurnstileToken('');
		setTurnstileResetKey((v) => v + 1);
	}, []);

	const loadQqStatus = React.useCallback(async () => {
		setQqStatusLoading(true);
		try {
			const res = await fetch('/api/auth/qq/status');
			const data = (await res.json()) as QqBotStatus;
			setQqStatus(data);
		} catch {
			setQqStatus({ configured: true, available: false, reason: '无法连接 QQ 登录服务' });
		} finally {
			setQqStatusLoading(false);
		}
	}, []);

	React.useEffect(() => {
		loadQqStatus();
		const timer = window.setInterval(loadQqStatus, 15000);
		return () => window.clearInterval(timer);
	}, [loadQqStatus]);

	React.useEffect(() => {
		if (!qqSessionId) return;
		let cancelled = false;
		const timer = window.setInterval(async () => {
			try {
				const res = await fetch(`/api/auth/qq/check/${encodeURIComponent(qqSessionId)}`);
				const data = (await res.json()) as any;
				if (cancelled) return;
				if (data.token) {
					window.clearInterval(timer);
					setQqSessionId('');
					setQqCode('');
					completeLogin(data);
					return;
				}
				if (data.status === 'expired' || data.status === 'not_found') {
					window.clearInterval(timer);
					setQqSessionId('');
					setQqPollText('验证码已过期，请重新获取');
					setError('QQ 验证码已过期');
				}
			} catch {
				if (!cancelled) setQqPollText('等待验证，网络暂时不稳定...');
			}
		}, 2000);
		return () => {
			cancelled = true;
			window.clearInterval(timer);
		};
	}, [completeLogin, qqSessionId]);

	function switchMode(mode: LoginMode) {
		setLoginMode(mode);
		setError('');
		if (mode === 'email') {
			setQqSessionId('');
			setQqCode('');
			setQqPollText('');
		}
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError('');
		if (turnstileActive && !turnstileToken) {
			setError('请完成验证码验证');
			return;
		}
		setLoading(true);
		try {
			const res = await fetch('/api/login', {
				method: 'POST',
				headers: getSecurityHeaders('POST'),
				body: JSON.stringify({
					email,
					password,
					totp_code: totpCode,
					'cf-turnstile-response': turnstileToken
				})
			});
			const data = (await res.json()) as any;
			if (!res.ok) {
				resetTurnstile();
				if (data?.error === 'TOTP_REQUIRED') {
					setError('请输入 2FA 验证码');
					return;
				}
				throw new Error(data?.error || '登录失败');
			}

			completeLogin(data);
		} catch (err: any) {
			setError(String(err?.message || err));
		} finally {
			setLoading(false);
		}
	}

	async function requestQqCode() {
		setError('');
		if (!qqAvailable) {
			setError(qqStatus?.reason || 'QQ 登录暂不可用');
			return;
		}
		if (turnstileActive && !turnstileToken) {
			setError('请完成验证码验证');
			return;
		}
		setLoading(true);
		try {
			const res = await fetch('/api/auth/qq/request-code', {
				method: 'POST',
				headers: getSecurityHeaders('POST'),
				body: JSON.stringify({ 'cf-turnstile-response': turnstileToken })
			});
			const data = (await res.json()) as any;
			if (!res.ok) {
				resetTurnstile();
				throw new Error(data?.error || '获取 QQ 验证码失败');
			}
			setQqSessionId(data.session_id);
			setQqCode(data.code);
			setQqPollText(`等待 QQ 私聊验证${data.bot_qq ? `，机器人 QQ：${data.bot_qq}` : ''}`);
			if (navigator.clipboard && window.isSecureContext) {
				navigator.clipboard.writeText(data.code).catch(() => {});
			}
		} catch (err: any) {
			setError(String(err?.message || err));
		} finally {
			setLoading(false);
		}
	}

	async function handleQqPasswordLogin(e: React.FormEvent) {
		e.preventDefault();
		setError('');
		if (turnstileActive && !turnstileToken) {
			setError('请完成验证码验证');
			return;
		}
		setLoading(true);
		try {
			const res = await fetch('/api/auth/qq/password-login', {
				method: 'POST',
				headers: getSecurityHeaders('POST'),
				body: JSON.stringify({
					qq_id: qqNumber,
					password: qqPassword,
					totp_code: qqTotpCode,
					'cf-turnstile-response': turnstileToken
				})
			});
			const data = (await res.json()) as any;
			if (!res.ok) {
				resetTurnstile();
				if (data?.error === 'TOTP_REQUIRED') {
					setError('请输入 2FA 验证码');
					return;
				}
				throw new Error(data?.error || 'QQ 密码登录失败');
			}
			completeLogin(data);
		} catch (err: any) {
			setError(String(err?.message || err));
		} finally {
			setLoading(false);
		}
	}

	const handleGoogleCredential = React.useCallback(
		async (credential: string) => {
			setError('');
			setLoading(true);
			try {
				const res = await fetch('/api/auth/google', {
					method: 'POST',
					headers: getSecurityHeaders('POST'),
					body: JSON.stringify({
						credential,
						totp_code: totpCodeRef.current,
					}),
				});
				const data = (await res.json()) as any;
				if (!res.ok) {
					if (data?.error === 'TOTP_REQUIRED') {
						setError('请输入 2FA 验证码后再次点击 Google 登录');
						return;
					}
					throw new Error(data?.error || 'Google 登录失败');
				}
				completeLogin(data);
			} catch (err: any) {
				setError(String(err?.message || err));
			} finally {
				setLoading(false);
			}
		},
		[completeLogin]
	);

	const handleGoogleError = React.useCallback((message: string) => {
		setError(message);
	}, []);

	return (
		<div className="min-h-dvh bg-muted/20">
			<main className="mx-auto flex max-w-5xl justify-center px-4 py-10">
				<Card className="w-full max-w-md">
					<CardHeader>
						<CardTitle>登录</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/30 p-1">
							<Button type="button" variant={loginMode === 'email' ? 'default' : 'ghost'} onClick={() => switchMode('email')}>
								邮箱登录
							</Button>
							<Button type="button" variant={loginMode === 'qq' ? 'default' : 'ghost'} onClick={() => switchMode('qq')}>
								QQ 登录
							</Button>
						</div>

						{error ? <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}

						{loginMode === 'email' ? (
							<form className="space-y-4" onSubmit={handleSubmit}>
								<div className="space-y-2">
									<Label htmlFor="login-email">邮箱</Label>
									<Input id="login-email" name="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
								</div>

								<div className="space-y-2">
									<Label htmlFor="login-password">密码</Label>
									<Input id="login-password" name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
								</div>

								<div className="space-y-2">
									<Label htmlFor="login-totp">双重验证码 (若开启)</Label>
									<Input
										id="login-totp"
										name="totp_code"
										type="text"
										inputMode="numeric"
										pattern="\d*"
										maxLength={6}
										placeholder="选填"
										autoComplete="one-time-code"
										value={totpCode}
										onChange={(e) => setTotpCode(e.target.value)}
									/>
								</div>

								<TurnstileWidget enabled={turnstileActive} siteKey={siteKey} onToken={setTurnstileToken} resetKey={turnstileResetKey} />

								<Button className="w-full" type="submit" disabled={loading}>
									{loading ? '处理中...' : '登录'}
								</Button>

								{googleLoginEnabled ? (
									<>
										<div className="flex items-center gap-3 text-xs text-muted-foreground">
											<div className="h-px flex-1 bg-border" />
											<span>或</span>
											<div className="h-px flex-1 bg-border" />
										</div>
										<GoogleSignInButton
											clientId={config.google_client_id || ''}
											disabled={loading}
											enabled={googleLoginEnabled}
											onCredential={handleGoogleCredential}
											onError={handleGoogleError}
										/>
									</>
								) : null}
							</form>
						) : (
							<div className="space-y-5">
								<div className="rounded-md border bg-muted/30 p-3 text-sm">
									<div className={qqAvailable ? 'text-emerald-600' : 'text-muted-foreground'}>
										{qqStatusLoading ? '正在检查 QQ bot 状态...' : qqAvailable ? 'QQ bot 在线，可以验证码登录' : `QQ bot 不可用：${qqStatus?.reason || '未连接'}`}
									</div>
									<Button className="mt-3" type="button" variant="outline" size="sm" onClick={loadQqStatus} disabled={qqStatusLoading}>
										刷新状态
									</Button>
								</div>

								<TurnstileWidget enabled={turnstileActive} siteKey={siteKey} onToken={setTurnstileToken} resetKey={turnstileResetKey} />

								<div className="space-y-3 rounded-md border p-4">
									<Button className="w-full" type="button" disabled={loading || !qqAvailable} onClick={requestQqCode}>
										{loading ? '处理中...' : '获取 QQ 验证码'}
									</Button>
									{qqCode ? (
										<div className="space-y-2 text-center">
											<div className="font-mono text-3xl font-semibold tracking-normal">{qqCode}</div>
											<div className="text-sm text-muted-foreground">{qqPollText || '等待 QQ 私聊验证...'}</div>
											<Button type="button" variant="outline" size="sm" onClick={() => copyCodeAndOpenQq(qqCode)}>
												复制并跳转到 QQ
											</Button>
										</div>
									) : null}
								</div>

								<form className="space-y-4 rounded-md border p-4" onSubmit={handleQqPasswordLogin}>
									<div className="space-y-2">
										<Label htmlFor="qq-number">QQ 号</Label>
										<Input id="qq-number" type="text" inputMode="numeric" autoComplete="username" value={qqNumber} onChange={(e) => setQqNumber(e.target.value)} required />
									</div>
									<div className="space-y-2">
										<Label htmlFor="qq-password">密码</Label>
										<Input id="qq-password" type="password" autoComplete="current-password" value={qqPassword} onChange={(e) => setQqPassword(e.target.value)} required />
									</div>
									<div className="space-y-2">
										<Label htmlFor="qq-totp">双重验证码 (若开启)</Label>
										<Input
											id="qq-totp"
											type="text"
											inputMode="numeric"
											maxLength={6}
											placeholder="选填"
											autoComplete="one-time-code"
											value={qqTotpCode}
											onChange={(e) => setQqTotpCode(e.target.value)}
										/>
									</div>
									<Button className="w-full" type="submit" disabled={loading}>
										{loading ? '处理中...' : 'QQ号 + 密码登录'}
									</Button>
								</form>
							</div>
						)}

						<div className="flex justify-between text-sm">
							<a className="text-muted-foreground hover:underline" href="/register">
								没有账号？注册
							</a>
							<a className="text-muted-foreground hover:underline" href="/forgot">
								忘记密码？
							</a>
						</div>
					</CardContent>
				</Card>
			</main>
		</div>
	);
}
