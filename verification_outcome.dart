/// v1.4 Verification & Outcome Protocol.
/// Verification is independent from provider/tool claims and must bind to the
/// exact execution, input revision and mission success criteria.
enum VerificationStatus { pending, passed, failed, inconclusive }
enum OutcomeStatus { pending, committed, rejected }
enum OutcomeType { success, partial, failure, unknown }

class VerificationContract {
  final String verificationId;
  final String organizationId;
  final String missionId;
  final String actionId;
  final String executionRunId;
  final String executionInputHash;
  final String criteriaHash;
  final List<String> evidenceIds;
  final DateTime createdAt;

  const VerificationContract({
    required this.verificationId,
    required this.organizationId,
    required this.missionId,
    required this.actionId,
    required this.executionRunId,
    required this.executionInputHash,
    required this.criteriaHash,
    required this.evidenceIds,
    required this.createdAt,
  });
}

class VerificationResult {
  final VerificationContract contract;
  final VerificationStatus status;
  final double confidence;
  final String rationale;
  final DateTime resolvedAt;

  const VerificationResult({
    required this.contract,
    required this.status,
    required this.confidence,
    required this.rationale,
    required this.resolvedAt,
  });

  bool get passed => status == VerificationStatus.passed;
}

class OutcomeCommitRequest {
  final String organizationId;
  final String missionId;
  final String goalId;
  final String executionRunId;
  final String verificationId;
  final OutcomeType type;
  final OutcomeStatus status;
  final Map<String, dynamic> result;
  final double successScore;
  final bool verified;
  final DateTime completedAt;

  const OutcomeCommitRequest({
    required this.organizationId,
    required this.missionId,
    required this.goalId,
    required this.executionRunId,
    required this.verificationId,
    required this.type,
    required this.status,
    required this.result,
    required this.successScore,
    required this.verified,
    required this.completedAt,
  });
}

class OutcomeCommitResult {
  final OutcomeCommitRequest request;
  final String outcomeId;
  final bool committed;

  const OutcomeCommitResult({
    required this.request,
    required this.outcomeId,
    required this.committed,
  });
}

class VerificationOutcomeViolation implements Exception {
  final String code;
  const VerificationOutcomeViolation(this.code);
  @override
  String toString() => code;
}

class VerificationOutcomeProtocol {
  const VerificationOutcomeProtocol();

  void validateVerification(VerificationResult result, {DateTime? now}) {
    final c = result.contract;
    if (c.organizationId.isEmpty || c.missionId.isEmpty || c.actionId.isEmpty || c.executionRunId.isEmpty) {
      throw const VerificationOutcomeViolation('MISSING_VERIFICATION_IDENTITY');
    }
    if (c.executionInputHash.isEmpty || c.criteriaHash.isEmpty) {
      throw const VerificationOutcomeViolation('MISSING_VERIFICATION_BINDING');
    }
    if (c.evidenceIds.isEmpty) {
      throw const VerificationOutcomeViolation('VERIFICATION_REQUIRES_EVIDENCE');
    }
    if (result.confidence < 0 || result.confidence > 1) {
      throw const VerificationOutcomeViolation('INVALID_VERIFICATION_CONFIDENCE');
    }
    if (result.status == VerificationStatus.passed && result.rationale.trim().isEmpty) {
      throw const VerificationOutcomeViolation('PASSED_VERIFICATION_REQUIRES_RATIONALE');
    }
    final t = now ?? DateTime.now().toUtc();
    if (result.resolvedAt.isAfter(t)) {
      throw const VerificationOutcomeViolation('VERIFICATION_TIMESTAMP_IN_FUTURE');
    }
  }

  void validateOutcome(OutcomeCommitRequest request, VerificationResult verification) {
    if (request.organizationId != verification.contract.organizationId ||
        request.missionId != verification.contract.missionId ||
        request.executionRunId != verification.contract.executionRunId ||
        request.verificationId != verification.contract.verificationId) {
      throw const VerificationOutcomeViolation('OUTCOME_VERIFICATION_BINDING_MISMATCH');
    }
    if (!request.verified || request.status != OutcomeStatus.committed) {
      throw const VerificationOutcomeViolation('OUTCOME_NOT_VERIFIED_FOR_COMMIT');
    }
    if (!verification.passed) {
      throw const VerificationOutcomeViolation('OUTCOME_REQUIRES_PASSED_VERIFICATION');
    }
    if (request.successScore < 0 || request.successScore > 1) {
      throw const VerificationOutcomeViolation('INVALID_OUTCOME_SCORE');
    }
    if (request.type == OutcomeType.success && request.successScore < 1) {
      throw const VerificationOutcomeViolation('FULL_SUCCESS_REQUIRES_FULL_SCORE');
    }
    if (request.type == OutcomeType.unknown) {
      throw const VerificationOutcomeViolation('UNKNOWN_OUTCOME_CANNOT_BE_COMMITTED_AS_VERIFIED');
    }
  }

  OutcomeCommitResult commit(OutcomeCommitRequest request, VerificationResult verification) {
    validateVerification(verification);
    validateOutcome(request, verification);
    return OutcomeCommitResult(
      request: request,
      outcomeId: 'out_${request.executionRunId}_${request.verificationId}',
      committed: true,
    );
  }
}
