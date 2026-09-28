"""Read a frozen local database; write report evidence, never call providers."""
import collections
import csv
import hashlib
import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRIVATE = ROOT / '.runtime/fund-report'
OUT = ROOT / 'reports/gama-fund-2026-09-27'
OUT.mkdir(parents=True, exist_ok=True)
runs = json.loads((PRIVATE / 'runs.json').read_text())
aggregate = json.loads((PRIVATE / 'aggregate.json').read_text())
con = sqlite3.connect(f'file:{PRIVATE / "evidence.sqlite3"}?mode=ro', uri=True)
con.row_factory = sqlite3.Row

def digest(x):
    return hashlib.sha256(json.dumps(x, sort_keys=True).encode()).hexdigest()[:12]

rows = []
for run in runs:
    for r in run['results']:
        m = run['metadata']
        rows.append(dict(run_id=run['id'], response_id=r['id'], model=m['model'],
                         protocol=m['comparison_hash'][:6], repetition=m['repetition'],
                         task=r['task'], level=r['difficulty'], latency_seconds=r['latency_seconds'],
                         input_tokens=r['tokens'].get('input'), output_tokens=r['tokens'].get('output'),
                         **{k:v for k,v in r['metrics'].items() if isinstance(v,(int,float)) or v is None}))
keys = list(dict.fromkeys(k for row in rows for k in row))
with (OUT / 'metricas_por_resposta.csv').open('w') as f:
    writer = csv.DictWriter(f, fieldnames=keys);writer.writeheader();writer.writerows(rows)
(OUT / 'metricas_agregadas.json').write_text(json.dumps(aggregate,ensure_ascii=False,indent=2))

summary = {'eligible_responses':len(rows),'series':{},'snapshots':{},'failures':[],'operational':{},'case_examples':{}}
for (model,protocol), group in __import__('itertools').groupby(sorted(rows,key=lambda r:(r['model'],r['protocol'])),key=lambda r:(r['model'],r['protocol'])):
    values=list(group)
    summary['series'][f'{model}/{protocol}']={'n':len(values),'task_counts':dict(collections.Counter(x['task']+'/'+x['level'] for x in values)),
       'mean_latency':sum(x['latency_seconds'] for x in values)/len(values),
       'input_tokens':sum(x['input_tokens'] or 0 for x in values),'output_tokens':sum(x['output_tokens'] or 0 for x in values)}
for run in runs:
    h=run['metadata']['comparison_hash'][:6];s=run['snapshot'];ds=s['dataset']
    summary['snapshots'][h]={'part_hashes':{k:digest(v) for k,v in s.items() if k not in ['model_config','settings','runtime','pricing']},
      'dataset_parts':{k:digest(v) for k,v in ds.items()},'dataset_keys':list(ds),
      'manifest':ds.get('manifest'),'prompt_headers':{k:v[:55] for k,v in s['prompts'].items()},
      'documents':{k:len(v) for k,v in ds['documents'].items()},'model_config':s['model_config'],'settings':s['settings']}
for row in con.execute('select id,run_id,status,data from live_calls'):
    d=json.loads(row['data']);key=d['model']
    summary['operational'].setdefault(key,collections.Counter())[row['status']]+=1
    if row['status']=='TECHNICAL_ERROR':
        p=d.get('provider_result') or d.get('response') or {}
        summary['failures'].append({'id':row['id'],'run_id':row['run_id'],'model':key,'task':d['task'],'repetition':d['repetition'],
             'error':d.get('error'),'failed_stage':d.get('failed_stage'),'data_keys':list(d),
             'latency_seconds':d.get('latency_seconds'),'validation_errors':d.get('validation_errors')})
for run in runs:
    if run['metadata']['provider']!='gemini':continue
    rep=run['metadata']['repetition']
    for r in run['results']:
        entry={'id':r['id'],'run_id':run['id'],'metrics':r['metrics'],'parsed_output':r['parsed_output']}
        summary['case_examples'][f"{r['task']}/{r['difficulty']}/{rep}"]=entry
(PRIVATE / 'analysis.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
print(json.dumps({k:v for k,v in summary.items() if k not in ['case_examples','snapshots']},ensure_ascii=False,indent=2))
print('SNAPSHOTS',json.dumps(summary['snapshots'],ensure_ascii=False,indent=2))
