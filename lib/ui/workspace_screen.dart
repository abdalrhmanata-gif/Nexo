import 'package:flutter/material.dart';

import '../domain/mission.dart';

class WorkspaceScreen extends StatelessWidget {
  final List<Mission> missions;
  final VoidCallback onNewMission;
  final ValueChanged<String> onOpenMission;

  const WorkspaceScreen({
    super.key,
    required this.missions,
    required this.onNewMission,
    required this.onOpenMission,
  });

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Your missions')),
        body: missions.isEmpty
            ? _EmptyWorkspace(onNewMission: onNewMission)
            : ListView(
                padding: const EdgeInsets.all(20),
                children: [
                  Text('What needs attention?',
                      style: Theme.of(context).textTheme.headlineSmall),
                  const SizedBox(height: 16),
                  ...missions.map(
                    (mission) => _MissionTile(
                      mission: mission,
                      onTap: () => onOpenMission(mission.id),
                    ),
                  ),
                ],
              ),
        floatingActionButton: FloatingActionButton.extended(
          onPressed: onNewMission,
          icon: const Icon(Icons.add),
          label: const Text('New mission'),
        ),
      );
}

class _EmptyWorkspace extends StatelessWidget {
  final VoidCallback onNewMission;
  const _EmptyWorkspace({required this.onNewMission});

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.route_outlined, size: 56),
              const SizedBox(height: 16),
              Text('Turn an intention into steps.',
                  style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 8),
              const Text(
                  'Create a mission and keep track of what needs attention next.'),
              const SizedBox(height: 20),
              FilledButton.icon(
                onPressed: onNewMission,
                icon: const Icon(Icons.add),
                label: const Text('New mission'),
              ),
            ],
          ),
        ),
      );
}

class _MissionTile extends StatelessWidget {
  final Mission mission;
  final VoidCallback onTap;
  const _MissionTile({required this.mission, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final current = mission.currentAction;
    final followUp = mission.actions
        .where((action) => action.followUpAt != null)
        .map((action) => action.followUpAt!)
        .fold<DateTime?>(null, (earliest, date) {
      if (earliest == null || date.isBefore(earliest)) return date;
      return earliest;
    });
    final state = current?.status == ActionStatus.waiting
        ? 'Waiting'
        : missionStatusLabel(mission.status);
    final localFollowUp = followUp?.toLocal();
    final followUpLabel = localFollowUp == null
        ? null
        : DateUtils.isSameDay(localFollowUp, DateTime.now())
            ? 'Follow-up today'
            : localFollowUp.isBefore(DateTime.now())
                ? 'Follow-up overdue (${localFollowUp.toString().split(' ').first})'
                : 'Follow-up ${localFollowUp.toString().split(' ').first}';
    final details = <String>[
      '$state • ${current?.title ?? 'All steps completed'}',
      '${mission.completedActionCount} of ${mission.actions.length} steps completed',
      if (followUpLabel != null) followUpLabel,
    ];
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ListTile(
        onTap: onTap,
        title: Text(mission.objective),
        subtitle: Text(details.join('\n')),
        isThreeLine: details.length > 2,
        trailing: SizedBox(
          width: 52,
          child: Text('${(mission.progress * 100).round()}%',
              textAlign: TextAlign.end,
              style: Theme.of(context).textTheme.titleMedium),
        ),
      ),
    );
  }
}
