import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../domain/mission.dart';
import '../domain/mission_ledger.dart';

abstract interface class LocalMissionStore {
  Future<String?> read();
  Future<void> write(String value);
  Future<void> clear();
}

class SharedPreferencesMissionStore implements LocalMissionStore {
  static const _key = 'nexo.local_mission.v1';
  final SharedPreferencesAsync _preferences;

  SharedPreferencesMissionStore([SharedPreferencesAsync? preferences])
      : _preferences = preferences ?? SharedPreferencesAsync();

  @override
  Future<String?> read() => _preferences.getString(_key);

  @override
  Future<void> write(String value) => _preferences.setString(_key, value);

  @override
  Future<void> clear() => _preferences.remove(_key);
}

class MissionStorageCodec {
  const MissionStorageCodec();

  String encode(Mission mission) =>
      encodeCollection([LocalMissionState(mission: mission, ledger: const [])]);

  String encodeState(
    Mission mission,
    List<MissionLedgerEntry> ledger,
  ) =>
      encodeCollection([LocalMissionState(mission: mission, ledger: ledger)]);

  String encodeCollection(List<LocalMissionState> states) => jsonEncode({
        'version': 2,
        'missions': states.map(_encodeState).toList(),
      });

  Map<String, Object?> _encodeState(LocalMissionState state) => {
        'mission': jsonDecode(_encodeMission(state.mission)),
        'ledger': state.ledger
            .map((entry) => {
                  'id': entry.id,
                  'missionId': entry.missionId,
                  'type': entry.type.name,
                  'occurredAt': entry.occurredAt.toIso8601String(),
                  'actor': entry.actor,
                  'summary': entry.summary,
                  'data': entry.data,
                })
            .toList(),
      };

  String _encodeMission(Mission mission) => jsonEncode({
        'id': mission.id,
        'objective': mission.objective,
        'status': mission.status.name,
        'maxCost': mission.maxCost,
        'currentCost': mission.currentCost,
        'maxActions': mission.maxActions,
        'actionCount': mission.actionCount,
        'maxRetries': mission.maxRetries,
        'nextActionAt': mission.nextActionAt?.toIso8601String(),
        'leaseExpiresAt': mission.leaseExpiresAt?.toIso8601String(),
        'authorityApproved': mission.authorityApproved,
        'leaseId': mission.leaseId,
        'delegationId': mission.delegationId,
        'authoritySummary': mission.authoritySummary,
        'actions': mission.actions
            .map((action) => {
                  'id': action.id,
                  'title': action.title,
                  'authorityClass': action.authorityClass,
                  'status': action.status.name,
                  'requiresApproval': action.requiresApproval,
                  'requiresVerification': action.requiresVerification,
                  'outcomeNote': action.outcomeNote,
                  'followUpAt': action.followUpAt?.toIso8601String(),
                })
            .toList(),
      });

  Mission decode(String value) => decodeState(value).mission;

  LocalMissionState decodeState(String value) {
    final states = decodeCollection(value);
    if (states.length != 1) {
      throw const FormatException('Expected one mission.');
    }
    return states.single;
  }

  List<LocalMissionState> decodeCollection(String value) {
    final raw = jsonDecode(value);
    if (raw is! Map<String, dynamic>) {
      throw const FormatException('Invalid mission storage envelope.');
    }
    if (raw['missions'] is List) {
      return (raw['missions'] as List)
          .map((entry) => _decodeState(entry as Map<String, dynamic>))
          .toList(growable: false);
    }
    return [_decodeState(raw)];
  }

  LocalMissionState _decodeState(Map<String, dynamic> raw) {
    final missionRaw = raw['mission'] is Map<String, dynamic>
        ? raw['mission'] as Map<String, dynamic>
        : raw;
    final mission = _decodeMission(missionRaw);
    final ledgerRaw = raw['ledger'];
    if (ledgerRaw != null && ledgerRaw is! List) {
      throw const FormatException('Invalid mission ledger storage.');
    }
    final ledger = (ledgerRaw as List? ?? const []).map((entry) {
      final item = entry as Map<String, dynamic>;
      return MissionLedgerEntry(
        id: item['id'] as String,
        missionId: item['missionId'] as String,
        type: LedgerEventType.values.byName(item['type'] as String),
        occurredAt: DateTime.parse(item['occurredAt'] as String),
        actor: item['actor'] as String,
        summary: item['summary'] as String,
        data: Map<String, Object?>.from(item['data'] as Map),
      );
    }).toList(growable: false);
    return LocalMissionState(mission: mission, ledger: ledger);
  }

  Mission _decodeMission(Map<String, dynamic> raw) {
    if (raw['actions'] is! List) {
      throw const FormatException('Invalid mission actions.');
    }
    DateTime? date(Object? value) =>
        value == null ? null : DateTime.parse(value as String);
    ActionStatus actionStatus(Object? value) =>
        ActionStatus.values.byName(value as String);
    return Mission(
      id: raw['id'] as String,
      objective: raw['objective'] as String,
      status: MissionStatus.values.byName(raw['status'] as String),
      maxCost: (raw['maxCost'] as num?)?.toDouble(),
      currentCost: (raw['currentCost'] as num).toDouble(),
      maxActions: raw['maxActions'] as int?,
      actionCount: raw['actionCount'] as int,
      maxRetries: raw['maxRetries'] as int,
      nextActionAt: date(raw['nextActionAt']),
      leaseExpiresAt: date(raw['leaseExpiresAt']),
      authorityApproved: raw['authorityApproved'] as bool,
      leaseId: raw['leaseId'] as String?,
      delegationId: raw['delegationId'] as String?,
      authoritySummary: raw['authoritySummary'] as String,
      actions: (raw['actions'] as List).map((entry) {
        final action = entry as Map<String, dynamic>;
        return MissionAction(
          id: action['id'] as String,
          title: action['title'] as String,
          authorityClass: action['authorityClass'] as String,
          status: actionStatus(action['status']),
          requiresApproval: action['requiresApproval'] as bool,
          requiresVerification: action['requiresVerification'] as bool,
          outcomeNote: action['outcomeNote'] as String?,
          followUpAt: date(action['followUpAt']),
        );
      }).toList(growable: false),
    );
  }
}

class LocalMissionState {
  final Mission mission;
  final List<MissionLedgerEntry> ledger;

  const LocalMissionState({required this.mission, required this.ledger});
}
