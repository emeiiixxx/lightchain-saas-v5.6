// Shared copy for actions intentionally omitted from this interaction demo.
export function demoNotice(locale: string) {
  return locale === 'en' ? 'No changes needed. Not demonstrated in this demo.'
    : locale === 'ja' ? '変更不要です。このデモでは実演しません。'
    : '无需修改，Demo 不作演示';
}
