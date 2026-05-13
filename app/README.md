# OURCAL App

Flutter 기반 OURCAL 모바일 껍데기입니다. 현재는 웹 앱을 WebView로 표시하는 최소 구조만 포함합니다.

## 실행

기본 웹 주소는 `https://ourcal.vercel.app`입니다. 다른 주소를 띄우려면 `OURCAL_WEB_URL`을 dart-define으로 넘깁니다.

```bash
flutter run --dart-define=OURCAL_WEB_URL=http://10.0.2.2:3000
```

- Android 에뮬레이터에서 로컬 PC의 `localhost:3000`을 보려면 `http://10.0.2.2:3000`을 사용합니다.
- 실제 기기에서는 같은 네트워크의 PC IP 주소를 사용해야 합니다.

## APK 빌드

```bash
flutter build apk --release --dart-define=OURCAL_WEB_URL=https://your-web-url.example
```

빌드 결과는 `build/app/outputs/flutter-apk/app-release.apk`에 생성됩니다.

## 이후 확장 예정

- 푸시 알림
- 홈/잠금화면 위젯
- 위치 권한 및 위치 정보 연동
