# 윤솔 인트라넷

노무법인 내부 업무관리 웹서비스입니다. 코덱스에서 만든 버전(HTML·Python·SQLite)의 화면과 업무 규칙을 그대로 옮기고, 여러 직원이 동시에 쓸 수 있도록 서버와 데이터베이스를 새로 구성했습니다.

- 화면: Next.js(React). 기존 화면의 스타일(`src/app/legacy.css`, `src/app/theme.css`)을 그대로 사용합니다.
- 서버: Next.js API(`/api/*`). 경로와 응답 형식은 기존 서버와 같습니다.
- 데이터베이스: PostgreSQL + Prisma. 마이그레이션은 `prisma/migrations`에 있습니다.

## 코덱스 버전과 달라진 점

| 항목 | 이전 | 지금 |
| --- | --- | --- |
| 저장 방식 | DB 전체를 JSON 한 덩어리로 저장 | 사업장·업무·수수료 등을 행 단위 테이블로 저장 |
| 동시 수정 | 누군가 저장하면 다른 모든 사람의 다음 저장이 거절됨 | 같은 행의 **같은 칸**을 동시에 고칠 때만 충돌 안내. 다른 칸·다른 행은 모두 저장 |
| 수정 기록 | 최종편집일 한 줄 | 최종편집일 + 변경 이력 테이블(누가·언제·어느 칸을·이전 값→새 값) |
| 엑셀 업로드 | 브라우저에서 파일 해석 | 서버에서 해석(ExcelJS). 중복 사업자등록번호 확인 창은 그대로 |
| 로그인 | 동일 | 동일 + 로그인 실패 횟수 제한, 다른 사이트에서 보낸 요청 차단 |
| 테스트 | 없음 | 업무 규칙·호환성·API 자동 테스트(`npm test`) |

비밀번호 해시와 계좌·카드 암호화 형식은 기존 서버와 같아서 기존 데이터를 그대로 옮길 수 있습니다.

## 처음 설치

Node.js 22.13 이상, PostgreSQL 14 이상이 필요합니다.

```sh
npm install
cp .env.example .env        # DATABASE_URL, YUNSOL_PAYMENT_KEY 입력
npm run db:migrate          # 테이블 생성
npm run init-admin -- admin # 마스터 관리자 만들기 (비밀번호는 화면에 표시되지 않게 입력)
npm run build
npm start                   # http://127.0.0.1:3100
```

`YUNSOL_PAYMENT_KEY`는 계좌·카드 정보 암호화 키입니다. 기존 서버를 쓰고 있었다면 그 서버의 `YUNSOL_PAYMENT_KEY` 값(또는 DB 옆 `.payment.key` 파일 내용)을 그대로 넣으세요. 새로 시작한다면 아래 명령으로 만듭니다. 키를 잃어버리면 저장된 계좌·카드 정보를 복구할 수 없으니 따로 안전하게 보관하세요.

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64').replace(/\+/g,'-').replace(/\//g,'_'))"
```

여러 직원이 쓰는 서버에서는 HTTPS 뒤에서 실행하고 `.env`에 `YUNSOL_SECURE_COOKIE="1"`을 넣으세요.

## 기존 데이터 옮기기

새 DB에서 **한 번만** 실행합니다.

코덱스 버전 서버(Python)의 DB를 쓰고 있었다면 (마스터 계정 만들기 전, 빈 DB에서):

```sh
YUNSOL_OLD_PAYMENT_KEY="기존 키" npm run import-legacy -- --sqlite /경로/yunsol.sqlite3
```

사용자·사업장·업무·수수료·연장근무·개인 열 설정·계좌/카드 정보(새 키로 다시 암호화)까지 옮깁니다.

그보다 이전의 HTML(브라우저 저장) 버전 데이터라면, 마스터 계정을 먼저 만든 뒤:

```sh
npm run import-legacy -- --browser /경로/yunsol-legacy.json
```

## 효성CMS 수수료 자료 반영

```sh
npm run cms-import -- 청구목록.xlsx 세금계산서_발급목록.xlsx --month 2026-11
```

같은 월에 다시 실행하면 효성CMS 내역을 교체하고, 계좌이체 내역은 유지합니다. 자동 다운로드와 예약 실행(매월 5·10·15·20·25일·말일 00:00)은 아직 연결하지 않았습니다. 예약일 판단 함수(`isScheduled`)는 `src/server/cms.ts`에 있습니다.

## 개발

```sh
npm run dev        # 개발 서버
npm run typecheck  # 타입 검사
npm test           # 자동 테스트 (DB 테스트는 TEST_DATABASE_URL이 있을 때만 실행)
TEST_DATABASE_URL="postgresql://.../yunsol_test" npm test
```

DB 테스트는 `TEST_DATABASE_URL`의 모든 테이블을 비우므로 운영 DB 주소를 넣지 마세요.

## 폴더 구조

```
prisma/schema.prisma      DB 설계 (테이블마다 수정자·수정일·버전)
src/server/rules.ts       업무 규칙·권한 판단
src/server/change.ts      저장 요청 검증과 반영
src/server/conflicts.ts   동시 수정 충돌 판단
src/server/project.ts     권한별로 내려줄 데이터 고르기
src/server/store.ts       DB ↔ 화면 데이터 변환, 변경분 저장과 이력
src/server/api.ts         REST API
src/client/               화면 (페이지별 파일은 src/client/pages)
scripts/                  관리자 생성, 데이터 이관, CMS 반영 명령
tests/                    자동 테스트
```
