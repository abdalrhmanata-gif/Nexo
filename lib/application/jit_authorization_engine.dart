import '../domain/jit_authorization.dart';

class JitAuthorizationEngine {
  JitAuthorizationDecisionRecord evaluate(
    JitAuthorizationRequest r, {
    required bool delegationActive,
    required bool passportActive,
    required bool policyAllows,
    required bool approvalSatisfied,
    required bool leaseActive,
  }) {
    final reasons = <String>[];
    final rules = <String>[];
    JitDecision decision;

    if (!delegationActive) {
      decision = JitDecision.deny;
      reasons.add('DELEGATION_INACTIVE');
      rules.add('delegation.active');
    } else if (!passportActive) {
      decision = JitDecision.deny;
      reasons.add('AUTHORITY_PASSPORT_INACTIVE');
      rules.add('passport.active');
    } else if (!leaseActive) {
      decision = JitDecision.deny;
      reasons.add('EXECUTION_LEASE_INACTIVE');
      rules.add('lease.active');
    } else if (!policyAllows) {
      decision = JitDecision.deny;
      reasons.add('POLICY_DENIED');
      rules.add('policy.decision');
    } else if (!approvalSatisfied) {
      decision = JitDecision.requireApproval;
      reasons.add('APPROVAL_REQUIRED');
      rules.add('approval.required');
    } else {
      decision = JitDecision.allow;
      reasons.add('ALL_AUTHORIZATION_GATES_PASSED');
      rules.addAll([
        'delegation.active',
        'passport.active',
        'lease.active',
        'policy.allow',
        'approval.satisfied'
      ]);
    }

    return JitAuthorizationDecisionRecord(
      decisionId: r.decisionId,
      decision: decision,
      organizationId: r.organizationId,
      missionId: r.missionId,
      actionId: r.actionId,
      actionVersion: r.actionVersion,
      actionInputHash: r.actionInputHash,
      authorityPassportId: r.authorityPassportId,
      delegationId: r.delegationId,
      approvalId: r.approvalId,
      policySetHash: r.policySetHash,
      authorityClass: r.authorityClass,
      toolId: r.toolId,
      estimatedCost: r.estimatedCost,
      currency: r.currency,
      evaluatedRules: List.unmodifiable(rules),
      reasons: List.unmodifiable(reasons),
      decidedAt: r.requestedAt,
      expiresAt: r.expiresAt,
    );
  }
}
