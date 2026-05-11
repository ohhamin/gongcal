# OPENCLAW

## v.0.0.6 - 2026-05-11

### 업데이트 내용

- 숨김 일정 DB 컬럼명을 `isHidden`에서 `is_hidden` 기준으로 수정했습니다.
- 일정 생성/수정 payload와 조회 타입, 표시 조건을 모두 `events.is_hidden`에 맞췄습니다.
- README 기준 버전을 `v.0.0.5`에서 소규모 패치 버전 `v.0.0.6`으로 업데이트했습니다.

### 작업 메모

- React state 이름은 컴포넌트 내부 관례에 맞춰 `isHidden`을 유지하고, Supabase와 주고받는 데이터 키만 DB 컬럼명인 `is_hidden`으로 매핑했습니다.

## v.0.0.5 - 2026-05-11

### 업데이트 내용

- 일정 추가/수정 모달에 `친구에게 숨기기` 체크박스를 추가했습니다.
- 체크된 일정은 `events.is_hidden` 값이 `true`로 저장/수정되도록 반영했습니다.
- 숨김 일정은 본인에게 실제 제목으로, 친구에게는 상수 `HIDDEN_EVENT_TITLE`의 `일정 있음` 텍스트로 표시되도록 처리했습니다.
- 숨김 일정의 FullCalendar 이벤트 색상은 80% opacity hex alpha를 적용하도록 분리했습니다.
- README 기준 버전을 `v.0.0.4`에서 소규모 패치 버전 `v.0.0.5`로 업데이트했습니다.

### 작업 메모

- 현재 클라이언트는 친구 일정 조회 시 원본 title도 함께 받아온 뒤 화면 표시만 마스킹합니다. 실제 데이터 비공개까지 필요하면 Supabase RLS/RPC에서 타인 조회 응답의 title을 서버 단에서 마스킹해야 합니다.

## v.0.0.4 - 2026-05-11

### 업데이트 내용

- 전체 lint 실패 원인을 정리하고 `npm run lint`가 통과하도록 수정했습니다.
- `app/day/[date]/page.tsx`의 FullCalendar 핸들러에서 `any` 타입을 제거하고 명시 타입을 적용했습니다.
- 이벤트 클릭/드래그/리사이즈에서 nullable 날짜값을 방어 처리했습니다.
- `fetchVisiblePeople`, `fetchEvents`를 `useCallback`으로 감싸 hook dependency 경고를 해결했습니다.
- auth callback effect에 `router` 의존성을 추가했습니다.
- README 기준 버전을 `v.0.0.3`에서 소규모 패치 버전 `v.0.0.4`로 업데이트했습니다.

### 작업 메모

- lint 실패 원인은 기존 `any` 타입, 미사용 핸들러, hook dependency 누락, nullable event date 미처리였습니다.
- `npm run lint`와 `npx tsc --noEmit` 모두 통과했습니다.

## v.0.0.3 - 2026-05-11

### 업데이트 내용

- 친구 수 계산 로직을 `lib/friendships.ts`의 재사용 함수로 분리했습니다.
- 친구 제한 기준값을 `FRIEND_LIMIT` 상수로 분리해 화면 문구와 검증 로직이 같은 값을 사용하도록 정리했습니다.
- 클로드코드 협업을 위해 친구 수 계산 함수에 정책 의도와 서버 단 보강 필요성을 주석으로 남겼습니다.
- 앱 명칭을 영어 `OURCAL`, 한글 `우리캘린더` 기준으로 정리했습니다.
- README 기준 버전을 `v.0.0.2`에서 소규모 패치 버전 `v.0.0.3`으로 업데이트했습니다.

### 작업 메모

- 레포 이름은 변경하지 않았습니다.
- 클라이언트 친구 수 제한은 UX 가드입니다. 동시 요청/직접 API 호출 방지는 Supabase RPC, DB trigger, constraint 등 서버 단 정책 보강이 필요합니다.

## v.0.0.2 - 2026-05-11

### 업데이트 내용

- README 기준 버전 `v.0.0.1`에서 소규모 패치 버전 `v.0.0.2`로 업데이트했습니다.
- README에 버전 관리 규칙을 추가했습니다.
- README의 주요 기능에 친구 수 제한 정책에 따른 친구 요청 차단 내용을 추가했습니다.

### 작업 메모

- 버전 기준은 README에 명시된 버전을 우선합니다.
- 이후 버전 변경 시 `README.md`, `OPENCLAW.md`, `package.json`, `package-lock.json`을 함께 갱신합니다.
