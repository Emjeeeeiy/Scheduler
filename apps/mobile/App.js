import { useState } from 'react'
import { SafeAreaView, View, Text, Pressable, useWindowDimensions, StyleSheet } from 'react-native'
import { todayKey, relativeDayLabel } from '@cadence/shared/src/date.js'
import { colors, BREAKPOINT_NARROW } from './src/theme.js'

// Expo shell: same IA as src/App.jsx (Dashboard/Day/Week/Month/Review/Focus).
// Responsiveness in RN = useWindowDimensions, not media queries:
// narrow screens get bottom tabs (web's <=900px behavior), wide screens get
// a side rail. Business logic (date/recurrence/stats/...) is @cadence/shared.
const VIEWS = ['dashboard', 'today', 'week', 'month', 'review', 'focus']

export default function App() {
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
