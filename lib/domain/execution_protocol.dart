import 'action_revision.dart';

/// v1.3: provider/adapter-neutral contract crossing the Mission Kernel -> Worker boundary.
/// The envelope is descriptive and immutable; it does not itself authorize execution.
enum ExecutionEnvelopeStatus {
  prepared,
  authorized,
  dispatched,
  unknown,
  succeeded,
  failed,
  rejected
}

enum ExternalOutcomeClassification {
  notSent,
  accepted,
  succeeded,
  failed,
  unknown
}

class ExecutionInvocationEnvelope {
  final String envelopeId;
  final String organizationId;
  final String missionId;
  final String actionId;
  final int actionVersion;
  final String actionRevisionBinding;
  final String authorityPassportId;
  final String delegationId;
  final String? executionLeaseId;
  final String agentId;
  final String provider;
  final String model;
  final String toolId;
  final String toolVersion;
  final String idempotencyKey;
  final String inputHash;
  final String instruction;
  final Map<String, dynamic> input;
  final ExternalOutcomeClassification expectedOutcome;
  final DateTime issuedAt;
  final DateTime expiresAt;

  const ExecutionInvocationEnvelope({
    required this.envelopeId,
    required this.organizationId,
    required this.missionId,
    required this.actionId,
    required this.actionVersion,
    required this.actionRevisionBinding,
    required this.authorityPassportId,
    required this.delegationId,
    required this.executionLeaseId,
    required this.agentId,
    required this.provider,
    required this.model,
    required this.toolId,
    required this.toolVersion,
    required this.idempotencyKey,
    required this.inputHash,
    required this.instruction,
    required this.input,
    required this.expectedOutcome,
    required this.issuedAt,
    required this.expiresAt,
  });

  ActionRevision toActionRevision() => ActionRevision(
        actionId: actionId,
        version: actionVersion,
        missionId: missionId,
        authorityClass: 'EXECUTE',
        toolId: toolId,
        inputHash: inputHash,
        createdAt: issuedAt,
      );

  String get bindingKey => '$actionId:$actionVersion:$inputHash';
}

class ExecutionProtocolViolation implements Exception {
  final String code;
  const ExecutionProtocolViolation(this.code);
  @override
  String toString() => code;
}

class ExecutionProtocolValidator {
  const ExecutionProtocolValidator();

  void validate(ExecutionInvocationEnvelope e, {DateTime? now}) {
    final t = now ?? DateTime.now().toUtc();
    if (e.organizationId.isEmpty || e.missionId.isEmpty || e.actionId.isEmpty) {
      throw const ExecutionProtocolViolation('MISSING_IDENTITY_BINDING');
    }
    if (e.authorityPassportId.isEmpty || e.delegationId.isEmpty) {
      throw const ExecutionProtocolViolation('MISSING_AUTHORITY_BINDING');
    }
    if (e.actionVersion <= 0 || e.actionRevisionBinding != e.bindingKey) {
      throw const ExecutionProtocolViolation(
          'ACTION_REVISION_BINDING_MISMATCH');
    }
    if (e.idempotencyKey.isEmpty || e.inputHash.isEmpty) {
      throw const ExecutionProtocolViolation(
          'MISSING_IDEMPOTENCY_OR_INPUT_HASH');
    }
    if (e.toolId.isEmpty ||
        e.toolVersion.isEmpty ||
        e.agentId.isEmpty ||
        e.provider.isEmpty) {
      throw const ExecutionProtocolViolation('INCOMPLETE_EXECUTION_TARGET');
    }
    if (!e.expiresAt.isAfter(e.issuedAt)) {
      throw const ExecutionProtocolViolation('INVALID_ENVELOPE_EXPIRY');
    }
    if (!t.isBefore(e.expiresAt)) {
      throw const ExecutionProtocolViolation('EXECUTION_ENVELOPE_EXPIRED');
    }
  }
}

class ExternalOutcomeReceipt {
  final String envelopeId;
  final ExternalOutcomeClassification classification;
  final String? externalReference;
  final String? responseHash;
  final DateTime observedAt;
  final String? errorCode;

  const ExternalOutcomeReceipt({
    required this.envelopeId,
    required this.classification,
    required this.externalReference,
    required this.responseHash,
    required this.observedAt,
    required this.errorCode,
  });

  bool get mayRetryAutomatically =>
      classification == ExternalOutcomeClassification.notSent;
  bool get requiresReconciliation =>
      classification == ExternalOutcomeClassification.unknown;
}
