import 'package:test/test.dart';
import '../lib/domain/security_constitution.dart';

void main() {
  test('cross-tenant execution fails closed', () {
    expect(
      () => SecurityConstitution.requireSameTenant('org-a', 'org-b'),
      throwsA(isA<SecurityViolation>()),
    );
  });

  test('execution requires JIT authorization', () {
    expect(
      () => SecurityConstitution.requireJitAuthorization(false),
      throwsA(isA<SecurityViolation>()),
    );
  });

  test('commit requires verification', () {
    expect(
      () => SecurityConstitution.requireVerifiedBeforeCommit(false),
      throwsA(isA<SecurityViolation>()),
    );
  });

  test('UNKNOWN cannot retry without reconciliation', () {
    expect(
      () => SecurityConstitution.requireReconciliationForUnknown(false),
      throwsA(isA<SecurityViolation>()),
    );
  });

  test('authority cannot expand', () {
    expect(
      () => SecurityConstitution.requireAuthorityNotExpanded(
        requested: {'READ', 'WRITE'},
        delegated: {'READ'},
      ),
      throwsA(isA<SecurityViolation>()),
    );
  });
}
