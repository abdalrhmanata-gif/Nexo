import '../domain/mission_handoff.dart';

class HandoffDecision {
  final bool allowed;
  final String reason;
  const HandoffDecision(this.allowed, this.reason);
}

class MissionHandoffService {
  const MissionHandoffService();

  HandoffDecision validateForAcceptance({
    required MissionHandoff handoff,
    required String expectedOrganizationId,
    required String expectedMissionId,
    required String expectedTargetAgentId,
    required String currentDelegationId,
    required Set<String> currentPermittedActionTypes,
    required Set<String> currentPermittedToolIds,
  }) {
    if (!handoff.isAcceptable) return const HandoffDecision(false, 'Handoff is not active or has expired.');
    if (handoff.organizationId != expectedOrganizationId || handoff.missionId != expectedMissionId) {
      return const HandoffDecision(false, 'Tenant or mission binding mismatch.');
    }
    if (handoff.targetAgentId != expectedTargetAgentId) return const HandoffDecision(false, 'Target agent mismatch.');
    if (handoff.delegationId != currentDelegationId) return const HandoffDecision(false, 'Delegation mismatch or stale authority.');
    if (!handoff.permittedActionTypes.every(currentPermittedActionTypes.contains)) {
      return const HandoffDecision(false, 'Handoff would expand action authority.');
    }
    if (!handoff.permittedToolIds.every(currentPermittedToolIds.contains)) {
      return const HandoffDecision(false, 'Handoff would expand tool authority.');
    }
    return const HandoffDecision(true, 'Continuity accepted; JIT authorization remains mandatory.');
  }
}
