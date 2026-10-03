# 問題パック（JSON）の書き方

```json
{
  "id": "chu2-rika-denki",          // パックID（半角英数・ハイフン）
  "name": "中2理科 電流",            // 表示名
  "version": 1,                     // 内容を直したら数字を上げる（サーバー配信時に自動更新）
  "author": "おうちの人",
  "units": [                        // 新しい単元（既存の単元に足すだけなら省略可）
    { "id": "s8-denryu", "subject": "science", "grade": 8, "name": "電流と電圧（中2）", "area": "エネルギー" }
  ],
  "questions": [
    {
      "unit": "s8-denryu",
      "type": "choice",
      "prompt": "電圧の単位は？",
      "choices": ["V（ボルト）", "A（アンペア）", "Ω（オーム）", "W（ワット）"],
      "explanation": "電圧はV、電流はA、抵抗はΩ。",
      "difficulty": 1
    },
    {
      "unit": "s8-denryu",
      "type": "numeric",
      "prompt": "抵抗 5Ω に 2A の電流が流れているとき、電圧は何V？",
      "answer": "10",
      "unitSuffix": "V",
      "explanation": "電圧 = 抵抗 × 電流 = 5 × 2 = 10（V）",
      "difficulty": 2
    }
  ]
}
```
（`//` のコメントは説明用です。実際のファイルには書かないでください）

## 問題の種類（type）

| type | 必要な項目 | 判定 |
|---|---|---|
| `choice` | `choices`（`answer` を省略すると先頭が正解） | 選んだものが正解か |
| `input` | `answer`、別解は `accept: [...]` | ひらがな/カタカナ・全角/半角・大文字/小文字・句読点を無視して比較 |
| `numeric` | `answer`（`"3/4"` `"1 1/2"` `"-5"` `"0.75"`）、`unitSuffix` | 値が等しいか。分数は約分まで確認（`"requireSimplest": false` で無効） |
| `numeric` + `"numKind": "ratio"` | `answer: "3:4"` | 等しい比で、いちばん簡単な整数の比か |
| `numeric` + `"numKind": "expr"` | `answer: "2x + 3"` | 一次式として等しいか（項の順番は自由） |
| `tf` | `answer: "o"` または `"x"` | ○× |
| `order` | `choices`（正しい順番で書く） | 並べた順が一致するか |
| `write` | `answer`、`choices`（選択式にするときの誤答） | 手書き → 自己採点 |

## 共通の項目

| 項目 | 説明 |
|---|---|
| `unit` | 単元ID（必須） |
| `prompt` | 問題文（必須）。`[[3/4]]` 分数、`[[1 3/4]]` 帯分数、`__下線__`、`**太字**`、`\n` 改行 |
| `ask` | 問題文の上に出す短い指示（例：「下線部の読みをひらがなで書こう」） |
| `difficulty` | 1〜5。推定偏差値の計算に使うので、なるべく正確に |
| `explanation` | 解説（まちがえたときに表示） |
| `hint` | ヒント（使うと記憶の評価が少し下がる） |
| `speak` / `speakLang` | 読み上げる文（英単語など）と言語（`"en"` / `"ja"`） |
| `listening` | `true` で、問題文の代わりに音声だけを聞かせる |
| `front` / `back` | 爆速周回のカードのおもて・うら（省略時は問題文と答え） |
| `id` | 省略可。省略すると内容から自動で決まる（問題文を変えると別の問題として扱われる） |

## 既存の単元ID（一部）

- 国語：`k6-yomi` `k6-kaki` `k6-yoji` `k6-kotowaza` `k6-taigi` `k6-keigo` `k6-bunpo` `k6-bungaku` `k7-bunpo`
- 算数・数学：`m6-frac` `m6-moji` `m6-taisho` `m6-en` `m6-taiseki` `m6-kakudai` `m6-hi` `m6-hirei` `m6-hayasa` `m6-wariai` `m6-baai` `m6-data` `m7-seifu` `m7-moji` `m7-hoteishiki` `m7-hirei`
- 理科：`s6-nensho` `s6-karada` `s6-shokubutsu` `s6-seibutsu` `s6-tsuki` `s6-daichi` `s6-teko` `s6-denki` `s6-suiyoeki` `s7-seibutsu` `s7-busshitsu` `s7-hikari` `s7-daichi`
- 社会：`h6-seiji` `h6-genshi` `h6-asuka` `h6-heian` `h6-kamakura` `h6-muromachi` `h6-azuchi` `h6-edo` `h6-meiji` `h6-showa` `h6-sengo` `h6-nendai` `h6-jinbutsu` `h6-kokusai` `h6-todofuken`
- 英語：`e6-animal` `e6-food` `e6-sports` `e6-school` `e6-time` `e6-num` `e6-feel` `e6-verb` `e6-place` `e6-job` `e6-phrase` `e6-listen` `e7-be` `e7-ippan` `e7-gimon` `e7-spell`

全一覧は `src/content/units.ts`。
