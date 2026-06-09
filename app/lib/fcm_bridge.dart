import 'dart:convert';
import 'dart:io' show Platform;

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:webview_flutter/webview_flutter.dart';

const bool fcmEnabled = bool.fromEnvironment('OURCAL_ENABLE_FCM');

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  if (!fcmEnabled) return;
  await Firebase.initializeApp();
}

class FcmBridge {
  FcmBridge(this._controller, this._baseWebUrl);

  final WebViewController _controller;
  final String _baseWebUrl;
  String? _token;
  FirebaseMessaging? _messaging;
  bool _initialized = false;

  Future<void> initialize() async {
    if (!fcmEnabled || _initialized) return;

    try {
      await Firebase.initializeApp();
      FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

      final messaging = FirebaseMessaging.instance;
      _messaging = messaging;
      _initialized = true;

      final settings = await messaging.getNotificationSettings();
      if (_isPermissionGranted(settings.authorizationStatus)) {
        await _registerToken(messaging);
      }

      FirebaseMessaging.instance.onTokenRefresh.listen((token) async {
        _token = token;
        await injectTokenIntoWebView();
      });

      final initialMessage = await messaging.getInitialMessage();
      if (initialMessage != null) {
        await _openNotificationPath(initialMessage);
      }

      FirebaseMessaging.onMessageOpenedApp.listen(_openNotificationPath);
    } catch (error) {
      // FCM 설정 파일이 아직 없거나 플랫폼 설정이 미완성이어도 WebView 앱 실행은 막지 않습니다.
      debugPrint('FCM initialization skipped: $error');
    }
  }

  Future<void> requestPermissionAndRegister() async {
    if (!fcmEnabled) return;

    try {
      if (!_initialized) {
        await initialize();
      }

      final messaging = _messaging ?? FirebaseMessaging.instance;
      _messaging = messaging;

      final settings = await messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );

      if (!_isPermissionGranted(settings.authorizationStatus)) return;
      await _registerToken(messaging);
    } catch (error) {
      debugPrint('FCM permission request skipped: $error');
    }
  }

  Future<void> _registerToken(FirebaseMessaging messaging) async {
    await messaging.setAutoInitEnabled(true);

    if (!kIsWeb && Platform.isIOS) {
      await _waitForApnsToken(messaging);
    }

    _token = await messaging.getToken();
    await injectTokenIntoWebView();
  }

  bool _isPermissionGranted(AuthorizationStatus status) {
    return status == AuthorizationStatus.authorized ||
        status == AuthorizationStatus.provisional;
  }

  Future<void> injectTokenIntoWebView() async {
    final token = _token;
    if (!fcmEnabled || token == null || token.isEmpty) return;

    final payload = jsonEncode({
      'token': token,
      'platform': _platformName,
      'updatedAt': DateTime.now().toUtc().toIso8601String(),
    });

    final script = '''
      window.localStorage.setItem('ourcal:fcm-token', ${jsonEncode(payload)});
      window.dispatchEvent(new CustomEvent('ourcal:fcm-token-updated'));
    ''';

    try {
      await _controller.runJavaScript(script);
    } catch (error) {
      debugPrint('FCM token injection failed: $error');
    }
  }

  Future<void> _waitForApnsToken(FirebaseMessaging messaging) async {
    for (var attempt = 0; attempt < 10; attempt += 1) {
      final token = await messaging.getAPNSToken();
      if (token != null && token.isNotEmpty) return;
      await Future<void>.delayed(const Duration(milliseconds: 300));
    }
  }

  Future<void> _openNotificationPath(RemoteMessage message) async {
    final path = message.data['path'] ?? '/notifications';
    final uri = Uri.parse(_baseWebUrl).resolve(path);

    try {
      await _controller.loadRequest(uri);
    } catch (error) {
      debugPrint('FCM notification navigation failed: $error');
    }
  }

  String get _platformName {
    if (kIsWeb) return 'web';
    if (Platform.isAndroid) return 'android';
    if (Platform.isIOS) return 'ios';
    return 'unknown';
  }
}
