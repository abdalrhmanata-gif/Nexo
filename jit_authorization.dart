class JitAuthorizationRequest {
  final String decisionId;
  final String organizationId;
  final String missionId;
  final String actionId;
  final int actionVersion;
  final String actionInputHash;
  final String authorityPassportId;
  final String delegationId;
  final String? approvalId;
  final String policySetHash;
  final String authorityClass;
  final String toolId;
  final double estimatedCost;
  final String currency;
  final DateTime requestedAt;
  final DateTime expiresAt;

  const JitAuthorizationRequest({
    required this.decisionId,
    required this.organizationId,
    required this.missionId,
    required this.actionId,
    required this.actionVersion,
    required this.actionInputHash,
    required this.authorityPassportId,
    required this.delegationId,
    required this.approvalId,
    required this.policySetHash,
    required this.authorityClass,
    required this.toolId,
    required this.estimatedCost,
    required this.currency,
    required this.requestedAt,
    required this.expiresAt,
  });
}

enum JitDecision { allow, deny, requireApproval }

class JitAuthorizationDecisionRecord {
  final String decisionId;
  final JitDecision decision;
  final String organizationId;
  final String missionId;
  final String actionId;
  final int actionVersion;
  final String actionInputHash;
  final String authorityPassportId;
  final String delegationId;
  final String? approvalId;
  final String policySetHash;
  final String authorityClass;
  final String toolId;
  final double estimatedCost;
  final String currency;
  final List<String> evaluatedRules;
  final List<String> reasons;
  final DateTime decidedAt;
  final DateTime expiresAt;

  const JitAuthorizationDecisionRecord({
    required this.decisionId,
    required this.decision,
    required this.organizationId,
    required this.missionId,
    required this.actionId,
    required this.actionVersion,
    required this.actionInputHash,
    required this.authorityPassportId,
    required this.delegationId,
    required this.approvalId,
    required this.policySetHash,
    required this.authorityClass,
    required this.toolId,
    required this.estimatedCost,
    required this.currency,
    required this.evaluatedRules,
    required this.reasons,
    required this.decidedAt,
    required this.expiresAt,
  });

  bool isUsableAt(DateTime now) => decision == JitDecision.allow && now.isBefore(expiresAt);
}
