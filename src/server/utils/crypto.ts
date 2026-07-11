import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;

function getEncryptionSecret() {
  const secret = process.env.ENCRYPTION_KEY?.trim();

  if (!secret || secret.length < 32) {
    throw new Error('ENCRYPTION_KEY must be set to a value of at least 32 characters before encrypted data can be used.');
  }

  return secret;
}

export function encrypt(text: string): string {
  if (!text) return text;
  const iv = crypto.randomBytes(IV_LENGTH);
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = crypto.scryptSync(getEncryptionSecret(), salt, 32);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const tag = cipher.getAuthTag();

  // Format: iv:salt:tag:encryptedData
  return `${iv.toString('hex')}:${salt.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

export function decrypt(encryptedData: string): string {
  const secret = getEncryptionSecret();

  if (!encryptedData || !encryptedData.includes(':')) return encryptedData;

  const parts = encryptedData.split(':');
  if (parts.length !== 4) throw new Error('Invalid encrypted text format');

  const iv = Buffer.from(parts[0], 'hex');
  const salt = Buffer.from(parts[1], 'hex');
  const tag = Buffer.from(parts[2], 'hex');
  const text = parts[3];

  const key = crypto.scryptSync(secret, salt, 32);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(text, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
