# OURCAL

**현재 버전: v.0.4.60**

우리캘린더(OURCAL)는 Supabase 인증과 FullCalendar를 사용하는 Next.js 기반 공유 캘린더 앱입니다. 개인 일정, 그룹원 일정, 초대받은 일정을 월간 캘린더 중심으로 확인하고 관리합니다.

## 버전 관리 규칙

- 소규모 패치: 세 번째 자리 증가 (예: v.0.0.1 → v.0.0.2)
- 대규모 패치: 두 번째 자리 증가 후 세 번째 자리를 1로 초기화 (예: v.0.1.3 → v.0.2.1)
- 버전 변경 시 `README.md`, `OPENCLAW.md`, `package.json`, `package-lock.json`을 함께 갱신합니다.

## 레포 구조

```text
app/  # Flutter 모바일 껍데기(WebView)
web/  # Next.js OURCAL 웹 앱
```

루트 npm 스크립트는 `web` 실행을 위임합니다.

```bash
npm run web:dev
npm run web:build
npm run web:lint
```

Flutter 앱은 `app/`에서 실행합니다.

```bash
cd app
flutter run --dart-define=OURCAL_WEB_URL=http://10.0.2.2:3000
```

## 주요 기능

### 인증/세션

- 카카오/Google OAuth 로그인
- 닉네임 기반 프로필 설정
- `proxy.ts` 기반 서버 사이드 인증 미들웨어 (세션 쿠키 갱신 + 라우트 보호)
- 같은 기기 자동 로그인을 위한 세션 저장 및 토큰 자동 갱신
- 루트/PWA 진입 시 세션이 있으면 `/calendar`, 없으면 `/login`으로 이동
- 설정 페이지 로그아웃 및 회원 탈퇴
- 설정 페이지 상단에 닉네임과 profiles.id 앞 8자리 초대코드를 표시하고, 📋 버튼으로 클립보드 복사

### 월간 캘린더

- 월간 캘린더를 기본 일정 확인 화면으로 사용
- 선택한 대표 그룹 기준으로 본인/그룹원/초대 일정을 월간 캘린더에 표시
- OC.zip `screens-core.jsx`의 Splash 디자인 톤을 반영한 앱 첫 진입/캘린더 로딩 화면 및 FullCalendar mount 기반 무한로딩 방지
- 바깥 라운드/그림자 껍데기를 줄여 모바일 화면 공간 효율화
- 월간 캘린더 높이를 기존 대비 1/6 늘리고, 6주 행을 동일 높이로 고정 표시
- 월간 캘린더에서 토요일/일요일과 `public/holiday.xml`의 공휴일 날짜 숫자를 빨간색으로 표시
- Android 홈 화면 월간 캘린더 위젯은 앱 월간 캘린더 스냅샷을 받아 공휴일명, 일정, `+N` 더보기를 함께 표시하고, OC.zip 월간 그리드처럼 보더/오늘 날짜 박스/rounded 이벤트 pill과 내 일정/타인 일정/초대 대기/숨김 일정 색상 체계를 반영
- 공휴일은 `locdate` 기준 날짜 숫자 왼쪽에 `dateName`을 작은 빨간 글씨로 표시
- 일정 입력 폼의 세부일정은 한 줄 입력창으로 표시하고, 참석자 목록은 15vh 내부 스크롤로 처리
- 일정 상세 화면에 읽기 전용 참석자 명단을 표시하고, 참석자 목록은 15vh, 댓글 목록은 20vh 내부 스크롤로 처리
- 하루 최대 3개 이벤트 노출, 초과 시 `+N` 더보기 표시
- 월간 이벤트 요소는 제목 한 줄로 표시하되, 타인의 공개 일정은 제목 옆에 소유자 닉네임을 함께 표시
- 월간 캘린더 상단은 FullCalendar 기본 헤더 대신 `< 2026. 5 >` 형태의 커스텀 월 이동 버튼과 그룹보기/알림/그룹선택/멤버 컨트롤로 구성
- 월간 캘린더는 앱 화면에서 좌우 공백 없이 네모 칸 형태로 표시하고, 요일은 `일 월 화 수 목 금 토` 한글 표기로 표시
- 날짜/이벤트 클릭 시 해당 날짜의 일정 목록 팝업 표시
- 일정 목록 팝업은 65vh 고정 높이이며 리스트 영역만 스크롤
- 일정 목록 팝업에서 내 일정은 오른쪽 삭제 버튼으로 바로 삭제할 수 있고, 내 일정/타인의 공개 일정은 오른쪽에 댓글 수를 `📝N` 형태로 표시
- 그룹 선택 드롭다운 아래의 마스터토글(👤/👥)과 멤버 드롭다운 토글로 월간 캘린더 표시 대상을 휘발성으로 필터링하며, 그룹 변경 시 멤버토글은 전체 ON으로 초기화하고, 마스터토글 스위치 클릭 시 반대 상태 이동과 멤버토글 전체 ON 초기화를 한 동작으로 처리
- 팝업 dim 영역 클릭 시 팝업 닫기
- 하단 오른쪽 플로팅 `+` 버튼으로 날짜까지 수정 가능한 일정 추가
- 롱프레스 드래그로 날짜 범위 선택 후 긴일정 생성
- 드래그 선택 중 선택 범위를 하늘색으로 표시하고, 드래그 종료 후 선택 잔상 제거

### 친구/그룹 관리

- 하단 네비게이션의 친구/그룹 탭을 👥 단일 탭으로 통합하고, 페이지 상단 토글로 친구/그룹 화면을 전환합니다.
- 친구 추가는 닉네임 검색 대신 profiles.id 앞 8자리 초대코드로 정확히 일치하는 사용자를 검색합니다.
- 친구 추가 팝업은 검색 결과가 최대 1명인 초대코드 방식에 맞춰 기존 대비 약 2/3 높이로 줄였습니다.

### 일정 표시 우선순위

- 이틀 이상 이어지는 일정은 DB에서는 하나의 일정으로 유지하고, 월간 캘린더에서는 날짜별 한 칸 일정으로 펼쳐 표시
- 예: 12~14일 일정은 12일/13일/14일 각각 한 칸씩 표시하며, 어느 날짜의 일정을 눌러도 같은 원본 일정 상세/삭제로 연결
- 월간 캘린더와 리스트 정렬 우선순위:
  1. 하루 종일 일정
  2. 미수락 초대받은 일정
  3. 내 일정 + 타인 일정 + 초대받은 일정(시작 시간 오름차순, 같다면 내 일정 우선 후 일정 제목 오름차순)
- 초대받은 일정은 `events_invite.profile_id`가 현재 프로필 ID인 row를 기준으로 찾고, `event_id`가 참조하는 `events.id`의 일정 정보를 표시
- 초대 일정/그룹 밖 소유자처럼 현재 그룹원 목록에 없는 일정 주인도 프로필을 추가 조회해 닉네임 표시
- 같은 일정이 여러 경로로 조회될 때는 내 일정, 초대받은 일정, 타인 일정 순으로 표시 관계를 정해 하나만 표시

### 일정 작성/수정/상세

- 일정 제목 최대 50자, 세부내용 최대 500자 제한
- 시작/종료 날짜 및 30분 단위 커스텀 시간 드롭다운
- 시작 시간은 `오전 10:00`, 종료 시간은 `오후 1:00 (3시간)` 형식 표시
- 하루 종일 체크 시 `is_allday=true`, 시간은 00:00~24:00 저장
- 하루 종일 해제 시 이전 시작/종료 시간 복원
- 기본 숨김 정책: 새 일정은 `is_hidden=true`
- `상세 일정 함께 보기` 체크 시 타인에게 상세 일정 공개, 도움말 툴팁으로 숨김 표시 정책 안내
- 숨김 일정은 타인에게 제목/상세 대신 `🔒닉네임`으로 표시
- 일정 목록 팝업에서 개별 일정 클릭 시 상세/댓글 팝업 표시
- 본인 일정만 상세 팝업에서 수정/삭제 가능
- 일정 겹침 차단 없음

### 일정 초대/참석자

- 일정 생성/수정 팝업에서 `events_invite` 기준 참석자 닉네임, 현재 상태(초대중/참석예정), 초대취소 버튼 표시
- 일정 소유자는 참석자에 항상 포함
- 친구 찾기 팝업에서 accepted 친구만 검색 가능
- 친구 검색 결과 클릭 시 DB 저장 없이 참석자 리스트에 임시 추가
- 이미 참석자로 추가된 사용자는 `이미 추가된 사용자에요` 알림
- 일정 저장 시 `save_event_with_invites` RPC로 `events`와 `events_invite`를 단일 트랜잭션 저장
- `events_invite` 구조: `event_id`, `profile_id`, `is_agree`
- 초대받은 일정은 별도 `events` row를 만들지 않고 `events_invite` row만 저장
- 참석자 리스트에서 `is_agree=false`는 `초대중`, `true`는 `참석예정`으로 표시
- 일정 소유자는 초대 참석자 삭제 가능
- 초대받은 일정 상세에서 참석하기/참석거절/참석취소 가능
- 참석하기: 확인 후 `events_invite.is_agree=true`
- 참석거절/참석취소: 확인 후 현재 사용자에 대한 `events_invite` row 삭제

### 색상 정책

- 내 일정: 파랑
- 타인 일정: 초록
- 초대받은 미수락 일정: 주황
- 초대받고 수락한 일정: 파랑
- 타인이 초대받았지만 미수락한 일정: 내 캘린더에서 숨김
- 숨김 타인 일정은 월간/일간 화면 모두 `🔒닉네임`으로 표시하고 기본 색상에 약 60% opacity 적용

### 친구/그룹

- 친구 100명 제한 정책
- 닉네임 검색 기반 친구 요청
- 친구 추가 팝업 70vh 고정 높이 및 검색 결과 영역 스크롤
- 그룹 생성/초대/수락/탈퇴/삭제/위임/추방 관리
- 대표 그룹 선택 및 대표 그룹 기준 그룹원 일정 조회

### 댓글

- 일정별 댓글 작성/수정/삭제
- 댓글 작성일 오름차순 목록
- 댓글 최대 100자 제한

### 알림

- 월간 캘린더 상단 🔔 버튼으로 알림 페이지 이동
- 읽지 않은 알림이 있으면 🔔 버튼 왼쪽 위에 빨간 점 표시
- Flutter 앱에서 FCM 토큰을 발급받아 WebView에 전달하고, 로그인된 프로필의 `push_tokens` 테이블에 등록하는 기본 흐름 추가
- 친구 요청, 일정 초대, 그룹 초대 알림 생성 시 대상 프로필의 활성 FCM 토큰으로 푸시 발송
- 현재 푸시 클릭 진입점은 모두 `/notifications`로 통일
- 페이지 이동 시마다 알림 unread 상태를 DB에서 다시 조회해 읽음 상태를 동기화
- 알림 페이지에서는 상단 🔔 버튼 숨김
- 알림 페이지 진입 시 내 알림 목록을 조회하고 읽지 않은 알림을 읽음 처리
- 일정 초대와 친구 요청 시 `notifications` 테이블에 알림 생성

### 네비게이션/페이지

- OC.zip Heroicons 기반 하단 네비게이션으로 캘린더/친구관리/그룹관리/설정 이동
- 네비게이션/캘린더 높이는 vh 기준으로 기기별 비율을 맞춥니다. 하단 네비는 이전 높이의 3/5 비율, 상단 보정은 5vh 기준입니다.
- 모든 버튼 클릭은 0.5초 debounce로 중복 실행을 방지합니다.
- Day 페이지(`web/app/day/[date]`)는 직접 URL 접근 호환용으로 유지
- 기본 일정 확인/추가/상세 흐름은 월간 캘린더에서 처리

## Supabase RPC

참석자 초대 저장은 `events`와 `events_invite`를 한 번에 저장해야 하므로 DB 트랜잭션 RPC가 필요합니다. 또한 일정 수정 화면 참석자 조회와 월간 초대 일정 조회는 RLS 영향을 줄이기 위해 조회 RPC를 사용합니다.

Supabase SQL Editor에서 아래 파일을 실행하세요.

```text
web/supabase/create_notifications.sql
web/supabase/create_push_tokens.sql
web/supabase/save_event_with_invites.sql
web/supabase/get_event_invite_attendees.sql
web/supabase/get_my_invited_events.sql
web/supabase/respond_event_invite.sql
```

## 기술 스택

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Supabase
- Supabase SSR
- TanStack Query
- FullCalendar
- Flutter
- Firebase Cloud Messaging
- webview_flutter
- url_launcher

## 시작하기

웹 의존성을 설치합니다.

```bash
npm --prefix web install
```

환경 변수를 설정합니다.

```bash
cp web/.env.example web/.env.local
```

`web/.env.local`에 실제 Supabase 값을 입력합니다.

```bash
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

로컬 로그인 확인을 위해 Supabase Dashboard의 Auth > URL Configuration > Redirect URLs에 아래 주소를 추가합니다.

```text
http://localhost:3000/auth/callback
```

개발 서버를 실행합니다.

```bash
npm run web:dev
```

브라우저에서 <http://localhost:3000>을 열면 앱을 확인할 수 있습니다. `next.config.ts`에서 `localhost:3000`과 `127.0.0.1:3000`을 개발 허용 origin으로 명시합니다.


## Android APK 빌드

`dev` 브랜치에 push되면 GitHub Actions가 Flutter APK를 빌드하고 artifact로 업로드합니다. 수동 빌드는 GitHub Actions의 `Build Flutter APK` 워크플로에서 `workflow_dispatch`로 실행할 수 있습니다.

카카오 OAuth 로그인이 APK에서도 동작하도록 WebView에서 `http/https` 외부 스킴을 감지하면 Android 외부 앱으로 넘깁니다. 카카오톡 앱 연동을 위해 Android manifest에는 `kakaokompassauth`, `kakaolink` 조회 스킴을 추가했습니다.

릴리즈 APK는 고정된 keystore로 서명해야 Kakao Developers의 Android 키 해시가 안정적으로 유지됩니다. GitHub repo secrets에 아래 값을 등록하세요.

```text
ANDROID_KEYSTORE_BASE64      # upload-keystore.jks를 base64 인코딩한 값
ANDROID_KEYSTORE_PASSWORD
ANDROID_KEY_ALIAS
ANDROID_KEY_PASSWORD
```

keystore 생성 예시:

```bash
keytool -genkey -v -keystore upload-keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
base64 -w 0 upload-keystore.jks
```

GitHub Actions에서 나온 release APK의 서명 키 해시를 Kakao Developers > 내 애플리케이션 > 플랫폼 > Android에 등록해야 카카오 로그인이 정상 동작합니다.

## FCM 푸시 알림 설정

Flutter 앱은 `--dart-define=OURCAL_ENABLE_FCM=true`로 실행/빌드할 때 FCM 초기화를 시도합니다. Firebase 앱 등록 전까지는 기존 빌드가 깨지지 않도록 기본값은 비활성화입니다.

Firebase Console의 `ourcal` 프로젝트에서 앱을 등록한 뒤 아래 파일을 각 위치에 넣으세요. 이 파일들은 로컬/CI 비밀 설정으로 취급하며 git에는 커밋하지 않습니다.

```text
app/android/app/google-services.json
app/ios/Runner/GoogleService-Info.plist  # iOS 프로젝트 생성 후 사용
```

현재 Android 패키지명은 `app/android/app/build.gradle.kts`의 `applicationId` 기준 `com.example.ourcal_app`입니다. iOS Bundle ID는 `app/ios/Runner.xcodeproj/project.pbxproj`의 `PRODUCT_BUNDLE_IDENTIFIER` 기준 `com.example.ourcalApp`입니다.

iOS FCM을 활성화하려면 Hamin이 아래 작업을 해야 합니다.

1. Firebase Console에서 iOS 앱을 `com.example.ourcalApp` Bundle ID로 추가합니다.
2. 내려받은 `GoogleService-Info.plist`를 `app/ios/Runner/GoogleService-Info.plist`에 넣습니다. 이 파일은 git에 커밋하지 않습니다.
3. Apple Developer에서 Push Notifications capability와 APNs Auth Key를 준비합니다.
4. Firebase Console > Project settings > Cloud Messaging에 APNs Auth Key를 등록합니다.
5. Xcode에서 Runner target의 Signing Team을 선택하고, 필요하면 Bundle ID를 실제 배포 ID로 변경합니다. 변경 시 Firebase iOS 앱 Bundle ID도 동일해야 합니다.
6. Supabase Auth > URL Configuration에 웹 콜백 URL `https://gongcal.vercel.app/auth/callback`이 허용되어 있는지 확인합니다.
7. Kakao Developers/Google OAuth 설정에는 웹 도메인 콜백과 iOS Bundle ID 정책을 함께 확인합니다.

Supabase SQL Editor에서 `web/supabase/create_push_tokens.sql`을 실행하면 모바일 FCM 토큰 저장용 `push_tokens` 테이블과 RLS 정책이 생성됩니다. 그룹 초대 알림을 위해 `web/supabase/create_notifications.sql`도 다시 실행해 `group_request` type 제약조건을 반영하세요.

Vercel에는 FCM 발송 API가 사용할 서버 환경변수를 등록해야 합니다.

```text
SUPABASE_SERVICE_ROLE_KEY
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
```

GitHub Actions APK 빌드는 `OURCAL_ENABLE_FCM=true`로 release APK를 생성합니다. Firebase Android 설정 파일을 repo에 두지 않을 경우 `GOOGLE_SERVICES_JSON_BASE64` secret에 `google-services.json`을 base64 인코딩해서 등록하세요.

FCM 활성화 APK 빌드 예시:

```bash
cd app
flutter build apk --release --dart-define=OURCAL_ENABLE_FCM=true
```

## 스크립트

```bash
npm run web:dev        # 웹 개발 서버 실행
npm run web:build      # 웹 프로덕션 빌드
npm run web:lint       # 웹 ESLint 검사
npm run app:build:apk  # Flutter Android APK 빌드
```

## 프로젝트 구조

```text
app/
  lib/main.dart     # Flutter WebView shell
  android/          # Android 프로젝트
  ios/              # iOS 프로젝트
web/app/
  auth/callback/   # 로그인 콜백 처리
  calendar/        # 월간 캘린더와 일정/초대/댓글 흐름
  day/[date]/      # 날짜별 직접 접근 호환 화면
  friends/         # 친구 화면
  groups/          # 그룹관리 화면
  login/           # 로그인 화면
  setup-profile/   # 프로필 설정 화면
  settings/        # 설정 화면
web/lib/
  friendships.ts   # 친구 정책 유틸
  groups.ts        # 그룹 정책 유틸
  supabase.ts      # Supabase 클라이언트
web/supabase/
  save_event_with_invites.sql # 일정+초대 저장 RPC
  get_event_invite_attendees.sql # 일정 참석자 조회 RPC
  get_my_invited_events.sql # 월간 내 초대 일정 조회 RPC
  respond_event_invite.sql # 초대 참석/거절/참석취소 RPC
```
