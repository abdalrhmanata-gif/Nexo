import 'intent.dart';

enum AuthorizationDecision { allow, deny, requireApproval }

class AuthorizationRequest {
  final String missionId;
  final String actionId;
  final String actionRevision;
  final AuthorityClass authorityClass;
  final double estimatedCost;
  final String inputHash;

  const AuthorizationRequest({
    required this.missionId,
    required this.actionId,
    required this.actionRevision,
    required this.authorityClass,
    required this.estimatedCost,
    required this.inputHash,
  });
}

class AuthorizationResult {
  final AuthorizationDecision decision;
  final String reason;
  final DateTime evaluatedAt;
  final String policyRevision;

  const AuthorizationResult({
    required this.decision,
    required this.reason,
    required this.evaluatedAt,
    required this.policyRevision,
  });
}
