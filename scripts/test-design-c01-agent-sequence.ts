import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runAgentImageSequence } from '../src/design-workbench/agent-image-sequence.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: () => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const nextTurn = () => new Promise(resolve => setImmediate(resolve));

test('only the started image has a placeholder, and every image settles before the next starts', async () => {
  const renders = Array.from({ length: 4 }, () => deferred<string>());
  const events: string[] = [];
  const task = runAgentImageSequence({
    count: 4, active: () => true,
    start: index => { events.push(`start:${index}`); return index; },
    generate: index => renders[index].promise,
    settle: index => { events.push(`settle:${index}`); },
  });
  assert.deepEqual(events, ['start:0']);
  for (let index = 0; index < 4; index++) {
    renders[index].resolve(`image:${index}`);
    await nextTurn();
    assert.deepEqual(events, Array.from({ length: index + 1 }, (_, i) => [`start:${i}`, `settle:${i}`]).flat().concat(index < 3 ? [`start:${index + 1}`] : []));
  }
  await task;
});

test('concurrent tasks finish independently without prestarting each others later images', async () => {
  const first = [deferred<string>(), deferred<string>()];
  const second = [deferred<string>(), deferred<string>()];
  const events: string[] = [];
  const run = (label: string, renders: ReturnType<typeof deferred<string>>[]) => runAgentImageSequence({
    count: 2, active: () => true,
    start: index => { events.push(`${label}:start:${index}`); return index; },
    generate: index => renders[index].promise,
    settle: index => { events.push(`${label}:settle:${index}`); },
  });
  const a = run('a', first), b = run('b', second);
  second[0].resolve('b0'); await nextTurn();
  assert.deepEqual(events, ['a:start:0', 'b:start:0', 'b:settle:0', 'b:start:1']);
  second[1].resolve('b1'); await b;
  assert.ok(!events.includes('a:start:1'));
  first[0].resolve('a0'); await nextTurn(); first[1].resolve('a1'); await a;
  assert.equal(events.at(-1), 'a:settle:1');
});

test('a failed image settles as failed before the next starts; unmount prevents later additions', async () => {
  let active = true;
  const first = deferred<string>(), second = deferred<string>();
  const events: string[] = [];
  const task = runAgentImageSequence({
    count: 3, active: () => active,
    start: index => { events.push(`start:${index}`); return index; },
    generate: index => index === 0 ? first.promise : second.promise,
    settle: (index, _slot, result) => { events.push(`${result === null ? 'fail' : 'done'}:${index}`); },
  });
  first.reject(); await nextTurn();
  assert.deepEqual(events, ['start:0', 'fail:0', 'start:1']);
  active = false; second.resolve('image'); await task;
  assert.deepEqual(events, ['start:0', 'fail:0', 'start:1']);
});

test('resuming an accepted batch starts at its stored index', async () => {
  const starts: number[] = [];
  await runAgentImageSequence({ count: 4, startIndex: 2, active: () => true,
    start: index => { starts.push(index); return index; }, generate: async index => index, settle: () => {},
  });
  assert.deepEqual(starts, [2, 3]);
});
