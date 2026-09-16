enum ProvenanceEventType {
  intentAccepted,
  delegationBound,
  policyEvaluated,
  authorizationDecided,
  actionPrepared,
  executionStarted,
  externalCallSent,
  externalOutcomeObserved,
  evidenceCaptured,
  verificationCompleted,
  outcomeCommitted,
  missionStateChanged,
  agentHandoff,
  recoveryPerformed,
  securityDenied,
}

class ProvenanceEvent {
  final String eventId;
  final String missionId;
  final String organizationId;
  final int sequence;
  final ProvenanceEventType type;
  final String actorType;
  final String actorId;
  final String payloadHash;
  final String previousEventHash;
  final String eventHash;
  final DateTime createdAt;
  final String correlationId;
  final String? causationId;

  const ProvenanceEvent({
    required this.eventId,
    required this.missionId,
    required this.organizationId,
    required this.sequence,
    required this.type,
    required this.actorType,
    required this.actorId,
    required this.payloadHash,
    required this.previousEventHash,
    required this.eventHash,
    required this.createdAt,
    required this.correlationId,
    this.causationId,
  });
}
