import '../domain/intent.dart';
import '../domain/mission.dart';
import '../domain/execution_lease.dart';
import '../domain/mission_ledger.dart';

abstract interface class MissionRepository {
  Future<Mission> createMission(IntentDraft draft);
  Future<Mission> approveAuthority(String missionId);
  Future<Mission> startMission(String missionId);
  Future<Mission> pauseMission(String missionId);
  Future<Mission> resumeMission(String missionId);
  Future<Mission> revokeLease(String missionId);
  Future<ExecutionLease?> getExecutionLease(String missionId);
  Future<List<MissionLedgerEntry>> getLedger(String missionId);
  Future<Mission> getMission(String missionId);
}

/// Local deterministic repository. It models the command boundary without
/// touching Supabase Main. Production implementation comes after DB gates.
class DemoMissionRepository implements MissionRepository {
  Mission? _mission;
  ExecutionLease? _lease;
  final List<MissionLedgerEntry> _ledger = [];

  @override
  Future<Mission> createMission(IntentDraft draft) async {
    _mission = Mission(
      id: 'mission-${DateTime.now().millisecondsSinceEpoch}',
      objective: draft.objective,
      status: MissionStatus.ready,
      maxCost: 100,
      currentCost: 0,
      maxActions: 20,
      actionCount: 0,
      maxRetries: 2,
      nextActionAt: null,
      leaseExpiresAt: null,
      authorityApproved: false,
      leaseId: null,
      delegationId: null,
      authoritySummary: 'READ + PREPARE. WRITE requires explicit approval. No FINANCIAL or LEGAL authority.',
      actions: const [
        MissionAction(id: 'a1', title: 'Research suitable leads', authorityClass: 'READ', status: ActionStatus.pending, requiresApproval: false, requiresVerification: true),
        MissionAction(id: 'a2', title: 'Prepare outreach message', authorityClass: 'PREPARE', status: ActionStatus.pending, requiresApproval: false, requiresVerification: true),
        MissionAction(id: 'a3', title: 'Send approved outreach', authorityClass: 'WRITE', status: ActionStatus.pending, requiresApproval: true, requiresVerification: true),
      ],
    );
    _record(LedgerEventType.intentCreated, 'Intent converted into a Mission.');
    _record(LedgerEventType.authorityRequested, 'Requested bounded authority for the mission.');
    return _mission!;
  }

  void _record(LedgerEventType type, String summary, [Map<String, Object?> data = const {}]) {
    final m = _mission;
    if (m == null) return;
    _ledger.add(MissionLedgerEntry(
      id: 'event-${_ledger.length + 1}',
      missionId: m.id,
      type: type,
      occurredAt: DateTime.now(),
      actor: 'NEXO',
      summary: summary,
      data: data,
    ));
  }

  Mission _require(String id) {
    final m = _mission;
    if (m == null || m.id != id) throw StateError('Mission not found.');
    return m;
  }

  @override
  Future<Mission> approveAuthority(String missionId) async {
    final m = _require(missionId);
    _mission = m.copyWith(authorityApproved: true, status: MissionStatus.ready, delegationId: 'delegation-${m.id}');
    _record(LedgerEventType.authorityApproved, 'User approved bounded authority.');
    return _mission!;
  }

  @override
  Future<Mission> startMission(String missionId) async {
    final m = _require(missionId);
    if (!m.authorityApproved) throw StateError('Authority must be approved before execution.');
    final now = DateTime.now();
    _lease = ExecutionLease(
      id: 'lease-${m.id}', missionId: m.id, delegationId: m.delegationId!, agentId: 'agent-demo',
      allowedActions: const {'READ', 'PREPARE', 'WRITE'}, allowedTools: const {'lead-research', 'outreach-draft', 'outreach-send'},
      spendingLimit: m.maxCost ?? 0, spendingUsed: m.currentCost, actionLimit: m.maxActions ?? 0, actionsUsed: m.actionCount,
      issuedAt: now, expiresAt: now.add(const Duration(minutes: 30)), status: ExecutionLeaseStatus.active, revokedAt: null,
    );
    _mission = m.copyWith(
      status: MissionStatus.running,
      leaseExpiresAt: _lease!.expiresAt,
      leaseId: _lease!.id,
      actions: m.actions.map((a) => a.requiresApproval ? a : a.copyWith(status: ActionStatus.authorized)).toList(),
    );
    _record(LedgerEventType.leaseIssued, 'Issued a 30-minute execution lease.', {'lease_id': _lease!.id});
    _record(LedgerEventType.missionStarted, 'Mission entered RUNNING.');
    return _mission!;
  }

  @override
  Future<Mission> pauseMission(String missionId) async => _mission = _require(missionId).copyWith(status: MissionStatus.paused);

  @override
  Future<Mission> resumeMission(String missionId) async {
    final m = _require(missionId);
    if (!m.authorityApproved) throw StateError('Authority is not approved.');
    if (m.leaseExpiresAt == null || DateTime.now().isAfter(m.leaseExpiresAt!)) {
      throw StateError('Execution lease expired. Re-authorization is required.');
    }
    _mission = m.copyWith(status: MissionStatus.running);
    return _mission!;
  }

  @override
  Future<Mission> revokeLease(String missionId) async {
    final m = _require(missionId);
    final now = DateTime.now();
    final lease = _lease;
    if (lease != null) {
      _lease = ExecutionLease(id: lease.id, missionId: lease.missionId, delegationId: lease.delegationId, agentId: lease.agentId, allowedActions: lease.allowedActions, allowedTools: lease.allowedTools, spendingLimit: lease.spendingLimit, spendingUsed: lease.spendingUsed, actionLimit: lease.actionLimit, actionsUsed: lease.actionsUsed, issuedAt: lease.issuedAt, expiresAt: now, status: ExecutionLeaseStatus.revoked, revokedAt: now);
    }
    _mission = m.copyWith(status: MissionStatus.paused, leaseExpiresAt: now);
    _record(LedgerEventType.leaseRevoked, 'Execution lease revoked.');
    return _mission!;
  }

  @override
  Future<ExecutionLease?> getExecutionLease(String missionId) async {
    _require(missionId);
    return _lease;
  }

  @override
  Future<List<MissionLedgerEntry>> getLedger(String missionId) async {
    _require(missionId);
    return List.unmodifiable(_ledger);
  }

  @override
  Future<Mission> getMission(String missionId) async => _require(missionId);
}
