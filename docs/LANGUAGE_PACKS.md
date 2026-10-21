# Moaham language packs / 언어 파일 추가

Moaham v1.7.0 includes 한국어 (`ko.json`) and English (`en.json`). It works offline and does not call a translation API.

## Add a language without reinstalling

1. Open the folder containing `Moaham.exe` and its `languages` folder. For example: `C:\Users\<user>\AppData\Local\Programs\Moaham\languages` (your installation location may differ).
2. Copy `en.json`, rename the copy to a language code such as `ja.json`, and edit it as UTF-8 JSON.
3. Change `code`, `name` (the language's own name) and `locale`. Translate the values under `messages`; leave message keys unchanged.
4. Paste the completed JSON file into the installation's `languages` folder.
5. Open the language selector at the top right of Moaham and select the new language. No app restart is needed. If the folder is protected, Windows may request permission to copy the file.

```json
{
  "code": "ja",
  "name": "日本語",
  "locale": "ja-JP",
  "messages": {
    "core.language": "言語"
  }
}
```

Use the supplied full `en.json` as the actual template; the small example only demonstrates the file format. Missing messages fall back to Korean. Keep variables such as `{{count}}`, `{{name}}` and `{{version}}` in each translated message. For plural message keys, keep all variants (`.one`, `.other`, etc.) and their variables. JSON does not support comments or trailing commas. HTML, JavaScript and executable plugins are not language pack formats.

The selected language persists after restarting. UI text and number/date formatting change; original filenames, custom folders, tags, notes and document contents stay unchanged. OS-provided dialog controls may follow Windows' language.

Malformed or incompatible files are skipped and reported by the language UI. Custom language files are retained through app updates. Keep an independent copy as well, especially when editing bundled `ko.json` or `en.json`, which are replaced by updates.

## 개발자 검증

`npm run locales:build`는 `translations/*.ko.json`·`*.en.json`을 병합해 배포용 파일을 생성합니다. `npm run locales:check`는 한국어·영어 키 일치, 변수와 복수형 누락, 소스에서 참조하는 키를 검사합니다. 추가 언어는 부분 번역도 가능하지만 번역한 메시지의 변수는 기본 언어와 일치해야 합니다.
