import type { InputError } from './types'

const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' })
const emojiSource = String.raw`(?:\p{RGI_Emoji}|\p{Extended_Pictographic}️?)`
const emojiPattern = new RegExp(`^${emojiSource}$`, 'v')
export const prefixlessPattern = new RegExp(String.raw`^\s*${emojiSource}(?!\p{Emoji_Modifier})\s*\+?\s*${emojiSource}\s*$`, 'v')

export function normalizeCodepoint(value: string): string {
  return value.toLowerCase().split('-').filter((part) => part !== 'fe0f' && part !== 'fe0e').join('-')
}

export function emojiCodepoint(value: string): string {
  return normalizeCodepoint(Array.from(value, (char) => char.codePointAt(0)!.toString(16)).join('-'))
}

export function parsePair(input: string): { left: string; right: string } | { error: InputError } {
  if (!input.trim()) return { error: 'empty' }
  if (input.length > 128) return { error: 'count' }
  const segments = Array.from(segmenter.segment(input), ({ segment }) => segment).filter((part) => !/^\s+$/.test(part) && part !== '+')
  if (segments.length !== 2) return { error: 'count' }
  if (!segments.every((part) => emojiPattern.test(part))) return { error: 'notEmoji' }
  return { left: segments[0], right: segments[1] }
}

export function combinationKey(left: string, right: string): string {
  return `${normalizeCodepoint(left)}:${normalizeCodepoint(right)}`
}
