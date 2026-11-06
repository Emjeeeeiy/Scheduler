/* This device's Web Push subscription — the browser half of push.
 *
 * A push subscription is a per-browser, per-origin address handed out by the
 * browser vendor's push service (Google's for Chrome, Mozilla's for Firefox,
 * Apple's for Safari). Anyone holding it plus our VAPID private key can wake
 * this device's service worker (public/sw.js) even with every tab closed —
 * which is the whole point. This module creates it, tells our server about it
 * (api/push/subscribe), and removes it again. Nothing here is Firebase.
 *
 * Deliberately NOT tied to the signed-in session: signing out leaves the
 * subscription alone so reminders already scheduled keep arriving on a logged
 * out device. It stops when someone turns it off here (from Settings or from
 * the sign-in screen) or deletes the account.
 */

import { callApi } from './apiClient.js'

/** Fired on `window` whenever this device's subscription is created or
    removed, so hooks in other parts of the tree re-check without a shared
    context. */
export const PUSH_CHANGED_EVENT = 'cadence:push-changed'

export function isPushSupported() {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    typeof Notification !== 'undefined'
  )
}

/** Brave switches Google's push service off by default, and Chromium push
    rides on it — so it needs a setting flipped that no other browser does. */
export function isBrave() {
  return typeof navigator !== 'undefined' && Boolean(navigator.brave)
}

/** 'granted' | 'denied' | 'default' | 'unsupported' */
export function pushPermission() {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
}

/** The VAPID public key arrives base64url-encoded; `subscribe` wants bytes. */
export function urlBase64ToUint8Array(base64Url) {
  const padded = base64Url.padEnd(base64Url.length + ((4 - (base64Url.length % 4)) % 4), '=')
  const raw = atob(padded.replaceAll('-', '+').replaceAll('_', '/'))
  return Uint8Array.from(raw, (char) => char.charCodeAt(0))
}

function vapidKeyBytes() {
  const key = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!key) return null
  try {
    return urlBase64ToUint8Array(key)
  } catch {
    return null
  }
}

const announce = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PUSH_CHANGED_EVENT))
}

/** The existing subscription on this device, or null. Never throws, and never
    waits on `serviceWorker.ready` — that promise never settles if no worker
    was ever registered (a dev build), which would hang the caller. */
export async function getLocalSubscription() {
  if (!isPushSupported()) return null
  try {
    const registration = await navigator.serviceWorker.getRegistration()
    return registration ? await registration.pushManager.getSubscription() : null
  } catch {
    return null
  }
}

/** A subscription is bound to the VAPID key it was created with. If ours has
    changed since, the old one can never be sent to — replace it. When the
    browser doesn't expose the key, assume it matches. */
function usesKey(subscription, bytes) {
  const current = subscription.options?.applicationServerKey
  if (!current) return true
  const have = new Uint8Array(current)
  return have.length === bytes.length && have.every((value, i) => value === bytes[i])
}

/**
 * Turns push on for this device and registers it with the server under the
 * signed-in account.
 *
 * @return `{ ok: true }` or `{ ok: false, reason }` where reason is
 *         'unsupported' (this browser can't), 'unavailable' (no VAPID key
 *         configured, or no service worker — a dev build), 'denied' (blocked
 *         in the browser), 'dismissed' (the prompt was closed undecided),
 *         'service' (the browser couldn't get an address from its own push
 *         service — see the catch below), or 'error'. Callers toast from the
 *         reason, never by re-reading state.
 */
export async function subscribePush() {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' }
  const key = vapidKeyBytes()
  if (!key) return { ok: false, reason: 'unavailable', detail: 'no-key' }

  /* Asked before anything else is awaited. Safari honours the prompt only
     while the tap that started this is still recent, and a service-worker
     lookup first can spend that. */
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
  if (permission === 'denied') return { ok: false, reason: 'denied' }
  if (permission !== 'granted') return { ok: false, reason: 'dismissed' }

  let subscription = null
  let created = false
  try {
    const registration = await navigator.serviceWorker.getRegistration()
    if (!registration) return { ok: false, reason: 'unavailable', detail: 'no-worker' }

    subscription = await registration.pushManager.getSubscription()
    if (subscription && !usesKey(subscription, key)) {
      await subscription.unsubscribe()
      subscription = null
    }
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
      created = true
    }
  } catch (caught) {
    console.error('Could not create a push subscription.', caught)
    /* An AbortError here is Chromium's "Registration failed - push service
       error": the browser asked its push service (Google's) for an address and
       was refused or couldn't reach it. Not our server, not a bug in the page —
       Brave ships with that service switched off, and a VPN, firewall or
       privacy extension can block it too. Worth its own reason so the person
       is told that, rather than "try again". */
    return { ok: false, reason: caught?.name === 'AbortError' ? 'service' : 'error' }
  }

  const saved = await callApi('/api/push/subscribe', { subscription: subscription.toJSON() })
  if (!saved) {
    // The server never heard of it. Leaving a subscription nothing can reach
    // would show "on" while delivering nothing, so undo what this call made.
    if (created) await subscription.unsubscribe().catch(() => false)
    return { ok: false, reason: 'error' }
  }

  announce()
  return { ok: true }
}

/**
 * Turns push off for this device. Works signed out — the server forgets a
 * device by its endpoint alone (see api/push/unsubscribe.js).
 *
 * @param everywhere also forget every other device and every queued reminder
 *                   for the signed-in account (used when deleting it)
 * @return true once this device has no subscription left
 */
export async function unsubscribePush({ everywhere = false } = {}) {
  const subscription = await getLocalSubscription()

  if (everywhere) await callApi('/api/push/unsubscribe', { all: true })
  if (subscription) {
    // The server first, while we still know the endpoint. If it is
    // unreachable the record just goes stale: the push service answers 410
    // for an unsubscribed endpoint and the next send prunes it.
    await callApi('/api/push/unsubscribe', { endpoint: subscription.endpoint }, { auth: false })
    try {
      await subscription.unsubscribe()
    } catch (caught) {
      console.error('Could not remove the push subscription.', caught)
    }
  }

  announce()
  return (await getLocalSubscription()) === null
}
