import 'dart:async';

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'application/zavqera_ai_planner.dart';
import 'data/local_mission_store.dart';
import 'data/mission_repository.dart';
import 'domain/intent.dart';
import 'domain/mission.dart';
import 'infrastructure/supabase_config.dart';
import 'ui/auth_screen.dart';
import 'ui/intent_builder_screen.dart';
import 'ui/mission_screen.dart';
import 'ui/workspace_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  if (SupabaseConfig.isConfigured) {
    await Supabase.initialize(
      url: SupabaseConfig.url,
      anonKey: SupabaseConfig.publishableKey,
    );
  }

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
        title: 'ZAVQERA',
        theme: ThemeData(useMaterial3: true, colorSchemeSeed: Colors.indigo),
        home: SupabaseConfig.isConfigured
            ? _AuthGate(repository: repository)
            : _Home(repository: repository),
      );
}

class _AuthGate extends StatefulWidget {
  final DemoMissionRepository repository;

  const _AuthGate({required this.repository});

  @override
  State<_AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<_AuthGate> {
  StreamSubscription<AuthState>? _subscription;

  bool get _signedIn =>
      Supabase.instance.client.auth.currentSession != null;

  @override
  void initState() {
    super.initState();
    _subscription =
        Supabase.instance.client.auth.onAuthStateChange.listen((_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _subscription?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_signedIn) {
      return AuthScreen(onAuthenticated: () {
        if (mounted) setState(() {});
      });
    }
    return _Home(repository: widget.repository);
  }
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

  ZavqeraAiPlanner? get _aiPlanner {
    if (!SupabaseConfig.isConfigured) return null;
    if (Supabase.instance.client.auth.currentSession == null) return null;
    return ZavqeraAiPlanner(Supabase.instance.client);
  }

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
    if (creating) {
      return IntentBuilderScreen(
        onApproved: _create,
        aiPlanner: _aiPlanner,
      );
    }

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
