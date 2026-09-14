/// Provider-agnostic execution contract.
/// NEXO owns mission authority; providers only receive an already-bounded request.
class ExecutionRequest {
  final String missionId;
  final String actionId;
  final int actionVersion;
  final String organizationId;
  final String authorityPassportId;
  final String agentId;
  final String provider;
  final String model;
  final String instruction;
  final Map<String, dynamic> input;

  const ExecutionRequest({
    required this.missionId,
    required this.actionId,
    required this.actionVersion,
    required this.organizationId,
    required this.authorityPassportId,
    required this.agentId,
    required this.provider,
    required this.model,
    required this.instruction,
    required this.input,
  });
}

class ExecutionResponse {
  final String provider;
  final String model;
  final String providerRunId;
  final String output;
  final bool completed;

  const ExecutionResponse({
    required this.provider,
    required this.model,
    required this.providerRunId,
    required this.output,
    required this.completed,
  });
}

abstract interface class AgentProviderAdapter {
  String get providerId;
  Future<ExecutionResponse> execute(ExecutionRequest request);
}

class ProviderUnavailableException implements Exception {
  final String message;
  const ProviderUnavailableException(this.message);
  @override
  String toString() => message;
}
