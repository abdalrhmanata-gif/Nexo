import '../domain/mission_runtime.dart';

class MissionRuntimeEngine {
  final MissionRuntimeContract contract;
  const MissionRuntimeEngine({this.contract = const MissionRuntimeContract()});

  MissionRuntimeState transition({
    required MissionRuntimeState state,
    required RuntimeEventType event,
    required int expectedVersion,
    required int actualVersion,
  }) {
    if (expectedVersion != actualVersion) {
      throw StateError('STALE_MISSION_VERSION');
    }
    return contract.apply(state, event);
  }
}
