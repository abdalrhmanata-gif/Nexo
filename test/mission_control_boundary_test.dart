import 'package:flutter_test/flutter_test.dart';
import '../lib/application/mission_control_boundary.dart';
import '../lib/domain/action_revision.dart';
import '../lib/domain/authorization.dart';
import '../lib/domain/execution_lease.dart';

ExecutionLease lease({
  DateTime? expiresAt,
  Set<String>? actions,
  Set<String>? tools,
  int actionsUsed = 0,
}) =>
    ExecutionLease(
      id: 'lease-1',
      missionId: 'mission-1',
      delegationId: 'delegation-1',
      agentId: 'agent-1',
      allowedActions: actions ?? {'WRITE'},
      allowedTools: tools ?? {'mail.send'},
      spendingLimit: 100,
      spendingUsed: 0,
      actionLimit: 5,
      actionsUsed: actionsUsed,
      issuedAt: DateTime.now().subtract(const Duration(minutes: 1)),
      expiresAt: expiresAt ?? DateTime.now().add(const Duration(minutes: 10)),
      status: ExecutionLeaseStatus.active,
      revokedAt: null,
    );

ActionRevision action({int version = 1}) => ActionRevision(
      actionId: 'action-1',
      version: version,
      missionId: 'mission-1',
      authorityClass: 'WRITE',
      toolId: 'mail.send',
      inputHash: 'sha256:demo',
      createdAt: DateTime.now(),
    );

void main() {
  const boundary = MissionControlBoundary();
  final allow = AuthorizationResult(
    decision: AuthorizationDecision.allow,
    reason: 'policy allow',
    evaluatedAt: DateTime.now(),
    policyRevision: 'policy-1',
  );

  test('expired lease fails the final fence', () {
    final result = boundary.authorizeImmediatelyBeforeIo(
      policyDecision: allow,
      lease:
          lease(expiresAt: DateTime.now().subtract(const Duration(seconds: 1))),
      action: action(),
    );
    expect(result.decision, AuthorizationDecision.deny);
    expect(result.reason, 'LEASE_INACTIVE_OR_EXPIRED');
  });

  test('wrong tool cannot cross the lease', () {
    final result = boundary.authorizeImmediatelyBeforeIo(
      policyDecision: allow,
      lease: lease(tools: {'calendar.read'}),
      action: action(),
    );
    expect(result.decision, AuthorizationDecision.deny);
    expect(result.reason, 'TOOL_OUTSIDE_LEASE');
  });

  test('exhausted action budget cannot cross the lease', () {
    final result = boundary.authorizeImmediatelyBeforeIo(
      policyDecision: allow,
      lease: lease(actionsUsed: 5),
      action: action(),
    );
    expect(result.decision, AuthorizationDecision.deny);
    expect(result.reason, 'ACTION_BUDGET_EXHAUSTED');
  });

  test('policy denial remains a hard stop', () {
    final deny = AuthorizationResult(
      decision: AuthorizationDecision.deny,
      reason: 'revoked',
      evaluatedAt: DateTime.now(),
      policyRevision: 'policy-2',
    );
    final result = boundary.authorizeImmediatelyBeforeIo(
      policyDecision: deny,
      lease: lease(),
      action: action(),
    );
    expect(result.decision, AuthorizationDecision.deny);
    expect(result.reason, 'revoked');
  });

  test('mission mismatch is denied before any tool check', () {
    final result = boundary.authorizeImmediatelyBeforeIo(
      policyDecision: allow,
      lease: lease(),
      action: ActionRevision(
        actionId: 'action-1',
        version: 1,
        missionId: 'other-mission',
        authorityClass: 'WRITE',
        toolId: 'mail.send',
        inputHash: 'sha256:demo',
        createdAt: DateTime(2026, 9, 14),
      ),
      now: DateTime(2026, 9, 14, 18),
    );
    expect(result.decision, AuthorizationDecision.deny);
    expect(result.reason, 'MISSION_MISMATCH');
  });

  test('invalid action revision is denied at the final fence', () {
    final result = boundary.authorizeImmediatelyBeforeIo(
      policyDecision: allow,
      lease: lease(),
      action: action(version: 0),
      now: DateTime(2026, 9, 14, 18),
    );
    expect(result.decision, AuthorizationDecision.deny);
    expect(result.reason, 'INVALID_ACTION_REVISION');
  });

  test('exact expiry is denied at the final fence', () {
    final expiry = DateTime(2026, 9, 14, 18, 10);
    final result = boundary.authorizeImmediatelyBeforeIo(
      policyDecision: allow,
      lease: lease(expiresAt: expiry),
      action: action(),
      now: expiry,
    );
    expect(result.decision, AuthorizationDecision.deny);
    expect(result.reason, 'LEASE_INACTIVE_OR_EXPIRED');
  });

  test('fence uses the supplied clock for its decision timestamp', () {
    final evaluationTime = DateTime(2026, 9, 14, 18, 5);
    final result = boundary.authorizeImmediatelyBeforeIo(
      policyDecision: allow,
      lease: lease(expiresAt: evaluationTime.add(const Duration(minutes: 5))),
      action: action(),
      now: evaluationTime,
    );
    expect(result.decision, AuthorizationDecision.allow);
    expect(result.evaluatedAt, evaluationTime);
  });

  test('valid policy + lease passes the final fence', () {
    final result = boundary.authorizeImmediatelyBeforeIo(
      policyDecision: allow,
      lease: lease(),
      action: action(),
    );
    expect(result.decision, AuthorizationDecision.allow);
  });
}
