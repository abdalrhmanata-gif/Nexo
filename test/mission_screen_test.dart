import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexo_followthrough/data/mission_repository.dart';
import 'package:nexo_followthrough/domain/intent.dart';
import 'package:nexo_followthrough/domain/mission.dart';
import 'package:nexo_followthrough/ui/mission_screen.dart';

IntentDraft _draft(String objective) => IntentDraft(
      rawGoal: objective,
      objective: objective,
      constraints: const [],
      successCriteria: const [],
      authorityRequests: const [],
      timeWindow: null,
    );

Future<(DemoMissionRepository, Mission)> _pausedRepository() async {
  final repo = DemoMissionRepository();
  final mission = await repo.createMission(_draft('ui state test'));
  await repo.approveAuthority(mission.id);
  await repo.startMission(mission.id);
  final paused = await repo.pauseMission(mission.id);
  return (repo, paused);
}

void main() {
  testWidgets('paused mission shows Resume and not Start', (tester) async {
    final (repo, mission) = await _pausedRepository();
    await tester.pumpWidget(MaterialApp(
      home: MissionScreen(repository: repo, missionId: mission.id),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Resume Mission'), findsOneWidget);
    expect(find.text('Start Mission'), findsNothing);
  });
}
