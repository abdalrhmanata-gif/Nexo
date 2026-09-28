import 'package:flutter_test/flutter_test.dart';
import 'package:zavqera_followthrough/data/local_mission_store.dart';
import 'package:zavqera_followthrough/data/mission_repository.dart';
import 'package:zavqera_followthrough/domain/intent.dart';
import 'package:zavqera_followthrough/main.dart';

class _MemoryStore implements LocalMissionStore {
  String? value;

  @override
  Future<void> clear() async => value = null;

  @override
  Future<String?> read() async => value;

  @override
  Future<void> write(String value) async => this.value = value;
}

void main() {
  testWidgets('restored mission opens instead of returning to goal creation',
      (tester) async {
    final store = _MemoryStore();
    final first = DemoMissionRepository(store: store);
    final created = await first.createMission(const IntentDraft(
      rawGoal: 'Renew my passport',
      objective: 'Renew my passport',
      constraints: [],
      successCriteria: [],
      authorityRequests: [],
      timeWindow: null,
    ));

    final restored = DemoMissionRepository(store: store);
    await restored.restore();
    await tester.pumpWidget(ZavqeraApp(repository: restored));
    await tester.pumpAndSettle();

    expect(find.text(created.objective), findsOneWidget);
    expect(find.text('Create a goal'), findsNothing);
  });
}
