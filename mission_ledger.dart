enum LedgerEventType {
  intentCreated,
  authorityRequested,
  authorityApproved,
  leaseIssued,
  leaseRenewed,
  leaseRevoked,
  missionStarted,
  actionAuthorized,
  actionStarted,
  actionSucceeded,
  actionFailed,
  waitingEntered,
  missionResumed,
  evidenceRecorded,
  verificationStarted,
  verificationCompleted,
  outcomeCommitted,
}

class MissionLedgerEntry {
  final String id;
  final String missionId;
  final LedgerEventType type;
  final DateTime occurredAt;
  final String actor;
  final String summary;
  final Map<String, Object?> data;

  const MissionLedgerEntry({
    required this.id,
    required this.missionId,
    required this.type,
    required this.occurredAt,
    required this.actor,
    required this.summary,
    required this.data,
  });
}
