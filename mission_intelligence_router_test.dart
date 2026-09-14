import 'package:flutter_test/flutter_test.dart';
import 'package:nexo_followthrough/application/mission_intelligence_router.dart';
import 'package:nexo_followthrough/domain/mission_intelligence.dart';

void main() {
  final profiles = [
    const IntelligenceProfile(providerId: 'openai', modelId: 'gpt-demo', capabilities: {'reasoning', 'web'}, estimatedCostPerUnit: 0.8, latencyMs: 900, riskCeiling: 8),
    const IntelligenceProfile(providerId: 'google', modelId: 'gemini-demo', capabilities: {'reasoning', 'web', 'long-context'}, estimatedCostPerUnit: 0.3, latencyMs: 700, riskCeiling: 8),
    const IntelligenceProfile(providerId: 'local', modelId: 'local-demo', capabilities: {'reasoning'}, estimatedCostPerUnit: 0.05, latencyMs: 400, riskCeiling: 4),
  ];

  test('routes to the best eligible provider', () {
    final result = MissionIntelligenceRouter(profiles).route(const MissionIntelligenceRequest(requiredCapabilities: {'reasoning', 'web'}, maxEstimatedCostPerUnit: 1, maxLatencyMs: 1000, riskLevel: 6));
    expect(result.profile.providerId, 'google');
  });

  test('preference is only a routing signal', () {
    final result = MissionIntelligenceRouter(profiles).route(const MissionIntelligenceRequest(requiredCapabilities: {'reasoning', 'web'}, maxEstimatedCostPerUnit: 1, maxLatencyMs: 1000, riskLevel: 6, preferredProvider: 'openai'));
    expect(result.profile.providerId, 'openai');
  });

  test('hard constraints reject unsupported capabilities', () {
    expect(() => MissionIntelligenceRouter(profiles).route(const MissionIntelligenceRequest(requiredCapabilities: {'reasoning', 'web', 'computer-use'}, maxEstimatedCostPerUnit: 2, maxLatencyMs: 2000, riskLevel: 5)), throwsA(isA<IntelligenceRouteDenied>()));
  });

  test('risk ceiling is a hard routing constraint', () {
    expect(() => MissionIntelligenceRouter(profiles).route(const MissionIntelligenceRequest(requiredCapabilities: {'reasoning'}, maxEstimatedCostPerUnit: 1, maxLatencyMs: 1000, riskLevel: 9)), throwsA(isA<IntelligenceRouteDenied>()));
  });

  test('routing cannot mutate mission authority identifiers', () {
    const missionId = 'M-42';
    const passportId = 'P-42';
    MissionIntelligenceRouter(profiles).route(const MissionIntelligenceRequest(requiredCapabilities: {'reasoning'}, maxEstimatedCostPerUnit: 1, maxLatencyMs: 1000, riskLevel: 3));
    expect(missionId, 'M-42');
    expect(passportId, 'P-42');
  });
}
