// 기존 Python 서버와 같은 형식인지 확인합니다(기존 비밀번호·계좌 암호문을 그대로 이관하기 위해).
import { describe, expect, it } from 'vitest';
import { decrypt, encrypt, generateKey } from '../src/server/fernet';
import { passwordHash, verifyPassword } from '../src/server/password';

describe('기존 서버 호환', () => {
  it('Python scrypt 해시를 그대로 검증한다', () => {
    const stored = '00112233445566778899aabbccddeeff:99c0d233e438dbc76df7294979b0f2562ac21c91c2e4fc5ffdd8ae662a44392c868a86b5189912adbaa73ceea144f0e8e758d00a908891514492cd34b4e1f1a8';
    expect(verifyPassword('pass1234', stored)).toBe(true);
    expect(verifyPassword('wrong', stored)).toBe(false);
    expect(passwordHash('pass1234', '00112233445566778899aabbccddeeff')).toBe(stored);
  });
  it('Python cryptography의 Fernet 암호문을 푼다', () => {
    const key = 'nJ2X7h8k0tJ6vYf3Zc9q1wRr5sT4uV7xY0aB2cD3eF4=';
    const token = 'gAAAAABrBPviJ-G_dhEr0gdkPnaRDyW2HDGnadJIq9JMrlLLgFUsFAijg4Usb7LfSUfB0Za2FXOhFP_zL0O_fpkl6CtzcwQDNpIqWrxz4LFv-IlGWr2KSnw=';
    expect(decrypt(key, token).toString('utf8')).toBe('{"bank":"국민"}');
  });
  it('암호화 후 다시 풀 수 있고, 다른 키로는 풀 수 없다', () => {
    const key = generateKey();
    const token = encrypt(key, Buffer.from('계좌'));
    expect(decrypt(key, token).toString()).toBe('계좌');
    expect(() => decrypt(generateKey(), token)).toThrow();
  });
});
