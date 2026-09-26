import 'package:flutter_test/flutter_test.dart';
import 'package:zavqera_followthrough/application/execution_gateway.dart';
import 'package:zavqera_followthrough/domain/execution_gateway.dart';
import 'package:zavqera_followthrough/domain/execution_protocol.dart';

class _ControlledProvider implements AgentProviderAdapter {
  @override
  final String providerId;
  final bool completed;

  _ControlledProvider(this.providerId, {required this.completed});

  @override
  Future<ExecutionResponse> execute(ExecutionRequest request) async {
    return ExecutionResponse(
      provider: providerId,
      model: request.model,
      providerRunId: 'run-${request.actionId}',
      output: completed ? 'accepted' : 'ambiguous',
      completed: completed,
    );
  }
}

ExecutionRequest request() => const ExecutionRequest(
      missionId: 'm1',
      actionId: 'a1',
      actionVersion: 1,
      organizationId: 'o1',
      authorityPassportId: 'p1',
      agentId: 'agent',
      provider: 'provider-a',
      model: 'model',
      instruction: 'execute bounded action',
      input: {'x': 1},
    );

void main() {
  test('approved provider preserves the ZAVQERA execution boundary', () async {
    final gateway = ExecutionGateway(
      adapters: {
        'provider-a': _ControlledProvider('provider-a', completed: false),
      },
    );

    final response = await gateway.execute(request());

    expect(response.provider, 'provider-a');
    expect(response.completed, isFalse);

    final receipt = ExternalOutcomeReceipt(
      envelopeId: 'e1',
      classification: ExternalOutcomeClassification.unknown,
      externalReference: response.providerRunId,
      responseHash: null,
      observedAt: DateTime.utc(2026, 1, 1),
      errorCode: 'AMBIGUOUS_PROVIDER_RESULT',
    );

    expect(receipt.requiresReconciliation, isTrue);
    expect(receipt.mayRetryAutomatically, isFalse);
  });

  test('provider substitution is fail-closed', () {
    final gateway = ExecutionGateway(
      adapters: {
        'provider-a': _ControlledProvider('provider-a', completed: true),
      },
    );

    const mismatched = ExecutionRequest(
      missionId: 'm1',
      actionId: 'a1',
      actionVersion: 1,
      organizationId: 'o1',
      authorityPassportId: 'p1',
      agentId: 'agent',
      provider: 'provider-b',
      model: 'model',
      instruction: 'execute bounded action',
      input: {'x': 1},
    );

    expect(
      () => gateway.execute(mismatched),
      throwsA(isA<ProviderUnavailableException>()),
    );
  });
}
