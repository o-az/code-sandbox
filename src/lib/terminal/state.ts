import { createSignal, type Accessor } from 'solid-js'

import type { StatusMode } from '#components/status.tsx'

export type TerminalPhase =
  | 'idle'
  | 'awaiting_input'
  | 'running_command'
  | 'interactive'
  | 'recovering'
  | 'broken'

export type TerminalState = {
  phase: TerminalPhase
  statusMode: StatusMode
  statusMessage: string
  sessionBroken: boolean
}

export type TerminalStateActions = {
  setIdle: () => void
  setAwaitingInput: () => void
  setRunningCommand: (command: string) => void
  setInteractive: (command: string) => void
  setRecovering: () => void
  setBroken: (message: string) => void
  setError: (message: string) => void
  setOnline: () => void
  setOffline: () => void
  updateOnlineStatus: () => void
}

export type TerminalStateAPI = {
  phase: Accessor<TerminalPhase>
  statusMode: Accessor<StatusMode>
  statusMessage: Accessor<string>
  isSessionBroken: Accessor<boolean>
  canAcceptInput: Accessor<boolean>
  isCommandInProgress: Accessor<boolean>
  isInteractiveMode: Accessor<boolean>
  actions: TerminalStateActions
}

export function createTerminalState(): TerminalStateAPI {
  const [phase, setPhase] = createSignal<TerminalPhase>('idle')
  const [statusMode, setStatusMode] = createSignal<StatusMode>('offline')
  const [statusMessage, setStatusMessage] = createSignal('Ready')
  const [sessionBroken, setSessionBroken] = createSignal(false)

  const canAcceptInput = () =>
    phase() === 'idle' || phase() === 'awaiting_input'

  const isCommandInProgress = () =>
    phase() === 'running_command' || phase() === 'interactive'

  const isInteractiveMode = () => phase() === 'interactive'

  const actions: TerminalStateActions = {
    setIdle() {
      setPhase('idle')
      setStatusMode(navigator.onLine ? 'online' : 'offline')
      setStatusMessage('Ready')
    },

    setAwaitingInput() {
      if (phase() === 'interactive' || phase() === 'broken') return
      setPhase('awaiting_input')
    },

    setRunningCommand(command: string) {
      setPhase('running_command')
      setStatusMode('online')
      setStatusMessage(`Running: ${command}`)
    },

    setInteractive(command: string) {
      setPhase('interactive')
      setStatusMode('interactive')
      setStatusMessage(`Interactive: ${command}`)
    },

    setRecovering() {
      setPhase('recovering')
      setStatusMode('error')
      setStatusMessage('Resetting...')
    },

    setBroken(message: string) {
      setPhase('broken')
      setSessionBroken(true)
      setStatusMode('error')
      setStatusMessage(message)
    },

    setError(message: string) {
      setStatusMode('error')
      setStatusMessage(message || 'Error')
    },

    setOnline() {
      if (phase() !== 'interactive') {
        setStatusMode('online')
      }
    },

    setOffline() {
      setStatusMode('offline')
    },

    updateOnlineStatus() {
      if (phase() === 'interactive') return
      setStatusMode(navigator.onLine ? 'online' : 'offline')
    },
  }

  return {
    phase,
    statusMode,
    statusMessage,
    isSessionBroken: sessionBroken,
    canAcceptInput,
    isCommandInProgress,
    isInteractiveMode,
    actions,
  }
}
