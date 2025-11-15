/**
 * @typedef {'online' | 'interactive' | 'error' | 'offline'} StatusMode
 */

export const STATUS_STYLE = /** @type {const} */ ({
  online: { text: 'Online', color: '#4ade80' },
  interactive: { text: 'Interactive', color: '#38bdf8' },
  error: { text: 'Error', color: '#f87171' },
  offline: { text: 'Offline', color: '#fbbf24' },
})

/**
 * Manages the status indicator element and its state.
 */
export class StatusIndicator {
  /** @type {HTMLParagraphElement | null} */
  #element

  /** @type {StatusMode} */
  #currentStatus = 'offline'

  /**
   * @param {HTMLParagraphElement | null} element
   */
  constructor(element) {
    this.#element = element ?? null
  }

  /**
   * @param {StatusMode} mode
   * @returns {void}
   */
  setStatus(mode) {
    if (this.#currentStatus === mode) return
    this.#currentStatus = mode
    if (!this.#element) return

    const style = /** @type {(typeof STATUS_STYLE)[StatusMode]} */ (
      STATUS_STYLE[mode] ?? STATUS_STYLE.online
    )

    this.#element.textContent = style.text
    Object.assign(this.#element.style, {
      top: '6px',
      right: '6px',
      zIndex: '1000',
      fontSize: '14px',
      color: style.color,
      position: 'absolute',
      letterSpacing: '0.05em',
    })
  }

  /**
   * @returns {StatusMode}
   */
  getCurrentStatus() {
    return this.#currentStatus
  }
}
