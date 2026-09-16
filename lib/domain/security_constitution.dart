enum SecurityInvariant {
  noAuthorityExpansion,
  noCrossTenantExecution,
  noExecutionWithoutJitAuthorization,
  noCommitWithoutVerification,
  noRetryUnknownWithoutReconciliation,
  noAgentOwnedAuthority,
  noProviderOwnedMissionState,
  noClientOwnedSecurityBoundary,
  noSilentMissionMutation,
  noBudgetResurrectionAfterRecovery,
}

class SecurityViolation implements Exception {
  final SecurityInvariant invariant;
  final String detail;
  const SecurityViolation(this.invariant, this.detail);

  @override
  String toString() => 'SecurityViolation($invariant): $detail';
}

class SecurityConstitution {
  static void require(
    SecurityInvariant invariant,
    bool condition, {
    String detail = '',
  }) {
    if (!condition) throw SecurityViolation(invariant, detail);
  }

  static void requireSameTenant(String a, String b) {
    require(
      SecurityInvariant.noCrossTenantExecution,
      a == b,
      detail: 'organization mismatch',
    );
  }

  static void requireJitAuthorization(bool authorized) {
    require(
      SecurityInvariant.noExecutionWithoutJitAuthorization,
      authorized,
      detail: 'JIT authorization required',
    );
  }

  static void requireVerifiedBeforeCommit(bool verified) {
    require(
      SecurityInvariant.noCommitWithoutVerification,
      verified,
      detail: 'verification required',
    );
  }

  static void requireReconciliationForUnknown(bool reconciled) {
    require(
      SecurityInvariant.noRetryUnknownWithoutReconciliation,
      reconciled,
      detail: 'UNKNOWN external outcome requires reconciliation',
    );
  }

  static void requireAuthorityNotExpanded({
    required Set<String> requested,
    required Set<String> delegated,
  }) {
    require(
      SecurityInvariant.noAuthorityExpansion,
      requested.difference(delegated).isEmpty,
      detail: 'requested authority exceeds delegated authority',
    );
  }
}
