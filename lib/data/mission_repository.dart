import '../domain/intent.dart';
import '../domain/mission.dart';
import '../domain/execution_lease.dart';
import '../domain/mission_ledger.dart';
import 'local_mission_store.dart';

abstract interface class MissionRepository {
  Future<Mission> createMission(IntentDraft draft);
  Future<void> deleteMission(String missionId);
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

  final Map<String, Mission> _missions = {};
  final Map<String, ExecutionLease?> _leases = {};
  final Map<String, List<MissionLedgerEntry>> _ledgers = {};

  Mission? get currentMission => _mission;
  List<Mission> get missions => List.unmodifiable(_missions.values);
  Future<List<Mission>> listMissions() async => missions;

  @override
  Future<void> deleteMission(String missionId) async {
    _require(missionId);
    _missions.remove(missionId);
    _ledgers.remove(missionId);
    _leases.remove(missionId);
    if (_mission?.id == missionId) {
      _mission = _missions.values.isEmpty ? null : _missions.values.last;
      _ledger
        ..clear()
        ..addAll(_mission == null ? const [] : _ledgers[_mission!.id]!);
      _lease = _mission == null ? null : _leases[_mission!.id];
    }
    await _persist();
  }

  Future<void> restore() async {
    final store = _store;
    if (store == null) return;
    final encoded = await store.read();
    if (encoded == null) return;
    try {
      final states = _codec.decodeCollection(encoded);
      _missions.clear();
      _ledgers.clear();
      _leases.clear();
      for (final state in states) {
        final restored = state.mission;
        final safe =
            restored.leaseId == null && restored.status != MissionStatus.running
                ? restored
                : restored.copyWith(
                    status: MissionStatus.paused,
                    authorityApproved: false,
                    clearLeaseId: true,
                    clearLeaseExpiresAt: true,
                    actions: restored.actions
                        .map((action) =>
                            action.status == ActionStatus.authorized
                                ? action.copyWith(status: ActionStatus.pending)
                                : action)
                        .toList(growable: false),
                  );
        _missions[safe.id] = safe;
        _ledgers[safe.id] = [...state.ledger];
      }
      _mission = _missions.values.isEmpty ? null : _missions.values.last;
      _ledger
        ..clear()
        ..addAll(_mission == null ? const [] : _ledgers[_mission!.id]!);
    } on Object {
      _missions.clear();
      _ledgers.clear();
      _leases.clear();
      _mission = null;
      await store.clear();
    }
  }

  Future<void> _persist() async {
    _saveSelected();
    final store = _store;
    if (store == null) return;
    await store.write(_codec.encodeCollection(_missions.entries.map((entry) {
      return LocalMissionState(
        mission: entry.value,
        ledger: _ledgers[entry.key] ?? const [],
      );
    }).toList(growable: false)));
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
      actions: draft.steps.isEmpty
          ? const [
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
            ]
          : draft.steps
              .asMap()
              .entries
              .map((entry) => MissionAction(
                    id: 'a${entry.key + 1}',
                    title: entry.value,
                    authorityClass: 'USER',
                    status: ActionStatus.pending,
                    requiresApproval: false,
                    requiresVerification: true,
                  ))
              .toList(growable: false),
    );
    _record(LedgerEventType.intentCreated, 'Intent converted into a Mission.');
    _record(LedgerEventType.authorityRequested,
        'Requested bounded authority for the mission.');
    _missions[_mission!.id] = _mission!;
    _ledgers[_mission!.id] = [..._ledger];
    _leases[_mission!.id] = null;
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
    if (m.id == _mission?.id) {
      _ledgers[m.id] = _ledger;
    }
  }

  Mission _require(String id) {
    final m = _missions[id];
    if (m == null || m.id != id) throw StateError('Mission not found.');
    return m;
  }

  void _select(String id) {
    _mission = _require(id);
    _ledger
      ..clear()
      ..addAll(_ledgers[id] ?? const []);
    _lease = _leases[id];
  }

  void _saveSelected() {
    final mission = _mission;
    if (mission == null) return;
    _missions[mission.id] = mission;
    _ledgers[mission.id] = [..._ledger];
    _leases[mission.id] = _lease;
  }

  @override
  Future<Mission> approveAuthority(String missionId) async {
    _select(missionId);
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
    _saveSelected();
    await _persist();
    return _mission!;
  }

  @override
  Future<Mission> startMission(String missionId) async {
    _select(missionId);
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
    _saveSelected();
    await _persist();
    return _mission!;
  }

  @override
  Future<Mission> continueMission(String missionId) async {
    _select(missionId);
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
        _saveSelected();
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
    _saveSelected();
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
    _select(missionId);
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
    _saveSelected();
    await _persist();
    return _mission!;
  }

  @override
  Future<Mission> pauseMission(String missionId) async {
    _select(missionId);
    final m = _require(missionId);
    if (m.status != MissionStatus.running) {
      throw StateError('Only a running mission can be paused.');
    }
    _mission = m.copyWith(status: MissionStatus.paused);
    _record(LedgerEventType.missionPaused, 'Mission paused by user.');
    await _persist();
    _saveSelected();
    await _persist();
    return _mission!;
  }

  @override
  Future<Mission> resumeMission(String missionId) async {
    _select(missionId);
    final m = _require(missionId);
    if (!m.authorityApproved) throw StateError('Authority is not approved.');
    final expiry = m.leaseExpiresAt;
    if (expiry == null || !_isLeaseUsable(expiry)) {
      _expireLease();
      await _persist();
      _saveSelected();
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
    _saveSelected();
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
    _select(missionId);
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
    _saveSelected();
    await _persist();
    return _mission!;
  }

  @override
  Future<ExecutionLease?> getExecutionLease(String missionId) async {
    return _leases[missionId];
  }

  @override
  Future<List<MissionLedgerEntry>> getLedger(String missionId) async {
    _require(missionId);
    return List.unmodifiable(_ledgers[missionId] ?? const []);
  }

  @override
  Future<Mission> getMission(String missionId) async => _require(missionId);
}
