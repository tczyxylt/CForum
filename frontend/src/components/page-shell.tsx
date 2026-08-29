import * as React from 'react';

import { SiteHeader } from '@/components/site-header';
import { apiFetch, getSecurityHeaders } from '@/lib/api';
import { getToken, getUser, setUser as persistUser, type User } from '@/lib/auth';
import { useConfig } from '@/hooks/use-config';

export function PageShell({
	children
}: {
	children: React.ReactNode;
}) {
	const [user, setCurrentUser] = React.useState<User | null>(() => getUser());
	const { config } = useConfig();
	const [generatedSecret, setGeneratedSecret] = React.useState<string>('');

	React.useEffect(() => {
		if (!getToken()) return;
		let cancelled = false;
		apiFetch<{ user: User }>('/user/me', { headers: getSecurityHeaders('GET') })
			.then((data) => {
				if (cancelled) return;
				persistUser(data.user);
				setCurrentUser(data.user);
			})
			.catch(() => {
				if (!cancelled) setCurrentUser(null);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	// if jwt not configured, generate a base64-secret for display
	React.useEffect(() => {
		if (config && config.jwt_secret_configured === false && !generatedSecret) {
			const arr = new Uint8Array(32);
			crypto.getRandomValues(arr);
			const secret = btoa(String.fromCharCode(...arr));
			setGeneratedSecret(secret);
		}
	}, [config, generatedSecret]);

	return (
		<div className="min-h-dvh">
			<SiteHeader currentUser={user} onLogout={() => setCurrentUser(null)} />
			{/* warning banner if jwt secret missing */}
			{config && config.jwt_secret_configured === false && (
				<div className="bg-yellow-200 text-yellow-800 px-4 py-2 text-sm">
					JWT secret not configured on server! Set a random value (≥32 chars) in Cloudflare Worker secrets named
					<strong> JWT_SECRET</strong>. Suggested value:
					<code className="ml-2 break-all">{generatedSecret}</code>
				</div>
			)}
			<main className="mx-auto w-full max-w-5xl px-4 py-6">{children}</main>
		</div>
	);
}

