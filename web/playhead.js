// Beats' playhead: a bar down through every row at the step being played.
// Where the bars go is worked out from the pills' boxes (playheadSpans, pure);
// createBars() draws them. The bars are kept from step to step and moved with
// a transform, and a width or height is written only when it changed, so a
// step moves the bar without the page laying itself out again.

const PAD = 6;   // px the bar reaches past the pills it crosses

// The bars for the pills being heard. `rects` is the box of each row's
// playing pill, `first` the boxes of the first row's first and last pill, all
// in px from the rows' top left corner. When the rows are in step and each
// fits on one line, it is one bar from the first row to the last; when rows run at
// different tempos, or a phone wraps each row onto two lines of 8, a short bar
// on each row's playing pill instead. Each: [x, top, bottom].
export function playheadSpans(rects, first) {
  if (!rects.length) return [];
  const centre = (r) => r.left + r.width / 2;
  const wrapped = first.start.top !== first.end.top;
  const aligned = rects.every((r) => Math.abs(centre(r) - centre(rects[0])) < 1);
  return wrapped || !aligned
    ? rects.map((r) => [centre(r), r.top - PAD, r.bottom + PAD])
    : [[centre(rects[0]), rects[0].top - PAD, rects[rects.length - 1].bottom + PAD]];
}

// The bars in `host`. paint(spans) makes as many as there are spans, reusing
// the ones it has, and writes only what moved.
export function createBars(host) {
  const bars = [];   // { node, x, top, height }
  return {
    paint(spans) {
      while (bars.length > spans.length) bars.pop().node.remove();
      spans.forEach(([x, top, bottom], i) => {
        let bar = bars[i];
        if (!bar) {
          const node = document.createElement('div');
          node.className = 'seq-bar';
          host.append(node);
          bar = { node, x: NaN, top: NaN, height: NaN };
          bars.push(bar);
        }
        const height = bottom - top;
        if (bar.x !== x || bar.top !== top) bar.node.style.transform = `translate(${x}px, ${top}px)`;
        if (bar.height !== height) bar.node.style.height = `${height}px`;
        Object.assign(bar, { x, top, height });
      });
    },
    count: () => bars.length,
  };
}
