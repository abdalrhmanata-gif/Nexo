import 'package:flutter/material.dart';
import 'data/mission_repository.dart';
import 'data/local_mission_store.dart';
import 'domain/intent.dart';
import 'domain/mission.dart';
import 'ui/intent_builder_screen.dart';
import 'ui/mission_screen.dart';
import 'ui/workspace_screen.dart';

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
  String? openMissionId;
  bool creating = false;

  @override
  void initState() {
    super.initState();
    mission = widget.repository.currentMission;
    openMissionId = null;
  }

  Future<void> _create(IntentDraft draft) async {
    final created = await widget.repository.createMission(draft);
    if (!mounted) return;
    setState(() {
      mission = created;
      creating = false;
      openMissionId = created.id;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (creating) return IntentBuilderScreen(onApproved: _create);
    final openId = openMissionId;
    if (openId != null) {
      return MissionScreen(
        repository: widget.repository,
        missionId: openId,
        onBack: () => setState(() => openMissionId = null),
      );
    }
    return FutureBuilder<List<Mission>>(
      future: widget.repository.listMissions(),
      builder: (context, snapshot) => WorkspaceScreen(
        missions: snapshot.data ?? const [],
        onNewMission: () => setState(() => creating = true),
        onOpenMission: (id) => setState(() => openMissionId = id),
      ),
    );
  }
}
