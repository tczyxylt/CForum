import * as React from 'react';

type GoogleCredentialResponse = {
	credential?: string;
	select_by?: string;
};

type GoogleButtonConfig = {
	theme?: 'outline' | 'filled_blue' | 'filled_black';
	size?: 'large' | 'medium' | 'small';
	type?: 'standard' | 'icon';
	shape?: 'rectangular' | 'pill' | 'circle' | 'square';
	text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
	width?: number;
};

declare global {
	interface Window {
		google?: {
			accounts: {
				id: {
					initialize(options: {
						client_id: string;
						callback: (response: GoogleCredentialResponse) => void;
						ux_mode?: 'popup' | 'redirect';
					}): void;
					renderButton(parent: HTMLElement, options: GoogleButtonConfig): void;
				};
			};
		};
	}
}

let googleScriptPromise: Promise<void> | null = null;

function loadGoogleIdentityScript() {
	if (window.google?.accounts?.id) return Promise.resolve();
	if (googleScriptPromise) return googleScriptPromise;

	googleScriptPromise = new Promise<void>((resolve, reject) => {
		const existing = document.getElementById('google-identity-services') as HTMLScriptElement | null;
		if (existing) {
			existing.addEventListener('load', () => resolve(), { once: true });
			existing.addEventListener('error', () => reject(new Error('无法加载 Google 登录脚本')), { once: true });
			return;
		}

		const script = document.createElement('script');
		script.id = 'google-identity-services';
		script.src = 'https://accounts.google.com/gsi/client';
		script.async = true;
		script.defer = true;
		script.onload = () => resolve();
		script.onerror = () => reject(new Error('无法加载 Google 登录脚本'));
		document.head.appendChild(script);
	});

	return googleScriptPromise;
}

type GoogleSignInButtonProps = {
	clientId: string;
	disabled?: boolean;
	enabled: boolean;
	onCredential: (credential: string) => void;
	onError: (message: string) => void;
};

export function GoogleSignInButton({ clientId, disabled, enabled, onCredential, onError }: GoogleSignInButtonProps) {
	const buttonRef = React.useRef<HTMLDivElement>(null);

	React.useEffect(() => {
		if (!enabled || !clientId) return;
		let cancelled = false;

		loadGoogleIdentityScript()
			.then(() => {
				if (cancelled || !buttonRef.current || !window.google?.accounts?.id) return;
				buttonRef.current.innerHTML = '';
				window.google.accounts.id.initialize({
					client_id: clientId,
					callback: (response) => {
						if (response.credential) {
							onCredential(response.credential);
							return;
						}
						onError('Google 登录没有返回凭据');
					},
					ux_mode: 'popup',
				});
				window.google.accounts.id.renderButton(buttonRef.current, {
					theme: 'outline',
					size: 'large',
					type: 'standard',
					shape: 'rectangular',
					text: 'signin_with',
					width: Math.max(240, Math.min(buttonRef.current.clientWidth || 320, 400)),
				});
			})
			.catch((error: Error) => {
				if (!cancelled) onError(error.message);
			});

		return () => {
			cancelled = true;
			if (buttonRef.current) buttonRef.current.innerHTML = '';
		};
	}, [clientId, enabled, onCredential, onError]);

	if (!enabled || !clientId) return null;

	return (
		<div className={disabled ? 'pointer-events-none opacity-60' : undefined}>
			<div ref={buttonRef} className="flex min-h-10 w-full justify-center" />
		</div>
	);
}
