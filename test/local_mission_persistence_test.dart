import 'package:flutter_test/flutter_test.dart';
import 'package:nexo_followthrough/data/local_mission_store.dart';
import 'package:nexo_followthrough/data/mission_repository.dart';
import 'package:nexo_followthrough/domain/intent.dart';
import 'package:nexo_followthrough/domain/mission.dart';

class _MemoryStore implements LocalMissionStore {
  String? value;

  @override
  Future<void> clear() async => value = null;

  @override
  Future<String?> read() async => value;

  @override
  Future<void> write(String value) async => this.value = value;
}

IntentDraft _draft() => const IntentDraft(
      rawGoal: 'follow up with a lead',
      objective: 'Follow up with a lead',
      constraints: [],
      successCriteria: [],
      authorityRequests: [],
      timeWindow: null,
    );

void main() {
  test('mission state survives a fresh repository instance', () async {
    final store = _MemoryStore();
    final first = DemoMissionRepository(store: store);
    final mission = await first.createMission(_draft());
    final followUp = DateTime.utc(2026, 10, 1);
    await first.updateActionProgress(
      mission.id,
      'a1',
      status: ActionStatus.waiting,
      outcomeNote: 'Waiting for a reply.',
      followUpAt: followUp,
    );

    final second = DemoMissionRepository(store: store);
    await second.restore();
    final restored = await second.getMission(mission.id);

    expect(restored.id, mission.id);
    expect(restored.actions.map((action) => action.id).toList(),
        ['a1', 'a2', 'a3']);
    expect(restored.actions.first.status, ActionStatus.waiting);
    expect(restored.actions.first.outcomeNote, 'Waiting for a reply.');
    expect(restored.actions.first.followUpAt, followUp);
    expect((await second.getLedger(mission.id)).length, greaterThan(2));
  });

  test('multiple missions restore independently and preserve order', () async {
    final store = _MemoryStore();
    final first = DemoMissionRepository(store: store);
    final passport = await first.createMission(
        _draft().withSteps(['Find the form', 'Submit the renewal']));
    final business = await first.createMission(
        _draft().withSteps(['Choose a name', 'Register the business']));
    await first.updateActionProgress(passport.id, 'a1',
        status: ActionStatus.waiting,
        followUpAt: DateTime.utc(2026, 11, 1),
        outcomeNote: 'Waiting for the form.');

    final second = DemoMissionRepository(store: store);
    await second.restore();
    final missions = await second.listMissions();

    expect(missions.map((mission) => mission.id).toList(),
        [passport.id, business.id]);
    expect((await second.getMission(passport.id)).actions.first.status,
        ActionStatus.waiting);
    expect((await second.getMission(business.id)).actions.first.status,
        ActionStatus.pending);
    expect((await second.getMission(passport.id)).actions.first.followUpAt,
        DateTime.utc(2026, 11, 1));
  });

  test('custom step ordering and progress survive restore', () async {
    final store = _MemoryStore();
    final first = DemoMissionRepository(store: store);
    final mission = await first.createMission(_draft().withSteps([
      'Choose a date',
      'Complete the form',
      'Submit the request',
      'Save the confirmation',
    ]));
    await first.updateActionProgress(mission.id, 'a1',
        status: ActionStatus.succeeded);
    await first.updateActionProgress(mission.id, 'a2',
        status: ActionStatus.waiting,
        followUpAt: DateTime.utc(2026, 10, 2),
        outcomeNote: 'Waiting for the required document.');

    final second = DemoMissionRepository(store: store);
    await second.restore();
    final restored = await second.getMission(mission.id);

    expect(restored.actions.map((action) => action.title).toList(), [
      'Choose a date',
      'Complete the form',
      'Submit the request',
      'Save the confirmation',
    ]);
    expect(restored.progress, 0.25);
    expect(restored.currentAction?.title, 'Complete the form');
    expect(restored.actions[1].status, ActionStatus.waiting);
    expect(
        restored.actions[1].outcomeNote, 'Waiting for the required document.');
  });

  test('corrupt local data is cleared and fails closed', () async {
    final store = _MemoryStore()..value = '{not-valid-json';
    final repository = DemoMissionRepository(store: store);

    await repository.restore();

    expect(store.value, isNull);
    expect(() => repository.getMission('missing'), throwsStateError);
  });

  test('codec preserves completed progress and outcome ordering', () {
    final codec = const MissionStorageCodec();
    final mission = Mission(
      id: 'm1',
      objective: 'Objective',
      status: MissionStatus.ready,
      maxCost: 100,
      currentCost: 4,
      maxActions: 3,
      actionCount: 1,
      maxRetries: 2,
      nextActionAt: null,
      leaseExpiresAt: null,
      authorityApproved: true,
      leaseId: 'lease-1',
      delegationId: 'delegation-1',
      authoritySummary: 'Bounded',
      actions: [
        const MissionAction(
          id: 'a1',
          title: 'First',
          authorityClass: 'READ',
          status: ActionStatus.succeeded,
          requiresApproval: false,
          requiresVerification: true,
          outcomeNote: 'Done',
        ),
        const MissionAction(
          id: 'a2',
          title: 'Second',
          authorityClass: 'PREPARE',
          status: ActionStatus.pending,
          requiresApproval: false,
          requiresVerification: true,
        ),
      ],
    );

    final restored = codec.decode(codec.encode(mission));
    expect(restored.completedActionCount, 1);
    expect(restored.progress, 0.5);
    expect(restored.actions.map((action) => action.title).toList(),
        ['First', 'Second']);
    expect(restored.actions.first.outcomeNote, 'Done');
  });
}
