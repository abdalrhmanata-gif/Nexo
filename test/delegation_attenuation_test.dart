import 'package:flutter_test/flutter_test.dart';
import 'package:nexo_followthrough/domain/delegation_attenuation.dart';

void main() {
  final expiresAt = DateTime.utc(2026, 12, 31, 23, 59);

  DelegationAuthoritySnapshot snapshot({
    Set<String> allowedActions = const {'READ', 'WRITE'},
    Set<String> deniedActions = const {'DELETE'},
    Set<String> scope = const {'CRM:LEADS'},
    Set<String> toolProviderScope = const {'crm'},
    double remainingBudget = 100,
    DateTime? expiresAtOverride,
    int riskCeiling = 3,
    int approvalStrength = 2,
    int evidenceStrength = 2,
    int remainingDelegationDepth = 3,
  }) {
    return DelegationAuthoritySnapshot(
      allowedActions: allowedActions,
      deniedActions: deniedActions,
      scope: scope,
      toolProviderScope: toolProviderScope,
      remainingBudget: remainingBudget,
      expiresAt: expiresAtOverride ?? expiresAt,
      riskCeiling: riskCeiling,
      approvalStrength: approvalStrength,
      evidenceStrength: evidenceStrength,
      remainingDelegationDepth: remainingDelegationDepth,
    );
  }

  void expectViolation({
    required DelegationAuthoritySnapshot parent,
    required DelegationAuthoritySnapshot child,
    required String code,
  }) {
    expect(
      () => const DelegationAttenuationValidator().validate(
        parent: parent,
        child: child,
      ),
      throwsA(
        isA<DelegationAttenuationViolation>().having(
          (violation) => violation.code,
          'code',
          code,
        ),
      ),
    );
  }

  test('valid child delegation attenuates parent authority', () {
    final parent = snapshot();
    final child = snapshot(
      allowedActions: {'READ'},
      scope: {'CRM:LEADS'},
      toolProviderScope: {'crm'},
      remainingBudget: 40,
      riskCeiling: 2,
      approvalStrength: 3,
      evidenceStrength: 3,
      remainingDelegationDepth: 2,
    );

    expect(
      () => const DelegationAttenuationValidator().validate(
        parent: parent,
        child: child,
      ),
      returnsNormally,
    );
  });

  test('rejects scope and action expansion', () {
    final parent = snapshot();
    expectViolation(
      parent: parent,
      child: snapshot(scope: {'CRM:LEADS', 'CRM:CONTACTS'}),
      code: 'SCOPE_EXPANSION',
    );
    expectViolation(
      parent: parent,
      child: snapshot(allowedActions: {'READ', 'WRITE', 'DELETE'}),
      code: 'ACTION_EXPANSION',
    );
  });

  test('rejects denied-action weakening and provider expansion', () {
    final parent = snapshot();
    expectViolation(
      parent: parent,
      child: snapshot(deniedActions: {}),
      code: 'DENY_WEAKENING',
    );
    expectViolation(
      parent: parent,
      child: snapshot(
        toolProviderScope: {'crm', 'billing'},
        remainingDelegationDepth: 2,
      ),
      code: 'TOOL_PROVIDER_EXPANSION',
    );
  });

  test('rejects budget and expiry expansion', () {
    final parent = snapshot();
    expectViolation(
      parent: parent,
      child: snapshot(remainingBudget: 101),
      code: 'BUDGET_EXPANSION',
    );
    expectViolation(
      parent: parent,
      child: snapshot(expiresAtOverride: DateTime.utc(2027, 1, 1)),
      code: 'EXPIRY_EXTENSION',
    );
  });

  test('rejects weaker security requirements', () {
    final parent = snapshot();
    expectViolation(
      parent: parent,
      child: snapshot(approvalStrength: 1),
      code: 'APPROVAL_WEAKENING',
    );
    expectViolation(
      parent: parent,
      child: snapshot(evidenceStrength: 1),
      code: 'EVIDENCE_WEAKENING',
    );
  });

  test('rejects non-reduced delegation depth', () {
    final parent = snapshot(remainingDelegationDepth: 3);
    expectViolation(
      parent: parent,
      child: snapshot(remainingDelegationDepth: 3),
      code: 'DELEGATION_DEPTH_NOT_REDUCED',
    );
  });
}
