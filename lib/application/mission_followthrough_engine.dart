import '../domain/action_revision.dart';
import '../domain/authorization.dart';
import '../domain/execution_gateway.dart' as domain;
import '../domain/execution_lease.dart';
import '../domain/verification_outcome.dart';
import 'execution_gateway.dart';
import 'mission_control_boundary.dart';

/// Port for ZAVQERA-owned verification. Implementations may later use storage,
/// webhooks, or provider-specific evidence without changing this orchestration.
abstract interface class FollowThroughVerifier {
  Future<VerificationResult> verify({
    required domain.ExecutionResponse execution,
    required VerificationContract contract,
  });
}

/// Coordinates the bounded application-layer path after a mission is approved.
/// It does not provide production authorization or external infrastructure.
class MissionFollowThroughEngine {
  final MissionControlBoundary controlBoundary;
  final VerificationOutcomeProtocol verificationProtocol;
  final ExecutionGateway executionGateway;

  const MissionFollowThroughEngine({
    this.controlBoundary = const MissionControlBoundary(),
    this.verificationProtocol = const VerificationOutcomeProtocol(),
    required this.executionGateway,
  });

  Future<OutcomeCommitResult> executeAndCommit({
    required AuthorizationResult policyDecision,
    required ExecutionLease lease,
    required ActionRevision action,
    required domain.ExecutionRequest request,
    required VerificationContract verificationContract,
    required OutcomeCommitRequest outcome,
    required FollowThroughVerifier verifier,
    DateTime? now,
  }) async {
    if (request.missionId != action.missionId ||
        request.actionId != action.actionId ||
        request.actionVersion != action.version ||
        verificationContract.missionId != action.missionId ||
        verificationContract.actionId != action.actionId ||
        verificationContract.executionInputHash != action.inputHash) {
      throw StateError('ACTION_EXECUTION_BINDING_MISMATCH');
    }

    final authorization = controlBoundary.authorizeImmediatelyBeforeIo(
      policyDecision: policyDecision,
      lease: lease,
      action: action,
      now: now,
    );
    if (authorization.decision != AuthorizationDecision.allow) {
      throw StateError('AUTHORIZATION_DENIED:${authorization.reason}');
    }

    final execution = await executionGateway.execute(request);
    if (!execution.completed) {
      throw StateError('EXECUTION_NOT_COMPLETED');
    }

    final verification = await verifier.verify(
      execution: execution,
      contract: verificationContract,
    );
    verificationProtocol.validateVerification(verification, now: now);
    return verificationProtocol.commit(outcome, verification);
  }
}
