import 'package:flutter_test/flutter_test.dart';
import 'package:nexo_followthrough/application/execution_gateway.dart';
import 'package:nexo_followthrough/application/demo_provider_adapters.dart';
import 'package:nexo_followthrough/domain/execution_gateway.dart';

void main() {
  ExecutionRequest request(String provider) => ExecutionRequest(
        missionId: 'M-1',
        actionId: 'A-1',
        actionVersion: 3,
        organizationId: 'ORG-1',
        authorityPassportId: 'P-1',
        agentId: 'AG-1',
        provider: provider,
        model: 'model-1',
        instruction: 'Do bounded work',
        input: const {},
      );

  test('executes through the requested provider adapter', () async {
    final gateway = ExecutionGateway(adapters: {
      'openai': const DemoProviderAdapter('openai', 'gpt-demo'),
      'google': const DemoProviderAdapter('google', 'gemini-demo'),
    });
    final result = await gateway.execute(request('openai'));
    expect(result.provider, 'openai');
    expect(result.completed, isTrue);
  });

  test('provider can change without changing mission authority identifiers',
      () async {
    final gateway = ExecutionGateway(adapters: {
      'openai': const DemoProviderAdapter('openai', 'gpt-demo'),
      'google': const DemoProviderAdapter('google', 'gemini-demo'),
    });
    final a = await gateway.execute(request('openai'));
    final b = await gateway.execute(request('google'));
    expect(a.provider, 'openai');
    expect(b.provider, 'google');
    expect(a.providerRunId, isNot(b.providerRunId));
    expect(request('openai').missionId, request('google').missionId);
    expect(request('openai').authorityPassportId,
        request('google').authorityPassportId);
  });

  test('unapproved provider fails closed', () async {
    final gateway = ExecutionGateway(adapters: {
      'openai': const DemoProviderAdapter('openai', 'gpt-demo'),
    });
    expect(() => gateway.execute(request('unknown')),
        throwsA(isA<ProviderUnavailableException>()));
  });

  test('unapproved provider does not silently fall back to another provider',
      () async {
    final gateway = ExecutionGateway(adapters: {
      'google': const DemoProviderAdapter('google', 'gemini-demo'),
    });
    expect(() => gateway.execute(request('openai')),
        throwsA(isA<ProviderUnavailableException>()));
  });
}
