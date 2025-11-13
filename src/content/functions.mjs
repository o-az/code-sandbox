import { UAParser } from 'ua-parser-js'

const uap = new UAParser()

export function getClientEnvironment() {
  return {
    device: uap.getDevice(),
    browser: uap.getBrowser(),
  }
}
