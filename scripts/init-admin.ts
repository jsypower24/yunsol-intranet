// 사용법: npm run init-admin -- <아이디>
// 새 DB에 마스터 관리자 계정을 만듭니다. 비밀번호는 화면에 표시되지 않게 입력합니다.
import { prisma } from '../src/server/db';
import { passwordHash } from '../src/server/password';
import { MENUS } from '../src/server/rules';
import { loadState, lockWrites, persistDiff } from '../src/server/store';
import { askHidden } from './prompt';

async function main() {
  const username = process.argv[2];
  if (!username) throw new Error('사용법: npm run init-admin -- <아이디>');
  const password = process.env.YUNSOL_ADMIN_PASSWORD || await askHidden('새 관리자 비밀번호: ');
  if (password.length < 8) throw new Error('비밀번호는 8자 이상으로 입력해주세요.');
  await prisma.$transaction(async tx => {
    await lockWrites(tx);
    const before = await loadState(tx);
    if (before.users.some(u => u.admin)) throw new Error('마스터 계정이 이미 있습니다.');
    const after = structuredClone(before);
    after.users.push({
      id: 'u0', name: '마스터 관리자', username, secret: passwordHash(password), admin: true, approved: true, active: true,
      permissions: [...MENUS], color: '#3b82f6', edited: '',
    });
    await persistDiff(tx, before, after, { id: null, name: '시스템' });
  });
  console.log(`마스터 관리자 ${username} 계정을 만들었습니다.`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
