import 'package:flutter/material.dart';
import '../application/intent_builder.dart';
import '../domain/intent.dart';

class IntentBuilderScreen extends StatefulWidget {
  final void Function(IntentDraft draft) onApproved;

  const IntentBuilderScreen({super.key, required this.onApproved});

  @override
  State<IntentBuilderScreen> createState() => _IntentBuilderScreenState();
}

class _IntentBuilderScreenState extends State<IntentBuilderScreen> {
  final _controller = TextEditingController();
  final _builder = IntentBuilder();
  IntentDraft? _draft;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
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
          FilledButton.icon(
            onPressed: _understand,
            icon: const Icon(Icons.auto_awesome),
            label: const Text('Let NEXO understand this goal'),
          ),
          if (draft != null) ...[
            const SizedBox(height: 24),
            _Section(title: 'NEXO understood', child: Text(draft.objective)),
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
              onPressed: () => widget.onApproved(draft),
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
