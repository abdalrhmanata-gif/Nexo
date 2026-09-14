import 'mission_runtime.dart';

/// v1.1 Mission Kernel: deterministic control nucleus for a durable mission.
/// The kernel owns state transitions and security bindings, never external I/O.
class MissionKernelSnapshot {
  final String missionId;
  final String organizationId;
  final int version;
  final MissionRuntimeState runtimeState;
  final String authorityPassportId;
  final String delegationId;
  final String? currentActionRevisionBinding;
  final String? executionLeaseId;
  final String? selectedAgentId;
  final String? selectedProvider;
  final String? selectedModel;
  final int remainingActions;
  final double remainingBudget;
  final String? checkpointId;
  final String? lastEventId;
  final String stateDigest;
  final String? verificationResultId;
  final DateTime updatedAt;

  const MissionKernelSnapshot({
    required this.missionId,
    required this.organizationId,
    required this.version,
    required this.runtimeState,
    required this.authorityPassportId,
    required this.delegationId,
    required this.currentActionRevisionBinding,
    required this.executionLeaseId,
    required this.selectedAgentId,
    required this.selectedProvider,
    required this.selectedModel,
    required this.remainingActions,
    required this.remainingBudget,
    required this.checkpointId,
    required this.lastEventId,
    required this.stateDigest,
    required this.verificationResultId,
    required this.updatedAt,
  });

  MissionKernelSnapshot copyWith({
    int? version,
    MissionRuntimeState? runtimeState,
    String? currentActionRevisionBinding,
    bool clearActionRevision = false,
    String? executionLeaseId,
    bool clearExecutionLease = false,
    String? selectedAgentId,
    String? selectedProvider,
    String? selectedModel,
    int? remainingActions,
    double? remainingBudget,
    String? checkpointId,
    String? lastEventId,
    String? stateDigest,
    String? verificationResultId,
    bool clearVerificationResult = false,
    DateTime? updatedAt,
  }) {
    return MissionKernelSnapshot(
      missionId: missionId,
      organizationId: organizationId,
      version: version ?? this.version,
      runtimeState: runtimeState ?? this.runtimeState,
      authorityPassportId: authorityPassportId,
      delegationId: delegationId,
      currentActionRevisionBinding: clearActionRevision ? null : (currentActionRevisionBinding ?? this.currentActionRevisionBinding),
      executionLeaseId: clearExecutionLease ? null : (executionLeaseId ?? this.executionLeaseId),
      selectedAgentId: selectedAgentId ?? this.selectedAgentId,
      selectedProvider: selectedProvider ?? this.selectedProvider,
      selectedModel: selectedModel ?? this.selectedModel,
      remainingActions: remainingActions ?? this.remainingActions,
      remainingBudget: remainingBudget ?? this.remainingBudget,
      checkpointId: checkpointId ?? this.checkpointId,
      lastEventId: lastEventId ?? this.lastEventId,
      stateDigest: stateDigest ?? this.stateDigest,
      verificationResultId: clearVerificationResult ? null : (verificationResultId ?? this.verificationResultId),
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }
}

enum MissionKernelCommandType {
  start,
  pause,
  wait,
  requestUser,
  resume,
  replan,
  handoff,
  selectIntelligence,
  beginVerification,
  complete,
  fail,
  cancel,
  recover,
}

class MissionKernelCommand {
  final String commandId;
  final String missionId;
  final String organizationId;
  final int expectedVersion;
  final MissionKernelCommandType type;
  final String actorId;
  final String? actionRevisionBinding;
  final String? selectedAgentId;
  final String? selectedProvider;
  final String? selectedModel;
  final int? remainingActions;
  final double? remainingBudget;
  final bool verificationPassed;
  final String? checkpointId;
  final String? stateDigest;

  const MissionKernelCommand({
    required this.commandId,
    required this.missionId,
    required this.organizationId,
    required this.expectedVersion,
    required this.type,
    required this.actorId,
    this.actionRevisionBinding,
    this.selectedAgentId,
    this.selectedProvider,
    this.selectedModel,
    this.remainingActions,
    this.remainingBudget,
    this.verificationPassed = false,
    this.checkpointId,
    this.stateDigest,
  });
}

class MissionKernelEvent {
  final String eventId;
  final String commandId;
  final String missionId;
  final String organizationId;
  final int expectedVersion;
  final int resultingVersion;
  final MissionKernelCommandType commandType;
  final MissionRuntimeState from;
  final MissionRuntimeState to;
  final String actorId;
  final DateTime occurredAt;

  const MissionKernelEvent({
    required this.eventId,
    required this.commandId,
    required this.missionId,
    required this.organizationId,
    required this.expectedVersion,
    required this.resultingVersion,
    required this.commandType,
    required this.from,
    required this.to,
    required this.actorId,
    required this.occurredAt,
  });
}

class KernelDecision {
  final MissionKernelSnapshot snapshot;
  final MissionKernelEvent event;
  const KernelDecision({required this.snapshot, required this.event});
}

class MissionKernelException implements Exception {
  final String code;
  const MissionKernelException(this.code);
  @override
  String toString() => code;
}

class MissionKernel {
  final MissionRuntimeContract _runtime;
  final Map<String, KernelDecision> _processedCommands = {};
  final List<MissionKernelEvent> _ledger = [];

  MissionKernel({MissionRuntimeContract runtime = const MissionRuntimeContract()}) : _runtime = runtime;

  List<MissionKernelEvent> get ledger => List.unmodifiable(_ledger);

  KernelDecision apply(MissionKernelSnapshot current, MissionKernelCommand command) {
    if (command.missionId != current.missionId || command.organizationId != current.organizationId) {
      throw const MissionKernelException('TENANT_OR_MISSION_MISMATCH');
    }
    if (command.expectedVersion != current.version) {
      throw const MissionKernelException('STALE_MISSION_VERSION');
    }

    final prior = _processedCommands[command.commandId];
    if (prior != null) return prior;

    if (command.type == MissionKernelCommandType.replan) {
      _assertNonExpansion(current, command);
    }
    if (command.type == MissionKernelCommandType.handoff) {
      _assertNonExpansion(current, command);
    }
    if (command.type == MissionKernelCommandType.selectIntelligence) {
      _assertProviderSelectionOnly(command);
    }
    if (command.type == MissionKernelCommandType.recover) {
      _assertRecoveryBinding(current, command);
    }
    if (command.type == MissionKernelCommandType.complete && !command.verificationPassed) {
      throw const MissionKernelException('COMPLETION_REQUIRES_VERIFICATION');
    }

    MissionRuntimeState next = current.runtimeState;
    if (command.type == MissionKernelCommandType.recover) {
      next = current.runtimeState;
    } else if (command.type == MissionKernelCommandType.replan) {
      next = current.runtimeState;
    } else if (command.type == MissionKernelCommandType.handoff || command.type == MissionKernelCommandType.selectIntelligence) {
      next = current.runtimeState;
    } else {
      next = _runtime.apply(current.runtimeState, _runtimeEvent(command.type));
    }

    final updated = current.copyWith(
      version: current.version + 1,
      runtimeState: next,
      currentActionRevisionBinding: command.actionRevisionBinding,
      selectedAgentId: command.selectedAgentId,
      selectedProvider: command.selectedProvider,
      selectedModel: command.selectedModel,
      remainingActions: command.remainingActions,
      remainingBudget: command.remainingBudget,
      checkpointId: command.checkpointId,
      stateDigest: command.stateDigest,
      verificationResultId: command.verificationPassed ? (command.checkpointId ?? current.verificationResultId) : null,
      updatedAt: DateTime.now().toUtc(),
    );

    final event = MissionKernelEvent(
      eventId: 'ke_${command.commandId}',
      commandId: command.commandId,
      missionId: current.missionId,
      organizationId: current.organizationId,
      expectedVersion: current.version,
      resultingVersion: updated.version,
      commandType: command.type,
      from: current.runtimeState,
      to: updated.runtimeState,
      actorId: command.actorId,
      occurredAt: updated.updatedAt,
    );
    final decision = KernelDecision(snapshot: updated, event: event);
    _processedCommands[command.commandId] = decision;
    _ledger.add(event);
    return decision;
  }

  /// Replays a durable event deterministically against a snapshot.
  /// The event must advance exactly one version and match the snapshot tenant/mission.
  MissionKernelSnapshot replayEvent(MissionKernelSnapshot current, MissionKernelEvent event) {
    if (event.missionId != current.missionId || event.organizationId != current.organizationId) {
      throw const MissionKernelException('TENANT_OR_MISSION_MISMATCH');
    }
    if (event.expectedVersion != current.version || event.resultingVersion != current.version + 1) {
      throw const MissionKernelException('LEDGER_VERSION_GAP');
    }
    if (event.from != current.runtimeState) {
      throw const MissionKernelException('LEDGER_STATE_MISMATCH');
    }
    return current.copyWith(
      version: event.resultingVersion,
      runtimeState: event.to,
      lastEventId: event.eventId,
      updatedAt: event.occurredAt,
    );
  }

  static RuntimeEventType _runtimeEvent(MissionKernelCommandType type) {
    switch (type) {
      case MissionKernelCommandType.start: return RuntimeEventType.start;
      case MissionKernelCommandType.pause: return RuntimeEventType.pause;
      case MissionKernelCommandType.wait: return RuntimeEventType.wait;
      case MissionKernelCommandType.requestUser: return RuntimeEventType.userRequired;
      case MissionKernelCommandType.resume: return RuntimeEventType.resume;
      case MissionKernelCommandType.beginVerification: return RuntimeEventType.verify;
      case MissionKernelCommandType.complete: return RuntimeEventType.complete;
      case MissionKernelCommandType.fail: return RuntimeEventType.fail;
      case MissionKernelCommandType.cancel: return RuntimeEventType.cancel;
      case MissionKernelCommandType.replan:
      case MissionKernelCommandType.handoff:
      case MissionKernelCommandType.selectIntelligence:
      case MissionKernelCommandType.recover:
        throw const MissionKernelException('NO_RUNTIME_EVENT_FOR_CONTROL_COMMAND');
    }
  }

  static void _assertProviderSelectionOnly(MissionKernelCommand command) {
    if (command.actionRevisionBinding != null || command.remainingActions != null || command.remainingBudget != null) {
      throw const MissionKernelException('PROVIDER_SELECTION_CANNOT_MUTATE_AUTHORITY');
    }
  }

  static void _assertNonExpansion(MissionKernelSnapshot current, MissionKernelCommand command) {
    if (command.remainingActions != null && command.remainingActions! > current.remainingActions) {
      throw const MissionKernelException('AUTHORITY_EXPANSION_ACTION_BUDGET');
    }
    if (command.remainingBudget != null && command.remainingBudget! > current.remainingBudget) {
      throw const MissionKernelException('AUTHORITY_EXPANSION_SPENDING_BUDGET');
    }
    if (command.actionRevisionBinding != null && current.currentActionRevisionBinding != null && command.actionRevisionBinding != current.currentActionRevisionBinding) {
      throw const MissionKernelException('AUTHORITY_BINDING_CHANGE_REQUIRES_NEW_AUTHORIZATION');
    }
  }

  static void _assertRecoveryBinding(MissionKernelSnapshot current, MissionKernelCommand command) {
    if (command.checkpointId == null || command.stateDigest == null) {
      throw const MissionKernelException('RECOVERY_REQUIRES_CHECKPOINT_BINDING');
    }
    if (command.stateDigest != current.stateDigest) {
      throw const MissionKernelException('RECOVERY_STATE_DIGEST_MISMATCH');
    }
  }
}
