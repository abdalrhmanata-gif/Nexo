import '../domain/execution_gateway.dart';

/// ZAVQERA gateway: provider selection is replaceable; authority remains outside
/// the provider adapter. A provider cannot mint, enlarge, or redefine ZAVQERA authority.
class ExecutionGateway {
  final Map<String, AgentProviderAdapter> adapters;
  final ProviderSelector selector;

  const ExecutionGateway(
      {required this.adapters, this.selector = const ProviderSelector()});

  Future<ExecutionResponse> execute(ExecutionRequest request) async {
    final provider = selector.select(request.provider, adapters.keys.toSet());
    final adapter = adapters[provider];
    if (adapter == null) {
      throw ProviderUnavailableException(
          'No approved adapter for provider: $provider');
    }
    return adapter.execute(request);
  }
}

class ProviderSelector {
  const ProviderSelector();

  String select(String preferred, Set<String> available) {
    if (available.contains(preferred)) return preferred;
    throw ProviderUnavailableException(
        'Requested provider is not approved: $preferred');
  }
}
