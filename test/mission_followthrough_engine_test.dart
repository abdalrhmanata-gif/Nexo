import 'package:flutter_test/flutter_test.dart';
import 'package:zavqera_followthrough/application/demo_provider_adapters.dart';
import 'package:zavqera_followthrough/application/execution_gateway.dart';
import 'package:zavqera_followthrough/application/mission_followthrough_engine.dart';
import 'package:zavqera_followthrough/domain/action_revision.dart';
import 'package:zavqera_followthrough/domain/authorization.dart';
import 'package:zavqera_followthrough/domain/execution_gateway.dart' as domain;
import 'package:zavqera_followthrough/domain/execution_lease.dart';
import 'package:zavqera_followthrough/domain/verification_outcome.dart';

final _now = DateTime.utc(2026, 9, 16, 12);

ExecutionLease _lease({DateTime? expiresAt}) => ExecutionLease(
      id: 'lease-1',
      missionId: 'mission-1',
      delegationId: 'delegation-1',
      agentId: 'agent-1',
      allowedActions: const {'WRITE'},
      allowedTools: const {'mail.send'},
      spendingLimit: 100,
      spendingUsed: 0,
      actionLimit: 5,
      actionsUsed: 0,
      issuedAt: _now.subtract(const Duration(minutes: 1)),
      expiresAt: expiresAt ?? _now.add(const Duration(minutes: 5)),
      status: ExecutionLeaseStatus.active,
      revokedAt: null,
    );

ActionRevision _action() => ActionRevision(
      actionId: 'action-1',
      version: 1,
      missionId: 'mission-1',
      authorityClass: 'WRITE',
      toolId: 'mail.send',
      inputHash: 'hash-1',
      createdAt: _now,
    );

domain.ExecutionRequest _request() => const domain.ExecutionRequest(
      missionId: 'mission-1',
      actionId: 'action-1',
      actionVersion: 1,
      organizationId: 'org-1',
      authorityPassportId: 'passport-1',
      agentId: 'agent-1',
      provider: 'demo',
      model: 'demo-model',
      instruction: 'send the approved message',
      input: {'body': 'hello'},
    );

VerificationContract _contract() => VerificationContract(
      verificationId: 'verification-1',
      organizationId: 'org-1',
      missionId: 'mission-1',
      actionId: 'action-1',
      executionRunId: 'run-1',
      executionInputHash: 'hash-1',
      criteriaHash: 'criteria-1',
      evidenceIds: ['evidence-1'],
      createdAt: _now,
    );

OutcomeCommitRequest _outcome({bool verified = true}) => OutcomeCommitRequest(
      organizationId: 'org-1',
      missionId: 'mission-1',
      goalId: 'goal-1',
      executionRunId: 'run-1',
      verificationId: 'verification-1',
      type: OutcomeType.success,
      status: OutcomeStatus.committed,
      result: const {'confirmed': true},
      successScore: 1,
      verified: verified,
      completedAt: _now,
    );

class _Verifier implements FollowThroughVerifier {
  final VerificationStatus status;
  const _Verifier(this.status);

  @override
  Future<VerificationResult> verify({
    required domain.ExecutionResponse execution,
    required VerificationContract contract,
  }) async =>
      VerificationResult(
        contract: contract,
        status: status,
        confidence: status == VerificationStatus.passed ? 1 : 0,
        rationale: status == VerificationStatus.passed
            ? 'Evidence confirms the success criteria.'
            : 'Evidence did not confirm the success criteria.',
        resolvedAt: _now,
      );
}

MissionFollowThroughEngine _engine({
  bool completed = true,
}) {
  return MissionFollowThroughEngine(
    executionGateway: ExecutionGateway(
      adapters: {
        'demo': _Adapter(
          DemoProviderAdapter('demo', 'demo-model'),
          completed: completed,
        ),
      },
    ),
  );
}

class _Adapter implements domain.AgentProviderAdapter {
  final domain.AgentProviderAdapter delegate;
  final bool completed;
  const _Adapter(this.delegate, {required this.completed});

  @override
  String get providerId => delegate.providerId;

  @override
  Future<domain.ExecutionResponse> execute(
      domain.ExecutionRequest request) async {
    final response = await delegate.execute(request);
    return domain.ExecutionResponse(
      provider: response.provider,
      model: response.model,
      providerRunId: response.providerRunId,
      output: response.output,
      completed: completed,
    );
  }
}

void main() {
  final allow = AuthorizationResult(
    decision: AuthorizationDecision.allow,
    reason: 'policy allow',
    evaluatedAt: _now,
    policyRevision: 'policy-1',
  );

  test('commits only a successfully verified execution', () async {
    final result = await _engine().executeAndCommit(
      policyDecision: allow,
      lease: _lease(),
      action: _action(),
      request: _request(),
      verificationContract: _contract(),
      outcome: _outcome(),
      verifier: const _Verifier(VerificationStatus.passed),
      now: _now,
    );

    expect(result.committed, isTrue);
    expect(result.outcomeId, 'out_run-1_verification-1');
  });

  test('rejects missing or expired authority before execution', () async {
    final denied = AuthorizationResult(
      decision: AuthorizationDecision.deny,
      reason: 'approval required',
      evaluatedAt: _now,
      policyRevision: 'policy-1',
    );
    expect(
      () => _engine().executeAndCommit(
        policyDecision: denied,
        lease: _lease(),
        action: _action(),
        request: _request(),
        verificationContract: _contract(),
        outcome: _outcome(),
        verifier: const _Verifier(VerificationStatus.passed),
        now: _now,
      ),
      throwsA(isA<StateError>()),
    );
    expect(
      () => _engine().executeAndCommit(
        policyDecision: allow,
        lease: _lease(expiresAt: _now),
        action: _action(),
        request: _request(),
        verificationContract: _contract(),
        outcome: _outcome(),
        verifier: const _Verifier(VerificationStatus.passed),
        now: _now,
      ),
      throwsA(isA<StateError>()),
    );
  });

  test('does not commit failed execution or failed verification', () async {
    expect(
      () => _engine(completed: false).executeAndCommit(
        policyDecision: allow,
        lease: _lease(),
        action: _action(),
        request: _request(),
        verificationContract: _contract(),
        outcome: _outcome(),
        verifier: const _Verifier(VerificationStatus.passed),
        now: _now,
      ),
      throwsA(isA<StateError>()),
    );
    expect(
      () => _engine().executeAndCommit(
        policyDecision: allow,
        lease: _lease(),
        action: _action(),
        request: _request(),
        verificationContract: _contract(),
        outcome: _outcome(),
        verifier: const _Verifier(VerificationStatus.failed),
        now: _now,
      ),
      throwsA(isA<VerificationOutcomeViolation>()),
    );
  });

  test('rejects an execution or evidence binding mismatch', () async {
    expect(
      () => _engine().executeAndCommit(
        policyDecision: allow,
        lease: _lease(),
        action: _action(),
        request: const domain.ExecutionRequest(
          missionId: 'mission-1',
          actionId: 'other-action',
          actionVersion: 1,
          organizationId: 'org-1',
          authorityPassportId: 'passport-1',
          agentId: 'agent-1',
          provider: 'demo',
          model: 'demo-model',
          instruction: 'send the approved message',
          input: {'body': 'hello'},
        ),
        verificationContract: _contract(),
        outcome: _outcome(),
        verifier: const _Verifier(VerificationStatus.passed),
        now: _now,
      ),
      throwsA(isA<StateError>()),
    );
  });
}
