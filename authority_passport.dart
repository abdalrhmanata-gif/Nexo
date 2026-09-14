import 'dart:convert';
import 'package:crypto/crypto.dart';

/// Portable, verifiable authority envelope. The passport grants no new
/// authority; it proves the authority already delegated to a mission.
class AuthorityPassport {
  final String passportId;
  final int schemaVersion;
  final String organizationId;
  final String principalId;
  final String missionId;
  final String delegationId;
  final String authorityRevision;
  final String? agentId;
  final List<String> allowedActions;
  final List<String> deniedActions;
  final int maxActions;
  final double maxSpend;
  final String currency;
  final DateTime issuedAt;
  final DateTime expiresAt;
  final String status;
  final String claimsHash;
  final String keyId;
  final String signatureAlgorithm;
  final String signature;

  const AuthorityPassport({
    required this.passportId,
    required this.schemaVersion,
    required this.organizationId,
    required this.principalId,
    required this.missionId,
    required this.delegationId,
    required this.authorityRevision,
    required this.agentId,
    required this.allowedActions,
    required this.deniedActions,
    required this.maxActions,
    required this.maxSpend,
    required this.currency,
    required this.issuedAt,
    required this.expiresAt,
    required this.status,
    required this.claimsHash,
    required this.keyId,
    required this.signatureAlgorithm,
    required this.signature,
  });

  Map<String, dynamic> unsignedClaims() => {
    'schema_version': schemaVersion,
    'passport_id': passportId,
    'organization_id': organizationId,
    'principal_id': principalId,
    'mission_id': missionId,
    'delegation_id': delegationId,
    'authority_revision': authorityRevision,
    'agent_id': agentId,
    'allowed_actions': [...allowedActions]..sort(),
    'denied_actions': [...deniedActions]..sort(),
    'max_actions': maxActions,
    'max_spend': maxSpend,
    'currency': currency,
    'issued_at': issuedAt.toUtc().toIso8601String(),
    'expires_at': expiresAt.toUtc().toIso8601String(),
    'status': status,
  };

  String canonicalClaims() => jsonEncode(unsignedClaims());

  static String computeClaimsHash(Map<String, dynamic> claims) =>
      sha256.convert(utf8.encode(jsonEncode(claims))).toString();
}
