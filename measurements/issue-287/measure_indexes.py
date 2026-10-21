"""#287: 운영 연결 없이 격리 PostgreSQL 14에서 조회·인덱스 쓰기 비용을 측정합니다.

이 스크립트는 최종 스키마/마이그레이션이 아닙니다. 합성 데이터와 측정용 DDL만 사용하며
매 후보·크기·변형마다 테이블을 다시 만들어 이전 측정의 행 변경/인덱스 팽창을 격리합니다.
"""
import json
import os
from pathlib import Path
import shutil
import statistics
import subprocess
import tempfile
import time

ARTIFACTS = Path(os.environ.get('HRA_287_EVIDENCE_DIR', '/tmp/hra-287-evidence'))
ARTIFACTS.mkdir(parents=True, exist_ok=True)
BIN = Path(os.environ.get('HRA_TEST_PG_BIN', '/usr/lib/postgresql/14/bin'))
ROOT = Path(tempfile.mkdtemp(prefix='hra287-', dir=os.environ.get('TMPDIR', '/dev/shm/hra-287-tests')))
ENV = {'PATH': os.environ['PATH'], 'LC_ALL': 'C', 'PGHOST': str(ROOT), 'PGPORT': '55471', 'PGUSER': 'hra_test', 'PGDATABASE': 'postgres'}
PSQL = [str(BIN / 'psql'), '-X', '-Atq', '-v', 'ON_ERROR_STOP=1']
REPORT = {'scope': 'isolated synthetic measurements; no production evidence', 'sizes': {'small': 120, 'large': 200000}, 'results': []}


def program(name, args):
    """고유한 소켓·데이터 디렉터리만 사용하는 로컬 도구를 실행합니다."""
    return subprocess.run([str(BIN / name), *args], env=ENV, check=True, capture_output=True, text=True).stdout


def sql(statement):
    """환경 파일이나 운영 연결 문자열을 읽지 않고 합성 측정 SQL만 전달합니다."""
    result = subprocess.run(PSQL, input=statement, env=ENV, capture_output=True, text=True, timeout=120)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()


def key(label, expression):
    """실제 계정·경로 대신 재현 가능한 합성 UUID를 만듭니다."""
    return f"md5('{label}' || ({expression})::text)::uuid"


def parent_key(expression):
    """희소 1행 키, 밀집 20% 키, 그 밖의 약 160행 키를 분리합니다."""
    return key('parent', expression)


RARE = parent_key('1')
MANY = parent_key('0')
NORMAL = parent_key('4')
ABSENT = parent_key('999999')
PARENT = parent_key('CASE WHEN g=1 THEN 1 WHEN g%5=0 THEN 0 ELSE 2+g%997 END')

CANDIDATES = [
    {
        'name': 'reservation', 'table': 'rate_limit_events',
        'source': ['src/lib/rate-limit.ts:95', 'src/features/applications/actions/submissions.ts:262'],
        'ddl': '''CREATE TABLE rate_limit_events(id uuid PRIMARY KEY, reservation_id uuid NOT NULL, scope varchar(32) NOT NULL,
          key_hash varchar(64) NOT NULL, attempted_at timestamptz NOT NULL, submission_id uuid);
          CREATE INDEX idx_rate_limit_scope_key_time ON rate_limit_events(scope,key_hash,attempted_at);
          CREATE INDEX idx_rate_limit_attempted_at ON rate_limit_events(attempted_at);
          CREATE INDEX idx_rate_limit_submission_id ON rate_limit_events(submission_id);''',
        'columns': 'id,reservation_id,scope,key_hash,attempted_at,submission_id',
        'seed': f"SELECT {key('event','g')},{key('reservation','(g-1)/3')},(ARRAY['login-ip','login-pair','login-email'])[1+g%3],repeat(md5(g::text),2),timestamp '2026-10-21'-(g%86400)*interval '1 second',NULL::uuid FROM generate_series(1,{{n}}) g",
        'variants': {'baseline': None, 'single': '(reservation_id)'},
        'queries': {
            'one_reservation_3_rows': f"SELECT * FROM rate_limit_events WHERE reservation_id={key('reservation','10')}",
            'many_reservations_192_rows': f"SELECT * FROM rate_limit_events WHERE reservation_id IN (SELECT {key('reservation','g')} FROM generate_series(0,63) g)",
            'absent': f"SELECT * FROM rate_limit_events WHERE reservation_id={key('reservation','999999')}",
        },
        'writes': {
            'successful_login_delete': f"DELETE FROM rate_limit_events WHERE reservation_id={key('reservation','10')}",
            'attach_submission': f"UPDATE rate_limit_events SET submission_id={RARE} WHERE reservation_id={key('reservation','10')}",
            'many_login_deletes': 'DO $do$ BEGIN FOR chosen IN 0..63 LOOP DELETE FROM rate_limit_events WHERE reservation_id=md5(\'reservation\'||chosen::text)::uuid; END LOOP; END $do$',
        },
    },
    {
        'name': 'gallery', 'table': 'gallery_images', 'source': ['src/features/gallery/actions/index.ts:68', 'src/features/gallery/actions/index.ts:372'],
        'ddl': 'CREATE TABLE gallery_images(id uuid PRIMARY KEY,gallery_id uuid NOT NULL,url text NOT NULL,alt varchar(255),"order" integer NOT NULL,created_at timestamp NOT NULL);',
        'columns': 'id,gallery_id,url,alt,"order",created_at',
        'seed': f"SELECT {key('image','g')},{PARENT},'https://example.invalid/'||g||'.png','합성 사진',g%17,timestamp '2026-10-21'-(g%86400)*interval '1 second' FROM generate_series(1,{{n}}) g",
        'variants': {'baseline': None, 'single': '(gallery_id)', 'ordered': '(gallery_id,"order",created_at)'},
        'queries': {f'{label}_ordered': f'SELECT * FROM gallery_images WHERE gallery_id={value} ORDER BY "order",created_at' for label, value in [('rare', RARE), ('normal', NORMAL), ('many', MANY)]},
        'writes': {'reorder_normal_album': f'UPDATE gallery_images SET "order"="order"+1 WHERE gallery_id={NORMAL}'},
    },
    {
        'name': 'answers_submission', 'table': 'application_answers', 'source': ['src/app/(admin)/admin/application-forms/[id]/submissions/[submissionId]/page.tsx:56'],
        'ddl': 'CREATE TABLE application_answers(id uuid PRIMARY KEY,submission_id uuid NOT NULL,question_id uuid NOT NULL,value text NOT NULL);',
        'columns': 'id,submission_id,question_id,value',
        'seed': f"SELECT {key('answer','g')},{PARENT},{parent_key('CASE WHEN g=1 THEN 1 WHEN g={n} THEN 1001 WHEN g%7=0 THEN 0 ELSE 2+g%499 END')},repeat('합성 답변 ',30) FROM generate_series(1,{{n}}) g",
        'variants': {'baseline': None, 'single': '(submission_id)', 'both': '(submission_id)'},
        'queries': {f'{label}_details': f'SELECT * FROM application_answers WHERE submission_id={value}' for label, value in [('rare', RARE), ('normal', NORMAL), ('many', MANY)]},
        'writes': {'delete_submission_answers': f'DELETE FROM application_answers WHERE submission_id={NORMAL}'},
    },
    {
        'name': 'answers_question', 'table': 'application_answers', 'source': ['scripts/migrate-atomic-application-questions.sql:64'],
        'ddl': 'CREATE TABLE application_answers(id uuid PRIMARY KEY,submission_id uuid NOT NULL,question_id uuid NOT NULL,value text NOT NULL);',
        'columns': 'id,submission_id,question_id,value',
        'seed': f"SELECT {key('answer','g')},{PARENT},{parent_key('CASE WHEN g=1 THEN 1 WHEN g={n} THEN 1001 WHEN g%7=0 THEN 0 ELSE 2+g%499 END')},repeat('합성 답변 ',30) FROM generate_series(1,{{n}}) g",
        'variants': {'baseline': None, 'single': '(question_id)'},
        'queries': {f'{label}_exists': f'SELECT EXISTS(SELECT 1 FROM application_answers WHERE question_id={value})' for label, value in [('rare_first', RARE), ('rare_last', parent_key('1001')), ('many', MANY), ('absent', ABSENT)]},
        'writes': {},
    },
    {
        'name': 'class_logs', 'table': 'class_logs', 'source': ['src/app/(member)/resources/class-logs/page.tsx:80'],
        'ddl': 'CREATE TABLE class_logs(id uuid PRIMARY KEY,title varchar(300) NOT NULL,content text NOT NULL,class_date timestamp NOT NULL,cohort_id uuid,author_id uuid,view_count integer NOT NULL,created_at timestamp NOT NULL,updated_at timestamp NOT NULL);',
        'columns': 'id,title,content,class_date,cohort_id,author_id,view_count,created_at,updated_at',
        'seed': f"SELECT {key('log','g')},'합성 수업 '||g,repeat('합성 수업 본문 ',30),timestamp '2026-10-21'-(g%730)*interval '1 day',{PARENT},{RARE},0,timestamp '2026-10-21'-(g%86400)*interval '1 second',timestamp '2026-10-21' FROM generate_series(1,{{n}}) g",
        'variants': {'baseline': None, 'single': '(cohort_id)', 'ordered': '(cohort_id,class_date DESC,created_at DESC)'},
        'queries': {f'{label}_ordered': f'SELECT l.*,u.name FROM class_logs l LEFT JOIN measurement_users u ON u.id=l.author_id WHERE l.cohort_id={value} ORDER BY class_date DESC,created_at DESC' for label, value in [('rare', RARE), ('normal', NORMAL), ('many', MANY)]},
        'writes': {'update_view_count': f'UPDATE class_logs SET view_count=view_count+1 WHERE cohort_id={NORMAL}', 'change_class_date': f"UPDATE class_logs SET class_date=class_date+interval '1 day' WHERE cohort_id={NORMAL}"},
    },
    {
        'name': 'sessions', 'table': 'schedule_sessions', 'source': ['src/features/schedule/actions/index.ts:155', 'src/features/schedule/actions/index.ts:380'],
        'ddl': 'CREATE TABLE schedule_sessions(id uuid PRIMARY KEY,schedule_event_id uuid NOT NULL,category session_category NOT NULL,faculty_id uuid,content text,report_category varchar(50),sub_title text,sub_description text,"order" integer NOT NULL);',
        'columns': 'id,schedule_event_id,category,faculty_id,content,report_category,sub_title,sub_description,"order"',
        'seed': f"SELECT {key('session','g')},{PARENT},'CLASSICS',NULL::uuid,repeat('합성 수업 ',12),NULL::varchar,NULL::text,NULL::text,g%4 FROM generate_series(1,{{n}}) g",
        'variants': {'baseline': None, 'single': '(schedule_event_id)', 'ordered': '(schedule_event_id,"order")'},
        'queries': {f'{label}_ordered': f'SELECT * FROM schedule_sessions WHERE schedule_event_id={value} ORDER BY "order"' for label, value in [('rare', RARE), ('normal', NORMAL), ('many', MANY)]},
        'writes': {'reorder_normal_event': f'UPDATE schedule_sessions SET "order"="order"+1 WHERE schedule_event_id={NORMAL}', 'lock_normal_event': f'SELECT id FROM schedule_sessions WHERE schedule_event_id={NORMAL} FOR UPDATE'},
    },
]


def summarize(plan):
    """최상위 실행 계획의 누적 버퍼·WAL을 사용해 자식 노드 중복 합산을 피합니다."""
    root = plan['Plan']
    nodes = []
    def collect(node):
        nodes.append(node['Node Type'] + (':' + node['Index Name'] if 'Index Name' in node else ''))
        for child in node.get('Plans', []):
            collect(child)
    collect(root)
    return {
        'execution_ms': plan['Execution Time'], 'planning_ms': plan['Planning Time'],
        'rows': root['Actual Rows'], 'shared_hit': root.get('Shared Hit Blocks', 0),
        'shared_read': root.get('Shared Read Blocks', 0), 'shared_dirtied': root.get('Shared Dirtied Blocks', 0),
        'wal_records': root.get('WAL Records', 0), 'wal_fpi': root.get('WAL FPI', 0), 'wal_bytes': root.get('WAL Bytes', 0),
        'nodes': nodes,
    }


def explain(query, write=False, table=None):
    """버퍼를 예열한 뒤 세 번 측정하고, DML은 측정 전용 트랜잭션으로 롤백합니다."""
    command = f'EXPLAIN (ANALYZE,BUFFERS,WAL,FORMAT JSON) {query};'
    records = []
    if not write:
        sql(command)
    for _ in range(3):
        if write:
            sql('CHECKPOINT;')
        raw = sql('BEGIN;'+command+'ROLLBACK;' if write else command)
        plan = json.loads(raw)[0]
        records.append({'summary': summarize(plan), 'plan': plan})
        if write:
            # 롤백한 UPDATE/INSERT가 남긴 dead tuple을 다음 반복 전에 회수합니다.
            sql(f'VACUUM ANALYZE {table};')
    summary = dict(records[1]['summary'])
    for field in ['execution_ms','planning_ms','shared_hit','shared_read','shared_dirtied','wal_records','wal_fpi','wal_bytes']:
        summary[field] = statistics.median(record['summary'][field] for record in records)
    return {'sql': query, 'median': summary, 'samples': records}


started = False
try:
    program('initdb', ['-D',str(ROOT/'data'),'-A','trust','-U','hra_test','--no-locale','-E','UTF8'])
    program('pg_ctl', ['-D',str(ROOT/'data'),'-l',str(ROOT/'server.log'),'-o',f"-h '' -k {ROOT} -p 55471",'-w','start'])
    started = True
    REPORT['postgres_version'] = sql('SHOW server_version;')
    assert sql('SHOW server_version_num;').startswith('14')
    REPORT['planner_settings'] = json.loads(sql("SELECT json_build_object('enable_seqscan',current_setting('enable_seqscan'),'random_page_cost',current_setting('random_page_cost'),'effective_cache_size',current_setting('effective_cache_size'),'shared_buffers',current_setting('shared_buffers'),'work_mem',current_setting('work_mem'),'jit',current_setting('jit'))"))
    sql(f"CREATE TYPE session_category AS ENUM ('CLASSICS','ENGLISH','SPEECH','SPECIAL_LECTURE','CASE_STUDY'); CREATE TABLE measurement_users(id uuid PRIMARY KEY,name varchar(100)); INSERT INTO measurement_users VALUES ({RARE},'합성 작성자');")
    for size, count in REPORT['sizes'].items():
        for candidate in CANDIDATES:
            table = candidate['table']
            for variant, index in candidate['variants'].items():
                sql(f'DROP INDEX IF EXISTS measurement_candidate_idx; DROP INDEX IF EXISTS measurement_secondary_idx; DROP TABLE IF EXISTS {table};'+candidate['ddl'])
                n = count * 3 if candidate['name']=='reservation' else count
                sql(f"INSERT INTO {table}({candidate['columns']}) "+candidate['seed'].format(n=n)+';')
                if index:
                    sql(f'CREATE INDEX measurement_candidate_idx ON {table}{index};')
                if variant == 'both':
                    sql(f'CREATE INDEX measurement_secondary_idx ON {table}(question_id);')
                sql(f'VACUUM (FREEZE,ANALYZE) {table}; CHECKPOINT;')
                result = {'candidate':candidate['name'],'size':size,'row_count':n,'variant':variant,'index':index,'secondary_index':'(question_id)' if variant=='both' else None,'source':candidate['source']}
                result['storage'] = json.loads(sql(f"SELECT json_build_object('table_bytes',pg_table_size('{table}'),'all_indexes_bytes',pg_indexes_size('{table}'),'candidate_bytes',coalesce(pg_relation_size(to_regclass('measurement_candidate_idx')),0)+coalesce(pg_relation_size(to_regclass('measurement_secondary_idx')),0))"))
                result['reads'] = {name:explain(query) for name,query in candidate['queries'].items()}
                result['writes'] = {name:explain(query,write=True,table=table) for name,query in candidate['writes'].items() if not query.startswith('DO ')}
                # PK·기존 인덱스를 유지한 채 같은 열 목록의 100개 INSERT 비용을 비교합니다.
                insert_query = f"INSERT INTO {table}({candidate['columns']}) "+candidate['seed'].replace('generate_series(1,{n})',f'generate_series({n+1},{n+100})').format(n=n)
                result['writes']['insert_100'] = explain(insert_query,write=True,table=table)
                if candidate['name']=='reservation':
                    # 실제 한 예약은 세 축입니다. 여러 성공 로그인 정리도 동등 조건을 반복합니다.
                    cleanup = candidate['writes']['many_login_deletes']
                    began=time.perf_counter()
                    sql('BEGIN;'+cleanup+';ROLLBACK;')
                    result['many_cleanup_64_ids_ms']=(time.perf_counter()-began)*1000
                REPORT['results'].append(result)
                (ARTIFACTS/'report.json').write_text(json.dumps(REPORT,ensure_ascii=False,indent=2)+'\n')
                print(f"DONE {size} {candidate['name']} {variant}",flush=True)
    REPORT['limitations'] = [
        '합성 데이터이며 운영 데이터 크기·선택도·지연·카탈로그 증거가 아닙니다.',
        'child query predicate/order와 payload를 재현하며 Drizzle JSON 집계·앱·네트워크 비용은 제외합니다.',
        '측정용 child table은 기존 PK와 rate-limit 인덱스를 보존하지만 외래키/트리거 비용은 제외합니다.',
        '밀집 키 20%와 큰 세션·갤러리 fan-out은 스트레스 사례이며 실제 운영 분포로 추정하지 않습니다.',
        '읽기는 예열 후 3회, 쓰기는 CHECKPOINT·ROLLBACK·VACUUM을 사용한 3회 중앙값입니다.',
        '쓰기 반복의 인덱스/페이지 재사용과 full-page WAL 차이가 있어 절대 지연 비율을 보장하지 않습니다.',
        '자동 시간 임계값이나 순차 스캔 강제 설정 없이 실제 planner 선택을 보존합니다.',
    ]
    (ARTIFACTS/'report.json').write_text(json.dumps(REPORT,ensure_ascii=False,indent=2)+'\n')
finally:
    if started:
        program('pg_ctl',['-D',str(ROOT/'data'),'-m','immediate','-w','stop'])
    shutil.rmtree(ROOT)
