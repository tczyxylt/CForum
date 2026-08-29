import { describe, expect, it } from 'vitest';

import {
	isQqPlaceholderEmail,
	isUsablePasswordHash,
	makeQqPlaceholderEmail,
	normalizeQqCode,
	normalizeQqId,
	toPublicUser,
} from './qq-auth';

describe('QQ auth helpers', () => {
	it('normalizes QQ login codes with the LT prefix', () => {
		expect(normalizeQqCode('LT123456')).toBe('LT123456');
		expect(normalizeQqCode('lt123456')).toBe('LT123456');
		expect(normalizeQqCode('123456')).toBe('');
		expect(normalizeQqCode('LT12345')).toBe('');
	});

	it('accepts plausible QQ numbers only', () => {
		expect(normalizeQqId('10000')).toBe('10000');
		expect(normalizeQqId('123456789012')).toBe('123456789012');
		expect(normalizeQqId('1234')).toBe('');
		expect(normalizeQqId('abc12345')).toBe('');
	});

	it('hides generated QQ placeholder emails from public user data', () => {
		const email = makeQqPlaceholderEmail('123456');
		const publicUser = toPublicUser({
			id: 1,
			email,
			username: 'QQUser',
			password: 'oauth:qq:placeholder',
			verified: 1,
			qq_id: '123456',
			qq_nickname: 'QQUser',
			email_notifications: 1,
		});

		expect(isQqPlaceholderEmail(email)).toBe(true);
		expect(publicUser.email).toBe('');
		expect(publicUser.qq_id).toBe('123456');
		expect(publicUser.has_password).toBe(false);
	});

	it('treats only legacy SHA-256 password hashes as usable passwords', () => {
		expect(isUsablePasswordHash('a'.repeat(64))).toBe(true);
		expect(isUsablePasswordHash('oauth:google:abc')).toBe(false);
		expect(isUsablePasswordHash('oauth:qq:abc')).toBe(false);
	});
});
