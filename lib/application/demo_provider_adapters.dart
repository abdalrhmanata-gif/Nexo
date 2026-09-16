import '../domain/execution_gateway.dart';

/// Demo adapters only. Real adapters must live behind the server-side
/// NEXO authorization + secret boundary and must never receive raw authority.
class DemoProviderAdapter implements AgentProviderAdapter {
  @override
  final String providerId;
  final String modelName;

  const DemoProviderAdapter(this.providerId, this.modelName);

  @override
  Future<ExecutionResponse> execute(ExecutionRequest request) async {
    return ExecutionResponse(
      provider: providerId,
      model: modelName,
      providerRunId: '$providerId-${request.actionId}-${request.actionVersion}',
      output: 'Demo execution completed by $providerId/$modelName.',
      completed: true,
    );
  }
}
