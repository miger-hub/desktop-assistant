;(function () {
  'use strict'

  var MODES = {
    toCamel: true,
    toSnake: true,
    toPascal: true,
    toKebab: true
  }

  function localeOf(context) {
    return context && typeof context.locale === 'string' ? context.locale : 'en'
  }

  function wordsOf(text) {
    return text
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/([A-Z])(?=[A-Z])/g, '$1 ')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .replace(/[_\-\s]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(function (word) {
        return word.toLowerCase()
      })
  }

  function capitalize(word) {
    return word ? word.charAt(0).toUpperCase() + word.slice(1) : word
  }

  function convert(words, mode) {
    if (words.length === 0) return ''
    switch (mode) {
      case 'toCamel':
        return words[0] + words.slice(1).map(capitalize).join('')
      case 'toSnake':
        return words.join('_')
      case 'toPascal':
        return words.map(capitalize).join('')
      case 'toKebab':
        return words.join('-')
      default:
        return ''
    }
  }

  function emptyMessage(locale) {
    if (locale === 'en') return 'Enter some text to convert'
    if (locale === 'zh-TW') return '請輸入要轉換的內容'
    return '请输入要转换的内容'
  }

  function modeMessage(locale) {
    if (locale === 'en') return 'Unknown conversion mode'
    if (locale === 'zh-TW') return '未知的轉換方式'
    return '未知的转换方式'
  }

  self.run = async function (input, options, context) {
    var locale = localeOf(context)
    var mode = options && typeof options.mode === 'string' ? options.mode : 'toCamel'
    if (!MODES[mode]) return { kind: 'error', message: modeMessage(locale) }

    // 换行 / 空格 / tab / 其它空白都作为转换单元分隔符，每个单元输出一行
    var units = String(input)
      .split(/\s+/)
      .filter(Boolean)
    var outputs = []
    for (var unitIndex = 0; unitIndex < units.length; unitIndex += 1) {
      var words = wordsOf(units[unitIndex])
      if (words.length > 0) outputs.push(convert(words, mode))
    }
    if (outputs.length === 0) return { kind: 'error', message: emptyMessage(locale) }

    return {
      kind: 'text',
      text: outputs.join('\n'),
      language: 'plain'
    }
  }
})()
