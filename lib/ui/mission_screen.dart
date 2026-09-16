import 'package:flutter/material.dart';
import '../data/mission_repository.dart';
import '../domain/mission.dart';

class MissionScreen extends StatefulWidget {
  final MissionRepository repository;
  final String missionId;
  const MissionScreen(
      {super.key, required this.repository, required this.missionId});
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
    } catch (e) {
      if (mounted)
        setState(() => error = e.toString().replaceFirst('Bad state: ', ''));
    }
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
    final leaseActive =
        m.leaseExpiresAt != null && DateTime.now().isBefore(m.leaseExpiresAt!);
    return Scaffold(
      appBar: AppBar(title: const Text('NEXO Mission Control')),
      body: ListView(padding: const EdgeInsets.all(20), children: [
        if (m.status == MissionStatus.paused)
          FilledButton(
              onPressed: () => _command(widget.repository.resumeMission),
              child: const Text('Resume Mission')),
        Text(m.objective, style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 16),
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
                  : 'Authority approval required'),
            ])),
        _Card(
            title: 'Execution Lease',
            icon: Icons.timer_outlined,
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(leaseActive ? 'ACTIVE' : 'NOT ACTIVE',
                  style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 6),
              Text(leaseActive
                  ? 'Expires ${m.leaseExpiresAt!.toLocal()}'
                  : 'No live execution authority.'),
              const SizedBox(height: 10),
              const Text(
                  'Temporary authority • bounded actions • budgeted • revocable'),
            ])),
        _Card(
            title: 'Authority Boundary',
            icon: Icons.policy_outlined,
            child: Text(m.authoritySummary)),
        _Card(
            title: 'Budget',
            icon: Icons.account_balance_wallet_outlined,
            child: Text(
                'Cost: ${m.currentCost}/${m.maxCost ?? '∞'}  •  Actions: ${m.actionCount}/${m.maxActions ?? '∞'}  •  Retries: ${m.maxRetries}')),
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
              label: const Text('Approve authority')),
        if (m.authorityApproved && m.status == MissionStatus.ready)
          FilledButton.icon(
              onPressed: () => _command(widget.repository.startMission),
              icon: const Icon(Icons.play_arrow),
              label: const Text('Start Mission')),
        if (m.status == MissionStatus.running) ...[
          FilledButton.icon(
              onPressed: () => _command(widget.repository.pauseMission),
              icon: const Icon(Icons.pause),
              label: const Text('Pause Mission')),
          OutlinedButton.icon(
              onPressed: () => _command(widget.repository.revokeLease),
              icon: const Icon(Icons.stop_circle_outlined),
              label: const Text('Revoke Execution Lease')),
        ],
        Text('Actions', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 8),
        ...m.actions.map((a) => Card(
                child: ListTile(
              title: Text(a.title),
              subtitle: Text(
                  '${a.authorityClass} • ${actionStatusLabel(a.status)}${a.requiresApproval ? ' • Approval required' : ''}'),
              leading: Icon(a.status == ActionStatus.authorized
                  ? Icons.lock_open
                  : Icons.lock_outline),
            ))),
        const SizedBox(height: 12),
        const SizedBox(height: 20),
        const _TrustChain(),
      ]),
    );
  }
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

class _TrustChain extends StatelessWidget {
  const _TrustChain();
  @override
  Widget build(BuildContext context) => Card(
      child: Padding(
          padding: const EdgeInsets.all(16),
          child: const Text(
              'Intent → Mission → Delegation → Policy → Execution Lease → Authorization → Action → Evidence → Verification → Outcome')));
}
