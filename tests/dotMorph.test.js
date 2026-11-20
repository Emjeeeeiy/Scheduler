/* The maths behind the sign-in screen's dot transition (src/lib/dotMorph.js): what
 * is worth holding to account is the promises the drawing relies on — a dot starts
 * exactly where its source point is and ends exactly on its target; every point of
 * both clouds is covered, so nothing of the old content is left behind and nothing
 * of the new is missing; the scatter goes away from where the content was; the
 * run is reproducible from a seed; and it is bounded however much content there is.
 *
 * Reading the page into dots and drawing them is the browser's (dotMorphRun.js),
 * checked in a real browser, not here.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  COLOUR_STEPS,
  GATHER_END_MS,
  GATHER_START_MS,
  MAX_DOTS,
  SCATTER_MS,
  TOTAL_MS,
  cloud,
  dotAlpha,
  mixStep,
  planMorph,
  positionAt,
  seeded,
  thin,
} from '../src/lib/dotMorph.js'

/** `n` points on a loose grid starting at (ox, oy), all one colour. */
function block(n, ox, oy, colour = 0, per = 10) {
  const xs = []
  const ys = []
  const cs = []
  for (let i = 0; i < n; i += 1) {
    xs.push(ox + (i % per) * 6)
    ys.push(oy + Math.floor(i / per) * 6)
    cs.push(colour)
  }
  return cloud(xs, ys, cs)
}

const at = new Float32Array(3)
const near = (a, b, within = 1e-3) => Math.abs(a - b) <= within

describe('seeded', () => {
  it('gives the same sequence for the same seed, in [0, 1)', () => {
    const a = seeded(7)
    const b = seeded(7)
    for (let i = 0; i < 50; i += 1) {
      const value = a()
      assert.equal(value, b())
      assert.ok(value >= 0 && value < 1)
    }
  })

  it('gives a different sequence for a different seed', () => {
    assert.notEqual(seeded(1)(), seeded(2)())
  })
})

describe('thin', () => {
  it('leaves a cloud under the cap alone', () => {
    const points = block(40, 0, 0)
    assert.equal(thin(points, 100), points)
  })

  it('takes an even share of a cloud over the cap, from all the way through it', () => {
    const points = block(1000, 0, 0)
    const thinned = thin(points, 100)
    assert.equal(thinned.count, 100)
    assert.equal(thinned.x[0], points.x[0])
    // The last kept point comes from near the end, not from a cut-off first tenth.
    assert.ok(thinned.y[99] >= points.y[points.count - 1] - 12)
  })
})

describe('planMorph', () => {
  it('has as many dots as the larger cloud has points', () => {
    assert.equal(planMorph(block(30, 0, 0), block(50, 200, 0), { random: seeded(1) }).count, 50)
    assert.equal(planMorph(block(50, 0, 0), block(30, 200, 0), { random: seeded(1) }).count, 50)
  })

  it('never has more dots than the cap, however much content there is', () => {
    const plan = planMorph(block(9000, 0, 0, 0, 100), block(8000, 0, 0, 0, 100), { random: seeded(1) })
    assert.equal(plan.count, MAX_DOTS)
  })

  it('covers every point of both clouds, so nothing old is left and nothing new is missing', () => {
    const source = block(40, 0, 0, 0)
    const target = block(70, 300, 100, 1)
    const plan = planMorph(source, target, { random: seeded(3) })
    const starts = new Set()
    const ends = new Set()
    for (let i = 0; i < plan.count; i += 1) {
      starts.add(`${plan.sx[i]},${plan.sy[i]}`)
      ends.add(`${plan.tx[i]},${plan.ty[i]}`)
    }
    for (let i = 0; i < source.count; i += 1) assert.ok(starts.has(`${source.x[i]},${source.y[i]}`), `source ${i}`)
    for (let i = 0; i < target.count; i += 1) assert.ok(ends.has(`${target.x[i]},${target.y[i]}`), `target ${i}`)
  })

  it('keeps each point its own colour, source and target', () => {
    const plan = planMorph(block(20, 0, 0, 2), block(20, 200, 0, 5), { random: seeded(1) })
    for (let i = 0; i < plan.count; i += 1) {
      assert.equal(plan.cFrom[i], 2)
      assert.equal(plan.cTo[i], 5)
    }
  })

  it('shuffles: a dot does not fly to the spot that matches its own', () => {
    const source = block(60, 0, 0)
    const target = block(60, 0, 0)
    const plan = planMorph(source, target, { random: seeded(11) })
    let moved = 0
    for (let i = 0; i < plan.count; i += 1) if (plan.sx[i] !== plan.tx[i] || plan.sy[i] !== plan.ty[i]) moved += 1
    assert.ok(moved > plan.count / 2, `only ${moved} of ${plan.count} were paired with another spot`)
  })

  it('is reproducible from a seed, and differs from another', () => {
    const a = planMorph(block(50, 0, 0), block(50, 200, 0), { random: seeded(5) })
    const b = planMorph(block(50, 0, 0), block(50, 200, 0), { random: seeded(5) })
    const c = planMorph(block(50, 0, 0), block(50, 200, 0), { random: seeded(6) })
    assert.deepEqual([...a.tx], [...b.tx])
    assert.deepEqual([...a.delay], [...b.delay])
    assert.notDeepEqual([...a.tx], [...c.tx])
  })

  it('is empty, not an error, when either side has nothing to draw', () => {
    assert.equal(planMorph(cloud([], [], []), block(10, 0, 0)).count, 0)
    assert.equal(planMorph(block(10, 0, 0), cloud([], [], [])).count, 0)
  })
})

describe('positionAt', () => {
  const plan = planMorph(block(60, 0, 0, 0), block(80, 300, 200, 1), { random: seeded(2) })

  it('starts every dot exactly on its source point, with none of the colour change made', () => {
    for (let i = 0; i < plan.count; i += 1) {
      positionAt(plan, i, 0, at)
      assert.ok(near(at[0], plan.sx[i]) && near(at[1], plan.sy[i]), `dot ${i} at ${at[0]},${at[1]}`)
      assert.equal(at[2], 0)
    }
  })

  it('ends every dot exactly on its target point, with all of the colour change made', () => {
    for (let i = 0; i < plan.count; i += 1) {
      for (const time of [GATHER_END_MS, TOTAL_MS, TOTAL_MS + 500]) {
        positionAt(plan, i, time, at)
        assert.ok(near(at[0], plan.tx[i]) && near(at[1], plan.ty[i]), `dot ${i} at ${time}`)
        assert.equal(at[2], 1)
      }
    }
  })

  it('scatters away from where the content was before anything starts home', () => {
    // Dots spread from the centre of the source cloud's own points.
    const source = block(60, 0, 0, 0)
    const cx = source.x.reduce((sum, v) => sum + v, 0) / source.count
    const cy = source.y.reduce((sum, v) => sum + v, 0) / source.count

    const time = SCATTER_MS / 2
    assert.ok(time < GATHER_START_MS, 'the scatter has the stage to itself for its first half')
    let away = 0
    for (let i = 0; i < plan.count; i += 1) {
      positionAt(plan, i, time, at)
      assert.equal(at[2], 0, 'no dot has set off for its target yet')
      const outward = (plan.sx[i] - cx) * (at[0] - plan.sx[i]) + (plan.sy[i] - cy) * (at[1] - plan.sy[i])
      if (outward > 0) away += 1
    }
    assert.ok(away > plan.count * 0.9, `${away} of ${plan.count} moved away from the centre`)
  })

  it('has every dot travelling by the time the scatter is done, then heading home', () => {
    let travelled = 0
    for (let i = 0; i < plan.count; i += 1) {
      positionAt(plan, i, SCATTER_MS, at)
      if (Math.hypot(at[0] - plan.sx[i], at[1] - plan.sy[i]) > 10) travelled += 1
    }
    assert.ok(travelled > plan.count * 0.9)
  })

  it('never takes a dot backwards through its colour change or its gather', () => {
    for (let i = 0; i < plan.count; i += 1) {
      let previous = 0
      for (let time = 0; time <= TOTAL_MS; time += 20) {
        positionAt(plan, i, time, at)
        assert.ok(at[2] >= previous - 1e-9, `dot ${i} went back at ${time}`)
        previous = at[2]
      }
    }
  })

  it('sets the dots off for their targets at their own moments, not all at once', () => {
    for (let i = 0; i < plan.count; i += 1) {
      positionAt(plan, i, GATHER_START_MS, at)
      assert.equal(at[2], 0, 'nobody has set off before the window opens')
    }
    // Part-way through, some are further along than others.
    let low = Number.POSITIVE_INFINITY
    let high = Number.NEGATIVE_INFINITY
    for (let i = 0; i < plan.count; i += 1) {
      positionAt(plan, i, GATHER_START_MS + 200, at)
      low = Math.min(low, at[2])
      high = Math.max(high, at[2])
    }
    assert.ok(high - low > 0.05, `all within ${(high - low).toFixed(3)} of each other`)
  })
})

describe('mixStep', () => {
  it('quantises a mix of 0 → 1 into COLOUR_STEPS + 1 steps, in order', () => {
    assert.equal(mixStep(0), 0)
    assert.equal(mixStep(1), COLOUR_STEPS)
    let previous = 0
    for (let k = 0; k <= 1; k += 0.01) {
      const step = mixStep(k)
      assert.ok(Number.isInteger(step) && step >= previous && step <= COLOUR_STEPS)
      previous = step
    }
  })

  it('clamps nonsense rather than indexing past its table', () => {
    assert.equal(mixStep(-3), 0)
    assert.equal(mixStep(9), COLOUR_STEPS)
  })
})

describe('dotAlpha', () => {
  it('holds the dots at full strength until they have landed, then fades them out', () => {
    assert.equal(dotAlpha(0), 1)
    assert.equal(dotAlpha(GATHER_END_MS), 1)
    assert.ok(dotAlpha((GATHER_END_MS + TOTAL_MS) / 2) > 0 && dotAlpha((GATHER_END_MS + TOTAL_MS) / 2) < 1)
    assert.equal(dotAlpha(TOTAL_MS), 0)
    assert.equal(dotAlpha(TOTAL_MS + 1000), 0)
  })
})

describe('the timeline', () => {
  it('is about a second, as promised', () => {
    assert.ok(TOTAL_MS >= 1000 && TOTAL_MS <= 1300, `${TOTAL_MS}ms`)
  })

  it('has the scatter underway before the first dot sets off, and every dot landed before the settle', () => {
    assert.ok(GATHER_START_MS < SCATTER_MS)
    assert.ok(GATHER_END_MS < TOTAL_MS)
  })
})
