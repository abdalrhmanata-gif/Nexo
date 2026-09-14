import '../domain/intent.dart';

class IntentBuilder {
  IntentDraft build(String rawGoal) {
    final goal = rawGoal.trim();
    if (goal.isEmpty) {
      throw ArgumentError('Goal cannot be empty.');
    }

    return IntentDraft(
      rawGoal: goal,
      objective: goal,
      constraints: const [
        'Use only explicitly authorized tools and providers.',
        'Do not exceed the authority budget.',
        'Do not send external communication without required approval.',
      ],
      successCriteria: const [
        'Complete the requested objective or clearly report why it could not be completed.',
        'Provide evidence for external side effects.',
        'Do not mark success until verification is complete.',
      ],
      authorityRequests: const [
        AuthorityRequest(
          authorityClass: AuthorityClass.read,
          action: 'Research suitable leads',
          reason: 'Find candidates relevant to the objective.',
          requiresApproval: false,
        ),
        AuthorityRequest(
          authorityClass: AuthorityClass.prepare,
          action: 'Prepare outreach',
          reason: 'Draft messages but do not send them.',
          requiresApproval: false,
        ),
        AuthorityRequest(
          authorityClass: AuthorityClass.write,
          action: 'Send approved outreach',
          reason: 'Create the external side effect only after approval.',
          requiresApproval: true,
        ),
      ],
      timeWindow: null,
    );
  }
}
