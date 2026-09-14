import 'package:flutter_test/flutter_test.dart';
import 'package:nexo_followthrough/domain/mission_kernel.dart';
import 'package:nexo_followthrough/domain/mission_recovery.dart';
import 'package:nexo_followthrough/domain/mission_runtime.dart';

MissionKernelSnapshot seed() => MissionKernelSnapshot(
  missionId: 'm1', organizationId: 'o1', version: 0,
  runtimeState: MissionRuntimeState.ready,
  authorityPassportId: 'p1', delegationId: 'd1',
  currentActionRevisionBinding: 'a1:1:h1', executionLeaseId: 'l1',
  selectedAgentId: 'agent-a', selectedProvider: 'provider-a', selectedModel: 'model-a',
  remainingActions: 10, remainingBudget: 100,
  checkpointId: 'c0', lastEventId: null, stateDigest: 'digest-0',
  verificationResultId: null, updatedAt: DateTime.utc(2026, 1, 1),
);

void main() {
  test('UNKNOWN external outcome forces reconciliation', () {
    final r = const MissionRecoveryPlanner().prepare(seed(), externalOutcome: ExternalOutcomeState.sentUnknown);
    expect(r.disposition, RecoveryDisposition.reconcile);
    expect(r.externalOutcome, ExternalOutcomeState.sentUnknown);
  });

  test('recovery preserves authority and budgets', () {
    final r = const MissionRecoveryPlanner().prepare(seed(), externalOutcome: ExternalOutcomeState.notSent);
    expect(r.authorityPassportId, 'p1');
    expect(r.delegationId, 'd1');
    expect(r.remainingActions, 10);
    expect(r.remainingBudget, 100);
  });

  test('terminal mission does not resume after crash', () {
    final s = seed().copyWith(runtimeState: MissionRuntimeState.failed);
    final r = const MissionRecoveryPlanner().prepare(s, externalOutcome: ExternalOutcomeState.confirmedFailure);
    expect(r.disposition, RecoveryDisposition.stop);
  });

  test('ledger replay advances exactly one version', () {
    final kernel = MissionKernel();
    final s = seed();
    final d = kernel.apply(s, const MissionKernelCommand(
      commandId: 'start', missionId: 'm1', organizationId: 'o1', expectedVersion: 0,
      type: MissionKernelCommandType.start, actorId: 'u1'));
    final replayed = kernel.replayEvent(s, d.event);
    expect(replayed.version, 1);
    expect(replayed.runtimeState, d.snapshot.runtimeState);
    expect(replayed.lastEventId, d.event.eventId);
  });

  test('ledger replay rejects version gaps', () {
    final kernel = MissionKernel();
    final s = seed();
    final d = kernel.apply(s, const MissionKernelCommand(
      commandId: 'start', missionId: 'm1', organizationId: 'o1', expectedVersion: 0,
      type: MissionKernelCommandType.start, actorId: 'u1'));
    final bad = MissionKernelEvent(
      eventId: d.event.eventId, commandId: d.event.commandId, missionId: d.event.missionId,
      organizationId: d.event.organizationId, expectedVersion: 0, resultingVersion: 2,
      commandType: d.event.commandType, from: d.event.from, to: d.event.to,
      actorId: d.event.actorId, occurredAt: d.event.occurredAt,
    );
    expect(() => kernel.replayEvent(s, bad), throwsA(isA<MissionKernelException>()));
  });
}
