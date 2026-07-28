import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  emitDomainEvent,
  resetDomainEventListeners,
  subscribeDomainEvents,
} from './eventBus'

afterEach(() => {
  resetDomainEventListeners()
})

describe('event bus', () => {
  it('订阅者会收到广播的事件', () => {
    const listener = vi.fn()
    subscribeDomainEvents(listener)

    emitDomainEvent({
      type: 'POD_SCHEDULED',
      payload: { podName: 'web-1', nodeName: 'node-1' },
    })

    expect(listener).toHaveBeenCalledWith({
      type: 'POD_SCHEDULED',
      payload: { podName: 'web-1', nodeName: 'node-1' },
    })
  })

  it('取消订阅后不再收到事件', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeDomainEvents(listener)
    unsubscribe()

    emitDomainEvent({ type: 'POD_READY', payload: { podName: 'web-1' } })

    expect(listener).not.toHaveBeenCalled()
  })

  it('多个订阅者都能收到同一个事件', () => {
    const listenerA = vi.fn()
    const listenerB = vi.fn()
    subscribeDomainEvents(listenerA)
    subscribeDomainEvents(listenerB)

    emitDomainEvent({ type: 'RESOURCE_CREATED', payload: { kind: 'Pod', name: 'web-1' } })

    expect(listenerA).toHaveBeenCalledTimes(1)
    expect(listenerB).toHaveBeenCalledTimes(1)
  })
})
