class MissionRuntimeEvent {
  final String eventId;
  final String missionId;
  final int expectedVersion;
  final int resultingVersion;
  final String eventType;
  final String actorType;
  final String? actorId;
  final String correlationId;
  final String? causationId;
  final DateTime createdAt;

  const MissionRuntimeEvent({
    required this.eventId,
    required this.missionId,
    required this.expectedVersion,
    required this.resultingVersion,
    required this.eventType,
    required this.actorType,
    required this.actorId,
    required this.correlationId,
    required this.causationId,
    required this.createdAt,
  });
}
