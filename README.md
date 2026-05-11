# OURCAL

**현재 버전: v.0.0.4**

우리캘린더(OURCAL)는 Supabase 인증과 FullCalendar를 사용하는 Next.js 기반 공유 캘린더 앱입니다.

## 버전 관리 규칙

- 소규모 패치: 세 번째 자리 증가 (예: v.0.0.1 → v.0.0.2)
- 대규모 패치: 두 번째 자리 증가 후 세 번째 자리를 1로 초기화 (예: v.0.0.4 → v.0.1.1)
- 버전 변경 시 `README.md`, `OPENCLAW.md`, `package.json`, `package-lock.json`을 함께 갱신합니다.

## 주요 기능

- 카카오 OAuth 로그인
- 닉네임 기반 프로필 설정
- 월간 캘린더 보기
- 날짜별 일정 화면 이동
- 친구 화면 진입점
- 친구 수 제한 정책에 따른 친구 요청 차단

## 기술 스택

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Supabase
- FullCalendar

## 시작하기

의존성을 설치합니다.

```bash
npm install
```

환경 변수를 설정합니다.

```bash
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

개발 서버를 실행합니다.

```bash
npm run dev
```

브라우저에서 <http://localhost:3000>을 열면 앱을 확인할 수 있습니다.

## 스크립트

```bash
npm run dev    # 개발 서버 실행
npm run build  # 프로덕션 빌드
npm run start  # 프로덕션 서버 실행
npm run lint   # ESLint 검사
```

## 프로젝트 구조

```text
app/
  auth/callback/   # 로그인 콜백 처리
  calendar/        # 캘린더 화면
  day/[date]/      # 날짜별 상세 화면
  friends/         # 친구 화면
  login/           # 로그인 화면
  setup-profile/   # 프로필 설정 화면
lib/
  supabase.ts      # Supabase 클라이언트
```
