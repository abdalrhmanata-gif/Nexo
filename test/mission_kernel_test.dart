import 'package:flutter_test/flutter_test.dart';
import 'package:nexo_followthrough/domain/mission_kernel.dart';
import 'package:nexo_followthrough/domain/mission_runtime.dart';

MissionKernelSnapshot seed() => MissionKernelSnapshot(
      missionId: 'm1',
      organizationId: 'o1',
      version: 0,
      runtimeState: MissionRuntimeState.ready,
      authorityPassportId: 'p1',
      delegationId: 'd1',
      currentActionRevisionBinding: 'a1:1:h1',
      executionLeaseId: 'l1',
      selectedAgentId: 'agent-a',
      selectedProvider: 'provider-a',
      selectedModel: 'model-a',
      remainingActions: 10,
      remainingBudget: 100,
      checkpointId: 'c0',
      lastEventId: null,
      stateDigest: 'digest-0',
      verificationResultId: null,
      updatedAt: DateTime.utc(2026, 1, 1),
    );

void main() {
  test('version fencing rejects stale commands', () {
    final kernel = MissionKernel();
    final s = seed();
    kernel.apply(
        s,
        const MissionKernelCommand(
            commandId: 'c1',
            missionId: 'm1',
            organizationId: 'o1',
            expectedVersion: 0,
            type: MissionKernelCommandType.start,
            actorId: 'u1'));
    expect(
        () => kernel.apply(
            s,
            const MissionKernelCommand(
                commandId: 'c2',
                missionId: 'm1',
                organizationId: 'o1',
                expectedVersion: 0,
                type: MissionKernelCommandType.start,
                actorId: 'u1')),
        throwsA(isA<MissionKernelException>()));
  });

  test('duplicate command is idempotent', () {
    final kernel = MissionKernel();
    final s = seed();
    final a = kernel.apply(
        s,
        const MissionKernelCommand(
            commandId: 'same',
            missionId: 'm1',
            organizationId: 'o1',
            expectedVersion: 0,
            type: MissionKernelCommandType.start,
            actorId: 'u1'));
    final b = kernel.apply(
        s,
        const MissionKernelCommand(
            commandId: 'same',
            missionId: 'm1',
            organizationId: 'o1',
            expectedVersion: 0,
            type: MissionKernelCommandType.start,
            actorId: 'u1'));
    expect(b.event.eventId, a.event.eventId);
    expect(kernel.ledger, hasLength(1));
  });

  test('completion requires verification', () {
    final kernel = MissionKernel();
    final s = seed().copyWith(runtimeState: MissionRuntimeState.verifying);
    expect(
        () => kernel.apply(
            s,
            const MissionKernelCommand(
                commandId: 'complete',
                missionId: 'm1',
                organizationId: 'o1',
                expectedVersion: 0,
                type: MissionKernelCommandType.complete,
                actorId: 'u1')),
        throwsA(isA<MissionKernelException>()));
  });

  test('replan cannot expand budgets', () {
    final kernel = MissionKernel();
    final s = seed();
    expect(
        () => kernel.apply(
            s,
            const MissionKernelCommand(
                commandId: 'replan',
                missionId: 'm1',
                organizationId: 'o1',
                expectedVersion: 0,
                type: MissionKernelCommandType.replan,
                actorId: 'u1',
                remainingActions: 11)),
        throwsA(isA<MissionKernelException>()));
  });

  test('provider switch does not mutate authority', () {
    final kernel = MissionKernel();
    final s = seed();
    final d = kernel.apply(
        s,
        const MissionKernelCommand(
            commandId: 'route',
            missionId: 'm1',
            organizationId: 'o1',
            expectedVersion: 0,
            type: MissionKernelCommandType.selectIntelligence,
            actorId: 'system',
            selectedAgentId: 'agent-b',
            selectedProvider: 'provider-b',
            selectedModel: 'model-b'));
    expect(d.snapshot.authorityPassportId, 'p1');
    expect(d.snapshot.delegationId, 'd1');
    expect(d.snapshot.currentActionRevisionBinding, 'a1:1:h1');
    expect(d.snapshot.remainingActions, 10);
    expect(d.snapshot.remainingBudget, 100);
  });

  test('cross-tenant binding fails closed', () {
    final kernel = MissionKernel();
    expect(
        () => kernel.apply(
            seed(),
            const MissionKernelCommand(
                commandId: 'x',
                missionId: 'm1',
                organizationId: 'other',
                expectedVersion: 0,
                type: MissionKernelCommandType.start,
                actorId: 'u1')),
        throwsA(isA<MissionKernelException>()));
  });
}
