enum MissionStatus {
  draft,
  planning,
  ready,
  running,
  waiting,
  needsUser,
  verifying,
  paused,
  blocked,
  failed,
  cancelled,
  completed
}

enum ActionStatus {
  pending,
  authorized,
  running,
  waiting,
  succeeded,
  failed,
  cancelled,
  verifying,
  verified,
  committed
}

class Mission {
  final String id;
  final String objective;
  final MissionStatus status;
  final double? maxCost;
  final double currentCost;
  final int? maxActions;
  final int actionCount;
  final int maxRetries;
  final DateTime? nextActionAt;
  final DateTime? leaseExpiresAt;
  final bool authorityApproved;
  final String? leaseId;
  final String? delegationId;
  final String authoritySummary;
  final List<MissionAction> actions;

  const Mission({
    required this.id,
    required this.objective,
    required this.status,
    required this.maxCost,
    required this.currentCost,
    required this.maxActions,
    required this.actionCount,
    required this.maxRetries,
    required this.nextActionAt,
    required this.leaseExpiresAt,
    required this.authorityApproved,
    required this.leaseId,
    required this.delegationId,
    required this.authoritySummary,
    required this.actions,
  });

  MissionAction? get currentAction {
    for (final action in actions) {
      if (action.status == ActionStatus.running ||
          action.status == ActionStatus.waiting ||
          action.status == ActionStatus.authorized ||
          action.status == ActionStatus.pending) {
        return action;
      }
    }
    return null;
  }

  int get completedActionCount => actions
      .where((action) =>
          action.status == ActionStatus.succeeded ||
          action.status == ActionStatus.verified ||
          action.status == ActionStatus.committed)
      .length;

  double get progress {
    if (actions.isEmpty) return 0;
    return completedActionCount / actions.length;
  }

  bool get allActionsCompleted =>
      actions.isNotEmpty && completedActionCount == actions.length;

  String get completionSummary {
    if (allActionsCompleted) return 'All steps have been completed.';
    if (completedActionCount == 0) {
      return actions.isEmpty
          ? 'No steps have been added.'
          : '0 of ${actions.length} steps completed. '
              '${actions.length} ${actions.length == 1 ? 'step' : 'steps'} '
              'still need attention.';
    }
    final remaining = actions.length - completedActionCount;
    return '$completedActionCount of ${actions.length} steps completed. '
        '$remaining ${remaining == 1 ? 'step' : 'steps'} still need attention.';
  }

  bool get hasWaitingAction =>
      actions.any((action) => action.status == ActionStatus.waiting);

  Mission copyWith({
    MissionStatus? status,
    bool? authorityApproved,
    String? leaseId,
    bool clearLeaseId = false,
    String? delegationId,
    DateTime? leaseExpiresAt,
    bool clearLeaseExpiresAt = false,
    List<MissionAction>? actions,
    int? actionCount,
  }) =>
      Mission(
        id: id,
        objective: objective,
        status: status ?? this.status,
        maxCost: maxCost,
        currentCost: currentCost,
        maxActions: maxActions,
        actionCount: actionCount ?? this.actionCount,
        maxRetries: maxRetries,
        nextActionAt: nextActionAt,
        leaseExpiresAt: clearLeaseExpiresAt
            ? null
            : (leaseExpiresAt ?? this.leaseExpiresAt),
        authorityApproved: authorityApproved ?? this.authorityApproved,
        leaseId: clearLeaseId ? null : (leaseId ?? this.leaseId),
        delegationId: delegationId ?? this.delegationId,
        authoritySummary: authoritySummary,
        actions: actions ?? this.actions,
      );
}

class MissionAction {
  final String id;
  final String title;
  final String authorityClass;
  final ActionStatus status;
  final bool requiresApproval;
  final bool requiresVerification;
  final String? outcomeNote;
  final DateTime? followUpAt;

  const MissionAction({
    required this.id,
    required this.title,
    required this.authorityClass,
    required this.status,
    required this.requiresApproval,
    required this.requiresVerification,
    this.outcomeNote,
    this.followUpAt,
  });

  MissionAction copyWith({
    ActionStatus? status,
    String? outcomeNote,
    DateTime? followUpAt,
    bool clearOutcomeNote = false,
    bool clearFollowUpAt = false,
  }) =>
      MissionAction(
        id: id,
        title: title,
        authorityClass: authorityClass,
        status: status ?? this.status,
        requiresApproval: requiresApproval,
        requiresVerification: requiresVerification,
        outcomeNote:
            clearOutcomeNote ? null : (outcomeNote ?? this.outcomeNote),
        followUpAt: clearFollowUpAt ? null : (followUpAt ?? this.followUpAt),
      );
}

String missionStatusLabel(MissionStatus status) => switch (status) {
      MissionStatus.draft => 'Draft',
      MissionStatus.planning => 'Planning',
      MissionStatus.ready => 'Ready',
      MissionStatus.running => 'Running',
      MissionStatus.waiting => 'Waiting',
      MissionStatus.needsUser => 'Needs you',
      MissionStatus.verifying => 'Verifying',
      MissionStatus.paused => 'Paused',
      MissionStatus.blocked => 'Blocked',
      MissionStatus.failed => 'Failed',
      MissionStatus.cancelled => 'Cancelled',
      MissionStatus.completed => 'Completed',
    };

String actionStatusLabel(ActionStatus status) => switch (status) {
      ActionStatus.pending => 'Pending',
      ActionStatus.authorized => 'Authorized',
      ActionStatus.running => 'Running',
      ActionStatus.waiting => 'Waiting',
      ActionStatus.succeeded => 'Succeeded',
      ActionStatus.failed => 'Failed',
      ActionStatus.cancelled => 'Cancelled',
      ActionStatus.verifying => 'Verifying',
      ActionStatus.verified => 'Verified',
      ActionStatus.committed => 'Committed',
    };
