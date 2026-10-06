import 'package:supabase_flutter/supabase_flutter.dart';

import '../domain/intent.dart';

/// Provider-facing adapter for ZAVQERA planning intelligence.
///
/// This class owns transport/parsing only. It does not grant authority,
/// execute actions, or bypass the existing intent/policy boundaries.
class ZavqeraAiPlanner {
  final SupabaseClient client;

  const ZavqeraAiPlanner(this.client);

  Future<AiMissionPlan> plan({
    required String goal,
    String context = '',
  }) async {
    final normalizedGoal = goal.trim();
    if (normalizedGoal.isEmpty) {
      throw ArgumentError('Goal cannot be empty.');
    }
    if (normalizedGoal.length > 6000) {
      throw ArgumentError('Goal is too long.');
    }
    if (context.length > 12000) {
      throw ArgumentError('Context is too long.');
    }

    final response = await client.functions.invoke(
      'ai-plan',
      body: <String, dynamic>{
        'goal': normalizedGoal,
        if (context.trim().isNotEmpty) 'context': context.trim(),
      },
    );

    final data = response.data;
    if (data is! Map) {
      throw const FormatException('AI planner returned an invalid response.');
    }

    final error = data['error'];
    if (error is String && error.isNotEmpty) {
      throw Exception(error);
    }

    final plan = data['plan'];
    if (plan is! Map) {
      throw const FormatException('AI planner returned no mission plan.');
    }

    return AiMissionPlan.fromJson(Map<String, dynamic>.from(plan));
  }
}

class AiMissionPlan {
  final String summary;
  final String objective;
  final List<AiMissionStep> steps;
  final List<String> clarifications;
  final List<String> risks;

  const AiMissionPlan({
    required this.summary,
    required this.objective,
    required this.steps,
    required this.clarifications,
    required this.risks,
  });

  factory AiMissionPlan.fromJson(Map<String, dynamic> json) {
    final rawSteps = json['steps'];
    if (rawSteps is! List || rawSteps.isEmpty) {
      throw const FormatException('AI planner returned no steps.');
    }

    return AiMissionPlan(
      summary: _requiredString(json, 'summary'),
      objective: _requiredString(json, 'objective'),
      steps: rawSteps
          .whereType<Map>()
          .map((step) => AiMissionStep.fromJson(
                Map<String, dynamic>.from(step),
              ))
          .toList(growable: false),
      clarifications: _stringList(json['clarifications']),
      risks: _stringList(json['risks']),
    );
  }

  IntentDraft toIntentDraft(String rawGoal) {
    final requests = <AuthorityRequest>[];

    for (final step in steps) {
      requests.add(
        AuthorityRequest(
          authorityClass: _authorityClass(step.authorityClass),
          action: step.title,
          reason: step.description,
          requiresApproval: step.requiresApproval,
        ),
      );
    }

    return IntentDraft(
      rawGoal: rawGoal.trim(),
      objective: objective,
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
      authorityRequests: List.unmodifiable(requests),
      timeWindow: null,
      steps: List.unmodifiable(steps.map((step) => step.title)),
    );
  }

  static AuthorityClass _authorityClass(String value) {
    switch (value.toUpperCase()) {
      case 'READ':
        return AuthorityClass.read;
      case 'SUGGEST':
        return AuthorityClass.suggest;
      case 'PREPARE':
        return AuthorityClass.prepare;
      case 'WRITE':
        return AuthorityClass.write;
      case 'EXECUTE':
        return AuthorityClass.execute;
      case 'COMMIT':
        return AuthorityClass.commit;
      case 'FINANCIAL':
        return AuthorityClass.financial;
      case 'LEGAL':
        return AuthorityClass.legal;
      default:
        throw FormatException('Unknown authority class: $value');
    }
  }
}

class AiMissionStep {
  final String title;
  final String description;
  final String authorityClass;
  final bool requiresApproval;

  const AiMissionStep({
    required this.title,
    required this.description,
    required this.authorityClass,
    required this.requiresApproval,
  });

  factory AiMissionStep.fromJson(Map<String, dynamic> json) {
    return AiMissionStep(
      title: _requiredString(json, 'title'),
      description: _requiredString(json, 'description'),
      authorityClass: _requiredString(json, 'authorityClass'),
      requiresApproval: json['requiresApproval'] == true,
    );
  }
}

String _requiredString(Map<String, dynamic> json, String key) {
  final value = json[key];
  if (value is! String || value.trim().isEmpty) {
    throw FormatException('Missing AI planner field: $key');
  }
  return value.trim();
}

List<String> _stringList(dynamic value) {
  if (value is! List) return const [];
  return value.whereType<String>().map((x) => x.trim()).where((x) => x.isNotEmpty).toList(growable: false);
}
