#!/usr/bin/env python3
from pathlib import Path
import hashlib, json, re, sys

ROOT = Path(__file__).resolve().parents[1]
DART_FILES = list((ROOT / 'lib').rglob('*.dart')) + list((ROOT / 'test').rglob('*.dart'))
ALL_REL = {p.relative_to(ROOT).as_posix() for p in DART_FILES}
errors = []
warnings = []

ALLOWED_EXTERNAL = {
    'package:flutter/',
    'package:flutter_test/',
    'package:supabase_flutter/',
    'package:crypto/',
    'package:test/',
}

for path in DART_FILES:
    text = path.read_text(encoding='utf-8')
    relpath = path.relative_to(ROOT).as_posix()
    for m in re.finditer(r"(?:import|export|part)\s+['\"]([^'\"]+)['\"]", text):
        ref = m.group(1)
        if ref.startswith('package:nexo_followthrough/'):
            rel = 'lib/' + ref[len('package:nexo_followthrough/'):]
            if rel not in ALL_REL and rel + '.dart' not in ALL_REL:
                errors.append(f'missing package reference: {relpath}: {ref}')
        elif ref.startswith('.'):
            target = (path.parent / ref).resolve()
            try:
                rel = target.relative_to(ROOT).as_posix()
            except ValueError:
                errors.append(f'outside-project relative reference: {relpath}: {ref}')
                continue
            if rel not in ALL_REL and rel + '.dart' not in ALL_REL:
                errors.append(f'missing relative reference: {relpath}: {ref}')
        elif ref.startswith('package:') and not any(ref.startswith(p) for p in ALLOWED_EXTERNAL):
            warnings.append(f'unlisted external package: {relpath}: {ref}')

pubspec = (ROOT / 'pubspec.yaml').read_text(encoding='utf-8')
if not re.search(r'^name:\s*nexo_followthrough\s*$', pubspec, re.M):
    errors.append('pubspec package name is not nexo_followthrough')

required = [
    'lib/domain/security_constitution.dart',
    'lib/application/security_constitution_guard.dart',
    'lib/application/provenance_chain.dart',
    'lib/application/trust_graph.dart',
    'docs/V1_7_AUDIT_PROVENANCE_CHAIN.md',
    'docs/V1_8_NEXO_TRUST_GRAPH.md',
    'docs/V1_9_NEXO_SECURITY_CONSTITUTION.md',
    'test/security_constitution_test.dart',
    'test/provenance_trust_graph_test.dart',
    '.github/workflows/flutter.yml',
    'analysis_options.yaml',
    'tool/verify_project.sh',
]
for item in required:
    if not (ROOT / item).is_file():
        errors.append(f'missing required artifact: {item}')

for forbidden in ['.env', '.env.production', 'supabase/config.toml']:
    if (ROOT / forbidden).exists():
        errors.append(f'forbidden runtime/config artifact present: {forbidden}')

verify = (ROOT / 'tool/verify_project.sh').read_text(encoding='utf-8')
for required_cmd in [
    'flutter pub get',
    'dart format --set-exit-if-changed lib test',
    'flutter analyze',
    'flutter test',
]:
    if required_cmd not in verify:
        errors.append(f'Flutter gate missing from verify script: {required_cmd}')

report = {
    'status': 'STATIC_PASS' if not errors else 'STATIC_FAIL',
    'dart_files': len(DART_FILES),
    'lib_files': len(list((ROOT / 'lib').rglob('*.dart'))),
    'test_files': len(list((ROOT / 'test').rglob('*.dart'))),
    'errors': errors,
    'warnings': warnings,
    'sha256': {
        p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
        for p in sorted(DART_FILES)
    },
}

out = ROOT / 'NEXO_STATIC_CONTRACT_REPORT.json'
out.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps({k: report[k] for k in ('status','dart_files','lib_files','test_files','errors','warnings')}, indent=2))
sys.exit(1 if errors else 0)
