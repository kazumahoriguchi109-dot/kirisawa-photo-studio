/**
 * Minimal typed publish/subscribe bus.
 * Presentation layers subscribe; game logic publishes. Keeps state free of DOM/THREE.
 */
export type Unsubscribe = () => void

export class EventBus<Events extends Record<string, unknown>> {
  private handlers = new Map<keyof Events, Set<(payload: never) => void>>()

  on<K extends keyof Events>(type: K, handler: (payload: Events[K]) => void): Unsubscribe {
    let set = this.handlers.get(type)
    if (!set) {
      set = new Set()
      this.handlers.set(type, set)
    }
    set.add(handler as (payload: never) => void)
    return () => {
      set!.delete(handler as (payload: never) => void)
    }
  }

  once<K extends keyof Events>(type: K, handler: (payload: Events[K]) => void): Unsubscribe {
    const off = this.on(type, (payload) => {
      off()
      handler(payload)
    })
    return off
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const set = this.handlers.get(type)
    if (!set) return
    // Copy so handlers may unsubscribe during dispatch.
    for (const handler of Array.from(set)) {
      try {
        ;(handler as (p: Events[K]) => void)(payload)
      } catch (err) {
        console.error(`[EventBus] handler for "${String(type)}" threw`, err)
      }
    }
  }

  clear(): void {
    this.handlers.clear()
  }
}
