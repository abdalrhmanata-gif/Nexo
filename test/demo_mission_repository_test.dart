import 'package:flutter_test/flutter_test.dart';
import 'package:nexo_followthrough/data/mission_repository.dart';
import 'package:nexo_followthrough/domain/intent.dart';
import 'package:nexo_followthrough/domain/mission_ledger.dart';
import 'package:nexo_followthrough/domain/mission.dart';
import 'package:nexo_followthrough/domain/execution_lease.dart';

IntentDraft draft(String objective) => IntentDraft(
      rawGoal: objective,
      objective: objective,
      constraints: const [],
      successCriteria: const [],
      authorityRequests: const [],
      timeWindow: null,
    );

void main() {
  group('DemoMissionRepository safety boundaries', () {
    test('creates isolated missions and resets ledger/lease state', () async {
      final repo = DemoMissionRepository();
      final first = await repo.createMission(draft('first'));
      await repo.approveAuthority(first.id);
      await repo.startMission(first.id);
      expect((await repo.getLedger(first.id)).length, 4);

      final second = await repo.createMission(draft('second'));
      expect(second.id, isNot(first.id));
      expect(await repo.getExecutionLease(second.id), isNull);
      final ledger = await repo.getLedger(second.id);
      expect(ledger.length, 2);
      expect(ledger.every((entry) => entry.missionId == second.id), isTrue);
    });

    test('requires authority before starting', () async {
      final repo = DemoMissionRepository();
      final mission = await repo.createMission(draft('bounded task'));
      expect(() => repo.startMission(mission.id), throwsStateError);
    });

    test('pause and resume are explicit state transitions', () async {
      final repo = DemoMissionRepository();
      final mission = await repo.createMission(draft('pause test'));
      await repo.approveAuthority(mission.id);
      await repo.startMission(mission.id);
      expect(
          (await repo.pauseMission(mission.id)).status, MissionStatus.paused);
      expect(
          (await repo.resumeMission(mission.id)).status, MissionStatus.running);
      final types =
          (await repo.getLedger(mission.id)).map((e) => e.type).toList();
      expect(types.where((type) => type.name == 'missionPaused').length, 1);
      expect(types.where((type) => type.name == 'missionResumed').length, 1);
    });

    test('revoking lease removes active authority and pauses mission',
        () async {
      final repo = DemoMissionRepository();
      final mission = await repo.createMission(draft('revoke test'));
      await repo.approveAuthority(mission.id);
      final running = await repo.startMission(mission.id);
      expect(running.actions.any((a) => a.status == ActionStatus.authorized),
          isTrue);

      final revoked = await repo.revokeLease(mission.id);
      expect(revoked.status, MissionStatus.paused);
      expect(revoked.leaseId, isNull);
      expect(await repo.getExecutionLease(mission.id), isNotNull);
      expect(revoked.actions.every((a) => a.status != ActionStatus.authorized),
          isTrue);
      expect(() => repo.resumeMission(mission.id), throwsStateError);
    });

    test('revocation requires explicit re-authorization before a new start',
        () async {
      final repo = DemoMissionRepository();
      final mission = await repo.createMission(draft('reauthorize test'));
      await repo.approveAuthority(mission.id);
      await repo.startMission(mission.id);
      await repo.revokeLease(mission.id);
      expect(() => repo.startMission(mission.id), throwsStateError);
      final reapproved = await repo.approveAuthority(mission.id);
      expect(reapproved.authorityApproved, isTrue);
      expect(reapproved.status, MissionStatus.ready);
      final restarted = await repo.startMission(mission.id);
      expect(restarted.status, MissionStatus.running);
    });

    test('cannot start a mission twice without an explicit resume transition',
        () async {
      final repo = DemoMissionRepository();
      final mission = await repo.createMission(draft('double start'));
      await repo.approveAuthority(mission.id);
      await repo.startMission(mission.id);
      expect(() => repo.startMission(mission.id), throwsStateError);
    });

    test('rejects resume while already running', () async {
      final repo = DemoMissionRepository();
      final mission = await repo.createMission(draft('invalid resume'));
      await repo.approveAuthority(mission.id);
      await repo.startMission(mission.id);
      expect(() => repo.resumeMission(mission.id), throwsStateError);
    });

    test('continues authorized actions and waits for approval', () async {
      final repo = DemoMissionRepository();
      final mission = await repo.createMission(draft('continue test'));
      await repo.approveAuthority(mission.id);
      await repo.startMission(mission.id);

      final afterFirst = await repo.continueMission(mission.id);
      expect(afterFirst.actions.first.status, ActionStatus.succeeded);
      expect(afterFirst.actionCount, 1);
      expect(afterFirst.status, MissionStatus.running);

      final afterSecond = await repo.continueMission(mission.id);
      expect(afterSecond.actions[1].status, ActionStatus.succeeded);
      expect(afterSecond.actionCount, 2);
      expect(afterSecond.status, MissionStatus.running);

      final waiting = await repo.continueMission(mission.id);
      expect(waiting.status, MissionStatus.needsUser);
      expect(waiting.actions.last.status, ActionStatus.pending);
      final types = (await repo.getLedger(mission.id))
          .map((entry) => entry.type)
          .toList();
      expect(
          types.where((type) => type == LedgerEventType.actionStarted).length,
          2);
      expect(
          types.where((type) => type == LedgerEventType.actionSucceeded).length,
          2);
      expect(
          types.where((type) => type == LedgerEventType.waitingEntered).length,
          1);
    });

    test('cannot continue a mission that is not running', () async {
      final repo = DemoMissionRepository();
      final mission = await repo.createMission(draft('invalid continue'));
      expect(() => repo.continueMission(mission.id), throwsStateError);
    });

    test('records step progress, outcome notes, and follow-up dates', () async {
      final repo = DemoMissionRepository();
      final mission = await repo.createMission(draft('track progress'));
      final followUp = DateTime(2026, 9, 20);

      final updated = await repo.updateActionProgress(
        mission.id,
        'a1',
        status: ActionStatus.waiting,
        outcomeNote: 'Waiting for the lead to reply.',
        followUpAt: followUp,
      );

      expect(updated.actions.first.status, ActionStatus.waiting);
      expect(
          updated.actions.first.outcomeNote, 'Waiting for the lead to reply.');
      expect(updated.actions.first.followUpAt, followUp);
      expect(updated.currentAction?.id, 'a1');
      expect(updated.progress, 0);
      expect(updated.hasWaitingAction, isTrue);
      expect((await repo.getLedger(mission.id)).last.type,
          LedgerEventType.waitingEntered);
    });

    test('progress identifies the next step after a completed action',
        () async {
      final repo = DemoMissionRepository();
      final mission = await repo.createMission(draft('next step'));

      final updated = await repo.updateActionProgress(
        mission.id,
        'a1',
        status: ActionStatus.succeeded,
        outcomeNote: 'Research complete.',
      );

      expect(updated.completedActionCount, 1);
      expect(updated.progress, closeTo(1 / 3, 0.001));
      expect(updated.currentAction?.id, 'a2');
      expect(updated.hasWaitingAction, isFalse);
    });

    test('does not allow the user to forge execution-owned statuses', () async {
      final repo = DemoMissionRepository();
      final mission = await repo.createMission(draft('protect progress'));

      expect(
        () => repo.updateActionProgress(
          mission.id,
          'a1',
          status: ActionStatus.authorized,
        ),
        throwsStateError,
      );
      expect(
        () => repo.updateActionProgress(
          mission.id,
          'a1',
          status: ActionStatus.committed,
        ),
        throwsStateError,
      );
    });

    test('expires the lease exactly at the boundary and invalidates authority',
        () async {
      var now = DateTime(2026, 9, 14, 18, 0);
      final repo = DemoMissionRepository(clock: () => now);
      final mission = await repo.createMission(draft('exact expiry'));
      await repo.approveAuthority(mission.id);
      final started = await repo.startMission(mission.id);
      now = started.leaseExpiresAt!;
      expect(() => repo.resumeMission(mission.id), throwsStateError);
      final expired = await repo.getMission(mission.id);
      expect(expired.authorityApproved, isFalse);
      expect(expired.leaseId, isNull);
      expect(expired.status, MissionStatus.paused);
      final lease = await repo.getExecutionLease(mission.id);
      expect(lease?.status, ExecutionLeaseStatus.expired);
      expect(
          (await repo.getLedger(mission.id))
              .any((e) => e.type.name == 'leaseExpired'),
          isTrue);
    });

    test('cannot pause a mission that is not running', () async {
      final repo = DemoMissionRepository();
      final mission = await repo.createMission(draft('invalid pause'));
      expect(() => repo.pauseMission(mission.id), throwsStateError);
    });
  });
}
