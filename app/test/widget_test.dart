import 'package:flutter_test/flutter_test.dart';

import 'package:ourcal_app/main.dart';

void main() {
  test('default web url is configured', () {
    expect(defaultWebUrl, isNotEmpty);
  });
}
