import { Terminal } from '@xterm/xterm'
import { Readline } from 'xterm-readline'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { ImageAddon } from '@xterm/addon-image'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SerializeAddon } from '@xterm/addon-serialize'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { ClipboardAddon } from '@xterm/addon-clipboard'
import { LigaturesAddon } from '@xterm/addon-ligatures'

/**
 * @typedef {Object} TerminalInitOptions
 * @property {(event: KeyboardEvent) => boolean} [onAltNavigation]
 */

/**
 * Manages the xterm.js terminal instance and its addons.
 */
export class TerminalManager {
  /** @type {Terminal} */
  #terminal

  /** @type {FitAddon} */
  #fitAddon

  /** @type {WebglAddon} */
  #webglAddon

  /** @type {Unicode11Addon} */
  #unicode11Addon

  /** @type {SerializeAddon} */
  #serializeAddon

  /** @type {SearchAddon} */
  #searchAddon

  /** @type {ImageAddon} */
  #imageAddon

  /** @type {ClipboardAddon} */
  #clipboardAddon

  /** @type {LigaturesAddon} */
  #ligaturesAddon

  /** @type {WebLinksAddon} */
  #webLinksAddon

  /** @type {Readline} */
  #xtermReadline

  /** @type {boolean} */
  #initialized = false

  constructor() {
    this.#terminal = new Terminal({
      fontSize: 17,
      lineHeight: 1.2,
      scrollback: 5000,
      convertEol: true,
      cursorBlink: true,
      allowProposedApi: true,
      scrollOnUserInput: false,
      cursorStyle: 'underline',
      rightClickSelectsWord: true,
      rescaleOverlappingGlyphs: true,
      ignoreBracketedPasteMode: true,
      cursorInactiveStyle: 'underline',
      drawBoldTextInBrightColors: true,
      fontFamily: 'Lilex, monospace',
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#58a6ff',
        black: '#484f58',
        red: '#ff7b72',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#39c5cf',
        white: '#b1bac4',
        brightBlack: '#6e7681',
        brightRed: '#ffa198',
        brightGreen: '#56d364',
        brightYellow: '#e3b341',
        brightBlue: '#79c0ff',
        brightMagenta: '#d2a8ff',
        brightCyan: '#56d4dd',
        brightWhite: '#f0f6fc',
      },
    })

    this.#fitAddon = new FitAddon()
    this.#webglAddon = new WebglAddon()
    this.#unicode11Addon = new Unicode11Addon()
    this.#serializeAddon = new SerializeAddon()
    this.#searchAddon = new SearchAddon({ highlightLimit: 50 })
    this.#imageAddon = new ImageAddon({ showPlaceholder: true })
    this.#clipboardAddon = new ClipboardAddon()
    this.#ligaturesAddon = new LigaturesAddon()
    this.#webLinksAddon = new WebLinksAddon((event, url) => {
      event.preventDefault()
      window.open(url, '_blank', 'noopener,noreferrer')
    })
    this.#xtermReadline = new Readline()

    this.#webglAddon.onContextLoss(() => this.#webglAddon.dispose())
    this.#terminal.onBell(() => {
      console.info('bell')
    })
  }

  /**
   * Initializes the terminal and attaches it to the DOM.
   * @param {HTMLElement} element - The DOM element to attach the terminal to
   * @param {TerminalInitOptions} [options]
   * @returns {Terminal}
   */
  init(element, { onAltNavigation } = {}) {
    if (this.#initialized) return this.#terminal
    if (!element) throw new Error('Terminal element is required')

    this.#terminal.open(element)
    // Attach terminal instance to DOM element for context-like access
    // @ts-expect-error - xterm property is not typed
    element.xterm = this.#terminal

    // Load addons after terminal.open()
    this.#terminal.loadAddon(this.#webglAddon)
    this.#terminal.loadAddon(this.#fitAddon)
    this.#terminal.loadAddon(this.#searchAddon)
    this.#terminal.loadAddon(this.#clipboardAddon)
    this.#terminal.loadAddon(this.#unicode11Addon)
    this.#terminal.unicode.activeVersion = '11'
    this.#terminal.loadAddon(this.#serializeAddon)
    this.#terminal.loadAddon(this.#ligaturesAddon)
    this.#terminal.loadAddon(this.#webLinksAddon)
    this.#terminal.loadAddon(this.#imageAddon)
    this.#terminal.loadAddon(this.#xtermReadline)

    this.#terminal.attachCustomKeyEventHandler(event => {
      if (typeof onAltNavigation === 'function' && onAltNavigation(event)) {
        return false
      }
      if (
        event.type === 'keydown' &&
        event.key === 'c' &&
        event.ctrlKey &&
        event.metaKey
      ) {
        return false
      }
      return true
    })

    this.#scheduleInitialFit()
    this.#initialized = true
    return this.#terminal
  }

  /**
   * @returns {Terminal}
   */
  get terminal() {
    if (!this.#initialized) throw new Error('Terminal not initialized')
    return this.#terminal
  }

  /**
   * @returns {Readline}
   */
  get readline() {
    if (!this.#initialized) throw new Error('Terminal not initialized')
    return this.#xtermReadline
  }

  /**
   * @returns {FitAddon}
   */
  get fitAddon() {
    if (!this.#initialized) throw new Error('Terminal not initialized')
    return this.#fitAddon
  }

  /**
   * @returns {SerializeAddon}
   */
  get serializeAddon() {
    if (!this.#initialized) throw new Error('Terminal not initialized')
    return this.#serializeAddon
  }

  /**
   * Disposes the terminal instance and all loaded addons.
   */
  dispose() {
    if (!this.#initialized) return
    this.#terminal.dispose()
    this.#initialized = false
  }

  async #scheduleInitialFit() {
    if (typeof document === 'undefined' || !document.fonts?.ready) {
      setTimeout(() => this.#fitAddon.fit(), 25)
      return
    }

    try {
      // Wait for fonts to be ready
      await document.fonts.ready
      // Verify Lilex font is loaded
      await document.fonts.load('17px Lilex')
    } catch {
      // Fonts failed to load, continue anyway
    }

    this.#fitAddon.fit()
  }
}
