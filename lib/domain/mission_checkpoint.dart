class MissionCheckpoint {
  final String missionId;
  final int version;
  final String authorityPassportId;
  final String delegationId;
  final String? actionRevisionBinding;
  final String? executionLeaseId;
  final int remainingActions;
  final double remainingBudget;
  final DateTime capturedAt;
  final String stateDigest;

  const MissionCheckpoint({
    required this.missionId,
    required this.version,
    required this.authorityPassportId,
    required this.delegationId,
    required this.actionRevisionBinding,
    required this.executionLeaseId,
    required this.remainingActions,
    required this.remainingBudget,
    required this.capturedAt,
    required this.stateDigest,
  });

  String get continuityBinding =>
      '$missionId:$version:$authorityPassportId:$delegationId:${actionRevisionBinding ?? '-'}:${executionLeaseId ?? '-'}:$stateDigest';
}
