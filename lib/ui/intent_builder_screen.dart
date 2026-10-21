import 'package:flutter/material.dart';
import '../application/intent_builder.dart';
import '../application/zavqera_ai_planner.dart';
import '../domain/intent.dart';

class IntentBuilderScreen extends StatefulWidget {
  final void Function(IntentDraft draft) onApproved;
  final ZavqeraAiPlanner? aiPlanner;

  const IntentBuilderScreen({
    super.key,
    required this.onApproved,
    this.aiPlanner,
  });

  @override
  State<IntentBuilderScreen> createState() => _IntentBuilderScreenState();
}

class _IntentBuilderScreenState extends State<IntentBuilderScreen> {
  final _controller = TextEditingController();
  final _builder = IntentBuilder();
  final _stepController = TextEditingController();
  final _steps = <String>[];
  IntentDraft? _draft;
  AiMissionPlan? _aiPlan;
  bool _aiLoading = false;

  @override
  void dispose() {
    _controller.dispose();
    _stepController.dispose();
    super.dispose();
  }

  Future<void> _understandWithAi() async {
    final planner = widget.aiPlanner;
    if (planner == null) return;
    final goal = _controller.text.trim();
    if (goal.isEmpty) {
      _understand();
      return;
    }
    setState(() => _aiLoading = true);
    try {
      final plan = await planner.plan(goal: goal);
      if (!mounted) return;
      setState(() {
        _aiPlan = plan;
        _draft = plan.toIntentDraft(goal);
        _steps
          ..clear()
          ..addAll(plan.steps.map((step) => step.title));
      });
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('ZAVQERA AI could not plan this goal: $e')),
      );
    } finally {
      if (mounted) setState(() => _aiLoading = false);
    }
  }

  void _understand() {
    try {
      setState(() => _draft = _builder.build(_controller.text));
    } on ArgumentError catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message.toString())),
      );
    }
  }

  void _addStep() {
    final step = _stepController.text.trim();
    if (step.isEmpty) return;
    setState(() {
      _steps.add(step);
      _stepController.clear();
    });
  }

  Future<void> _editStep(int index) async {
    final controller = TextEditingController(text: _steps[index]);
    final value = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Edit step'),
        content: TextField(
          controller: controller,
          autofocus: true,
          onSubmitted: (value) => Navigator.pop(context, value),
          decoration: const InputDecoration(labelText: 'Step'),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(context, controller.text),
              child: const Text('Save')),
        ],
      ),
    );
    controller.dispose();
    final step = value?.trim();
    if (step != null && step.isNotEmpty && mounted) {
      setState(() => _steps[index] = step);
    }
  }

  @override
  Widget build(BuildContext context) {
    final draft = _draft;
    return Scaffold(
      appBar: AppBar(title: const Text('Create a goal')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text('What do you want NEXO to accomplish?',
              style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 8),
          const Text(
              'Describe the outcome naturally. NEXO will convert it into a bounded Mission.'),
          const SizedBox(height: 16),
          TextField(
            controller: _controller,
            maxLines: 4,
            decoration: const InputDecoration(
              hintText:
                  'Example: Get 5 new customers from Norway within two weeks.',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  onPressed: _understand,
                  icon: const Icon(Icons.check),
                  label: const Text('Set goal'),
                ),
              ),
              if (widget.aiPlanner != null) ...[
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _aiLoading ? null : _understandWithAi,
                    icon: _aiLoading
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.auto_awesome),
                    label: Text(_aiLoading ? 'Planning…' : 'ZAVQERA AI'),
                  ),
                ),
              ],
            ],
          ),
          if (draft != null) ...[
            const SizedBox(height: 24),
            _Section(title: 'NEXO understood', child: Text(draft.objective)),
            if (_aiPlan != null) ...[
              _Section(
                title: 'AI planning notes',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (_aiPlan!.summary.isNotEmpty) Text(_aiPlan!.summary),
                    if (_aiPlan!.clarifications.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      const Text('Clarifications needed'),
                      ..._aiPlan!.clarifications.map(_Bullet.new),
                    ],
                    if (_aiPlan!.risks.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      const Text('Risks'),
                      ..._aiPlan!.risks.map(_Bullet.new),
                    ],
                  ],
                ),
              ),
            ],
            _Section(
              title: 'Steps',
              child: Column(
                children: [
                  if (_steps.isEmpty)
                    const Align(
                      alignment: Alignment.centerLeft,
                      child: Text('Add at least one step to continue.'),
                    ),
                  ..._steps.asMap().entries.map((entry) => ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: CircleAvatar(child: Text('${entry.key + 1}')),
                        title: Text(entry.value),
                        trailing: Wrap(
                          children: [
                            IconButton(
                              tooltip: 'Edit step',
                              onPressed: () => _editStep(entry.key),
                              icon: const Icon(Icons.edit_outlined),
                            ),
                            IconButton(
                              tooltip: 'Remove step',
                              onPressed: () =>
                                  setState(() => _steps.removeAt(entry.key)),
                              icon: const Icon(Icons.delete_outline),
                            ),
                            if (entry.key > 0)
                              IconButton(
                                tooltip: 'Move step up',
                                onPressed: () => setState(() {
                                  final step = _steps.removeAt(entry.key);
                                  _steps.insert(entry.key - 1, step);
                                }),
                                icon: const Icon(Icons.arrow_upward),
                              ),
                            if (entry.key < _steps.length - 1)
                              IconButton(
                                tooltip: 'Move step down',
                                onPressed: () => setState(() {
                                  final step = _steps.removeAt(entry.key);
                                  _steps.insert(entry.key + 1, step);
                                }),
                                icon: const Icon(Icons.arrow_downward),
                              ),
                          ],
                        ),
                      )),
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _stepController,
                          onSubmitted: (_) => _addStep(),
                          decoration: const InputDecoration(
                            labelText: 'Add a step',
                            hintText: 'Example: Submit the application',
                          ),
                        ),
                      ),
                      IconButton(
                        tooltip: 'Add step',
                        onPressed: _addStep,
                        icon: const Icon(Icons.add_circle),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            _Section(
              title: 'Constraints',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: draft.constraints.map((x) => _Bullet(x)).toList(),
              ),
            ),
            _Section(
              title: 'Success criteria',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: draft.successCriteria.map((x) => _Bullet(x)).toList(),
              ),
            ),
            _Section(
              title: 'Requested authority',
              child: Column(
                children: draft.authorityRequests
                    .map((r) => ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: CircleAvatar(
                            child:
                                Text(authorityClassLabel(r.authorityClass)[0]),
                          ),
                          title: Text(r.action),
                          subtitle: Text(
                              '${authorityClassLabel(r.authorityClass)} • ${r.reason}'),
                          trailing: r.requiresApproval
                              ? const Chip(label: Text('Approval'))
                              : const Chip(label: Text('No approval')),
                        ))
                    .toList(),
              ),
            ),
            const SizedBox(height: 8),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Text(
                  'NEXO will NOT grant itself additional authority, increase the budget, redefine success, or send an external action that requires approval.',
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ),
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: _steps.isEmpty
                  ? null
                  : () => widget.onApproved(draft.withSteps(_steps)),
              child: const Text('Create this plan'),
            ),
          ],
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  final String title;
  final Widget child;
  const _Section({required this.title, required this.child});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            child,
          ],
        ),
      );
}

class _Bullet extends StatelessWidget {
  final String text;
  const _Bullet(this.text);

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('•  '),
            Expanded(child: Text(text)),
          ],
        ),
      );
}
