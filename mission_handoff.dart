enum HandoffStatus { issued, accepted, rejected, expired, revoked, consumed }

class MissionHandoff {
  final String id, missionId, organizationId, sourceAgentId, targetAgentId, delegationId;
  final String authoritySnapshotHash, missionStateHash, nonce;
  final Set<String> permittedActionTypes, permittedToolIds;
  final double spendingRemaining;
  final int actionsRemaining;
  final DateTime issuedAt, expiresAt;
  final HandoffStatus status;
  final DateTime? consumedAt;
  const MissionHandoff({required this.id, required this.missionId, required this.organizationId,
    required this.sourceAgentId, required this.targetAgentId, required this.delegationId,
    required this.authoritySnapshotHash, required this.missionStateHash,
    required this.permittedActionTypes, required this.permittedToolIds,
    required this.spendingRemaining, required this.actionsRemaining,
    required this.issuedAt, required this.expiresAt, required this.status,
    required this.nonce, required this.consumedAt});
  bool get isAcceptable => status == HandoffStatus.issued && DateTime.now().isBefore(expiresAt);
}
