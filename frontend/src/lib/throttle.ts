// Calls `fn` at most once per `ms`, always after the trigger that asked for it.
// The first trigger starts a timer and any triggers while it is pending fold
// into that one call. Unlike a debounce, a steady trickle of triggers cannot
// postpone the call forever.
export function trailingThrottle(fn: () => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;

  return {
    trigger() {
      if (timer !== undefined) return;
      timer = setTimeout(() => {
        timer = undefined;
        fn();
      }, ms);
    },
    cancel() {
      clearTimeout(timer);
      timer = undefined;
    },
  };
}
