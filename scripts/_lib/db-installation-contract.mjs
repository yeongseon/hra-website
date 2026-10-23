/**
 * 소스 inventory를 외래키 정본으로 사용하는 읽기 전용 설치 의미 대응표를 검사합니다.
 * SQL·관리 모듈·schema export를 실행하지 않으며 실제 DB 적용·운영 승인을 판정하지 않습니다.
 */
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const keys = (value, expected) => plain(value) && Object.keys(value).sort().join() === [...expected].sort().join();
const text = value => typeof value === 'string' && value.trim().length >= 5 && value.length <= 1200 && !value.includes('\0');
const id = value => typeof value === 'string' && /^[a-z][a-z0-9-]{0,79}$/.test(value);
const repoPath = value => typeof value === 'string' && /^(?:scripts|src|tests|docs)\/[a-zA-Z0-9_./()[\]-]+\.(?:mjs|sql|tsx?|md)$/.test(value) && value.split('/').every(part => part && part !== '.' && part !== '..');
const list = (value, maximum = 500) => Array.isArray(value) && value.length <= maximum;
const distinct = value => new Set(value).size === value.length;
const descriptions = (value, required = true) => list(value, 50) && (!required || value.length > 0) && value.every(text);
const relations = new Set(['primary', 'equivalent', 'replacement', 'unresolved', 'wrapper', 'data-only', 'inspection', 'external-only']);

/** 고정 진단만 반환하며 경로·설명·SQL 원문은 오류 결과에 반사하지 않습니다. */
export function validateInstallationContract(input = {}) {
  const { contract, inventory, trackedPaths, evidenceLineCounts } = plain(input) ? input : {};
  const diagnostics = new Set();
  const add = code => diagnostics.add(code);
  const result = () => ({ ok: diagnostics.size === 0, diagnostics: [...diagnostics].sort(), coverageComplete: false, freshReady: false,
    counts: { sources: 0, objects: 0, requiredUnresolved: 0 }, sourceOnly: true, observedDatabase: false, productionReady: false });
  if (!plain(inventory) || inventory.version !== 1 || !list(inventory.sql, 1000) || !list(inventory.scripts, 1000) || !list(inventory.g1Order, 1000)) { add('INSTALL_INVENTORY_INVALID'); return result(); }
  const inventoryRefs = [...inventory.sql, ...inventory.scripts].map(entry => entry?.path);
  if (!inventoryRefs.every(repoPath) || !distinct(inventoryRefs) || !inventory.g1Order.every(ref => inventory.sql.some(entry => entry.path === ref)) || !distinct(inventory.g1Order)) { add('INSTALL_INVENTORY_INVALID'); return result(); }
  if (!keys(contract, ['version', 'inventoryRef', 'schemaExport', 'sources', 'objects', 'fixtures']) || contract.version !== 1 || contract.inventoryRef !== 'scripts/db/source-inventory.json' || !list(contract.sources, 2000) || !list(contract.objects, 1000) || !list(contract.fixtures, 20)) { add('INSTALL_SCHEMA_INVALID'); return result(); }
  const known = new Set(inventoryRefs), sources = new Map(), objects = new Map();
  const validRef = ref => typeof ref === 'string' && known.has(ref);
  const stringRefs = value => list(value) && value.every(item => typeof item === 'string') && distinct(value);
  const evidence = value => {
    if (!list(value, 40) || !value.length) return false;
    for (const entry of value) {
      if (!keys(entry, ['file', 'line', 'note']) || !repoPath(entry.file) || !Number.isSafeInteger(entry.line) || entry.line < 1 || !text(entry.note)) return false;
      if (trackedPaths !== undefined && (!Array.isArray(trackedPaths) || !trackedPaths.includes(entry.file))) add('INSTALL_EVIDENCE_UNTRACKED');
      if (evidenceLineCounts !== undefined && (!plain(evidenceLineCounts) || !Number.isSafeInteger(evidenceLineCounts[entry.file]) || entry.line > evidenceLineCounts[entry.file])) add('INSTALL_EVIDENCE_LOCATION');
    }
    return true;
  };
  const tracked = file => { if (trackedPaths !== undefined && (!Array.isArray(trackedPaths) || !trackedPaths.includes(file))) add('INSTALL_EVIDENCE_UNTRACKED'); if (evidenceLineCounts !== undefined && (!plain(evidenceLineCounts) || !Number.isSafeInteger(evidenceLineCounts[file]) || evidenceLineCounts[file] < 1)) add('INSTALL_EVIDENCE_LOCATION'); };
  if (!keys(contract.schemaExport, ['entry', 'description', 'checks', 'evidence']) || contract.schemaExport.entry !== 'src/lib/db/schema.ts' || !text(contract.schemaExport.description) || !descriptions(contract.schemaExport.checks) || !evidence(contract.schemaExport.evidence)) add('INSTALL_EXPORT_INVALID');
  else { tracked(contract.schemaExport.entry); if (!contract.schemaExport.evidence.some(entry => entry.file === contract.schemaExport.entry)) add('INSTALL_EXPORT_EVIDENCE'); }
  for (const source of contract.sources) {
    if (!keys(source, ['ref', 'phase', 'fresh', 'objects', 'requires', 'checks', 'evidence', 'unresolved']) || !repoPath(source.ref) || !['schema-overlap', 'custom-definition', 'academic', 'preflight', 'data', 'external'].includes(source.phase) ||
      !keys(source.fresh, ['disposition', 'required', 'reason']) || !['include', 'exclude', 'unresolved'].includes(source.fresh.disposition) || typeof source.fresh.required !== 'boolean' || !text(source.fresh.reason) ||
      !stringRefs(source.objects) || !source.objects.length || !stringRefs(source.requires) || !descriptions(source.checks) || !evidence(source.evidence) || !descriptions(source.unresolved, false)) { add('INSTALL_SOURCE_SCHEMA'); continue; }
    if (!known.has(source.ref)) add('INSTALL_SOURCE_UNKNOWN');
    if (sources.has(source.ref)) add('INSTALL_SOURCE_DUPLICATE');
    sources.set(source.ref, source);
    if (source.fresh.required && source.fresh.disposition === 'exclude') add('INSTALL_REQUIRED_EXCLUDED');
    if (source.fresh.disposition === 'unresolved' && !source.unresolved.length) add('INSTALL_UNRESOLVED_REASON');
    if (source.fresh.disposition === 'include' && source.unresolved.length) add('INSTALL_FALSE_READY');
  }
  for (const ref of known) if (!sources.has(ref)) add('INSTALL_SOURCE_MISSING');
  const names = new Set();
  for (const object of contract.objects) {
    if (!keys(object, ['id', 'kind', 'names', 'owner', 'definitions', 'requires', 'checks', 'unresolved', 'requiredForFresh']) || !id(object.id) ||
      !['table-set', 'type-set', 'trigger-set', 'column', 'constraint-set', 'function-set', 'index-set', 'view', 'data-effect', 'external-effect', 'inspection'].includes(object.kind) ||
      !list(object.names, 150) || !object.names.length || !distinct(object.names) || !object.names.every(name => typeof name === 'string' && /^[a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*){0,2}(?:\([a-z0-9_,\[\] ]*\))?$/.test(name)) ||
      !(object.owner === 'schema-export' || validRef(object.owner)) || !list(object.definitions, 30) || !object.definitions.length || !stringRefs(object.requires) || !descriptions(object.checks) || !descriptions(object.unresolved, false) || typeof object.requiredForFresh !== 'boolean') { add('INSTALL_OBJECT_SCHEMA'); continue; }
    if (objects.has(object.id)) add('INSTALL_OBJECT_DUPLICATE'); objects.set(object.id, object);
    for (const name of object.names) { const key = `${object.kind}:${name}`; if (names.has(key)) add('INSTALL_OBJECT_NAME_DUPLICATE'); names.add(key); }
    const definitions = new Set(); let primary = 0, unresolved = false;
    for (const definition of object.definitions) {
      if (!keys(definition, ['source', 'relationship', 'reason']) || !(definition.source === 'schema-export' || validRef(definition.source)) || !relations.has(definition.relationship) || !text(definition.reason)) { add('INSTALL_DEFINITION_INVALID'); continue; }
      if (definitions.has(definition.source)) add('INSTALL_DEFINITION_DUPLICATE'); definitions.add(definition.source);
      if (definition.relationship === 'primary') { primary++; if (definition.source !== object.owner) add('INSTALL_OWNER_MISMATCH'); }
      if (definition.relationship === 'unresolved') unresolved = true;
    }
    if (primary !== 1) add('INSTALL_OWNER_MISSING');
    if (unresolved && !object.unresolved.length) add('INSTALL_UNRESOLVED_REASON');
  }
  for (const source of sources.values()) {
    for (const objectId of [...source.objects, ...source.requires]) if (!objects.has(objectId)) add('INSTALL_OBJECT_UNKNOWN');
    for (const objectId of source.objects) if (objects.has(objectId) && !objects.get(objectId).definitions.some(definition => definition?.source === source.ref)) add('INSTALL_SOURCE_DEFINITION_MISSING');
  }
  for (const object of objects.values()) {
    for (const dependency of object.requires) if (!objects.has(dependency) || dependency === object.id) add('INSTALL_PREREQUISITE_INVALID');
    for (const definition of object.definitions) if (definition?.source !== 'schema-export' && !sources.get(definition?.source)?.objects.includes(object.id)) add('INSTALL_DEFINITION_SOURCE_MISSING');
  }
  const visiting = new Set(), visited = new Set();
  const cycle = objectId => {
    if (visiting.has(objectId)) return true; if (visited.has(objectId)) return false;
    visiting.add(objectId); for (const dependency of objects.get(objectId)?.requires ?? []) if (cycle(dependency)) return true;
    visiting.delete(objectId); visited.add(objectId); return false;
  };
  const objectCycle = [...objects.keys()].some(cycle);
  if (objectCycle) add('INSTALL_PREREQUISITE_CYCLE');
  // 서로 다른 파일의 primary owner를 선행 소스로 연결합니다. 동일 파일 내부 순서는 이 그래프의 순환이 아닙니다.
  const sourceEdges = new Map([...sources.keys()].map(ref => [ref, new Set()]));
  const addOwnerEdge = (ref, objectId) => {
    const owner = objects.get(objectId)?.owner;
    if (owner && owner !== 'schema-export' && owner !== ref && sources.has(owner)) sourceEdges.get(ref).add(owner);
  };
  for (const source of sources.values()) {
    for (const dependency of source.requires) addOwnerEdge(source.ref, dependency);
    for (const provided of source.objects) for (const dependency of objects.get(provided)?.requires ?? []) addOwnerEdge(source.ref, dependency);
  }
  // predecessor를 새 표에 복제하지 않고 inventory의 유일 정본에서 읽어 의미 선행조건과 함께 검사합니다.
  const byInventoryId = new Map(inventory.sql.filter(entry => typeof entry.id === 'string').map(entry => [entry.id, entry.path]));
  for (const entry of inventory.sql) for (const predecessor of Array.isArray(entry.predecessors) ? entry.predecessors : []) {
    const parent = byInventoryId.get(predecessor);
    if (parent && sourceEdges.has(entry.path) && sourceEdges.has(parent)) sourceEdges.get(entry.path).add(parent);
  }
  const sourceVisiting = new Set(), sourceVisited = new Set();
  const sourceCycle = ref => {
    if (sourceVisiting.has(ref)) return true;
    if (sourceVisited.has(ref)) return false;
    sourceVisiting.add(ref);
    for (const dependency of sourceEdges.get(ref) ?? []) if (sourceCycle(dependency)) return true;
    sourceVisiting.delete(ref); sourceVisited.add(ref); return false;
  };
  // 객체 그래프에서 이미 찾은 같은 모순의 중복 진단은 생략합니다.
  if (!objectCycle && [...sourceEdges.keys()].some(sourceCycle)) add('INSTALL_SOURCE_CYCLE');
  const fixtureIds = new Set();
  for (const fixture of contract.fixtures) {
    if (!keys(fixture, ['id', 'file', 'description', 'steps', 'exclusions', 'evidence']) || !id(fixture.id) || !repoPath(fixture.file) || !text(fixture.description) || !list(fixture.steps, 100) || !fixture.steps.length || !list(fixture.exclusions, 1000) || !evidence(fixture.evidence)) { add('INSTALL_FIXTURE_SCHEMA'); continue; }
    tracked(fixture.file);
    if (!fixture.evidence.some(entry => entry.file === fixture.file)) add('INSTALL_FIXTURE_EVIDENCE');
    if (fixtureIds.has(fixture.id)) add('INSTALL_FIXTURE_DUPLICATE'); fixtureIds.add(fixture.id);
    const included = new Set();
    for (const step of fixture.steps) {
      if (!keys(step, ['kind', 'ref', 'repeatEach', 'note']) || !['schema-export', 'synthetic-base', 'synthetic-data', 'inventory-order', 'source', 'nested-source'].includes(step.kind) || ![1, 2].includes(step.repeatEach) || !text(step.note)) { add('INSTALL_FIXTURE_STEP'); continue; }
      if (['source', 'nested-source'].includes(step.kind)) { if (!validRef(step.ref) || !inventory.sql.some(entry => entry.path === step.ref) || included.has(step.ref)) add('INSTALL_FIXTURE_STEP'); included.add(step.ref); }
      else if (step.kind === 'inventory-order') { if (step.ref !== 'g1Order' || step.repeatEach !== 2) add('INSTALL_FIXTURE_STEP'); for (const ref of inventory.g1Order) { if (included.has(ref)) add('INSTALL_FIXTURE_STEP'); included.add(ref); } }
      else if (step.ref !== null || step.repeatEach !== 1) add('INSTALL_FIXTURE_STEP');
    }
    const excluded = new Set();
    for (const exclusion of fixture.exclusions) {
      if (!keys(exclusion, ['ref', 'reason']) || !validRef(exclusion.ref) || !inventory.sql.some(entry => entry.path === exclusion.ref) || !text(exclusion.reason) || excluded.has(exclusion.ref) || included.has(exclusion.ref)) add('INSTALL_FIXTURE_EXCLUSION');
      else excluded.add(exclusion.ref);
    }
    for (const entry of inventory.sql) if (!included.has(entry.path) && !excluded.has(entry.path)) add('INSTALL_FIXTURE_COVERAGE');
  }
  if (!contract.fixtures.length) add('INSTALL_FIXTURE_MISSING');
  const summary = result(); summary.ok = diagnostics.size === 0; summary.diagnostics = [...diagnostics].sort();
  summary.coverageComplete = inventoryRefs.length === sources.size && inventoryRefs.every(ref => sources.has(ref)) && !diagnostics.size;
  summary.counts.sources = sources.size; summary.counts.objects = objects.size;
  // 필수 객체의 최종 정의 소스가 제외된 경우도 미가용입니다. source와 object 의존성을 함께 전파합니다.
  const sourceUnavailable = new Set([...sources.values()].filter(source => source.fresh.disposition !== 'include' || source.unresolved.length).map(source => source.ref));
  const objectUnavailable = new Set([...objects.values()].filter(object => object.unresolved.length || object.definitions.some(definition => definition?.relationship === 'unresolved') || object.owner !== 'schema-export' && (!sources.has(object.owner) || sourceUnavailable.has(object.owner))).map(object => object.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const source of sources.values()) if (!sourceUnavailable.has(source.ref) && [...source.objects, ...source.requires].some(objectId => !objects.has(objectId) || objectUnavailable.has(objectId))) { sourceUnavailable.add(source.ref); changed = true; }
    for (const object of objects.values()) if (!objectUnavailable.has(object.id) && (object.requires.some(dependency => !objects.has(dependency) || objectUnavailable.has(dependency)) || object.owner !== 'schema-export' && sourceUnavailable.has(object.owner))) { objectUnavailable.add(object.id); changed = true; }
  }
  const blockers = [...sources.values()].filter(source => (source.fresh.required || source.fresh.disposition === 'include') && sourceUnavailable.has(source.ref));
  const requiredObjects = [...objects.values()].filter(object => object.requiredForFresh && objectUnavailable.has(object.id));
  summary.counts.requiredUnresolved = blockers.length + requiredObjects.length;
  summary.freshReady = summary.coverageComplete && summary.counts.requiredUnresolved === 0;
  return summary;
}
