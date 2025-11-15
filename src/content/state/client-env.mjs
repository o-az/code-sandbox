import { UAParser } from 'ua-parser-js'

const parser = new UAParser()

export function getClientEnvironment() {
  return {
    device: parser.getDevice(),
    browser: parser.getBrowser(),
  }
}
