/// Pure, database-free delegation attenuation contract.
///
/// This is intentionally additive: it does not replace the existing
/// authorization engine, Authority Passport, JIT gate, or persistence layer.
/// It only proves the monotonic parent -> child delegation invariants.
class DelegationAuthoritySnapshot {
  final Set<String> allowedActions;
  final Set<String> deniedActions;
  final Set<String> scope;
  final Set<String> toolProviderScope;
  final double remainingBudget;
  final DateTime expiresAt;
  final int riskCeiling;
  final int approvalStrength;
  final int evidenceStrength;
  final int remainingDelegationDepth;

  const DelegationAuthoritySnapshot({
    required this.allowedActions,
    required this.deniedActions,
    required this.scope,
    required this.toolProviderScope,
    required this.remainingBudget,
    required this.expiresAt,
    required this.riskCeiling,
    required this.approvalStrength,
    required this.evidenceStrength,
    required this.remainingDelegationDepth,
  });
}

class DelegationAttenuationViolation implements Exception {
  final String code;
  const DelegationAttenuationViolation(this.code);

  @override
  String toString() => code;
}

class DelegationAttenuationValidator {
  const DelegationAttenuationValidator();

  void validate({
    required DelegationAuthoritySnapshot parent,
    required DelegationAuthoritySnapshot child,
  }) {
    _requireSubset(child.scope, parent.scope, 'SCOPE_EXPANSION');
    _requireSubset(
        child.allowedActions, parent.allowedActions, 'ACTION_EXPANSION');
    _requireSubset(parent.deniedActions, child.deniedActions, 'DENY_WEAKENING');
    _requireSubset(child.toolProviderScope, parent.toolProviderScope,
        'TOOL_PROVIDER_EXPANSION');

    if (child.remainingBudget > parent.remainingBudget) {
      throw const DelegationAttenuationViolation('BUDGET_EXPANSION');
    }
    if (child.expiresAt.isAfter(parent.expiresAt)) {
      throw const DelegationAttenuationViolation('EXPIRY_EXTENSION');
    }
    if (child.riskCeiling > parent.riskCeiling) {
      throw const DelegationAttenuationViolation('RISK_EXPANSION');
    }
    if (child.approvalStrength < parent.approvalStrength) {
      throw const DelegationAttenuationViolation('APPROVAL_WEAKENING');
    }
    if (child.evidenceStrength < parent.evidenceStrength) {
      throw const DelegationAttenuationViolation('EVIDENCE_WEAKENING');
    }
    if (child.remainingDelegationDepth >= parent.remainingDelegationDepth) {
      throw const DelegationAttenuationViolation(
          'DELEGATION_DEPTH_NOT_REDUCED');
    }
  }

  void _requireSubset(
    Set<String> child,
    Set<String> parent,
    String code,
  ) {
    if (!child.every(parent.contains)) {
      throw DelegationAttenuationViolation(code);
    }
  }
}
