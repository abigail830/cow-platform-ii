import jwt, { type SignOptions } from 'jsonwebtoken';

const ATTACHMENT_TOKEN_TYP = 'attachment';

export type AttachmentAccessClaims = {
  typ: typeof ATTACHMENT_TOKEN_TYP;
  agentName: string;
  instanceId: string;
  attachmentId: string;
};

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is required');
  return secret;
}

function attachmentTokenExpiresIn(): SignOptions['expiresIn'] {
  return (process.env.ATTACHMENT_TOKEN_EXPIRES_IN?.trim() || process.env.JWT_EXPIRES_IN?.trim() || '7d') as SignOptions['expiresIn'];
}

export function signAttachmentAccessToken(claims: Omit<AttachmentAccessClaims, 'typ'>): string {
  return jwt.sign({ typ: ATTACHMENT_TOKEN_TYP, ...claims }, jwtSecret(), {
    expiresIn: attachmentTokenExpiresIn(),
  });
}

export function verifyAttachmentAccessToken(
  token: string,
  expected: Omit<AttachmentAccessClaims, 'typ'>,
): boolean {
  try {
    const payload = jwt.verify(token, jwtSecret()) as Partial<AttachmentAccessClaims>;
    return (
      payload.typ === ATTACHMENT_TOKEN_TYP &&
      payload.agentName === expected.agentName &&
      payload.instanceId === expected.instanceId &&
      payload.attachmentId === expected.attachmentId
    );
  } catch {
    return false;
  }
}
