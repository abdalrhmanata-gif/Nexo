enum ExecutionLeaseStatus { active, expired, revoked }

class ExecutionLease {
  final String id;
  final String missionId;
  final String delegationId;
  final String agentId;
  final Set<String> allowedActions;
  final Set<String> allowedTools;
  final double spendingLimit;
  final double spendingUsed;
  final int actionLimit;
  final int actionsUsed;
  final DateTime issuedAt;
  final DateTime expiresAt;
  final ExecutionLeaseStatus status;
  final DateTime? revokedAt;

  const ExecutionLease({
    required this.id,
    required this.missionId,
    required this.delegationId,
    required this.agentId,
    required this.allowedActions,
    required this.allowedTools,
    required this.spendingLimit,
    required this.spendingUsed,
    required this.actionLimit,
    required this.actionsUsed,
    required this.issuedAt,
    required this.expiresAt,
    required this.status,
    required this.revokedAt,
  });

  bool get isUsable => status == ExecutionLeaseStatus.active && DateTime.now().isBefore(expiresAt);

  double get spendingRemaining => (spendingLimit - spendingUsed).clamp(0, spendingLimit).toDouble();
  int get actionsRemaining => (actionLimit - actionsUsed).clamp(0, actionLimit);
}
