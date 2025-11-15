type SessionInfo = {
  sandboxId: string
  activeTabs: Set<string>
  lastActivity: number
}

const sessions = new Map<string, SessionInfo>()

export function getOrCreateSandboxId(sessionId: string, tabId?: string) {
  let sessionInfo = sessions.get(sessionId)

  if (!sessionInfo) {
    sessionInfo = {
      sandboxId: sessionId,
      activeTabs: new Set(tabId ? [tabId] : []),
      lastActivity: Date.now(),
    }
    sessions.set(sessionId, sessionInfo)
    return sessionId
  }

  if (tabId) sessionInfo.activeTabs.add(tabId)
  sessionInfo.lastActivity = Date.now()

  return sessionInfo.sandboxId
}

export function clearSandboxSession(sessionId: string) {
  sessions.delete(sessionId)
}

export function getSandboxSession(sessionId: string) {
  return sessions.get(sessionId)
}
