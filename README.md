# OURCAL

**현재 버전: v.0.3.1**

우리캘린더(OURCAL)는 Supabase 인증과 FullCalendar를 사용하는 Next.js 기반 공유 캘린더 앱입니다.

## 버전 관리 규칙

- 소규모 패치: 세 번째 자리 증가 (예: v.0.0.1 → v.0.0.2)
- 대규모 패치: 두 번째 자리 증가 후 세 번째 자리를 1로 초기화 (예: v.0.1.3 → v.0.2.1)
- 버전 변경 시 `README.md`, `OPENCLAW.md`, `package.json`, `package-lock.json`을 함께 갱신합니다.

## 주요 기능

- 카카오 OAuth 로그인
- 닉네임 기반 프로필 설정
- 월간 캘린더에 일정 표시 (본인 파랑 / 그룹원 초록, 하루 최대 4개 + `+N` 더보기)
- 날짜 클릭 시 일정 목록 팝업 (상단 날짜, 중앙 리스트, 하단 `일정 추가` 버튼)
- 하단 이모지 네비게이션을 통한 캘린더/친구관리/그룹관리/설정 이동
- 친구 100명 제한 정책에 따른 친구 요청 차단
- 닉네임 검색 목록 기반 친구 요청
- 그룹 생성/초대/수락/탈퇴/삭제/위임/추방 관리
- 선택한 대표 그룹 기준 날짜별 그룹원 일정 조회
- Day 페이지 내부 그룹 변경 시 캘린더 재조회
- 캘린더 초기 로딩 화면 표시
- TanStack Query 기반 접속 유저/프로필/수락 그룹 캐싱
- Supabase SSR 기반 세션 쿠키 갱신 middleware
- 같은 기기 자동 로그인 유지를 위한 세션 저장/토큰 자동 갱신
- 설정 페이지 로그아웃 및 회원 탈퇴
- 루트/PWA 진입 시 세션이 있으면 캘린더로 자동 이동
- 친구에게 숨긴 일정은 타인에게 내용 대신 `일정 있음`으로 표시
- 일정 세부내용 입력 및 상세 팝업 보기
- 일정별 댓글 작성/수정/삭제 및 작성일 오름차순 댓글 목록
- 댓글 최대 100자 제한
- 30분 단위 커스텀 시간 드롭다운 (시작 `오전 10:00` / 종료 `오후 1:00 (3시간)` 형식)
- 일정 폼 하루 종일 체크박스 (체크 시 00:00~24:00 고정, 해제 시 이전 시간 복원)

## 기술 스택

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Supabase
- Supabase SSR
- TanStack Query
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
  groups/          # 그룹관리 화면
  login/           # 로그인 화면
  setup-profile/   # 프로필 설정 화면
  settings/        # 설정 화면
lib/
  friendships.ts   # 친구 정책 유틸
  groups.ts        # 그룹 정책 유틸
  supabase.ts      # Supabase 클라이언트
```
