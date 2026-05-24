const MAX_GREETING_LEN = 20
const TRAILING_PUNCT = /[\s!！。.?？~,，、;；:：\u3002\uFF01\uFF1F]+$/u

const GREETING_PATTERNS: RegExp[] = [
  /^(hi|hello|hey|yo|sup|howdy|hiya|heya|hullo)( there| y'all| you| folks| everyone)?$/,
  /^good (morning|afternoon|evening|day|night)$/,
  /^(what'?s up|wassup|whaddup)$/,
  /^greetings$/,
  /^(你好|您好|大家好|嗨|哈喽|哈啰|哈囉|哈罗|喂)[啊呀吖呢么呗哦哈]?$/,
  /^(早|早啊|早安|早上好|中午好|下午好|晚上好|晚安)[啊呀吖呢么呗哦哈]?$/,
  /^(在吗|在嗎|在不在|有人吗|有人嗎|有人在吗|有人在嗎)$/,
  /^(こんにちは|こんばんは|おはよう|おはようございます|やあ|どうも|はじめまして)$/,
  /^(안녕|안녕하세요|안녕하십니까)$/,
  /^(hola|bonjour|salut|coucou|hallo|servus|hej|hejsan|ciao|saluton|ola|olá|privet|привет)$/,
]

export function isGreeting(text: string): boolean {
  if (!text) return false
  const normalized = text.trim().replace(TRAILING_PUNCT, "").trim().toLowerCase()
  if (!normalized || normalized.length > MAX_GREETING_LEN) return false
  return GREETING_PATTERNS.some((re) => re.test(normalized))
}
