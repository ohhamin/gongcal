import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'fcm_bridge.dart';

const String defaultWebUrl = String.fromEnvironment(
  'OURCAL_WEB_URL',
  defaultValue: 'https://gongcal.vercel.app',
);

void main() {
  runApp(const OurCalApp());
}

class OurCalApp extends StatelessWidget {
  const OurCalApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'OURCAL',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.black),
        scaffoldBackgroundColor: Colors.white,
        useMaterial3: true,
      ),
      home: const OurCalWebShell(),
    );
  }
}

class OurCalWebShell extends StatefulWidget {
  const OurCalWebShell({super.key});

  @override
  State<OurCalWebShell> createState() => _OurCalWebShellState();
}

class _OurCalWebShellState extends State<OurCalWebShell> {
  late final WebViewController _controller;
  late final FcmBridge _fcmBridge;
  var _progress = 0;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();

    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.white)
      ..setNavigationDelegate(
        NavigationDelegate(
          onProgress: (progress) => setState(() => _progress = progress),
          onPageStarted: (_) => setState(() => _errorMessage = null),
          onPageFinished: (_) => _fcmBridge.injectTokenIntoWebView(),
          onNavigationRequest: _handleNavigationRequest,
          onWebResourceError: (error) {
            setState(() {
              _errorMessage = '웹 화면을 불러오지 못했습니다. (${error.errorCode})';
            });
          },
        ),
      );

    _fcmBridge = FcmBridge(_controller);
    _fcmBridge.initialize();
    _controller.loadRequest(Uri.parse(defaultWebUrl));
  }

  Future<NavigationDecision> _handleNavigationRequest(
    NavigationRequest request,
  ) async {
    final uri = Uri.tryParse(request.url);
    final scheme = uri?.scheme.toLowerCase();

    if (uri == null || scheme == null) {
      return NavigationDecision.prevent;
    }

    if (scheme == 'http' || scheme == 'https' || scheme == 'about') {
      return NavigationDecision.navigate;
    }

    try {
      final launched = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!launched && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('외부 로그인 앱을 열 수 없습니다.')),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('외부 로그인 앱을 열 수 없습니다.')),
        );
      }
    }

    return NavigationDecision.prevent;
  }

  Future<bool> _handleBack() async {
    if (await _controller.canGoBack()) {
      await _controller.goBack();
      return false;
    }
    return true;
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        final shouldClose = await _handleBack();
        if (shouldClose && context.mounted) Navigator.of(context).maybePop();
      },
      child: Scaffold(
        body: SafeArea(
          child: Stack(
            children: [
              WebViewWidget(controller: _controller),
              if (_progress < 100)
                LinearProgressIndicator(
                  value: _progress / 100,
                  minHeight: 2,
                  color: Colors.black,
                  backgroundColor: Colors.black12,
                ),
              if (_errorMessage != null)
                Positioned.fill(
                  child: ColoredBox(
                    color: Colors.white,
                    child: Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              _errorMessage!,
                              textAlign: TextAlign.center,
                              style: const TextStyle(fontSize: 14),
                            ),
                            const SizedBox(height: 12),
                            FilledButton(
                              onPressed: () => _controller.reload(),
                              child: const Text('다시 시도'),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
