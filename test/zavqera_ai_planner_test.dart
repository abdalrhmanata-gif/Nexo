import 'package:flutter_test/flutter_test.dart';

import 'package:nexo_followthrough/application/zavqera_ai_planner.dart';
import 'package:nexo_followthrough/domain/intent.dart';

void main() {
  test('parses a structured AI mission plan', () {
    final plan = AiMissionPlan.fromJson({
      'summary': 'Reach new customers.',
      'objective': 'Acquire five qualified customers.',
      'steps': [
        {
          'title': 'Research leads',
          'description': 'Find suitable candidates.',
          'authorityClass': 'READ',
          'requiresApproval': false,
        },
        {
          'title': 'Prepare outreach',
          'description': 'Draft messages without sending them.',
          'authorityClass': 'PREPARE',
          'requiresApproval': false,
        },
        {
          'title': 'Send approved outreach',
          'description': 'Send only after explicit approval.',
          'authorityClass': 'WRITE',
          'requiresApproval': true,
        },
      ],
      'clarifications': ['Which customer segment matters most?'],
      'risks': ['External messages require approval.'],
    });

    final draft = plan.toIntentDraft('Find customers');

    expect(draft.objective, 'Acquire five qualified customers.');
    expect(draft.steps, [
      'Research leads',
      'Prepare outreach',
      'Send approved outreach',
    ]);
    expect(
      draft.authorityRequests.map((x) => x.authorityClass),
      [
        AuthorityClass.read,
        AuthorityClass.prepare,
        AuthorityClass.write,
      ],
    );
    expect(draft.authorityRequests.last.requiresApproval, isTrue);
  });

  test('rejects an unknown authority class', () {
    expect(
      () => AiMissionPlan.fromJson({
        'summary': 'Test',
        'objective': 'Test',
        'steps': [
          {
            'title': 'Do it',
            'description': 'Test',
            'authorityClass': 'UNTRUSTED',
            'requiresApproval': false,
          },
        ],
      }),
      throwsA(isA<FormatException>()),
    );
  });

  test('rejects a plan without steps', () {
    expect(
      () => AiMissionPlan.fromJson({
        'summary': 'Test',
        'objective': 'Test',
        'steps': [],
      }),
      throwsA(isA<FormatException>()),
    );
  });
}
