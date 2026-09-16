import '../domain/security_constitution.dart';

class SecurityConstitutionGuard {
  void validateExecution({
    required String organizationId,
    required String missionOrganizationId,
    required bool jitAuthorized,
  }) {
    SecurityConstitution.requireSameTenant(
      organizationId,
      missionOrganizationId,
    );
    SecurityConstitution.requireJitAuthorization(jitAuthorized);
  }

  void validateCommit({required bool verificationPassed}) {
    SecurityConstitution.requireVerifiedBeforeCommit(verificationPassed);
  }

  void validateUnknownRetry({required bool reconciled}) {
    SecurityConstitution.requireReconciliationForUnknown(reconciled);
  }

  void validateDelegation({
    required Set<String> requestedAuthority,
    required Set<String> delegatedAuthority,
  }) {
    SecurityConstitution.requireAuthorityNotExpanded(
      requested: requestedAuthority,
      delegated: delegatedAuthority,
    );
  }
}
