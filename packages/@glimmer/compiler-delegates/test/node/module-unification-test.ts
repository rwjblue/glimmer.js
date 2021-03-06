import { MUCodeGenerator } from '@glimmer/compiler-delegates';
import {
  ModuleLocatorMap,
  ExternalModuleTable,
  BundleCompilationResult,
} from '@glimmer/bundle-compiler';
import { sync as findup } from 'find-up';
import { ProgramSymbolTable, ConstantPool } from '@glimmer/interfaces';
import { Project } from 'glimmer-analyzer';
import { artifacts as artifactsFor } from '@glimmer/program';
import { Context } from '@glimmer/opcode-compiler';

const { module, test } = QUnit;

let generator: MUCodeGenerator;

let table: ExternalModuleTable;
let pool: ConstantPool;
let symbolTables: ModuleLocatorMap<ProgramSymbolTable>;

module('Module Unification Delegate', {
  beforeEach() {
    let projectPath = findup('packages/@glimmer/compiler-delegates/test/node/fixtures/code-gen');
    let project = new Project(projectPath);

    table = new ExternalModuleTable();
    let artifacts = artifactsFor(Context());

    pool = artifacts.constants;
    symbolTables = new ModuleLocatorMap();
    let compilation: BundleCompilationResult = {
      main: 0,
      heap: artifacts.heap,
      pool: artifacts.constants,
      table,
      symbolTables,
    };

    let outputFiles = {
      dataSegment: 'data.ts',
      heapFile: 'templates.gbx',
    };

    generator = new MUCodeGenerator(project, outputFiles, {}, compilation, {
      module: '@glimmer/application',
      name: 'mainLayout',
    });
  },
});

test('can generate the serialized constants pool ', assert => {
  pool.strings.push('a', 'b', 'c');
  pool.handles.push(1, 2, 3);
  let serializedPool = generator.generateConstantPool(pool);

  assert.equal(serializedPool, `const pool =JSON.parse(${JSON.stringify(JSON.stringify(pool))});`);
});

test('can generate the heap table', assert => {
  let heap = {
    table: [0, 0, 0, 30, 0, 0, 121, 0, 0, 211, 8, 0, 367, 0, 0, 423, 0, 0],
    handle: 18, // Handle must be divisble Size.ENTRY_SIZE
    buffer: new ArrayBuffer(1704),
  };
  let serializedHeaptable = generator.generateHeap(heap as any);

  assert.equal(
    serializedHeaptable,
    `const heap =JSON.parse(${JSON.stringify(
      JSON.stringify({
        table: [0, 0, 0, 30, 0, 0, 121, 0, 0, 211, 8, 0, 367, 0, 0, 423, 0, 0],
        handle: 18,
      })
    )});`
  );
});

test('heap table should be balanced', assert => {
  assert.throws(() => {
    generator.generateHeap({ table: [0, 650, 40, 100] } as any);
  }, /Heap table should be balanced and divisible by 3/);
});

test('can generate the specifier map', assert => {
  let locator = {
    name: 'default',
    module: './src/ui/components/x/template.hbs',
  };
  table.vmHandleByModuleLocator.set(locator, 0);
  table.byModuleLocator.set(locator, 100);
  let serializedTable = generator.generateSpecifierMap(table);

  assert.deepEqual(serializedTable, {
    'template:/my-project/components/x': [0, 100],
  });
});

test("specifier's module path needs to be well formed", assert => {
  table.vmHandleByModuleLocator.set({ name: 'default', module: 'B' }, 0);

  assert.deepEqual(
    generator.generateSpecifierMap(table),
    {},
    'does not generate specifier map entry for non-MU modules'
  );
});

test('can generate symbol tables', assert => {
  symbolTables.set({ name: 'default', module: './src/ui/components/x/template.hbs' }, {
    hasEval: 0,
    symbols: [],
  } as any);
  let serializedSymbolTables = generator.generateSymbolTables(symbolTables);
  assert.deepEqual(serializedSymbolTables, {
    'template:/my-project/components/x': { hasEval: 0, symbols: [] },
  } as any);
});

test('can generate the external module table', assert => {
  table.byHandle.set(0, {
    name: 'default',
    module: './src/ui/components/x/template.hbs',
  });
  let serializedModuleTable = generator.generateExternalModuleTable(table);
  assert.equal(
    serializedModuleTable,
    `\nimport component_0 from \"./src/ui/components/x/component\";\nconst table = [component_0];\n`
  );
});
