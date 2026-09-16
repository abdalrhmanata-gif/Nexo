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
  DemoMissionRepository({DateTime Function()? clock})
      : _clock = clock ?? DateTime.now;

  final DateTime Function() _clock;
  Mission? _mission;
  ExecutionLease? _lease;
  final List<MissionLedgerEntry> _ledger = [];
  int _missionSequence = 0;

  @override
  Future<Mission> createMission(IntentDraft draft) async {
    _missionSequence += 1;
    _ledger.clear();
    _lease = null;
    _mission = Mission(
      id: 'mission-${_clock().millisecondsSinceEpoch}-$_missionSequence',
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
      authoritySummary:
          'READ + PREPARE. WRITE requires explicit approval. No FINANCIAL or LEGAL authority.',
      actions: const [
        MissionAction(
            id: 'a1',
            title: 'Research suitable leads',
            authorityClass: 'READ',
            status: ActionStatus.pending,
            requiresApproval: false,
            requiresVerification: true),
        MissionAction(
            id: 'a2',
            title: 'Prepare outreach message',
            authorityClass: 'PREPARE',
            status: ActionStatus.pending,
            requiresApproval: false,
            requiresVerification: true),
        MissionAction(
            id: 'a3',
            title: 'Send approved outreach',
            authorityClass: 'WRITE',
            status: ActionStatus.pending,
            requiresApproval: true,
            requiresVerification: true),
      ],
    );
    _record(LedgerEventType.intentCreated, 'Intent converted into a Mission.');
    _record(LedgerEventType.authorityRequested,
        'Requested bounded authority for the mission.');
    return _mission!;
  }

  void _record(LedgerEventType type, String summary,
      [Map<String, Object?> data = const {}]) {
    final m = _mission;
    if (m == null) return;
    _ledger.add(MissionLedgerEntry(
      id: 'event-${_ledger.length + 1}',
      missionId: m.id,
      type: type,
      occurredAt: _clock(),
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
    if (m.status != MissionStatus.ready && m.status != MissionStatus.paused) {
      throw StateError(
          'Authority can only be approved for a READY or PAUSED mission.');
    }
    _mission = m.copyWith(
        authorityApproved: true,
        status: MissionStatus.ready,
        delegationId: 'delegation-${m.id}');
    return _mission!;
  }

  @override
  Future<Mission> startMission(String missionId) async {
    final m = _require(missionId);
    if (m.status != MissionStatus.ready) {
      throw StateError(
          'Only a READY mission can start; use resume for a paused mission.');
    }
    if (!m.authorityApproved)
      throw StateError('Authority must be approved before execution.');
    final now = _clock();
    _lease = ExecutionLease(
      id: 'lease-${m.id}',
      missionId: m.id,
      delegationId: m.delegationId!,
      agentId: 'agent-demo',
      allowedActions: const {'READ', 'PREPARE', 'WRITE'},
      allowedTools: const {'lead-research', 'outreach-draft', 'outreach-send'},
      spendingLimit: m.maxCost ?? 0,
      spendingUsed: m.currentCost,
      actionLimit: m.maxActions ?? 0,
      actionsUsed: m.actionCount,
      issuedAt: now,
      expiresAt: now.add(const Duration(minutes: 30)),
      status: ExecutionLeaseStatus.active,
      revokedAt: null,
    );
    _mission = m.copyWith(
      status: MissionStatus.running,
      leaseExpiresAt: _lease!.expiresAt,
      leaseId: _lease!.id,
      actions: m.actions
          .map((a) => a.requiresApproval
              ? a
              : a.copyWith(status: ActionStatus.authorized))
          .toList(),
    );
    _record(LedgerEventType.leaseIssued, 'Issued a 30-minute execution lease.',
        {'lease_id': _lease!.id});
    _record(LedgerEventType.missionStarted, 'Mission entered RUNNING.');
    return _mission!;
  }

  @override
  Future<Mission> pauseMission(String missionId) async {
    final m = _require(missionId);
    if (m.status != MissionStatus.running) {
      throw StateError('Only a running mission can be paused.');
    }
    _mission = m.copyWith(status: MissionStatus.paused);
    _record(LedgerEventType.missionPaused, 'Mission paused by user.');
    return _mission!;
  }

  @override
  Future<Mission> resumeMission(String missionId) async {
    final m = _require(missionId);
    if (!m.authorityApproved) throw StateError('Authority is not approved.');
    final expiry = m.leaseExpiresAt;
    if (expiry == null || !_isLeaseUsable(expiry)) {
      _expireLease();
      throw StateError(
          'Execution lease expired. Re-authorization is required.');
    }
    if (m.status != MissionStatus.paused) {
      throw StateError('Only a paused mission can be resumed.');
    }
    _mission = m.copyWith(status: MissionStatus.running);
    _record(LedgerEventType.missionResumed,
        'Mission resumed under the existing lease.');
    return _mission!;
  }

  bool _isLeaseUsable(DateTime expiry) => _clock().isBefore(expiry);

  void _expireLease() {
    final m = _mission;
    final lease = _lease;
    if (m == null ||
        lease == null ||
        lease.status != ExecutionLeaseStatus.active) return;
    final now = _clock();
    _lease = ExecutionLease(
      id: lease.id,
      missionId: lease.missionId,
      delegationId: lease.delegationId,
      agentId: lease.agentId,
      allowedActions: lease.allowedActions,
      allowedTools: lease.allowedTools,
      spendingLimit: lease.spendingLimit,
      spendingUsed: lease.spendingUsed,
      actionLimit: lease.actionLimit,
      actionsUsed: lease.actionsUsed,
      issuedAt: lease.issuedAt,
      expiresAt: lease.expiresAt,
      status: ExecutionLeaseStatus.expired,
      revokedAt: null,
    );
    _mission = m.copyWith(
      status: MissionStatus.paused,
      authorityApproved: false,
      leaseId: null,
      clearLeaseId: true,
      leaseExpiresAt: now,
      actions: m.actions
          .map((a) => a.status == ActionStatus.authorized
              ? a.copyWith(status: ActionStatus.pending)
              : a)
          .toList(),
    );
    _record(LedgerEventType.leaseExpired,
        'Execution lease expired; authority was invalidated.');
  }

  @override
  Future<Mission> revokeLease(String missionId) async {
    final m = _require(missionId);
    final now = _clock();
    final lease = _lease;
    if (lease != null) {
      _lease = ExecutionLease(
          id: lease.id,
          missionId: lease.missionId,
          delegationId: lease.delegationId,
          agentId: lease.agentId,
          allowedActions: lease.allowedActions,
          allowedTools: lease.allowedTools,
          spendingLimit: lease.spendingLimit,
          spendingUsed: lease.spendingUsed,
          actionLimit: lease.actionLimit,
          actionsUsed: lease.actionsUsed,
          issuedAt: lease.issuedAt,
          expiresAt: now,
          status: ExecutionLeaseStatus.revoked,
          revokedAt: now);
    }
    _mission = m.copyWith(
      status: MissionStatus.paused,
      authorityApproved: false,
      leaseExpiresAt: now,
      leaseId: null,
      clearLeaseId: true,
      actions: m.actions
          .map((a) => a.status == ActionStatus.authorized
              ? a.copyWith(status: ActionStatus.pending)
              : a)
          .toList(),
    );
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
