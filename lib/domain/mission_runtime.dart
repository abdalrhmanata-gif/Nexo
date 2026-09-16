/// v1.0 Mission Runtime Contract.
/// A mission is durable state, not a chat turn. Runtime transitions are
/// fail-closed and never grant authority.
enum MissionRuntimeState {
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
  completed,
}

enum RuntimeEventType {
  start,
  wait,
  userRequired,
  resume,
  pause,
  verify,
  complete,
  fail,
  cancel,
  block,
}

class MissionRuntimeTransition {
  final MissionRuntimeState from;
  final RuntimeEventType event;
  final MissionRuntimeState to;

  const MissionRuntimeTransition(this.from, this.event, this.to);
}

class MissionRuntimeContract {
  const MissionRuntimeContract();

  MissionRuntimeState apply(
    MissionRuntimeState state,
    RuntimeEventType event,
  ) {
    final next = _transitions[state]?[event];
    if (next == null) {
      throw StateError(
          'INVALID_RUNTIME_TRANSITION:${state.name}:${event.name}');
    }
    return next;
  }

  static const _transitions =
      <MissionRuntimeState, Map<RuntimeEventType, MissionRuntimeState>>{
    MissionRuntimeState.draft: {
      RuntimeEventType.start: MissionRuntimeState.planning,
    },
    MissionRuntimeState.planning: {
      RuntimeEventType.start: MissionRuntimeState.ready,
      RuntimeEventType.fail: MissionRuntimeState.failed,
      RuntimeEventType.block: MissionRuntimeState.blocked,
    },
    MissionRuntimeState.ready: {
      RuntimeEventType.start: MissionRuntimeState.running,
      RuntimeEventType.pause: MissionRuntimeState.paused,
      RuntimeEventType.cancel: MissionRuntimeState.cancelled,
    },
    MissionRuntimeState.running: {
      RuntimeEventType.wait: MissionRuntimeState.waiting,
      RuntimeEventType.userRequired: MissionRuntimeState.needsUser,
      RuntimeEventType.verify: MissionRuntimeState.verifying,
      RuntimeEventType.pause: MissionRuntimeState.paused,
      RuntimeEventType.block: MissionRuntimeState.blocked,
      RuntimeEventType.fail: MissionRuntimeState.failed,
      RuntimeEventType.cancel: MissionRuntimeState.cancelled,
    },
    MissionRuntimeState.waiting: {
      RuntimeEventType.resume: MissionRuntimeState.running,
      RuntimeEventType.fail: MissionRuntimeState.failed,
      RuntimeEventType.cancel: MissionRuntimeState.cancelled,
    },
    MissionRuntimeState.needsUser: {
      RuntimeEventType.resume: MissionRuntimeState.running,
      RuntimeEventType.pause: MissionRuntimeState.paused,
      RuntimeEventType.cancel: MissionRuntimeState.cancelled,
    },
    MissionRuntimeState.verifying: {
      RuntimeEventType.complete: MissionRuntimeState.completed,
      RuntimeEventType.fail: MissionRuntimeState.failed,
    },
    MissionRuntimeState.paused: {
      RuntimeEventType.resume: MissionRuntimeState.running,
      RuntimeEventType.cancel: MissionRuntimeState.cancelled,
    },
    MissionRuntimeState.blocked: {
      RuntimeEventType.start: MissionRuntimeState.running,
      RuntimeEventType.cancel: MissionRuntimeState.cancelled,
    },
    MissionRuntimeState.failed: {
      RuntimeEventType.start: MissionRuntimeState.planning,
      RuntimeEventType.cancel: MissionRuntimeState.cancelled,
    },
  };
}
