import 'package:flutter/material.dart';
import '../data/mission_repository.dart';
import '../domain/mission.dart';

class MissionScreen extends StatefulWidget {
  final MissionRepository repository;
  final String missionId;
  final VoidCallback? onBack;
  const MissionScreen({
    super.key,
    required this.repository,
    required this.missionId,
    this.onBack,
  });
  @override
  State<MissionScreen> createState() => _MissionScreenState();
}

class _MissionScreenState extends State<MissionScreen> {
  Mission? mission;
  String? error;
  bool loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) setState(() => loading = true);
    try {
      final value = await widget.repository.getMission(widget.missionId);
      if (mounted)
        setState(() {
          mission = value;
          error = null;
          loading = false;
        });
    } catch (e) {
      if (mounted)
        setState(() {
          error = e.toString().replaceFirst('Bad state: ', '');
          loading = false;
        });
    }
  }

  Future<void> _command(Future<Mission> Function(String) fn) async {
    try {
      final value = await fn(widget.missionId);
      if (mounted)
        setState(() {
          mission = value;
          error = null;
        });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Mission updated')),
        );
      }
    } catch (e) {
      if (mounted)
        setState(() => error = e.toString().replaceFirst('Bad state: ', ''));
    }
  }

  Future<void> _editAction(MissionAction action) async {
    final noteController = TextEditingController(text: action.outcomeNote);
    var status = action.status;
    DateTime? followUpAt = action.followUpAt;
    final result =
        await showModalBottomSheet<(ActionStatus, String?, DateTime?)>(
      context: context,
      isScrollControlled: true,
      builder: (context) => StatefulBuilder(
        builder: (context, setSheetState) => Padding(
          padding: EdgeInsets.fromLTRB(
            20,
            20,
            20,
            MediaQuery.viewInsetsOf(context).bottom + 20,
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(action.title,
                    style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 12),
                DropdownButtonFormField<ActionStatus>(
                  initialValue: status,
                  decoration: const InputDecoration(labelText: 'Step status'),
                  items: [
                    if (action.status == ActionStatus.authorized)
                      const DropdownMenuItem(
                        value: ActionStatus.authorized,
                        enabled: false,
                        child: Text('Authorized (execution-owned)'),
                      ),
                    if (action.status == ActionStatus.committed)
                      const DropdownMenuItem(
                        value: ActionStatus.committed,
                        enabled: false,
                        child: Text('Committed (execution-owned)'),
                      ),
                    ...const [
                      ActionStatus.pending,
                      ActionStatus.running,
                      ActionStatus.waiting,
                      ActionStatus.succeeded,
                      ActionStatus.failed,
                    ].map((value) => DropdownMenuItem(
                          value: value,
                          child: Text(actionStatusLabel(value)),
                        )),
                  ],
                  onChanged: (value) =>
                      setSheetState(() => status = value ?? status),
                ),
                TextField(
                  controller: noteController,
                  maxLines: 2,
                  decoration: const InputDecoration(labelText: 'Outcome note'),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () async {
                          final picked = await showDatePicker(
                            context: context,
                            firstDate: DateTime.now(),
                            lastDate:
                                DateTime.now().add(const Duration(days: 365)),
                            initialDate: followUpAt ?? DateTime.now(),
                          );
                          if (picked != null) {
                            setSheetState(() => followUpAt = picked);
                          }
                        },
                        icon: const Icon(Icons.event_outlined),
                        label: Text(followUpAt == null
                            ? 'Set follow-up'
                            : 'Follow-up ${followUpAt!.toLocal().toString().split(' ').first}'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    FilledButton(
                      onPressed: () => Navigator.pop(
                        context,
                        (status, noteController.text.trim(), followUpAt),
                      ),
                      child: const Text('Save'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
    Future<void>.delayed(
        const Duration(milliseconds: 500), noteController.dispose);
    if (result == null || !mounted) return;
    await _command((id) => widget.repository.updateActionProgress(
          id,
          action.id,
          status: result.$1,
          outcomeNote: result.$2?.isEmpty == true ? null : result.$2,
          followUpAt: result.$3,
        ));
  }

  @override
  Widget build(BuildContext context) {
    final m = mission;
    if (m == null) {
      return Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(loading ? Icons.hourglass_top : Icons.error_outline,
                    size: 48),
                const SizedBox(height: 12),
                Text(loading
                    ? 'Loading mission…'
                    : (error ?? 'Mission could not be loaded.')),
                if (!loading) ...[
                  const SizedBox(height: 12),
                  FilledButton.icon(
                      onPressed: _load,
                      icon: const Icon(Icons.refresh),
                      label: const Text('Retry')),
                ],
              ],
            ),
          ),
        ),
      );
    }
    final current = m.currentAction;
    return Scaffold(
      appBar: AppBar(
        title: const Text('ZAVQERA Follow-through'),
        leading: widget.onBack == null
            ? null
            : IconButton(
                tooltip: 'Back to missions',
                onPressed: widget.onBack,
                icon: const Icon(Icons.arrow_back),
              ),
        actions: [
          IconButton(
            tooltip: 'Delete Mission',
            onPressed: () => _confirmDelete(m.id),
            icon: const Icon(Icons.delete_outline),
          ),
        ],
      ),
      body: ListView(padding: const EdgeInsets.all(20), children: [
        if (m.status == MissionStatus.paused && m.authorityApproved)
          FilledButton(
              onPressed: () => _command(widget.repository.resumeMission),
              child: const Text('Resume Mission')),
        if (m.status == MissionStatus.paused && !m.authorityApproved)
          const Padding(
            padding: EdgeInsets.only(bottom: 12),
            child:
                Text('Approval is required before this Mission can continue.'),
          ),
        Text(m.objective, style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 16),
        _Card(
          title: 'What needs attention next?',
          icon: m.hasWaitingAction
              ? Icons.schedule_outlined
              : Icons.arrow_forward_outlined,
          child: current == null
              ? Text(m.completionSummary)
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(current.title,
                        style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 6),
                    Text(current.status == ActionStatus.waiting
                        ? 'Waiting for a response. Add a follow-up date so you know when to check again.'
                        : 'This is the next step to work on.'),
                  ],
                ),
        ),
        _Card(
          title: 'Progress',
          icon: Icons.insights_outlined,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(m.completionSummary),
              const SizedBox(height: 8),
              LinearProgressIndicator(value: m.progress),
            ],
          ),
        ),
        _Card(
            title: 'Mission',
            icon: Icons.route,
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(missionStatusLabel(m.status),
                  style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              Text(m.authorityApproved
                  ? 'Authority approved'
                  : 'Approval is required before this Mission can continue.'),
            ])),
        if (error != null)
          Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Card(
                  child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Text(error!,
                          style:
                              const TextStyle(fontWeight: FontWeight.w600))))),
        if (!m.authorityApproved)
          FilledButton.icon(
              onPressed: () => _command(widget.repository.approveAuthority),
              icon: const Icon(Icons.verified_user_outlined),
              label: const Text('Approve Mission')),
        if (m.authorityApproved && m.status == MissionStatus.ready)
          FilledButton.icon(
              onPressed: () => _command(widget.repository.startMission),
              icon: const Icon(Icons.play_arrow),
              label: const Text('Start Mission')),
        if (m.status == MissionStatus.running) ...[
          FilledButton.icon(
              onPressed: () => _command(widget.repository.continueMission),
              icon: const Icon(Icons.skip_next),
              label: const Text('Continue Mission')),
          FilledButton.icon(
              onPressed: () => _command(widget.repository.pauseMission),
              icon: const Icon(Icons.pause),
              label: const Text('Pause Mission')),
          OutlinedButton.icon(
              onPressed: () => _command(widget.repository.revokeLease),
              icon: const Icon(Icons.stop_circle_outlined),
              label: const Text('Stop active work')),
        ],
        Text('Actions', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 8),
        ...m.actions.map((a) => Card(
              child: ListTile(
                title: Text(a.title),
                subtitle: Text([
                  '${a.authorityClass} • ${_userActionStatus(a.status)}',
                  if (a.requiresApproval) 'Approval required',
                  if (a.followUpAt != null)
                    'Follow up ${a.followUpAt!.toLocal().toString().split(' ').first}',
                  if (a.outcomeNote != null) a.outcomeNote!,
                ].join(' • ')),
                leading: Icon(a.status == ActionStatus.authorized
                    ? Icons.lock_open
                    : Icons.lock_outline),
                trailing: IconButton(
                  tooltip: a.status == ActionStatus.authorized ||
                          a.status == ActionStatus.committed
                      ? 'Managed by execution'
                      : 'Update step',
                  onPressed: a.status == ActionStatus.authorized ||
                          a.status == ActionStatus.committed
                      ? null
                      : () => _editAction(a),
                  icon: const Icon(Icons.edit_outlined),
                ),
              ),
            )),
        const SizedBox(height: 20),
      ]),
    );
  }

  Future<void> _confirmDelete(String missionId) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete Mission?'),
        content: const Text(
            'This Mission and its progress will be permanently removed from this device.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Delete')),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      await widget.repository.deleteMission(missionId);
      if (mounted) widget.onBack?.call();
    } catch (e) {
      if (mounted) {
        setState(() => error = e.toString().replaceFirst('Bad state: ', ''));
      }
    }
  }

  String _userActionStatus(ActionStatus status) => switch (status) {
        ActionStatus.succeeded ||
        ActionStatus.verified ||
        ActionStatus.committed =>
          'Completed',
        ActionStatus.authorized => 'Ready',
        ActionStatus.running => 'In progress',
        ActionStatus.waiting => 'Waiting',
        ActionStatus.verifying => 'Verifying',
        ActionStatus.failed => 'Failed',
        ActionStatus.pending => 'Not started',
        ActionStatus.cancelled => 'Cancelled',
      };
}

class _Card extends StatelessWidget {
  final String title;
  final IconData icon;
  final Widget child;
  const _Card({required this.title, required this.icon, required this.child});
  @override
  Widget build(BuildContext context) => Card(
      margin: const EdgeInsets.only(bottom: 14),
      child: Padding(
          padding: const EdgeInsets.all(16),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Icon(icon),
              const SizedBox(width: 8),
              Text(title, style: Theme.of(context).textTheme.titleMedium)
            ]),
            const SizedBox(height: 10),
            child
          ])));
}
