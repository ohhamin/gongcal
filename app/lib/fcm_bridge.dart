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
  FcmBridge(this._controller);

  final WebViewController _controller;
  String? _token;

  Future<void> initialize() async {
    if (!fcmEnabled) return;

    try {
      await Firebase.initializeApp();
      FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

      final messaging = FirebaseMessaging.instance;
      await messaging.requestPermission(alert: true, badge: true, sound: true);

      _token = await messaging.getToken();
      await injectTokenIntoWebView();

      FirebaseMessaging.instance.onTokenRefresh.listen((token) async {
        _token = token;
        await injectTokenIntoWebView();
      });
    } catch (error) {
      // FCM 설정 파일이 아직 없거나 플랫폼 설정이 미완성이어도 WebView 앱 실행은 막지 않습니다.
      debugPrint('FCM initialization skipped: $error');
    }
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

  String get _platformName {
    if (kIsWeb) return 'web';
    if (Platform.isAndroid) return 'android';
    if (Platform.isIOS) return 'ios';
    return 'unknown';
  }
}
