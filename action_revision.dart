/// Immutable, security-relevant revision of an action.
/// Any change to authority class, tool, target, input or approval-sensitive
/// fields must create a new revision instead of mutating an approved one.
class ActionRevision {
  final String actionId;
  final int version;
  final String missionId;
  final String authorityClass;
  final String toolId;
  final String inputHash;
  final DateTime createdAt;

  const ActionRevision({
    required this.actionId,
    required this.version,
    required this.missionId,
    required this.authorityClass,
    required this.toolId,
    required this.inputHash,
    required this.createdAt,
  });

  String get bindingKey => '$actionId:$version:$inputHash';
}
