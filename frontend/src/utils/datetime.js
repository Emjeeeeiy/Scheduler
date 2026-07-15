export function toDatetimeLocal(isoString) {
  if (!isoString) return ""
  const date = new Date(isoString)
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60000)
  return local.toISOString().slice(0, 16)
}

export function formatDateTime(isoString) {
  if (!isoString) return ""
  return new Date(isoString).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}
