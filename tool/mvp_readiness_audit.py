#!/usr/bin/env python3
from pathlib import Path
import json, re, sys
root = Path(__file__).resolve().parents[1]
errors=[]; warnings=[]
files=[p for p in root.rglob('*') if p.is_file() and '.git' not in p.parts and '__pycache__' not in p.parts]
scan_files=[p for p in files if p != Path(__file__) and p.name not in {'MVP_READINESS_AUDIT.json','NEXO_STATIC_CONTRACT_REPORT.json'}]
text='\n'.join(p.read_text(errors='ignore') for p in scan_files if p.suffix in {'.dart','.yaml','.yml','.md','.sh','.py','.json'})
required = ['lib','test','tool/verify_project.sh','.github/workflows/flutter.yml','pubspec.yaml']
for item in required:
    if not (root/item).exists(): errors.append(f'MISSING_REQUIRED:{item}')
for pat, label in [(r'(?i)(service_role|anon[_-]?key|access[_-]?token|password\s*[:=])','POSSIBLE_SECRET'),
                   (r'(?i)drop\s+table|truncate\s+table|drop\s+schema','DESTRUCTIVE_SQL')]:
    if re.search(pat,text): warnings.append(label)
if not list((root/'test').glob('*.dart')): errors.append('NO_TEST_FILES')
if 'flutter pub get' not in (root/'tool/verify_project.sh').read_text(): errors.append('VERIFY_GATE_MISSING_PUB_GET')
if 'flutter analyze' not in (root/'tool/verify_project.sh').read_text(): errors.append('VERIFY_GATE_MISSING_ANALYZE')
if 'flutter test' not in (root/'tool/verify_project.sh').read_text(): errors.append('VERIFY_GATE_MISSING_TEST')
workflow=(root/'.github/workflows/flutter.yml').read_text(errors='ignore')
for marker in ['subosito/flutter-action@v2','flutter-version: "3.47.2"','./tool/verify_project.sh']:
    if marker not in workflow: errors.append(f'WORKFLOW_MISSING:{marker}')
report={'status':'PASS' if not errors else 'FAIL','errors':errors,'warnings':warnings,
        'dart_files':len(list(root.rglob('*.dart'))),'lib_files':len(list((root/'lib').rglob('*.dart'))),
        'test_files':len(list((root/'test').rglob('*.dart'))),
        'required_checks':required}
print(json.dumps(report,indent=2))
sys.exit(0 if not errors else 1)
