/* jsdom implements no 2D canvas, and prints "Not implemented: HTMLCanvasElement's
   getContext()" to stderr every time one is asked for. Several screens now mount a
   canvas — the 404 page and the sign-in screen both draw DotField — and every test
   that renders one would repeat the line. DotField already treats "no context" as
   "draw nothing" (that is what an old browser gets), so a quiet `null` is both
   truthful and enough. A test that wants a context to record into (notFound.test.jsx)
   spies on this and replaces it, as it always did. */
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = function getContext() {
    return null
  }
}
