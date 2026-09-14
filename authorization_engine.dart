import '../domain/authorization.dart';
import '../domain/execution_lease.dart';

/// Deterministic client-side model of the server authorization boundary.
/// It is intentionally not a security boundary. Production authorization
/// must be repeated server-side immediately before external I/O.
class DemoAuthorizationEngine {
  AuthorizationResult evaluate(
    AuthorizationRequest request,
    ExecutionLease? lease,
  ) {
    if (lease == null || !lease.isUsable) {
      return AuthorizationResult(
        decision: AuthorizationDecision.deny,
        reason: 'No active execution lease.',
        evaluatedAt: DateTime.now(),
        policyRevision: 'demo-policy-v1',
      );
    }

    if (!lease.allowedActions.contains(request.authorityClass.name.toUpperCase())) {
      return AuthorizationResult(
        decision: AuthorizationDecision.deny,
        reason: 'Authority class is outside the active lease.',
        evaluatedAt: DateTime.now(),
        policyRevision: 'demo-policy-v1',
      );
    }

    if (request.estimatedCost > lease.spendingRemaining) {
      return AuthorizationResult(
        decision: AuthorizationDecision.deny,
        reason: 'Spending budget exceeded.',
        evaluatedAt: DateTime.now(),
        policyRevision: 'demo-policy-v1',
      );
    }

    if (request.authorityClass == AuthorityClass.write ||
        request.authorityClass == AuthorityClass.execute ||
        request.authorityClass == AuthorityClass.commit) {
      return AuthorizationResult(
        decision: AuthorizationDecision.requireApproval,
        reason: 'High-impact action requires explicit approval.',
        evaluatedAt: DateTime.now(),
        policyRevision: 'demo-policy-v1',
      );
    }

    return AuthorizationResult(
      decision: AuthorizationDecision.allow,
      reason: 'Action is within the active delegated authority.',
      evaluatedAt: DateTime.now(),
      policyRevision: 'demo-policy-v1',
    );
  }
}
