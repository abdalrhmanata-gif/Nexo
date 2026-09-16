import '../domain/action_revision.dart';
import '../domain/authorization.dart';
import '../domain/execution_lease.dart';
import '../domain/lease_fence.dart';

/// Orchestrates the final control-plane checks before an external side effect.
/// This class is a deterministic client/demo representation of the server
/// contract. It never replaces server-side authorization.
class MissionControlBoundary {
  final LeaseFence leaseFence;

  const MissionControlBoundary({this.leaseFence = const LeaseFence()});

  AuthorizationResult authorizeImmediatelyBeforeIo({
    required AuthorizationResult policyDecision,
    required ExecutionLease lease,
    required ActionRevision action,
    DateTime? now,
  }) {
    if (policyDecision.decision != AuthorizationDecision.allow) {
      return policyDecision;
    }

    final effectiveNow = now ?? DateTime.now();

    final fence = leaseFence.check(
      lease: lease,
      missionId: action.missionId,
      actionType: action.authorityClass,
      toolId: action.toolId,
      actionRevision: action.version,
      now: effectiveNow,
    );

    if (!fence.allowed) {
      return AuthorizationResult(
        decision: AuthorizationDecision.deny,
        reason: fence.reason,
        evaluatedAt: effectiveNow,
        policyRevision: policyDecision.policyRevision,
      );
    }

    return AuthorizationResult(
      decision: AuthorizationDecision.allow,
      reason: 'JIT authorization and lease fence passed.',
      evaluatedAt: effectiveNow,
      policyRevision: policyDecision.policyRevision,
    );
  }
}
