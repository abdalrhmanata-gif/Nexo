import 'package:flutter_test/flutter_test.dart';
import 'package:nexo_followthrough/domain/mission_policy.dart';

PolicyEvaluationRequest req({bool approval = false, double cost = 10}) => PolicyEvaluationRequest(
  organizationId: 'o1', missionId: 'm1', actionId: 'a1', actionRevisionBinding: 'a1:1:h',
  toolId: 'mail', authorityClass: 'WRITE', riskLevel: 'medium', estimatedCost: cost,
  approvalPresent: approval, delegationActive: true, leaseActive: true,
);

void main() {
  test('default deny when no policy matches', () {
    final e = MissionPolicyEngine(rules: const []);
    expect(e.evaluate(req()).effect, PolicyEffect.deny);
  });

  test('higher priority deny wins', () {
    final e = MissionPolicyEngine(rules: const [
      PolicyRule(id: 'allow', priority: 10, effect: PolicyEffect.allow, authorityClasses: {'WRITE'}),
      PolicyRule(id: 'deny', priority: 20, effect: PolicyEffect.deny, authorityClasses: {'WRITE'}),
    ]);
    expect(e.evaluate(req()).effect, PolicyEffect.deny);
  });

  test('approval rule blocks until approval exists', () {
    final e = MissionPolicyEngine(rules: const [
      PolicyRule(id: 'approval', priority: 10, effect: PolicyEffect.requireApproval, authorityClasses: {'WRITE'}),
    ]);
    expect(e.evaluate(req()).effect, PolicyEffect.requireApproval);
    expect(e.evaluate(req(approval: true)).effect, PolicyEffect.allow);
  });

  test('inactive delegation fails closed even with allow rule', () {
    final e = MissionPolicyEngine(rules: const [
      PolicyRule(id: 'allow', priority: 10, effect: PolicyEffect.allow),
    ]);
    final r = req();
    final bad = PolicyEvaluationRequest(
      organizationId: r.organizationId, missionId: r.missionId, actionId: r.actionId,
      actionRevisionBinding: r.actionRevisionBinding, toolId: r.toolId,
      authorityClass: r.authorityClass, riskLevel: r.riskLevel, estimatedCost: r.estimatedCost,
      approvalPresent: r.approvalPresent, delegationActive: false, leaseActive: true,
    );
    expect(e.evaluate(bad).effect, PolicyEffect.deny);
  });

  test('policy never expands authority', () {
    const rule = PolicyRule(id: 'allow', priority: 10, effect: PolicyEffect.allow, authorityClasses: {'READ'});
    final e = MissionPolicyEngine(rules: const [rule]);
    expect(e.evaluate(req()).effect, PolicyEffect.deny);
  });
}
