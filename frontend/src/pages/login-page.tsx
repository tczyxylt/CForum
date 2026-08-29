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

export function LoginPage() {
	const { config } = useConfig();
	const [email, setEmail] = React.useState('');
	const [password, setPassword] = React.useState('');
	const [totpCode, setTotpCode] = React.useState('');
	const [turnstileToken, setTurnstileToken] = React.useState('');
	const [turnstileResetKey, setTurnstileResetKey] = React.useState(0);
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState('');
	const totpCodeRef = React.useRef('');

	React.useEffect(() => {
		totpCodeRef.current = totpCode;
	}, [totpCode]);

	const enabled = !!config?.turnstile_enabled;
	const siteKey = config?.turnstile_site_key || '';
	const turnstileActive = enabled && !!siteKey;
	const googleLoginEnabled = !!config?.google_login_enabled && !!config.google_client_id;

	const completeLogin = React.useCallback((data: any) => {
		setUser(data.user);
		setToken(data.token);
		window.location.href = '/';
	}, []);

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
				setTurnstileToken('');
				setTurnstileResetKey((v) => v + 1);
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
					<CardContent>
						<form className="space-y-4" onSubmit={handleSubmit}>
							{error ? <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}

							<div className="space-y-2">
								<Label htmlFor="login-email">邮箱</Label>
								<Input
									id="login-email"
									name="email"
									type="email"
									autoComplete="username"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									required
								/>
							</div>

							<div className="space-y-2">
								<Label htmlFor="login-password">密码</Label>
								<Input
									id="login-password"
									name="password"
									type="password"
									autoComplete="current-password"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									required
								/>
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

							<div className="flex justify-between text-sm">
								<a className="text-muted-foreground hover:underline" href="/register">
									没有账号？注册
								</a>
								<a className="text-muted-foreground hover:underline" href="/forgot">
									忘记密码？
								</a>
							</div>
						</form>
					</CardContent>
				</Card>
			</main>
		</div>
	);
}
