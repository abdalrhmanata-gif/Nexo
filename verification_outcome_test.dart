import 'package:flutter_test/flutter_test.dart';
import 'package:nexo_followthrough/domain/verification_outcome.dart';

VerificationResult passed() => VerificationResult(
  contract: VerificationContract(
    verificationId: 'v1', organizationId: 'org1', missionId: 'm1', actionId: 'a1',
    executionRunId: 'run1', executionInputHash: 'hash', criteriaHash: 'criteria',
    evidenceIds: const ['e1'], createdAt: DateTime.utc(2026, 1, 1),
  ),
  status: VerificationStatus.passed,
  confidence: 1,
  rationale: 'Evidence confirms the success criteria.',
  resolvedAt: DateTime.utc(2026, 1, 1),
);

OutcomeCommitRequest outcome({OutcomeType type = OutcomeType.success, bool verified = true}) => OutcomeCommitRequest(
  organizationId: 'org1', missionId: 'm1', goalId: 'g1', executionRunId: 'run1',
  verificationId: 'v1', type: type, status: OutcomeStatus.committed,
  result: const {'confirmed': true}, successScore: 1, verified: verified,
  completedAt: DateTime.utc(2026, 1, 1),
);

void main() {
  const protocol = VerificationOutcomeProtocol();

  test('provider success claim is not enough without evidence', () {
    final bad = VerificationResult(
      contract: VerificationContract(
        verificationId: 'v1', organizationId: 'org1', missionId: 'm1', actionId: 'a1',
        executionRunId: 'run1', executionInputHash: 'hash', criteriaHash: 'criteria',
        evidenceIds: const [], createdAt: DateTime.utc(2026, 1, 1),
      ),
      status: VerificationStatus.passed, confidence: 1,
      rationale: 'Provider said success.', resolvedAt: DateTime.utc(2026, 1, 1),
    );
    expect(() => protocol.validateVerification(bad), throwsA(isA<VerificationOutcomeViolation>()));
  });

  test('successful outcome requires passed verification', () {
    expect(() => protocol.commit(outcome(), passed()), returnsNormally);
    final failedVerification = VerificationResult(
      contract: passed().contract,
      status: VerificationStatus.failed, confidence: 1,
      rationale: 'Evidence contradicts success.', resolvedAt: DateTime.utc(2026, 1, 1),
    );
    expect(() => protocol.commit(outcome(), failedVerification), throwsA(isA<VerificationOutcomeViolation>()));
  });

  test('outcome cannot cross mission or execution boundary', () {
    final mismatched = OutcomeCommitRequest(
      organizationId: 'org1', missionId: 'other', goalId: 'g1', executionRunId: 'run1',
      verificationId: 'v1', type: OutcomeType.success, status: OutcomeStatus.committed,
      result: const {}, successScore: 1, verified: true, completedAt: DateTime.utc(2026, 1, 1),
    );
    expect(() => protocol.commit(mismatched, passed()), throwsA(isA<VerificationOutcomeViolation>()));
  });

  test('unknown outcome cannot be committed as verified success', () {
    expect(() => protocol.commit(outcome(type: OutcomeType.unknown), passed()),
      throwsA(isA<VerificationOutcomeViolation>()));
  });

  test('unverified outcome cannot commit even with passing evidence', () {
    expect(() => protocol.commit(outcome(verified: false), passed()),
      throwsA(isA<VerificationOutcomeViolation>()));
  });
}
