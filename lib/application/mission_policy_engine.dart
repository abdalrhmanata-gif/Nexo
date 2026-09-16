import '../domain/mission_policy.dart';

/// Application boundary for governance decisions. This is deterministic and
/// side-effect free; production authorization must repeat server-side at JIT.
class MissionPolicyBoundary {
  final MissionPolicyEngine engine;
  const MissionPolicyBoundary(this.engine);

  PolicyDecision authorize(PolicyEvaluationRequest request, {DateTime? now}) =>
      engine.evaluate(request, now: now);
}
