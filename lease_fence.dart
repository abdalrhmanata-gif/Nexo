import 'execution_lease.dart';

/// Models the just-in-time fence between planning and an external side effect.
/// The fence must be checked again immediately before I/O on the server.
class LeaseFenceResult {
  final bool allowed;
  final String reason;

  const LeaseFenceResult({required this.allowed, required this.reason});
}

class LeaseFence {
  const LeaseFence();

  LeaseFenceResult check({
    required ExecutionLease lease,
    required String missionId,
    required String actionType,
    required String toolId,
    required int actionRevision,
  }) {
    if (lease.missionId != missionId) {
      return const LeaseFenceResult(allowed: false, reason: 'MISSION_MISMATCH');
    }
    if (!lease.isUsable) {
      return const LeaseFenceResult(allowed: false, reason: 'LEASE_INACTIVE_OR_EXPIRED');
    }
    if (!lease.allowedActions.contains(actionType.toUpperCase())) {
      return const LeaseFenceResult(allowed: false, reason: 'ACTION_OUTSIDE_LEASE');
    }
    if (!lease.allowedTools.contains(toolId)) {
      return const LeaseFenceResult(allowed: false, reason: 'TOOL_OUTSIDE_LEASE');
    }
    if (lease.actionsRemaining <= 0) {
      return const LeaseFenceResult(allowed: false, reason: 'ACTION_BUDGET_EXHAUSTED');
    }
    if (actionRevision <= 0) {
      return const LeaseFenceResult(allowed: false, reason: 'INVALID_ACTION_REVISION');
    }
    return const LeaseFenceResult(allowed: true, reason: 'JIT_FENCE_PASSED');
  }
}
