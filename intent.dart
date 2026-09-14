enum AuthorityClass {
  read,
  suggest,
  prepare,
  write,
  execute,
  commit,
  financial,
  legal,
}

class IntentDraft {
  final String rawGoal;
  final String objective;
  final List<String> constraints;
  final List<String> successCriteria;
  final List<AuthorityRequest> authorityRequests;
  final String? timeWindow;

  const IntentDraft({
    required this.rawGoal,
    required this.objective,
    required this.constraints,
    required this.successCriteria,
    required this.authorityRequests,
    required this.timeWindow,
  });
}

class AuthorityRequest {
  final AuthorityClass authorityClass;
  final String action;
  final String reason;
  final bool requiresApproval;

  const AuthorityRequest({
    required this.authorityClass,
    required this.action,
    required this.reason,
    required this.requiresApproval,
  });
}

String authorityClassLabel(AuthorityClass value) => switch (value) {
  AuthorityClass.read => 'READ',
  AuthorityClass.suggest => 'SUGGEST',
  AuthorityClass.prepare => 'PREPARE',
  AuthorityClass.write => 'WRITE',
  AuthorityClass.execute => 'EXECUTE',
  AuthorityClass.commit => 'COMMIT',
  AuthorityClass.financial => 'FINANCIAL',
  AuthorityClass.legal => 'LEGAL',
};
