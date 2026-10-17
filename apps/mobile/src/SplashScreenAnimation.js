// The launch animation: index.html's web boot splash, rebuilt in React Native.
//
// One beat of theatre and then out of the way — the long minute hand takes a
// full turn well ahead of the short hour one, both come to rest, and only then
// does the word mark rise. No spinner and no shimmer bar.
//
// This renders over the app shell rather than instead of it, and hides the
// native splash itself (see App.js), so the handoff is Android's white+logo
// frame → this → the app, with no window in the middle where neither is
// painted.
//
// The timing constants below are the same contract as the CSS ones in
// index.html's #boot-splash, and for the same reason: the mark and the
// wordmark have to read as one gesture on both platforms.

import { useEffect, useMemo, useRef } from 'react'
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import { colors } from './theme.js'

const WORDMARK = 'cadence'

// Two hands, two speeds, and that difference is the whole animation. The long
// minute hand takes a full turn in 850ms while the short hour hand needs 1400ms
// for the same ground, so it visibly lags behind and the mark reads as a clock
// rather than a badge spinning. Deliberately not a live timepiece — a splash
// has no reason to carry a time-correct pose, and one that did would have to
// re-solve itself for every visitor's timezone.
const MINUTE_TURN_MS = 850
const HOUR_TURN_MS = 1400
// Held off until both hands have come to rest and the mark has had a beat of
// its own, so the name arrives as the settling of the composition rather than
// on top of it. 1800ms against the slower hand's 1400ms is the margin that
// lets the turn finish before anything fades.
const LETTER_FIRST_DELAY_MS = 1050
const LETTER_STEP_MS = 40
const LETTER_RISE_MS = 450
// The moment the last letter has landed. The fade starts from here and the
// shell is revealed from the end of it, so nothing is ever cut mid-flight.
const SETTLE_MS = 1800
const FADE_MS = 280

// One sweep, ease-out rather than linear: the hands have to arrive somewhere,
// and a splash whose rotation the fade merely interrupts reads as an app that
// cut its own animation off. This one lands and sits at twelve.
const HAND_EASING = [0.33, 1, 0.68, 1]

/** The SVG mark's proportions, carried over from index.html's boot splash:
    a 2.1-unit stroke on a 24-unit viewBox, the minute hand running out to 5.6
    units and the hour hand only to 3.4 — the length difference is what makes
    the speed difference legible as a clock rather than a spinner.
    Sized so the mark holds its share of a phone's width instead of sitting
    small in the middle of it, with the same ceiling so it stays a mark rather
    than becoming the subject on a tablet. */
const STROKE_RATIO = 2.1 / 24
const MINUTE_HAND_RATIO = 5.6 / 24
const HOUR_HAND_RATIO = 3.4 / 24

/** One hand: a rounded bar hanging off the clock's centre, so its pivot is
    `transformOrigin: 50% 100%`. RN has no line primitive, and this is the
    closest honest stand-in for the SVG's rotate(angle 12 12). */
function handStyle({ size, stroke, length, turn }) {
  return [
    styles.hand,
    {
      left: size / 2 - stroke / 2,
      top: size / 2 - length,
      width: stroke,
      height: length,
      borderRadius: stroke / 2,
    },
    {
      transform: [
        {
          rotate: turn.interpolate({
            inputRange: [0, 1],
            outputRange: ['0deg', '360deg'],
          }),
        },
      ],
    },
  ]
}

export default function SplashScreenAnimation({ onFinish }) {
  const { width } = useWindowDimensions()

  const size = Math.max(140, Math.min(210, width * 0.36))
  const stroke = size * STROKE_RATIO
  const fontSize = Math.max(21, Math.min(29, width * 0.055))

  const minute = useMemo(() => new Animated.Value(0), [])
  const hour = useMemo(() => new Animated.Value(0), [])
  // Paired with their durations, because a single turn each at different speeds
  // is the whole gesture.
  const hands = useMemo(
    () => [
      [minute, MINUTE_TURN_MS],
      [hour, HOUR_TURN_MS],
    ],
    [minute, hour],
  )
  const fade = useMemo(() => new Animated.Value(1), [])
  const letters = useMemo(() => WORDMARK.split('').map(() => new Animated.Value(0)), [])

  // Held in a ref so the effect below runs exactly once, whatever the parent
  // hands down: the animation is a fixed-length gesture, not something to
  // restart because a render changed. The assignment is an effect rather than
  // a render-time write, and it is declared first so it has landed by the time
  // the animation effect runs.
  const finishRef = useRef(onFinish)
  const firedRef = useRef(false)
  useEffect(() => {
    finishRef.current = onFinish
  }, [onFinish])

  useEffect(() => {
    const timeouts = []
    let cancelled = false

    const fadeOut = () => {
      Animated.timing(fade, {
        toValue: 0,
        duration: FADE_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && !firedRef.current) {
          firedRef.current = true
          finishRef.current?.()
        }
      })
    }

    // One sweep each, and it completes: the hands have to arrive somewhere
    // before the splash hands over. Two separate values rather than one on the
    // ring, which is the only way their durations can differ.
    const sweepHands = (easing) =>
      hands.forEach((value, duration) =>
        Animated.timing(value, {
          toValue: 1,
          duration,
          easing,
          useNativeDriver: true,
        }).start(),
      )

    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => {
        if (cancelled) return
        // Nothing animates at all — no hold, no turn, no rise — so the splash
        // is simply out of the way by the time it could have been seen.
        if (reduced) {
          fadeOut()
          return
        }
        sweepHands(Easing.bezier(...HAND_EASING))
        letters.forEach((value, i) => {
          timeouts.push(
            setTimeout(() => {
              Animated.timing(value, {
                toValue: 1,
                duration: LETTER_RISE_MS,
                easing: Easing.bezier(0.2, 0.7, 0.2, 1),
                useNativeDriver: true,
              }).start()
            }, LETTER_FIRST_DELAY_MS + i * LETTER_STEP_MS),
          )
        })
        timeouts.push(setTimeout(fadeOut, SETTLE_MS))
      })
      .catch(() => {
        /* Reduce-motion state unreadable is not a reason to hold the app at a
           launch screen — play the sequence. */
        if (!cancelled) {
          sweepHands(Easing.linear)
          letters.forEach((value) => {
            Animated.timing(value, { toValue: 1, duration: LETTER_RISE_MS, useNativeDriver: true }).start()
          })
          timeouts.push(setTimeout(fadeOut, SETTLE_MS))
        }
      })

    return () => {
      cancelled = true
      timeouts.forEach(clearTimeout)
    }
  }, [fade, hands, letters])

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]}>
        <View style={styles.center}>
          <View
            style={{
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: stroke,
            }}
          >
            {/* Both start pointing up — twelve o'clock, the only pose that is
                unambiguously a clock — and each takes one full turn from there,
                the long one well ahead of the short one. */}
            <Animated.View
              style={handStyle({ size, stroke, length: size * MINUTE_HAND_RATIO, turn: minute })}
            />
            <Animated.View
              style={handStyle({ size, stroke, length: size * HOUR_HAND_RATIO, turn: hour })}
            />
            <View
              style={{
                position: 'absolute',
                left: size / 2 - stroke / 2,
                top: size / 2 - stroke / 2,
                width: stroke,
                height: stroke,
                borderRadius: stroke / 2,
                backgroundColor: colors.ink,
              }}
            />
          </View>
          <Text
            style={[styles.wordmark, { fontSize, letterSpacing: fontSize * 0.04 }]}
            accessibilityLabel="Cadence"
          >
            {letters.map((value, i) => (
              <Text
                key={`${WORDMARK[i]}-${i}`}
                style={{
                  opacity: value,
                  // Animated, but still laid out: a letter that took its space
                  // on the first frame can't shift the mark as its siblings
                  // arrive.
                  transform: [
                    {
                      translateY: value.interpolate({
                        inputRange: [0, 1],
                        outputRange: [12, 0],
                      }),
                    },
                  ],
                }}
              >
                {WORDMARK[i]}
              </Text>
            ))}
          </Text>
        </View>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  // Fixed light, like the auth screen the web splash hands over to: entry is
  // one continuous light frame on both platforms, and a launch screen that
  // flipped with the OS would be the one part of entry that didn't.
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 30,
    backgroundColor: colors.paper,
  },
  hand: {
    position: 'absolute',
    backgroundColor: colors.ink,
    transformOrigin: '50% 100%',
  },
  wordmark: {
    fontWeight: '600',
    color: colors.ink,
  },
})