/* ProseMirror measures text with Range rectangles and finds drop targets with
   elementFromPoint; jsdom implements neither. These stand-ins return empty
   geometry, which is all a test that drives the editor through commands (rather
   than real pointer layout) needs. Safe to call more than once. */

const emptyRect = () => ({
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  toJSON() {
    return this
  },
})

export function installProseMirrorDom() {
  if (typeof Range !== 'undefined') {
    Range.prototype.getClientRects ??= () => ({
      length: 0,
      item: () => null,
      [Symbol.iterator]: function* () {},
    })
    Range.prototype.getBoundingClientRect ??= emptyRect
  }
  if (typeof document !== 'undefined') {
    document.elementFromPoint ??= () => null
  }
  if (typeof window !== 'undefined') {
    window.matchMedia ??= (query) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    })
  }
}

/* jsdom has no PointerEvent, and React's pointer handlers read pointerId,
   pointerType and pressure off the native event. A MouseEvent carries the
   coordinates; this adds the rest. */
export function installPointerEvents() {
  if (typeof window === 'undefined' || window.PointerEvent) return
  window.PointerEvent = class PointerEvent extends MouseEvent {
    constructor(type, init = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 1
      this.pointerType = init.pointerType ?? 'mouse'
      this.pressure = init.pressure ?? 0
    }
  }
}
