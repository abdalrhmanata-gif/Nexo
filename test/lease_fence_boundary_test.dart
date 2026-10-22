import 'package:flutter_test/flutter_test.dart';
import 'package:zavqera_followthrough/domain/execution_lease.dart';
import 'package:zavqera_followthrough/domain/lease_fence.dart';

ExecutionLease testLease({required DateTime expiresAt}) => ExecutionLease(
      id: 'lease-1',
      missionId: 'mission-1',
      delegationId: 'delegation-1',
      agentId: 'agent-1',
      allowedActions: const {'WRITE'},
      allowedTools: const {'mail.send'},
      spendingLimit: 100,
      spendingUsed: 0,
      actionLimit: 5,
      actionsUsed: 0,
      issuedAt: expiresAt.subtract(const Duration(minutes: 1)),
      expiresAt: expiresAt,
      status: ExecutionLeaseStatus.active,
      revokedAt: null,
    );

void main() {
  const fence = LeaseFence();
  final expiry = DateTime(2026, 9, 14, 18, 30);

  test('exact expiry is denied by the final lease fence', () {
    final result = fence.check(
      lease: testLease(expiresAt: expiry),
      missionId: 'mission-1',
      actionType: 'WRITE',
      toolId: 'mail.send',
      actionRevision: 1,
      now: expiry,
    );
    expect(result.allowed, isFalse);
    expect(result.reason, 'LEASE_INACTIVE_OR_EXPIRED');
  });

  test('one instant before expiry is still usable', () {
    final result = fence.check(
      lease: testLease(expiresAt: expiry),
      missionId: 'mission-1',
      actionType: 'WRITE',
      toolId: 'mail.send',
      actionRevision: 1,
      now: expiry.subtract(const Duration(microseconds: 1)),
    );
    expect(result.allowed, isTrue);
    expect(result.reason, 'JIT_FENCE_PASSED');
  });
}
