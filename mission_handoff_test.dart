import 'package:test/test.dart';
import '../lib/application/mission_handoff_service.dart';
import '../lib/domain/mission_handoff.dart';

MissionHandoff sample({DateTime? expiresAt, Set<String>? actions}) => MissionHandoff(
  id:'h1', missionId:'m1', organizationId:'o1', sourceAgentId:'a1', targetAgentId:'a2', delegationId:'d1',
  authoritySnapshotHash:'auth', missionStateHash:'state', permittedActionTypes: actions ?? {'READ','PREPARE'},
  permittedToolIds:{'crm.search'}, spendingRemaining:20, actionsRemaining:4,
  issuedAt:DateTime.now().subtract(const Duration(minutes:1)), expiresAt:expiresAt ?? DateTime.now().add(const Duration(minutes:5)),
  status:HandoffStatus.issued, nonce:'n1', consumedAt:null);

void main() {
  const s = MissionHandoffService();
  test('accepts bounded handoff', () {
    final r=s.validateForAcceptance(handoff:sample(),expectedOrganizationId:'o1',expectedMissionId:'m1',expectedTargetAgentId:'a2',currentDelegationId:'d1',currentPermittedActionTypes:{'READ','PREPARE','WRITE'},currentPermittedToolIds:{'crm.search'});
    expect(r.allowed,isTrue);
  });
  test('rejects expired handoff', () {
    final r=s.validateForAcceptance(handoff:sample(expiresAt:DateTime.now().subtract(const Duration(seconds:1))),expectedOrganizationId:'o1',expectedMissionId:'m1',expectedTargetAgentId:'a2',currentDelegationId:'d1',currentPermittedActionTypes:{'READ','PREPARE'},currentPermittedToolIds:{'crm.search'});
    expect(r.allowed,isFalse);
  });
  test('rejects stale delegation', () {
    final r=s.validateForAcceptance(handoff:sample(),expectedOrganizationId:'o1',expectedMissionId:'m1',expectedTargetAgentId:'a2',currentDelegationId:'d2',currentPermittedActionTypes:{'READ','PREPARE'},currentPermittedToolIds:{'crm.search'});
    expect(r.allowed,isFalse);
  });
  test('rejects authority expansion', () {
    final r=s.validateForAcceptance(handoff:sample(actions:{'READ','WRITE'}),expectedOrganizationId:'o1',expectedMissionId:'m1',expectedTargetAgentId:'a2',currentDelegationId:'d1',currentPermittedActionTypes:{'READ'},currentPermittedToolIds:{'crm.search'});
    expect(r.allowed,isFalse);
  });
}
