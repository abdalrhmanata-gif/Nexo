import 'package:flutter_test/flutter_test.dart';
import 'package:nexo_followthrough/domain/mission_runtime.dart';
import 'package:nexo_followthrough/application/mission_runtime_engine.dart';

void main() {
  const engine = MissionRuntimeEngine();

  test('long-running mission enters waiting and resumes', () {
    final waiting = engine.transition(
      state: MissionRuntimeState.running,
      event: RuntimeEventType.wait,
      expectedVersion: 7,
      actualVersion: 7,
    );
    expect(waiting, MissionRuntimeState.waiting);
    final resumed = engine.transition(
      state: waiting,
      event: RuntimeEventType.resume,
      expectedVersion: 8,
      actualVersion: 8,
    );
    expect(resumed, MissionRuntimeState.running);
  });

  test('stale version is fail-closed', () {
    expect(
      () => engine.transition(
        state: MissionRuntimeState.running,
        event: RuntimeEventType.pause,
        expectedVersion: 3,
        actualVersion: 4,
      ),
      throwsA(isA<StateError>()),
    );
  });

  test('cannot complete without verification state', () {
    expect(
      () => engine.transition(
        state: MissionRuntimeState.running,
        event: RuntimeEventType.complete,
        expectedVersion: 9,
        actualVersion: 9,
      ),
      throwsA(isA<StateError>()),
    );
  });
}
