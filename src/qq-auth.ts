export const QQ_CODE_PREFIX = 'LT';
export const QQ_CODE_TTL_SECONDS = 5 * 60;
export const QQ_PLACEHOLDER_DOMAIN = 'qq.local.invalid';

type PublicUserSource = {
	id: number;
	email: string;
	username: string;
	password?: string | null;
	role?: string | null;
	verified?: number | boolean | null;
	avatar_url?: string | null;
	totp_enabled?: number | boolean | null;
	email_notifications?: number | boolean | null;
	qq_id?: string | null;
	qq_nickname?: string | null;
};

export function isUsablePasswordHash(password: string | undefined | null): boolean {
	return /^[a-f0-9]{64}$/i.test(String(password || ''));
}

export function normalizeQqId(value: unknown): string {
	const qq = String(value || '').trim();
	return /^\d{5,12}$/.test(qq) ? qq : '';
}

export function isQqPlaceholderEmail(email: string | undefined | null): boolean {
	return new RegExp(`^qq_\\d+@${QQ_PLACEHOLDER_DOMAIN.replace('.', '\\.')}$`, 'i').test(String(email || ''));
}

export function makeQqPlaceholderEmail(qqId: string): string {
	return `qq_${qqId}@${QQ_PLACEHOLDER_DOMAIN}`;
}

export function toPublicUser(user: PublicUserSource) {
	return {
		id: user.id,
		email: isQqPlaceholderEmail(user.email) ? '' : user.email,
		username: user.username,
		avatar_url: user.avatar_url,
		role: user.role || 'user',
		totp_enabled: !!user.totp_enabled,
		email_notifications: user.email_notifications === 1 || user.email_notifications === true,
		qq_id: user.qq_id || null,
		qq_nickname: user.qq_nickname || null,
		has_password: isUsablePasswordHash(user.password),
	};
}

export function generateQqCode(): string {
	const random = new Uint32Array(1);
	crypto.getRandomValues(random);
	return `${QQ_CODE_PREFIX}${100000 + (random[0] % 900000)}`;
}

export function normalizeQqCode(value: unknown): string {
	const code = String(value || '').trim().toUpperCase();
	return new RegExp(`^${QQ_CODE_PREFIX}\\d{6}$`).test(code) ? code : '';
}

export function safeQqAvatarUrl(qqId: string, avatarUrl: unknown): string {
	const candidate = String(avatarUrl || '').trim();
	if (candidate.length <= 500 && /^https?:\/\//i.test(candidate)) return candidate;
	return `https://q.qlogo.cn/headimg_dl?dst_uin=${encodeURIComponent(qqId)}&spec=640&img_type=jpg`;
}
