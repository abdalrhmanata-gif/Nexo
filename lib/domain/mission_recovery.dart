import 'mission_kernel.dart';
import 'mission_runtime.dart';

/// v1.2 crash/recovery contract. No external I/O is performed here.
enum RecoveryDisposition { resume, reconcile, stop }

enum ExternalOutcomeState {
  notSent,
  sentUnknown,
  confirmedSuccess,
  confirmedFailure
}

class MissionRecoveryRecord {
  final String missionId;
  final String organizationId;
  final int checkpointVersion;
  final String checkpointId;
  final String stateDigest;
  final String authorityPassportId;
  final String delegationId;
  final int remainingActions;
  final double remainingBudget;
  final ExternalOutcomeState externalOutcome;
  final RecoveryDisposition disposition;

  const MissionRecoveryRecord({
    required this.missionId,
    required this.organizationId,
    required this.checkpointVersion,
    required this.checkpointId,
    required this.stateDigest,
    required this.authorityPassportId,
    required this.delegationId,
    required this.remainingActions,
    required this.remainingBudget,
    required this.externalOutcome,
    required this.disposition,
  });
}

class MissionRecoveryException implements Exception {
  final String code;
  const MissionRecoveryException(this.code);
  @override
  String toString() => code;
}

class MissionRecoveryPlanner {
  const MissionRecoveryPlanner();

  MissionRecoveryRecord prepare(
    MissionKernelSnapshot snapshot, {
    required ExternalOutcomeState externalOutcome,
  }) {
    if (snapshot.version < 0 || snapshot.checkpointId == null) {
      throw const MissionRecoveryException('INVALID_DURABLE_CHECKPOINT');
    }
    if (snapshot.stateDigest.isEmpty) {
      throw const MissionRecoveryException('MISSING_STATE_DIGEST');
    }
    if (externalOutcome == ExternalOutcomeState.sentUnknown) {
      return MissionRecoveryRecord(
        missionId: snapshot.missionId,
        organizationId: snapshot.organizationId,
        checkpointVersion: snapshot.version,
        checkpointId: snapshot.checkpointId!,
        stateDigest: snapshot.stateDigest,
        authorityPassportId: snapshot.authorityPassportId,
        delegationId: snapshot.delegationId,
        remainingActions: snapshot.remainingActions,
        remainingBudget: snapshot.remainingBudget,
        externalOutcome: externalOutcome,
        disposition: RecoveryDisposition.reconcile,
      );
    }
    return MissionRecoveryRecord(
      missionId: snapshot.missionId,
      organizationId: snapshot.organizationId,
      checkpointVersion: snapshot.version,
      checkpointId: snapshot.checkpointId!,
      stateDigest: snapshot.stateDigest,
      authorityPassportId: snapshot.authorityPassportId,
      delegationId: snapshot.delegationId,
      remainingActions: snapshot.remainingActions,
      remainingBudget: snapshot.remainingBudget,
      externalOutcome: externalOutcome,
      disposition: snapshot.runtimeState == MissionRuntimeState.completed ||
              snapshot.runtimeState == MissionRuntimeState.cancelled ||
              snapshot.runtimeState == MissionRuntimeState.failed
          ? RecoveryDisposition.stop
          : RecoveryDisposition.resume,
    );
  }
}
