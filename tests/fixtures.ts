export const imageUrl = 'https://www.gstatic.com/android/keyboard/emojikitchen/20201001/u1f600/u1f600_u1f525.png'

export function metadata(url = imageUrl) {
  return {
    knownSupportedEmoji: ['1f600', '1f525', '2764-fe0f'],
    data: {
      '1f600': {
        emoji: '😀', emojiCodepoint: '1f600', alt: 'grinning face', keywords: ['smile', 'happy'], gBoardOrder: 1,
        combinations: {
          '1f525': [
            { gStaticUrl: imageUrl.replace('20201001', '20190101'), alt: 'old', date: '20190101', isLatest: false },
            { gStaticUrl: url, alt: 'grinning-fire', date: '20201001', isLatest: true }
          ]
        }
      },
      '1f525': { emoji: '🔥', emojiCodepoint: '1f525', alt: 'fire', keywords: ['hot'], gBoardOrder: 2, combinations: {} },
      '2764-fe0f': {
        emoji: '❤️', emojiCodepoint: '2764-fe0f', alt: 'heart', keywords: ['love'], gBoardOrder: 3,
        combinations: { '1f525': [{ gStaticUrl: url, alt: 'heart-fire', date: '20201001', isLatest: true }] }
      }
    }
  }
}
