import '../domain/mission_intelligence.dart';

/// Selects intelligence for a mission. It never owns or changes authority.
class MissionIntelligenceRouter {
  final List<IntelligenceProfile> profiles;
  const MissionIntelligenceRouter(this.profiles);

  IntelligenceRoute route(MissionIntelligenceRequest request) {
    final candidates = profiles.where((p) =>
      p.available &&
      p.capabilities.containsAll(request.requiredCapabilities) &&
      p.estimatedCostPerUnit <= request.maxEstimatedCostPerUnit &&
      p.latencyMs <= request.maxLatencyMs &&
      p.riskCeiling >= request.riskLevel,
    ).toList();
    if (candidates.isEmpty) throw const IntelligenceRouteDenied('No intelligence provider satisfies the mission routing constraints.');
    candidates.sort((a, b) => _score(b, request).compareTo(_score(a, request)));
    final selected = candidates.first;
    final reasons = <String>['capabilities satisfied', 'cost within routing ceiling', 'latency within routing ceiling', 'risk tier supported'];
    if (request.preferredProvider == selected.providerId) reasons.add('preferred provider matched');
    return IntelligenceRoute(profile: selected, score: _score(selected, request), reasons: reasons);
  }

  double _score(IntelligenceProfile p, MissionIntelligenceRequest r) {
    final capabilityScore = r.requiredCapabilities.isEmpty ? 1.0 : p.capabilities.intersection(r.requiredCapabilities).length / r.requiredCapabilities.length;
    final costScore = 1 - (p.estimatedCostPerUnit / r.maxEstimatedCostPerUnit).clamp(0.0, 1.0);
    final latencyScore = 1 - (p.latencyMs / r.maxLatencyMs).clamp(0.0, 1.0);
    final riskFit = 1 - ((p.riskCeiling - r.riskLevel).abs() / 10).clamp(0.0, 1.0);
    final preference = r.preferredProvider == p.providerId ? 0.08 : 0.0;
    return capabilityScore * 0.55 + costScore * 0.18 + latencyScore * 0.17 + riskFit * 0.10 + preference;
  }
}
