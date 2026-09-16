import 'package:flutter_test/flutter_test.dart';
import 'package:nexo_followthrough/domain/execution_protocol.dart';

ExecutionInvocationEnvelope envelope({DateTime? expiresAt}) =>
    ExecutionInvocationEnvelope(
      envelopeId: 'e1',
      organizationId: 'o1',
      missionId: 'm1',
      actionId: 'a1',
      actionVersion: 1,
      actionRevisionBinding: 'a1:1:h1',
      authorityPassportId: 'p1',
      delegationId: 'd1',
      executionLeaseId: 'l1',
      agentId: 'agent',
      provider: 'provider',
      model: 'model',
      toolId: 'tool',
      toolVersion: '1',
      idempotencyKey: 'idem-1',
      inputHash: 'h1',
      instruction: 'do it',
      input: const {'x': 1},
      expectedOutcome: ExternalOutcomeClassification.succeeded,
      issuedAt: DateTime.utc(2026, 1, 1),
      expiresAt: expiresAt ?? DateTime.utc(2026, 1, 1, 0, 5),
    );

void main() {
  test('valid envelope crosses protocol boundary', () {
    const validator = ExecutionProtocolValidator();
    validator.validate(envelope(), now: DateTime.utc(2026, 1, 1, 0, 1));
  });

  test('expired envelope fails closed', () {
    const validator = ExecutionProtocolValidator();
    expect(
        () =>
            validator.validate(envelope(), now: DateTime.utc(2026, 1, 1, 0, 6)),
        throwsA(isA<ExecutionProtocolViolation>()));
  });

  test('envelope at exact expiry fails closed', () {
    const validator = ExecutionProtocolValidator();
    expect(
        () => validator.validate(
              envelope(),
              now: DateTime.utc(2026, 1, 1, 0, 5),
            ),
        throwsA(isA<ExecutionProtocolViolation>()));
  });

  test('revision binding cannot be detached from input hash', () {
    const validator = ExecutionProtocolValidator();
    expect(
        () => validator.validate(
            ExecutionInvocationEnvelope(
              envelopeId: 'e1',
              organizationId: 'o1',
              missionId: 'm1',
              actionId: 'a1',
              actionVersion: 1,
              actionRevisionBinding: 'a1:1:other',
              authorityPassportId: 'p1',
              delegationId: 'd1',
              executionLeaseId: 'l1',
              agentId: 'agent',
              provider: 'provider',
              model: 'model',
              toolId: 'tool',
              toolVersion: '1',
              idempotencyKey: 'idem-1',
              inputHash: 'h1',
              instruction: 'do it',
              input: const {},
              expectedOutcome: ExternalOutcomeClassification.succeeded,
              issuedAt: DateTime.utc(2026, 1, 1),
              expiresAt: DateTime.utc(2026, 1, 1, 0, 5),
            ),
            now: DateTime.utc(2026, 1, 1, 0, 1)),
        throwsA(isA<ExecutionProtocolViolation>()));
  });

  test('unknown external outcome requires reconciliation', () {
    final receipt = ExternalOutcomeReceipt(
        envelopeId: 'e1',
        classification: ExternalOutcomeClassification.unknown,
        externalReference: null,
        responseHash: null,
        observedAt: DateTime.utc(2026, 1, 1),
        errorCode: 'TIMEOUT');
    expect(receipt.requiresReconciliation, isTrue);
    expect(receipt.mayRetryAutomatically, isFalse);
  });
}
