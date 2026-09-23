import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env';
import { getSetting } from '../settings/settings';

export interface GoogleProfile {
  email: string;
  email_verified: boolean;
  name: string;
  sub: string;
}

async function clientId(): Promise<string> {
  return getSetting('google.client_id', env.GOOGLE_CLIENT_ID ?? '');
}

export async function isGoogleConfigured(): Promise<boolean> {
  return !!(await clientId());
}

export async function googleClientId(): Promise<string | null> {
  const id = await clientId();
  return id || null;
}

/** Verifikasi Google ID token (dari Google Identity Services di FE) → profil. */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  const aud = await clientId();
  if (!aud) throw new Error('Google sign-in is not configured');
  const client = new OAuth2Client(aud);
  const ticket = await client.verifyIdToken({ idToken, audience: aud });
  const payload = ticket.getPayload();
  if (!payload?.email) throw new Error('The Google token is not valid');
  return {
    email: payload.email,
    email_verified: !!payload.email_verified,
    name: payload.name ?? payload.email.split('@')[0],
    sub: payload.sub,
  };
}
