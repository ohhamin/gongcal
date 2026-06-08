import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';

/// Bridges the loaded OURCAL web calendar state into the native Android widget.
///
/// Android AppWidget cannot directly render or inspect the WebView DOM. The web
/// app therefore posts a small monthly calendar snapshot whenever its visible
/// month/events change, and this bridge hands that JSON to native code.
class WidgetBridge {
  WidgetBridge(this._controller);

  static const _channel = MethodChannel('ourcal/widget');
  final WebViewController _controller;

  void attach() {
    _controller.addJavaScriptChannel(
      'OurcalWidgetBridge',
      onMessageReceived: (message) async {
        final payload = message.message.trim();
        if (payload.isEmpty) return;

        try {
          // Validate JSON on the Flutter side so native code only receives a
          // well-formed snapshot string.
          jsonDecode(payload);
          await _channel.invokeMethod<void>(
            'saveMonthlyCalendarSnapshot',
            payload,
          );
        } catch (error) {
          debugPrint('Widget snapshot bridge skipped: $error');
        }
      },
    );
  }
}
