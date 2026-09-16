import 'dart:convert';
import 'package:crypto/crypto.dart';
import '../domain/authority_passport.dart';

abstract interface class AuthoritySigner {
  String get keyId;
  String get algorithm;
  String sign(String canonicalClaims);
  bool verify(String canonicalClaims, String signature);
}

/// Deterministic development signer only. It is deliberately NOT presented
/// as production asymmetric cryptography. Production adapters may implement
/// EdDSA/COSE/VC/JWS or another reviewed profile without changing the domain.
class DemoHmacSigner implements AuthoritySigner {
  @override
  final String keyId;
  final List<int> secret;

  DemoHmacSigner({required this.keyId, required this.secret});

  @override
  String get algorithm => 'HMAC-SHA256-DEMO';

  @override
  String sign(String canonicalClaims) =>
      Hmac(sha256, secret).convert(utf8.encode(canonicalClaims)).toString();

  @override
  bool verify(String canonicalClaims, String signature) =>
      sign(canonicalClaims) == signature;
}

class AuthorityPassportService {
  const AuthorityPassportService();

  AuthorityPassport issue({
    required String passportId,
    required String organizationId,
    required String principalId,
    required String missionId,
    required String delegationId,
    required String authorityRevision,
    required String agentId,
    required List<String> allowedActions,
    required List<String> deniedActions,
    required int maxActions,
    required double maxSpend,
    required String currency,
    required DateTime issuedAt,
    required DateTime expiresAt,
    required AuthoritySigner signer,
  }) {
    if (expiresAt.isBefore(issuedAt)) {
      throw ArgumentError('Passport expiry must be after issuance.');
    }
    if (maxActions < 0 || maxSpend < 0) {
      throw ArgumentError('Authority budgets cannot be negative.');
    }
    final unsigned = {
      'schema_version': 1,
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
      'status': 'ACTIVE',
    };
    final canonical = jsonEncode(unsigned);
    final hash = sha256.convert(utf8.encode(canonical)).toString();
    return AuthorityPassport(
      passportId: passportId,
      schemaVersion: 1,
      organizationId: organizationId,
      principalId: principalId,
      missionId: missionId,
      delegationId: delegationId,
      authorityRevision: authorityRevision,
      agentId: agentId,
      allowedActions: allowedActions,
      deniedActions: deniedActions,
      maxActions: maxActions,
      maxSpend: maxSpend,
      currency: currency,
      issuedAt: issuedAt,
      expiresAt: expiresAt,
      status: 'ACTIVE',
      claimsHash: hash,
      keyId: signer.keyId,
      signatureAlgorithm: signer.algorithm,
      signature: signer.sign(canonical),
    );
  }

  bool verify(
      AuthorityPassport passport, AuthoritySigner signer, DateTime now) {
    if (passport.status != 'ACTIVE') return false;
    if (now.isBefore(passport.issuedAt) || !now.isBefore(passport.expiresAt)) {
      return false;
    }
    if (passport.keyId != signer.keyId ||
        passport.signatureAlgorithm != signer.algorithm) {
      return false;
    }
    final claims = passport.unsignedClaims();
    final canonical = jsonEncode(claims);
    final expectedHash = sha256.convert(utf8.encode(canonical)).toString();
    if (expectedHash != passport.claimsHash) return false;
    return signer.verify(canonical, passport.signature);
  }

  bool permits({
    required AuthorityPassport passport,
    required String organizationId,
    required String missionId,
    required String action,
    required DateTime now,
  }) {
    if (passport.status != 'ACTIVE') return false;
    if (passport.organizationId != organizationId ||
        passport.missionId != missionId) {
      return false;
    }
    if (now.isBefore(passport.issuedAt) || !now.isBefore(passport.expiresAt))
      return false;
    if (passport.deniedActions.contains(action)) return false;
    return passport.allowedActions.contains(action);
  }
}
