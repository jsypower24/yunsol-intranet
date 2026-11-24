// 계좌·카드 정보 암호화. 기존 서버와 같은 Fernet 형식이라 기존 키와 암호문을 그대로 사용할 수 있습니다.
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { ApiError } from './rules';

function b64url(buffer: Buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
}
function fromB64url(text: string) {
  return Buffer.from(text.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

export function generateKey() {
  return b64url(randomBytes(32));
}

function keyParts(key: string) {
  const raw = fromB64url(key.trim());
  if (raw.length !== 32) throw new ApiError(500, '암호화 키 형식이 올바르지 않습니다.');
  return { signing: raw.subarray(0, 16), encryption: raw.subarray(16) };
}

export function encrypt(key: string, plain: Buffer, now = Date.now()) {
  const { signing, encryption } = keyParts(key);
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-128-cbc', encryption, iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  const time = Buffer.alloc(8);
  time.writeBigUInt64BE(BigInt(Math.floor(now / 1000)));
  const payload = Buffer.concat([Buffer.from([0x80]), time, iv, body]);
  const mac = createHmac('sha256', signing).update(payload).digest();
  return Buffer.from(b64url(Buffer.concat([payload, mac])));
}

export function decrypt(key: string, token: Buffer | string) {
  const { signing, encryption } = keyParts(key);
  const data = fromB64url(token.toString());
  if (data.length < 57 || data[0] !== 0x80) throw new ApiError(500, '암호화된 정보를 읽을 수 없습니다.');
  const payload = data.subarray(0, data.length - 32);
  const mac = data.subarray(data.length - 32);
  const expected = createHmac('sha256', signing).update(payload).digest();
  if (!timingSafeEqual(mac, expected)) throw new ApiError(500, '암호화 키가 일치하지 않습니다.');
  const iv = payload.subarray(9, 25);
  const decipher = createDecipheriv('aes-128-cbc', encryption, iv);
  return Buffer.concat([decipher.update(payload.subarray(25)), decipher.final()]);
}

export function paymentKey() {
  const key = process.env.YUNSOL_PAYMENT_KEY;
  if (!key) throw new ApiError(500, '서버에 계좌·카드 암호화 키(YUNSOL_PAYMENT_KEY)가 설정되지 않았습니다.');
  return key;
}
