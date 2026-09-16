/// Provider/model capability metadata used for routing intelligence.
/// Routing is a hint and never grants authority.
class IntelligenceProfile {
  final String providerId;
  final String modelId;
  final Set<String> capabilities;
  final double estimatedCostPerUnit;
  final int latencyMs;
  final int riskCeiling;
  final bool available;
  const IntelligenceProfile(
      {required this.providerId,
      required this.modelId,
      required this.capabilities,
      required this.estimatedCostPerUnit,
      required this.latencyMs,
      required this.riskCeiling,
      this.available = true});
}

class MissionIntelligenceRequest {
  final Set<String> requiredCapabilities;
  final double maxEstimatedCostPerUnit;
  final int maxLatencyMs;
  final int riskLevel;
  final String? preferredProvider;
  const MissionIntelligenceRequest(
      {required this.requiredCapabilities,
      required this.maxEstimatedCostPerUnit,
      required this.maxLatencyMs,
      required this.riskLevel,
      this.preferredProvider});
}

class IntelligenceRoute {
  final IntelligenceProfile profile;
  final double score;
  final List<String> reasons;
  const IntelligenceRoute(
      {required this.profile, required this.score, required this.reasons});
}

class IntelligenceRouteDenied implements Exception {
  final String message;
  const IntelligenceRouteDenied(this.message);
  @override
  String toString() => message;
}
