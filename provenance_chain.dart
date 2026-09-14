import 'dart:convert';
import 'package:crypto/crypto.dart';
import '../domain/provenance_event.dart';

class ProvenanceChain {
  final List<ProvenanceEvent> _events = [];

  List<ProvenanceEvent> get events => List.unmodifiable(_events);

  String _hash(String value) =>
      sha256.convert(utf8.encode(value)).toString();

  ProvenanceEvent append({
    required String missionId,
    required String organizationId,
    required ProvenanceEventType type,
    required String actorType,
    required String actorId,
    required Map<String, dynamic> payload,
    required String correlationId,
    String? causationId,
    DateTime? createdAt,
  }) {
    final previous = _events.isEmpty ? 'GENESIS' : _events.last.eventHash;
    final sequence = _events.length + 1;
    final payloadHash = _hash(jsonEncode(payload));
    final canonical = [
      missionId, organizationId, sequence, type.name, actorType, actorId,
      payloadHash, previous, correlationId, causationId ?? ''
    ].join('|');
    final eventHash = _hash(canonical);

    final event = ProvenanceEvent(
      eventId: 'pe-$sequence',
      missionId: missionId,
      organizationId: organizationId,
      sequence: sequence,
      type: type,
      actorType: actorType,
      actorId: actorId,
      payloadHash: payloadHash,
      previousEventHash: previous,
      eventHash: eventHash,
      createdAt: createdAt ?? DateTime.now().toUtc(),
      correlationId: correlationId,
      causationId: causationId,
    );
    _events.add(event);
    return event;
  }

  bool verifyIntegrity() {
    String previous = 'GENESIS';
    for (final e in _events) {
      if (e.previousEventHash != previous) return false;
      final canonical = [
        e.missionId, e.organizationId, e.sequence, e.type.name,
        e.actorType, e.actorId, e.payloadHash, e.previousEventHash,
        e.correlationId, e.causationId ?? ''
      ].join('|');
      if (_hash(canonical) != e.eventHash) return false;
      previous = e.eventHash;
    }
    return true;
  }

  ProvenanceEvent? findByCorrelation(String correlationId) {
    for (final e in _events) {
      if (e.correlationId == correlationId) return e;
    }
    return null;
  }
}
