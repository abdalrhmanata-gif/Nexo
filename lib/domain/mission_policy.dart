/// v1.5 Governance contract. Policy decides whether an already-identified
/// action may proceed; it never creates or expands authority.
enum PolicyEffect { allow, deny, requireApproval }

enum PolicyConditionType {
  authorityClass,
  risk,
  cost,
  tool,
  action,
  timeWindow
}

class PolicyRule {
  final String id;
  final int priority;
  final PolicyEffect effect;
  final Set<String> authorityClasses;
  final Set<String> riskLevels;
  final Set<String> toolIds;
  final Set<String> actionIds;
  final double? maxCost;
  final DateTime? startsAt;
  final DateTime? expiresAt;

  const PolicyRule({
    required this.id,
    required this.priority,
    required this.effect,
    this.authorityClasses = const {},
    this.riskLevels = const {},
    this.toolIds = const {},
    this.actionIds = const {},
    this.maxCost,
    this.startsAt,
    this.expiresAt,
  });

  bool matches(PolicyEvaluationRequest request, DateTime now) {
    if (authorityClasses.isNotEmpty &&
        !authorityClasses.contains(request.authorityClass)) return false;
    if (riskLevels.isNotEmpty && !riskLevels.contains(request.riskLevel))
      return false;
    if (toolIds.isNotEmpty && !toolIds.contains(request.toolId)) return false;
    if (actionIds.isNotEmpty && !actionIds.contains(request.actionId))
      return false;
    if (maxCost != null && request.estimatedCost > maxCost!) return false;
    if (startsAt != null && now.isBefore(startsAt!)) return false;
    if (expiresAt != null && !now.isBefore(expiresAt!)) return false;
    return true;
  }
}

class PolicyEvaluationRequest {
  final String organizationId;
  final String missionId;
  final String actionId;
  final String actionRevisionBinding;
  final String toolId;
  final String authorityClass;
  final String riskLevel;
  final double estimatedCost;
  final bool approvalPresent;
  final bool delegationActive;
  final bool leaseActive;

  const PolicyEvaluationRequest({
    required this.organizationId,
    required this.missionId,
    required this.actionId,
    required this.actionRevisionBinding,
    required this.toolId,
    required this.authorityClass,
    required this.riskLevel,
    required this.estimatedCost,
    required this.approvalPresent,
    required this.delegationActive,
    required this.leaseActive,
  });
}

class PolicyDecision {
  final PolicyEffect effect;
  final String reason;
  final String policyRevision;
  final String? matchedRuleId;
  final DateTime evaluatedAt;

  const PolicyDecision({
    required this.effect,
    required this.reason,
    required this.policyRevision,
    required this.matchedRuleId,
    required this.evaluatedAt,
  });

  bool get allowed => effect == PolicyEffect.allow;
}

class MissionPolicyEngine {
  final List<PolicyRule> rules;
  final String policyRevision;

  const MissionPolicyEngine(
      {required this.rules, this.policyRevision = 'policy-v1.5'});

  PolicyDecision evaluate(PolicyEvaluationRequest request, {DateTime? now}) {
    final t = now ?? DateTime.now().toUtc();
    if (request.organizationId.isEmpty ||
        request.missionId.isEmpty ||
        request.actionId.isEmpty ||
        request.actionRevisionBinding.isEmpty) {
      return PolicyDecision(
          effect: PolicyEffect.deny,
          reason: 'Missing security identity or action revision.',
          policyRevision: policyRevision,
          matchedRuleId: null,
          evaluatedAt: t);
    }
    if (!request.delegationActive) return _deny('Delegation is inactive.', t);
    if (!request.leaseActive) return _deny('Execution lease is inactive.', t);
    if (request.estimatedCost < 0) return _deny('Negative cost is invalid.', t);

    final matches = rules.where((r) => r.matches(request, t)).toList()
      ..sort((a, b) => b.priority.compareTo(a.priority));
    if (matches.isEmpty)
      return _deny('No matching policy rule; default deny.', t);

    final rule = matches.first;
    if (rule.effect == PolicyEffect.deny)
      return _deny('Denied by policy rule ${rule.id}.', t, rule.id);
    if (rule.effect == PolicyEffect.requireApproval &&
        !request.approvalPresent) {
      return PolicyDecision(
          effect: PolicyEffect.requireApproval,
          reason: 'Approval required by policy rule ${rule.id}.',
          policyRevision: policyRevision,
          matchedRuleId: rule.id,
          evaluatedAt: t);
    }
    return PolicyDecision(
        effect: PolicyEffect.allow,
        reason: 'Allowed by policy rule ${rule.id}.',
        policyRevision: policyRevision,
        matchedRuleId: rule.id,
        evaluatedAt: t);
  }

  PolicyDecision _deny(String reason, DateTime t, [String? rule]) =>
      PolicyDecision(
          effect: PolicyEffect.deny,
          reason: reason,
          policyRevision: policyRevision,
          matchedRuleId: rule,
          evaluatedAt: t);
}
