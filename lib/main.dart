import 'package:flutter/material.dart';
import 'data/mission_repository.dart';
import 'data/local_mission_store.dart';
import 'domain/intent.dart';
import 'domain/mission.dart';
import 'ui/intent_builder_screen.dart';
import 'ui/mission_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final repository = DemoMissionRepository(
    store: SharedPreferencesMissionStore(),
  );
  await repository.restore();
  runApp(NexoApp(repository: repository));
}

class NexoApp extends StatelessWidget {
  final DemoMissionRepository repository;
  const NexoApp({super.key, required this.repository});

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'NEXO',
        theme: ThemeData(useMaterial3: true, colorSchemeSeed: Colors.indigo),
        home: _Home(repository: repository),
      );
}

class _Home extends StatefulWidget {
  final DemoMissionRepository repository;
  const _Home({required this.repository});

  @override
  State<_Home> createState() => _HomeState();
}

class _HomeState extends State<_Home> {
  Mission? mission;

  Future<void> _create(IntentDraft draft) async {
    final created = await widget.repository.createMission(draft);
    if (!mounted) return;
    setState(() => mission = created);
  }

  @override
  Widget build(BuildContext context) {
    final m = mission;
    if (m == null) return IntentBuilderScreen(onApproved: _create);
    return MissionScreen(repository: widget.repository, missionId: m.id);
  }
}
