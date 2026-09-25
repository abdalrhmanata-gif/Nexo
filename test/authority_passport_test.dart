import 'package:flutter_test/flutter_test.dart';
import 'package:zavqera_followthrough/application/authority_passport_service.dart';
import 'package:zavqera_followthrough/domain/authority_passport.dart';

void main() {
  final issued = DateTime.utc(2026, 9, 6, 10);
  final expires = DateTime.utc(2026, 9, 6, 11);
  final signer = DemoHmacSigner(keyId: 'dev-key-1', secret: [1, 2, 3, 4]);
  const service = AuthorityPassportService();

  test('issues and verifies an authority passport', () {
    final p = service.issue(
      passportId: 'P-1',
      organizationId: 'ORG-1',
      principalId: 'U-1',
      missionId: 'M-1',
      delegationId: 'D-1',
      authorityRevision: 'D-1:7',
      agentId: 'A-1',
      allowedActions: ['READ', 'PREPARE'],
      deniedActions: ['WRITE'],
      maxActions: 5,
      maxSpend: 10,
      currency: 'EUR',
      issuedAt: issued,
      expiresAt: expires,
      signer: signer,
    );
    expect(service.verify(p, signer, issued.add(const Duration(minutes: 5))),
        isTrue);
  });

  test('tampering with claims invalidates the passport', () {
    final p = service.issue(
      passportId: 'P-2',
      organizationId: 'ORG-1',
      principalId: 'U-1',
      missionId: 'M-1',
      delegationId: 'D-1',
      authorityRevision: 'D-1:8',
      agentId: 'A-1',
      allowedActions: ['READ'],
      deniedActions: [],
      maxActions: 2,
      maxSpend: 0,
      currency: 'EUR',
      issuedAt: issued,
      expiresAt: expires,
      signer: signer,
    );
    final tampered = AuthorityPassport(
      passportId: p.passportId,
      schemaVersion: p.schemaVersion,
      organizationId: p.organizationId,
      principalId: p.principalId,
      missionId: p.missionId,
      delegationId: p.delegationId,
      authorityRevision: p.authorityRevision,
      agentId: p.agentId,
      allowedActions: ['READ', 'WRITE'],
      deniedActions: p.deniedActions,
      maxActions: p.maxActions,
      maxSpend: p.maxSpend,
      currency: p.currency,
      issuedAt: p.issuedAt,
      expiresAt: p.expiresAt,
      status: p.status,
      claimsHash: p.claimsHash,
      keyId: p.keyId,
      signatureAlgorithm: p.signatureAlgorithm,
      signature: p.signature,
    );
    expect(
        service.verify(
            tampered, signer, issued.add(const Duration(minutes: 5))),
        isFalse);
  });

  test('expiry and tenant/mission mismatch fail closed', () {
    final p = service.issue(
      passportId: 'P-3',
      organizationId: 'ORG-1',
      principalId: 'U-1',
      missionId: 'M-1',
      delegationId: 'D-1',
      authorityRevision: 'D-1:9',
      agentId: 'A-1',
      allowedActions: ['READ'],
      deniedActions: [],
      maxActions: 2,
      maxSpend: 0,
      currency: 'EUR',
      issuedAt: issued,
      expiresAt: expires,
      signer: signer,
    );
    expect(
        service.permits(
            passport: p,
            organizationId: 'ORG-1',
            missionId: 'M-2',
            action: 'READ',
            now: issued.add(const Duration(minutes: 5))),
        isFalse);
    expect(
        service.permits(
            passport: p,
            organizationId: 'ORG-1',
            missionId: 'M-1',
            action: 'WRITE',
            now: issued.add(const Duration(minutes: 5))),
        isFalse);
    expect(service.verify(p, signer, expires), isFalse);
  });
}
