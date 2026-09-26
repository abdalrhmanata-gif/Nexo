import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:zavqera_followthrough/domain/intent.dart';
import 'package:zavqera_followthrough/ui/intent_builder_screen.dart';

void main() {
  testWidgets('empty Create Mission can be canceled immediately',
      (tester) async {
    var canceled = false;
    await tester.pumpWidget(MaterialApp(
      home: IntentBuilderScreen(
        onApproved: (_) {},
        onCancel: () => canceled = true,
      ),
    ));

    await tester.tap(find.byTooltip('Cancel'));
    await tester.pumpAndSettle();

    expect(canceled, isTrue);
  });

  testWidgets('Android back cancels an empty Create Mission', (tester) async {
    var canceled = false;
    await tester.pumpWidget(MaterialApp(
      home: IntentBuilderScreen(
        onApproved: (_) {},
        onCancel: () => canceled = true,
      ),
    ));

    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();

    expect(canceled, isTrue);
  });

  testWidgets('unsaved changes can be discarded without creating a Mission',
      (tester) async {
    var canceled = false;
    IntentDraft? created;
    await tester.pumpWidget(MaterialApp(
      home: IntentBuilderScreen(
        onApproved: (draft) => created = draft,
        onCancel: () => canceled = true,
      ),
    ));

    await tester.enterText(find.byType(TextField).first, 'Renew my passport');
    await tester.tap(find.byTooltip('Cancel'));
    await tester.pumpAndSettle();
    expect(find.text('Discard this Mission?'), findsOneWidget);

    await tester.tap(find.text('Continue editing'));
    await tester.pumpAndSettle();
    expect(canceled, isFalse);
    expect(find.text('Renew my passport'), findsOneWidget);

    await tester.tap(find.byTooltip('Cancel'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Exit without saving'));
    await tester.pumpAndSettle();

    expect(canceled, isTrue);
    expect(created, isNull);
  });
}
