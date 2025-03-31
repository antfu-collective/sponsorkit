import init, { simplecc } from 'simplecc-wasm'

init()

export function convertCC(text: string, mode: string) {
  return simplecc(text, mode)
}

export function detectLanguage(str: string): 'zh-cn' | 'zh-tw' | 'ja' | 'ko' | 'en' {
  if (/\p{Script=Hiragana}/u.test(str) || /\p{Script=Katakana}/u.test(str)) {
    return 'ja'
  }
  if (/\p{Script=Hangul}/u.test(str)) {
    return 'ko'
  }
  if (/\p{Script=Han}/u.test(str)) {
    return convertCC(str, 't2s') === str
      ? 'zh-cn'
      : 'zh-tw'
  }
  return 'en'
}
