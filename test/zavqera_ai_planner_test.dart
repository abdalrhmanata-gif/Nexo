import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

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

  test('normalizes the fail-closed quota 503 to a user-facing message', () {
    final normalized = normalizeAiPlannerFunctionException(
      FunctionException(
        status: 503,
        details: {'error': 'ai_quota_enforcement_not_configured'},
        reasonPhrase: 'Service Unavailable',
      ),
    );

    expect(normalized, isA<AiPlannerUnavailableException>());
    expect(
      normalized.toString(),
      'AI planning is temporarily unavailable. Please use Set goal to continue manually.',
    );
  });

  test('normalizes the real HTTP 503 response without retrying', () async {
    var requestCount = 0;
    final mockHttpClient = MockClient((request) async {
      requestCount += 1;
      expect(request.method, 'POST');
      expect(request.url.path, '/functions/v1/ai-plan');
      return http.Response(
        jsonEncode({'error': 'ai_quota_enforcement_not_configured'}),
        503,
        headers: {'content-type': 'application/json'},
      );
    });
    final supabaseClient = SupabaseClient(
      'https://example.supabase.co',
      'test-publishable-key',
      accessToken: () async => 'test-user-token',
      httpClient: mockHttpClient,
    );
    addTearDown(() async {
      await supabaseClient.dispose();
    });

    final planner = ZavqeraAiPlanner(supabaseClient);
    await expectLater(
      planner.plan(goal: 'Test goal'),
      throwsA(isA<AiPlannerUnavailableException>()),
    );
    expect(requestCount, 1, reason: 'the client must not automatically retry');
  });

  test('does not mislabel unrelated function errors as quota unavailable', () {
    final normalized = normalizeAiPlannerFunctionException(
      FunctionException(
        status: 503,
        details: {'error': 'provider_unavailable'},
        reasonPhrase: 'Service Unavailable',
      ),
    );

    expect(normalized, isNull);
  });

  test('does not mislabel quota-shaped errors with a different status', () {
    final normalized = normalizeAiPlannerFunctionException(
      FunctionException(
        status: 502,
        details: {'error': 'ai_quota_enforcement_not_configured'},
        reasonPhrase: 'Bad Gateway',
      ),
    );

    expect(normalized, isNull);
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

  test('rejects a step without an explicit approval flag', () {
    expect(
      () => AiMissionPlan.fromJson({
        'summary': 'Test',
        'objective': 'Test',
        'steps': [
          {
            'title': 'Send message',
            'description': 'Send an external message.',
            'authorityClass': 'WRITE',
          },
        ],
      }),
      throwsA(isA<FormatException>()),
    );
  });

  test('rejects malformed step entries instead of silently skipping them', () {
    expect(
      () => AiMissionPlan.fromJson({
        'summary': 'Test',
        'objective': 'Test',
        'steps': ['not a step'],
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
