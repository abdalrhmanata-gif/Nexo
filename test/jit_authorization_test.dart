import 'package:test/test.dart';
import '../lib/application/jit_authorization_engine.dart';
import '../lib/domain/jit_authorization.dart';

void main() {
  final now = DateTime.utc(2026, 9, 7, 10);
  JitAuthorizationRequest req() => JitAuthorizationRequest(
        decisionId: 'd1',
        organizationId: 'o1',
        missionId: 'm1',
        actionId: 'a1',
        actionVersion: 3,
        actionInputHash: 'sha256:x',
        authorityPassportId: 'p1',
        delegationId: 'del1',
        approvalId: 'ap1',
        policySetHash: 'sha256:policy',
        authorityClass: 'WRITE',
        toolId: 'email.send',
        estimatedCost: 1.5,
        currency: 'NOK',
        requestedAt: now,
        expiresAt: now.add(const Duration(seconds: 30)),
      );

  test('allows only when every gate passes', () {
    final d = JitAuthorizationEngine().evaluate(req(),
        delegationActive: true,
        passportActive: true,
        policyAllows: true,
        approvalSatisfied: true,
        leaseActive: true);
    expect(d.decision, JitDecision.allow);
    expect(d.actionVersion, 3);
    expect(d.actionInputHash, 'sha256:x');
  });

  test('policy denial is terminal', () {
    final d = JitAuthorizationEngine().evaluate(req(),
        delegationActive: true,
        passportActive: true,
        policyAllows: false,
        approvalSatisfied: true,
        leaseActive: true);
    expect(d.decision, JitDecision.deny);
  });

  test('missing approval does not become allow', () {
    final d = JitAuthorizationEngine().evaluate(req(),
        delegationActive: true,
        passportActive: true,
        policyAllows: true,
        approvalSatisfied: false,
        leaseActive: true);
    expect(d.decision, JitDecision.requireApproval);
  });

  test('expired decision is unusable', () {
    final r = JitAuthorizationRequest(
      decisionId: 'd2',
      organizationId: 'o1',
      missionId: 'm1',
      actionId: 'a1',
      actionVersion: 1,
      actionInputHash: 'h',
      authorityPassportId: 'p',
      delegationId: 'd',
      approvalId: 'a',
      policySetHash: 'p',
      authorityClass: 'WRITE',
      toolId: 't',
      estimatedCost: 0,
      currency: 'NOK',
      requestedAt: now,
      expiresAt: now.add(const Duration(seconds: 1)),
    );
    final d = JitAuthorizationEngine().evaluate(r,
        delegationActive: true,
        passportActive: true,
        policyAllows: true,
        approvalSatisfied: true,
        leaseActive: true);
    expect(d.isUsableAt(now.add(const Duration(seconds: 2))), isFalse);
  });
}
