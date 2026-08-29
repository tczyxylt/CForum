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

type RegisterMode = 'email' | 'qq';

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

export function RegisterPage() {
	const { config } = useConfig();
	const [registerMode, setRegisterMode] = React.useState<RegisterMode>('email');
	const [email, setEmail] = React.useState('');
	const [username, setUsername] = React.useState('');
	const [password, setPassword] = React.useState('');
	const [turnstileToken, setTurnstileToken] = React.useState('');
	const [turnstileResetKey, setTurnstileResetKey] = React.useState(0);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState('');
	const [success, setSuccess] = React.useState('');
	const [qqStatus, setQqStatus] = React.useState<QqBotStatus | null>(null);
	const [qqStatusLoading, setQqStatusLoading] = React.useState(false);
	const [qqSessionId, setQqSessionId] = React.useState('');
	const [qqCode, setQqCode] = React.useState('');
	const [qqPollText, setQqPollText] = React.useState('');

	const enabled = !!config?.turnstile_enabled;
	const siteKey = config?.turnstile_site_key || '';
	const turnstileActive = enabled && !!siteKey;
	const googleRegisterEnabled = !!config?.google_login_enabled && !!config.google_client_id;
	const qqAvailable = !!qqStatus?.available;

	const completeGoogleRegister = React.useCallback((data: any) => {
		setUser(data.user);
		setToken(data.token);
		window.location.href = '/';
	}, []);

	const completeQqRegister = React.useCallback((data: any) => {
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
					completeQqRegister(data);
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
	}, [completeQqRegister, qqSessionId]);

	function switchMode(mode: RegisterMode) {
		setRegisterMode(mode);
		setError('');
		setSuccess('');
		if (mode === 'email') {
			setQqSessionId('');
			setQqCode('');
			setQqPollText('');
		}
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError('');
		setSuccess('');
		if (turnstileActive && !turnstileToken) {
			setError('请完成验证码验证');
			return;
		}

		setLoading(true);
		try {
			const res = await fetch('/api/register', {
				method: 'POST',
				headers: getSecurityHeaders('POST'),
				body: JSON.stringify({
					email,
					username,
					password,
					'cf-turnstile-response': turnstileToken
				})
			});
			const data = (await res.json()) as any;
			if (!res.ok) {
				resetTurnstile();
				throw new Error(data?.error || '注册失败');
			}
			setSuccess('注册成功！请前往邮箱完成验证后再登录。');
			setEmail('');
			setUsername('');
			setPassword('');
			resetTurnstile();
		} catch (err: any) {
			setError(String(err?.message || err));
		} finally {
			setLoading(false);
		}
	}

	async function requestQqCode() {
		setError('');
		setSuccess('');
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

	const handleGoogleCredential = React.useCallback(
		async (credential: string) => {
			setError('');
			setSuccess('');
			setLoading(true);
			try {
				const res = await fetch('/api/auth/google', {
					method: 'POST',
					headers: getSecurityHeaders('POST'),
					body: JSON.stringify({ credential }),
				});
				const data = (await res.json()) as any;
				if (!res.ok) {
					if (data?.error === 'TOTP_REQUIRED') {
						throw new Error('此 Gmail 已有账号且开启了 2FA，请前往登录页输入验证码后使用 Google 登录');
					}
					throw new Error(data?.error || 'Google 注册失败');
				}
				completeGoogleRegister(data);
			} catch (err: any) {
				setError(String(err?.message || err));
			} finally {
				setLoading(false);
			}
		},
		[completeGoogleRegister]
	);

	const handleGoogleError = React.useCallback((message: string) => {
		setError(message);
		setSuccess('');
	}, []);

	return (
		<div className="min-h-dvh bg-muted/20">
			<main className="mx-auto flex max-w-5xl justify-center px-4 py-10">
				<Card className="w-full max-w-md">
					<CardHeader>
						<CardTitle>注册</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/30 p-1">
							<Button type="button" variant={registerMode === 'email' ? 'default' : 'ghost'} onClick={() => switchMode('email')}>
								邮箱注册
							</Button>
							<Button type="button" variant={registerMode === 'qq' ? 'default' : 'ghost'} onClick={() => switchMode('qq')}>
								QQ 登录
							</Button>
						</div>

						{error ? <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}
						{success ? <div className="rounded-md border bg-muted/40 p-3 text-sm">{success}</div> : null}

						{registerMode === 'email' ? (
							<form className="space-y-4" onSubmit={handleSubmit}>
								<div className="space-y-2">
									<Label htmlFor="register-username">用户名 (最多 20 字符)</Label>
									<Input
										id="register-username"
										name="username"
										type="text"
										maxLength={20}
										value={username}
										onChange={(e) => setUsername(e.target.value)}
										required
									/>
								</div>

								<div className="space-y-2">
									<Label htmlFor="register-email">邮箱</Label>
									<Input
										id="register-email"
										name="email"
										type="email"
										autoComplete="email"
										value={email}
										onChange={(e) => setEmail(e.target.value)}
										required
									/>
								</div>

								<div className="space-y-2">
									<Label htmlFor="register-password">密码 (8-16 字符)</Label>
									<Input
										id="register-password"
										name="password"
										type="password"
										autoComplete="new-password"
										value={password}
										onChange={(e) => setPassword(e.target.value)}
										required
									/>
								</div>

								<TurnstileWidget enabled={turnstileActive} siteKey={siteKey} onToken={setTurnstileToken} resetKey={turnstileResetKey} />

								<Button className="w-full" type="submit" disabled={loading}>
									{loading ? '处理中...' : '注册'}
								</Button>

								{googleRegisterEnabled ? (
									<>
										<div className="flex items-center gap-3 text-xs text-muted-foreground">
											<div className="h-px flex-1 bg-border" />
											<span>或</span>
											<div className="h-px flex-1 bg-border" />
										</div>
										<GoogleSignInButton
											clientId={config.google_client_id || ''}
											disabled={loading}
											enabled={googleRegisterEnabled}
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
							</div>
						)}

						<div className="text-sm">
							<a className="text-muted-foreground hover:underline" href="/login">
								已有账号？登录
							</a>
						</div>
					</CardContent>
				</Card>
			</main>
		</div>
	);
}
