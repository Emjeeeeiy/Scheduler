import { useEffect, useState } from 'react'
import {
  SafeAreaView,
  View,
  Text,
  Pressable,
  useWindowDimensions,
  StyleSheet,
} from 'react-native'
import * as NativeSplashScreen from 'expo-splash-screen'
import { todayKey, relativeDayLabel } from '@cadence/shared/src/date.js'
import { colors, BREAKPOINT_NARROW } from './theme.js'
import SplashScreenAnimation from './src/SplashScreenAnimation.js'

// Expo shell: same IA as src/App.jsx (Dashboard/Day/Week/Month/Review/Focus).
// Responsiveness in RN = useWindowDimensions, not media queries:
// narrow screens get bottom tabs (web's <=900px behavior), wide screens get
// a side rail. Business logic (date/recurrence/stats/...) is @cadence/shared.
const VIEWS = ['dashboard', 'today', 'week', 'month', 'review', 'focus']

/* Hold Android's own white+logo splash frame rather than letting it auto-dismiss
   the moment the bundle is parsed. Without this the native splash would be gone
   before React had painted a single frame, and the launch animation would never
   be seen on a fast launch — the exact flash the frame exists to cover.
   Called at module scope, not in an effect: it has to be registered before the
   first render, and the module is the only place that runs early enough. The
   rejection is swallowed deliberately — there is nothing to recover to, the
   splash simply hides itself as usual. */
NativeSplashScreen.preventAutoHideAsync().catch(() => {})

export default function App() {
  return (
    <View style={styles.root}>
      <Shell />
      <BootSplash />
    </View>
  )
}

function Shell() {
  const { width } = useWindowDimensions()
  const narrow = width <= BREAKPOINT_NARROW
  const [view, setView] = useState('dashboard')
  const today = todayKey()

  return (
    <SafeAreaView style={styles.root}>
      <View style={narrow ? styles.column : styles.row}>
        {!narrow && (
          <View style={styles.rail}>
            {VIEWS.map((id) => (
              <Pressable key={id} onPress={() => setView(id)}>
                <Text style={view === id ? styles.active : styles.link}>{id}</Text>
              </Pressable>
            ))}
          </View>
        )}
        <View style={styles.content}>
          <Text>{relativeDayLabel(today)}</Text>
          <Text>View: {view} — same output contract as web, native controls.</Text>
        </View>
        {narrow && (
          <View style={styles.tabs}>
            {VIEWS.map((id) => (
              <Pressable key={id} style={styles.tab} onPress={() => setView(id)}>
                <Text style={view === id ? styles.active : styles.link}>{id}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </SafeAreaView>
  )
}

/* Hands the window over from the native splash to the launch animation.
   The native frame is released on mount, not when the animation ends: the
   animation is already painted underneath at that point and shares its
   background exactly, so releasing it there is seamless — whereas holding on
   to it until the end would mean the animation played behind an opaque native
   frame and then jumped out from nowhere. The animation fades itself out and
   calls back when it is done; until then it sits above the shell as a plain
   overlay. */
function BootSplash() {
  const [done, setDone] = useState(false)

  useEffect(() => {
    NativeSplashScreen.hideAsync().catch(() => {})
  }, [])

  if (done) return null

  return <SplashScreenAnimation onFinish={() => setDone(true)} />
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  row: { flex: 1, flexDirection: 'row' },
  column: { flex: 1, flexDirection: 'column' },
  rail: { width: 232, padding: 14 },
  content: { flex: 1, padding: 20 },
  tabs: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.faintInk },
  tab: { flex: 1, alignItems: 'center', padding: 12 },
  link: { color: colors.softInk },
  active: { color: colors.ink, fontWeight: '600' },
})