import '../domain/intent.dart';
import '../domain/mission.dart';
import '../domain/execution_lease.dart';
import '../domain/mission_ledger.dart';
import 'local_mission_store.dart';

abstract interface class MissionRepository {
  Future<Mission> createMission(IntentDraft draft);
  Future<Mission> approveAuthority(String missionId);
  Future<Mission> startMission(String missionId);
  Future<Mission> continueMission(String missionId);
  Future<Mission> updateActionProgress(
    String missionId,
    String actionId, {
    required ActionStatus status,
    String? outcomeNote,
    DateTime? followUpAt,
  });
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
  DemoMissionRepository({
    DateTime Function()? clock,
    LocalMissionStore? store,
  })  : _clock = clock ?? DateTime.now,
        _store = store;

  final DateTime Function() _clock;
  final LocalMissionStore? _store;
  final MissionStorageCodec _codec = const MissionStorageCodec();
  Mission? _mission;
  ExecutionLease? _lease;
  final List<MissionLedgerEntry> _ledger = [];
  int _missionSequence = 0;

  Future<void> restore() async {
    final store = _store;
    if (store == null) return;
    final encoded = await store.read();
    if (encoded == null) return;
    try {
      final state = _codec.decodeState(encoded);
      final restored = state.mission;
      _mission =
          restored.leaseId == null && restored.status != MissionStatus.running
              ? restored
              : restored.copyWith(
                  status: MissionStatus.paused,
                  authorityApproved: false,
                  clearLeaseId: true,
                  clearLeaseExpiresAt: true,
                  actions: restored.actions
                      .map((action) => action.status == ActionStatus.authorized
                          ? action.copyWith(status: ActionStatus.pending)
                          : action)
                      .toList(growable: false),
                );
      _ledger
        ..clear()
        ..addAll(state.ledger);
    } on Object {
      _mission = null;
      await store.clear();
    }
  }

  Future<void> _persist() async {
    final store = _store;
    final mission = _mission;
    if (store == null || mission == null) return;
    await store.write(_codec.encodeState(mission, _ledger));
  }

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
    await _persist();
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
    await _persist();
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
    await _persist();
    return _mission!;
  }

  @override
  Future<Mission> continueMission(String missionId) async {
    final m = _require(missionId);
    if (m.status != MissionStatus.running) {
      throw StateError('Only a running mission can continue.');
    }

    final nextIndex = m.actions
        .indexWhere((action) => action.status == ActionStatus.authorized);
    if (nextIndex == -1) {
      final waitingIndex =
          m.actions.indexWhere((action) => action.requiresApproval);
      if (waitingIndex != -1) {
        _mission = m.copyWith(status: MissionStatus.needsUser);
        _record(
            LedgerEventType.waitingEntered,
            'Mission is waiting for approval before the next action.',
            {'action_id': m.actions[waitingIndex].id});
        await _persist();
        return _mission!;
      }

      throw StateError('No executable action remains.');
    }

    final action = m.actions[nextIndex];
    _record(LedgerEventType.actionStarted, 'Started demo action.',
        {'action_id': action.id});
    final actions = [...m.actions];
    actions[nextIndex] = action.copyWith(status: ActionStatus.succeeded);
    _mission = m.copyWith(
      actions: actions,
      actionCount: m.actionCount + 1,
    );
    _record(LedgerEventType.actionSucceeded, 'Completed demo action.',
        {'action_id': action.id});
    await _persist();
    return _mission!;
  }

  @override
  Future<Mission> updateActionProgress(
    String missionId,
    String actionId, {
    required ActionStatus status,
    String? outcomeNote,
    DateTime? followUpAt,
  }) async {
    final m = _require(missionId);
    final index = m.actions.indexWhere((action) => action.id == actionId);
    if (index == -1) throw StateError('Action not found.');
    if (status == ActionStatus.authorized || status == ActionStatus.committed) {
      throw StateError('Execution-owned action status cannot be set manually.');
    }
    final action = m.actions[index];
    final actions = [...m.actions];
    actions[index] = action.copyWith(
      status: status,
      outcomeNote: outcomeNote,
      followUpAt: followUpAt,
      clearOutcomeNote: outcomeNote == null,
      clearFollowUpAt: followUpAt == null,
    );
    _mission = m.copyWith(actions: actions);
    _record(
      status == ActionStatus.failed
          ? LedgerEventType.actionFailed
          : status == ActionStatus.waiting
              ? LedgerEventType.waitingEntered
              : LedgerEventType.actionSucceeded,
      'Updated action progress.',
      {
        'action_id': actionId,
        'status': actionStatusLabel(status),
        if (outcomeNote != null) 'outcome_note': outcomeNote,
        if (followUpAt != null) 'follow_up_at': followUpAt.toIso8601String(),
      },
    );
    await _persist();
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
    await _persist();
    return _mission!;
  }

  @override
  Future<Mission> resumeMission(String missionId) async {
    final m = _require(missionId);
    if (!m.authorityApproved) throw StateError('Authority is not approved.');
    final expiry = m.leaseExpiresAt;
    if (expiry == null || !_isLeaseUsable(expiry)) {
      _expireLease();
      await _persist();
      throw StateError(
          'Execution lease expired. Re-authorization is required.');
    }
    if (m.status != MissionStatus.paused) {
      throw StateError('Only a paused mission can be resumed.');
    }
    _mission = m.copyWith(status: MissionStatus.running);
    _record(LedgerEventType.missionResumed,
        'Mission resumed under the existing lease.');
    await _persist();
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
    await _persist();
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
