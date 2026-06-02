# OURCAL App

Flutter 기반 OURCAL 모바일 WebView 앱입니다. Android와 iOS 프로젝트를 포함하고, 웹 앱 기본 주소는 `https://gongcal.vercel.app`입니다.

## 실행

다른 웹 주소를 띄우려면 `OURCAL_WEB_URL`을 dart-define으로 넘깁니다.

```bash
flutter run --dart-define=OURCAL_WEB_URL=http://10.0.2.2:3000
```

- Android 에뮬레이터에서 로컬 PC의 `localhost:3000`을 보려면 `http://10.0.2.2:3000`을 사용합니다.
- iOS Simulator에서는 보통 `http://127.0.0.1:3000` 또는 Mac의 로컬 네트워크 주소를 사용합니다.
- 실제 기기에서는 같은 네트워크의 PC IP 주소를 사용해야 합니다.

## FCM

FCM은 기본 비활성화입니다. 활성화 빌드는 `OURCAL_ENABLE_FCM=true`를 넘깁니다.

```bash
flutter run --dart-define=OURCAL_ENABLE_FCM=true
```

필수 설정 파일:

```text
android/app/google-services.json
ios/Runner/GoogleService-Info.plist
```

두 파일은 환경별 설정 파일이므로 git에 커밋하지 않습니다.

## Android APK 빌드

```bash
flutter build apk --release --dart-define=OURCAL_ENABLE_FCM=true --build-name=<package-version>
```

빌드 결과는 `build/app/outputs/flutter-apk/app-release.apk`에 생성됩니다.

## iOS 빌드

```bash
flutter build ios --release --dart-define=OURCAL_ENABLE_FCM=true
```

iOS 배포 전 Hamin이 해야 할 일:

1. Firebase iOS 앱 등록: Bundle ID `com.example.ourcalApp` 기준
2. `ios/Runner/GoogleService-Info.plist` 추가
3. Apple Developer Push Notifications capability 활성화
4. APNs Auth Key를 Firebase Cloud Messaging에 등록
5. Xcode Runner target의 Signing Team 설정
6. 실제 배포 Bundle ID로 바꿀 경우 Firebase/Supabase/OAuth 설정도 동일하게 갱신
