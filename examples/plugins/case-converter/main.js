;(function () {
  'use strict'

  function localeOf(context) {
    return context && typeof context.locale === 'string' ? context.locale : 'en'
  }

  function upper(text, locale) {
    return text.toLocaleUpperCase(locale)
  }

  function lower(text, locale) {
    return text.toLocaleLowerCase(locale)
  }

  function titleCase(text, locale) {
    return lower(text, locale)
      .split(/(\s+)/)
      .map(function (part) {
        return part.replace(/^([^\p{L}\p{N}]*)(\p{L})/u, function (_, prefix, char) {
          return prefix + char.toLocaleUpperCase(locale)
        })
      })
      .join('')
  }

  function sentenceCase(text, locale) {
    return lower(text, locale).replace(
      /(^|[.!?。！？]\s*|\n\s*)(\p{L})/gu,
      function (_, prefix, char) {
        return prefix + char.toLocaleUpperCase(locale)
      }
    )
  }

  function toggleCase(text, locale) {
    return Array.from(text)
      .map(function (char) {
        var upperChar = char.toLocaleUpperCase(locale)
        var lowerChar = char.toLocaleLowerCase(locale)
        if (upperChar === lowerChar) return char
        return char === upperChar ? lowerChar : upperChar
      })
      .join('')
  }

  function errorMessage(locale) {
    if (locale === 'en') return 'Unknown conversion mode'
    if (locale === 'zh-TW') return '未知的轉換方式'
    return '未知的转换方式'
  }

  self.run = async function (input, options, context) {
    var locale = localeOf(context)
    var mode = options && typeof options.mode === 'string' ? options.mode : 'upper'
    var trim = !options || options.trim !== false
    var text = trim ? String(input).trim() : String(input)

    switch (mode) {
      case 'upper':
        return { kind: 'text', text: upper(text, locale), language: 'plain' }
      case 'lower':
        return { kind: 'text', text: lower(text, locale), language: 'plain' }
      case 'title':
        return { kind: 'text', text: titleCase(text, locale), language: 'plain' }
      case 'sentence':
        return { kind: 'text', text: sentenceCase(text, locale), language: 'plain' }
      case 'toggle':
        return { kind: 'text', text: toggleCase(text, locale), language: 'plain' }
      default:
        return { kind: 'error', message: errorMessage(locale) }
    }
  }
})()
