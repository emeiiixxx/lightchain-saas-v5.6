/** Only the currently started image gets a slot; later images do not reserve space. */
export async function runAgentImageSequence<T, R>(options: {
  count: number;
  startIndex?: number;
  active: () => boolean;
  start: (index: number) => T | undefined;
  generate: (index: number, slot: T) => Promise<R>;
  settle: (index: number, slot: T, result: R | null) => void;
}) {
  for (let index = options.startIndex ?? 0; index < options.count; index++) {
    if (!options.active()) return;
    const slot = options.start(index);
    if (slot === undefined) return;
    let result: R | null;
    try { result = await options.generate(index, slot); }
    catch { result = null; }
    if (!options.active()) return;
    options.settle(index, slot, result);
  }
}
