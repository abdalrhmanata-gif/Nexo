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

  testWidgets('running mission shows Continue Mission', (tester) async {
    final repo = DemoMissionRepository();
    final mission = await repo.createMission(_draft('continue ui test'));
    await repo.approveAuthority(mission.id);
    await repo.startMission(mission.id);

    await tester.pumpWidget(MaterialApp(
      home: MissionScreen(repository: repo, missionId: mission.id),
    ));
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.text('Continue Mission'),
      500,
      scrollable: find.byType(Scrollable),
    );
    expect(find.text('Continue Mission'), findsOneWidget);
  });

  testWidgets('mission screen explains the next step and progress',
      (tester) async {
    final repo = DemoMissionRepository();
    final mission = await repo.createMission(_draft('understand next step'));
    await repo.approveAuthority(mission.id);
    await repo.startMission(mission.id);

    await tester.pumpWidget(MaterialApp(
      home: MissionScreen(repository: repo, missionId: mission.id),
    ));
    await tester.pumpAndSettle();

    expect(find.text('What needs attention next?'), findsOneWidget);
    expect(find.text('Research suitable leads'), findsOneWidget);
    expect(find.text('0 of 3 steps completed'), findsOneWidget);
    expect(find.text('This is the next step to work on.'), findsOneWidget);
  });
}
