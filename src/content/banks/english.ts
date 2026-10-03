// ===== 英語 =====
import { bank, C, I, distractors, seeded, type Draft } from '../helpers';
import type { Question } from '../types';
import { shuffle } from '../../lib/util';

type Vocab = [en: string, ja: string];

const VOCAB: Record<string, Vocab[]> = {
  'e6-animal': [
    ['dog', '犬'], ['cat', 'ねこ'], ['bird', '鳥'], ['fish', '魚'], ['rabbit', 'うさぎ'], ['horse', '馬'],
    ['cow', '牛'], ['pig', 'ぶた'], ['sheep', 'ひつじ'], ['monkey', 'さる'], ['elephant', 'ぞう'], ['lion', 'ライオン'],
    ['tiger', 'トラ'], ['bear', 'クマ'], ['panda', 'パンダ'], ['koala', 'コアラ'], ['penguin', 'ペンギン'], ['dolphin', 'イルカ'],
    ['whale', 'クジラ'], ['frog', 'カエル'], ['snake', 'ヘビ'], ['mouse', 'ネズミ'], ['giraffe', 'キリン'], ['owl', 'フクロウ'],
    ['turtle', 'カメ'], ['butterfly', 'チョウ'],
  ],
  'e6-food': [
    ['apple', 'りんご'], ['banana', 'バナナ'], ['orange', 'オレンジ'], ['grapes', 'ぶどう'], ['strawberry', 'いちご'],
    ['peach', 'もも'], ['melon', 'メロン'], ['lemon', 'レモン'], ['tomato', 'トマト'], ['potato', 'じゃがいも'],
    ['carrot', 'にんじん'], ['onion', 'たまねぎ'], ['cabbage', 'キャベツ'], ['corn', 'とうもろこし'], ['rice', 'ごはん・米'],
    ['bread', 'パン'], ['egg', 'たまご'], ['milk', '牛乳'], ['juice', 'ジュース'], ['water', '水'], ['tea', 'お茶・紅茶'],
    ['cake', 'ケーキ'], ['ice cream', 'アイスクリーム'], ['pizza', 'ピザ'], ['hamburger', 'ハンバーガー'], ['salad', 'サラダ'],
    ['soup', 'スープ'], ['sandwich', 'サンドイッチ'], ['spaghetti', 'スパゲッティ'], ['curry and rice', 'カレーライス'],
    ['chocolate', 'チョコレート'], ['beef', '牛肉'], ['chicken', 'とり肉'], ['noodles', 'めん類'],
  ],
  'e6-sports': [
    ['baseball', '野球'], ['soccer', 'サッカー'], ['basketball', 'バスケットボール'], ['volleyball', 'バレーボール'],
    ['tennis', 'テニス'], ['table tennis', '卓球'], ['swimming', '水泳'], ['badminton', 'バドミントン'],
    ['dodgeball', 'ドッジボール'], ['rugby', 'ラグビー'], ['skiing', 'スキー'], ['skating', 'スケート'],
    ['judo', '柔道'], ['kendo', '剣道'], ['golf', 'ゴルフ'], ['gymnastics', '体操'], ['wheelchair basketball', '車いすバスケットボール'],
    ['surfing', 'サーフィン'], ['jump rope', 'なわとび'], ['tag', 'おにごっこ'],
  ],
  'e6-school': [
    ['Japanese', '国語'], ['math', '算数'], ['science', '理科'], ['social studies', '社会'], ['English', '英語'],
    ['music', '音楽'], ['P.E.', '体育'], ['arts and crafts', '図画工作'], ['home economics', '家庭科'],
    ['moral education', '道徳'], ['calligraphy', '書写'], ['classroom', '教室'], ['library', '図書室・図書館'],
    ['gym', '体育館'], ['music room', '音楽室'], ['science room', '理科室'], ["nurse's office", '保健室'],
    ["teachers' office", '職員室'], ['playground', '校庭・運動場'], ['school trip', '修学旅行'], ['sports day', '運動会'],
    ['entrance ceremony', '入学式'], ['graduation ceremony', '卒業式'], ['field trip', '遠足'], ['chorus contest', '合唱コンクール'],
    ['textbook', '教科書'], ['notebook', 'ノート'], ['eraser', '消しゴム'], ['pencil case', '筆箱'], ['ruler', '定規'],
  ],
  'e6-time': [
    ['Monday', '月曜日'], ['Tuesday', '火曜日'], ['Wednesday', '水曜日'], ['Thursday', '木曜日'], ['Friday', '金曜日'],
    ['Saturday', '土曜日'], ['Sunday', '日曜日'], ['January', '1月'], ['February', '2月'], ['March', '3月'], ['April', '4月'],
    ['May', '5月'], ['June', '6月'], ['July', '7月'], ['August', '8月'], ['September', '9月'], ['October', '10月'],
    ['November', '11月'], ['December', '12月'], ['spring', '春'], ['summer', '夏'], ['fall', '秋'], ['winter', '冬'],
    ['morning', '朝・午前'], ['afternoon', '午後'], ['evening', '夕方'], ['night', '夜'], ['today', '今日'],
    ['tomorrow', '明日'], ['yesterday', '昨日'], ['weekend', '週末'],
  ],
  'e6-num': [
    ['eleven', '11'], ['twelve', '12'], ['thirteen', '13'], ['fifteen', '15'], ['twenty', '20'], ['thirty', '30'],
    ['forty', '40'], ['fifty', '50'], ['one hundred', '100'], ['first', '1番目（1日）'], ['second', '2番目（2日）'],
    ['third', '3番目（3日）'], ['fourth', '4番目（4日）'], ['fifth', '5番目（5日）'], ['eighth', '8番目（8日）'],
    ['ninth', '9番目（9日）'], ['twelfth', '12番目（12日）'], ['twentieth', '20番目（20日）'],
  ],
  'e6-feel': [
    ['happy', 'うれしい'], ['sad', '悲しい'], ['angry', '怒った'], ['tired', '疲れた'], ['sleepy', 'ねむい'],
    ['hungry', 'おなかがすいた'], ['thirsty', 'のどがかわいた'], ['fine', '元気な'], ['sick', '病気の'],
    ['excited', 'わくわくした'], ['nervous', '緊張した'], ['scared', 'こわがった'], ['surprised', 'おどろいた'],
    ['big', '大きい'], ['small', '小さい'], ['long', '長い'], ['short', '短い'], ['new', '新しい'], ['old', '古い・年をとった'],
    ['hot', '暑い・熱い'], ['cold', '寒い・冷たい'], ['beautiful', '美しい'], ['cute', 'かわいい'], ['cool', 'かっこいい'],
    ['fun', '楽しいこと'], ['interesting', 'おもしろい（興味深い）'], ['difficult', 'むずかしい'], ['easy', 'かんたんな'],
    ['kind', 'やさしい・親切な'], ['strong', '強い'], ['brave', '勇かんな'], ['popular', '人気のある'],
    ['delicious', 'とてもおいしい'], ['famous', '有名な'],
  ],
  'e6-verb': [
    ['play', '（スポーツを）する・遊ぶ'], ['eat', '食べる'], ['drink', '飲む'], ['run', '走る'], ['swim', '泳ぐ'],
    ['sing', '歌う'], ['dance', 'おどる'], ['cook', '料理する'], ['read', '読む'], ['write', '書く'], ['study', '勉強する'],
    ['watch', '（テレビなどを）見る'], ['listen', '聞く'], ['speak', '話す'], ['go', '行く'], ['come', '来る'],
    ['have', '持っている'], ['like', '好きである'], ['want', 'ほしい'], ['make', '作る'], ['help', '手伝う'],
    ['jump', 'とぶ'], ['walk', '歩く'], ['sleep', 'ねむる'], ['buy', '買う'], ['enjoy', '楽しむ'], ['visit', '訪れる'],
    ['live', '住む'], ['know', '知っている'], ['teach', '教える'], ['draw', '（絵を）かく'], ['clean', 'そうじする'],
    ['ride', '乗る'], ['climb', '登る'], ['went', '行った（go の過去形）'], ['ate', '食べた（eat の過去形）'],
    ['saw', '見た（see の過去形）'], ['enjoyed', '楽しんだ（enjoy の過去形）'],
  ],
  'e6-place': [
    ['school', '学校'], ['park', '公園'], ['library', '図書館'], ['hospital', '病院'], ['station', '駅'],
    ['post office', '郵便局'], ['police station', '警察署'], ['fire station', '消防署'], ['museum', '博物館・美術館'],
    ['zoo', '動物園'], ['aquarium', '水族館'], ['restaurant', 'レストラン'], ['supermarket', 'スーパーマーケット'],
    ['bookstore', '書店'], ['flower shop', '花屋'], ['bakery', 'パン屋'], ['convenience store', 'コンビニ'],
    ['department store', 'デパート'], ['amusement park', '遊園地'], ['shrine', '神社'], ['temple', '寺'],
    ['castle', '城'], ['bridge', '橋'], ['river', '川'], ['mountain', '山'], ['sea', '海'], ['lake', '湖'],
    ['beach', '浜辺'], ['house', '家'], ['airport', '空港'], ['bank', '銀行'], ['stadium', 'スタジアム'],
  ],
  'e6-job': [
    ['teacher', '先生'], ['doctor', '医者'], ['nurse', '看護師'], ['police officer', '警察官'], ['firefighter', '消防士'],
    ['pilot', 'パイロット'], ['cook', '料理人'], ['baker', 'パン職人'], ['farmer', '農家の人'], ['florist', '花屋さん'],
    ['singer', '歌手'], ['dancer', 'ダンサー'], ['artist', '芸術家・画家'], ['scientist', '科学者'],
    ['astronaut', '宇宙飛行士'], ['vet', '獣医'], ['dentist', '歯医者'], ['soccer player', 'サッカー選手'],
    ['zookeeper', '動物園の飼育員'], ['programmer', 'プログラマー'], ['writer', '作家'], ['actor', '俳優'],
    ['bus driver', 'バスの運転手'], ['carpenter', '大工'], ['flight attendant', '客室乗務員'], ['photographer', '写真家'],
  ],
};

function vocabQuestions(unit: string, list: Vocab[]): Draft[] {
  const jas = list.map((v) => v[1]);
  const ens = list.map((v) => v[0]);
  return list.flatMap(([en, ja]) => [
    C(en, [ja, ...distractors(ja, jas, 3, unit + en)], `${en}：${ja}`, en.length > 7 ? 2 : 1, {
      ask: '英語の意味を選ぼう',
      speak: en,
      speakLang: 'en',
      front: en,
      back: ja,
      tags: ['英→日'],
    }),
    C(ja, [en, ...distractors(en, ens, 3, unit + ja)], `${ja}：${en}`, en.length > 7 ? 3 : 2, {
      ask: '英語で何という？',
      speak: en,
      speakLang: 'en',
      tags: ['日→英'],
    }),
  ]);
}

// ---------- リスニング（全単語からランダムに安定選択） ----------
function listeningQuestions(): Draft[] {
  // 同じつづりで意味が違う単語（cook など）があいまいにならないよう重複を除く
  const seen = new Set<string>();
  const all = Object.values(VOCAB)
    .flat()
    .filter(([en]) => (seen.has(en) ? false : (seen.add(en), true)));
  const rng = seeded('listening-v1');
  const picked = shuffle(all, rng).slice(0, 60);
  const ens = all.map((v) => v[0]);
  const jas = all.map((v) => v[1]);
  return picked.map(([en, ja], i) =>
    i % 2 === 0
      ? C('🔊 音声を聞いて、意味を選ぼう', [ja, ...distractors(ja, jas, 3, 'L' + en)], `聞こえた単語は「${en}」：${ja}`, 2, {
          speak: en,
          speakLang: 'en',
          listening: true,
          front: `🔊 ${en}`,
          back: ja,
        })
      : C('🔊 音声を聞いて、聞こえた英単語を選ぼう', [en, ...distractors(en, ens, 3, 'S' + en)], `聞こえた単語は「${en}」：${ja}`, 2, {
          speak: en,
          speakLang: 'en',
          listening: true,
        }),
  );
}

// ---------- 会話表現 ----------
const PHRASES: [string, string][] = [
  ['はじめまして。', 'Nice to meet you.'],
  ['あなたの誕生日はいつですか。', 'When is your birthday?'],
  ['私の誕生日は5月10日です。', 'My birthday is May 10th.'],
  ['何がほしいですか。', 'What do you want?'],
  ['駅はどこですか。', 'Where is the station?'],
  ['まっすぐ行ってください。', 'Go straight.'],
  ['右に曲がってください。', 'Turn right.'],
  ['夏休みはどうでしたか。', 'How was your summer vacation?'],
  ['私は海に行きました。', 'I went to the sea.'],
  ['私はそれを楽しみました。', 'I enjoyed it.'],
  ['あなたは何になりたいですか。', 'What do you want to be?'],
  ['私は先生になりたいです。', 'I want to be a teacher.'],
  ['あなたは何の教科が好きですか。', 'What subject do you like?'],
  ['私は速く泳ぐことができます。', 'I can swim fast.'],
  ['彼はじょうずにピアノをひくことができます。', 'He can play the piano well.'],
  ['彼女はだれですか。', 'Who is she?'],
  ['あなたはどこに行きたいですか。', 'Where do you want to go?'],
  ['私はイタリアに行きたいです。', 'I want to go to Italy.'],
  ['それはいくらですか。', 'How much is it?'],
  ['あなたは何時に起きますか。', 'What time do you get up?'],
  ['私はふだん6時に起きます。', 'I usually get up at six.'],
  ['ピザはいかがですか。', 'Would you like pizza?'],
  ['どういたしまして。', "You're welcome."],
  ['あなたのいちばんの思い出は何ですか。', 'What is your best memory?'],
  ['私のいちばんの思い出は修学旅行です。', 'My best memory is our school trip.'],
  ['あなたは中学校で何の部活に入りたいですか。', 'What club do you want to join?'],
  ['私はブラスバンド部に入りたいです。', 'I want to join the brass band.'],
  ['私の町には大きな公園があります。', 'We have a big park in my town.'],
  ['私の町には遊園地がありません。', "We don't have an amusement park in my town."],
  ['あなたはどうですか。', 'How about you?'],
];
const phraseQs: Draft[] = PHRASES.map(([ja, en]) => {
  const ens = PHRASES.map((p) => p[1]);
  return C(ja, [en, ...distractors(en, ens, 3, ja)], `${ja} → ${en}`, 2, {
    ask: '英語で言うと？',
    speak: en,
    speakLang: 'en',
    front: ja,
    back: en,
  });
});

// ---------- 中1文法 ----------
const ask = '（　）に入るものを選ぼう';
const g = (prompt: string, choices: string[], expl: string, diff = 2): Draft =>
  C(prompt, choices, expl, diff, { ask, speak: prompt.replace('（　）', choices[0]), speakLang: 'en' });

const beQs: Draft[] = [
  g('I （　） a student.', ['am', 'is', 'are', 'be'], '主語が I のときは am。', 1),
  g('You （　） my friend.', ['are', 'am', 'is', 'be'], '主語が you のときは are。', 1),
  g('He （　） from Canada.', ['is', 'am', 'are', 'be'], '主語が he / she / it や1人・1つのものは is。', 1),
  g('We （　） in the same class.', ['are', 'is', 'am', 'be'], '主語が複数（we, they など）は are。', 1),
  g('（　） you a soccer fan?', ['Are', 'Do', 'Is', 'Am'], 'be動詞の疑問文は be動詞を主語の前に出す。', 2),
  g('Is this your bag? — Yes, （　）.', ['it is', 'this is', 'I am', 'it does'], 'this / that で聞かれたら it で答えます。', 2),
  g('Are they your friends? — No, （　） aren\'t.', ['they', 'we', 'you', 'there'], 'they で聞かれたら they で答えます。', 2),
  g('Ken and I （　） good friends.', ['are', 'is', 'am', 'be'], '「Ken and I」は2人なので複数 → are。', 3),
  g('That （　） my sister\'s bike.', ['is', 'are', 'am', 'do'], 'that（あれは）は単数なので is。', 1),
  g('What （　） this? — It\'s a koala.', ['is', 'are', 'do', 'does'], 'What is this? の答えは It is ～.', 1),
  C('「彼女は看護師ではありません。」を正しく表している文は？', ['She is not a nurse.', 'She not is a nurse.', 'She does not a nurse.', 'She is a not nurse.'], 'be動詞の否定文は be動詞のあとに not。', 2),
  C('「She is a nurse.」を疑問文にすると？', ['Is she a nurse?', 'Does she a nurse?', 'She is a nurse?', 'Are she a nurse?'], 'is を主語の前に出します。', 1),
];

const ippanQs: Draft[] = [
  g('I （　） tennis every day.', ['play', 'plays', 'am play', 'playing'], '主語が I なので、動詞はそのまま（原形）。', 1),
  g('She （　） tennis every day.', ['plays', 'play', 'is play', 'playing'], '主語が3人称単数（she）で現在の文 → 動詞に s をつける（3単現）。', 1),
  g('He （　） English hard.', ['studies', 'studys', 'study', 'is study'], 'study は y を i に変えて es → studies。', 2),
  g('My brother （　） TV after dinner.', ['watches', 'watchs', 'watch', 'is watch'], 'ch で終わる語は es をつける → watches。', 2),
  g('Tom （　） a dog.', ['has', 'haves', 'have', 'is have'], 'have の3単現は has（特別な形）。', 2),
  g('（　） you like music?', ['Do', 'Does', 'Are', 'Is'], '一般動詞の疑問文は Do で始める。', 1),
  g('（　） your sister like music?', ['Does', 'Do', 'Is', 'Are'], '主語が3人称単数のときは Does。', 2),
  g('Does he play the piano? — Yes, he （　）.', ['does', 'do', 'is', 'plays'], 'Does で聞かれたら does で答える。', 2),
  g('I （　） like natto.', ["don't", "doesn't", "am not", "isn't"], '一般動詞の否定文：I / you / 複数 は don\'t。', 1),
  g('Emi （　） eat meat.', ["doesn't", "don't", "isn't", "aren't"], '主語が3人称単数 → doesn\'t ＋動詞の原形。', 2),
  g('He doesn\'t （　） soccer.', ['play', 'plays', 'playing', 'played'], 'doesn\'t のあとの動詞は原形（s をつけない）。', 3),
  g('She can （　） very well.', ['swim', 'swims', 'swimming', 'to swim'], 'can のあとの動詞は原形。', 2),
  g('（　） the window, please.', ['Open', 'Opens', 'Opening', 'You open'], '命令文は動詞の原形で始めます。', 2),
  g('（　） play soccer after school.', ["Let's", 'Lets', 'Let us to', 'Shall'], '「～しましょう」は Let\'s ＋動詞の原形。', 1),
  C('box の複数形は？', ['boxes', 'boxs', 'boxies', 'box'], 'x, s, sh, ch で終わる語は es をつけます。', 2),
  C('child の複数形は？', ['children', 'childs', 'childes', 'childrens'], '不規則に変化する複数形。', 3),
  C('city の複数形は？', ['cities', 'citys', 'cityes', 'city'], '子音字＋y は y を i に変えて es。', 2),
  C('go の3単現の形は？', ['goes', 'gos', 'goies', 'going'], 'o で終わる語は es をつけます。', 2),
];

const gimonQs: Draft[] = [
  g('（　） is your name? — My name is Yuki.', ['What', 'Who', 'Where', 'How'], 'What は「何」。', 1),
  g('（　） do you live? — I live in Osaka.', ['Where', 'What', 'When', 'Who'], 'Where は「どこ」。', 1),
  g('（　） is that boy? — He is Ken.', ['Who', 'What', 'Whose', 'Which'], 'Who は「だれ」。', 1),
  g('（　） do you go to school? — By bus.', ['How', 'What', 'Where', 'Why'], 'How は「どのように（方法）」。', 2),
  g('（　） is your birthday? — It\'s June 5th.', ['When', 'What', 'Where', 'How'], 'When は「いつ」。', 1),
  g('（　） bag is this? — It\'s mine.', ['Whose', 'Who', 'What', 'Which'], 'Whose は「だれの」。', 2),
  g('How （　） are you? — I\'m twelve.', ['old', 'many', 'much', 'long'], 'How old は「何才」。', 1),
  g('How （　） pens do you have? — I have three.', ['many', 'much', 'old', 'long'], '数をたずねるときは How many ＋複数形の名詞。', 2),
  g('（　） time is it? — It\'s seven.', ['What', 'When', 'How', 'Which'], '時刻は What time。', 1),
  g('（　） do you like, dogs or cats? — I like dogs.', ['Which', 'What', 'Who', 'Where'], 'Which は「どちら」。', 2),
  g('I am （　） now.', ['studying', 'study', 'studies', 'studied'], '現在進行形：be動詞 ＋ ～ing。', 2),
  g('He is （　） in the pool.', ['swimming', 'swiming', 'swim', 'swims'], 'swim は最後の m を重ねて ing → swimming。', 3),
  g('I （　） to Kyoto last week.', ['went', 'go', 'goes', 'going'], 'last week（先週）なので過去形。go の過去形は went。', 2),
  g('She （　） a cake yesterday.', ['made', 'make', 'makes', 'maked'], 'make の過去形は made（不規則動詞）。', 2),
  g('Did you watch TV? — Yes, I （　）.', ['did', 'do', 'was', 'watched'], 'Did で聞かれたら did で答えます。', 2),
];

// ---------- つづり練習（中1） ----------
const SPELL: [string, string, string[]?][] = [
  ['友だち', 'friend'], ['家族', 'family'], ['朝', 'morning'], ['水曜日', 'Wednesday'], ['2月', 'February'],
  ['美しい', 'beautiful'], ['おもしろい（興味深い）', 'interesting'], ['図書館', 'library'], ['理科', 'science'],
  ['先生', 'teacher'], ['朝食', 'breakfast'], ['とてもおいしい', 'delicious'], ['明日', 'tomorrow'], ['昨日', 'yesterday'],
  ['なぜなら（～だから）', 'because'], ['いちばん好きな', 'favorite', ['favourite']], ['ときどき', 'sometimes'],
  ['ふだんは', 'usually'], ['いっしょに', 'together'], ['誕生日', 'birthday'], ['宿題', 'homework'], ['国', 'country'],
  ['辞書', 'dictionary'], ['質問', 'question'], ['答え', 'answer'], ['人々', 'people'], ['子どもたち', 'children'],
  ['天気', 'weather'], ['音楽', 'music'], ['動物', 'animal'],
];
const spellQs: Draft[] = SPELL.map(([ja, en, alt]) =>
  I(ja, [en, ...(alt ?? [])], `${ja}：${en}`, en.length >= 8 ? 3 : 2, {
    ask: '英語のつづりを書こう',
    speak: en,
    speakLang: 'en',
    front: ja,
    back: en,
  }),
);

export const ENGLISH: Question[] = [
  ...Object.entries(VOCAB).flatMap(([unit, list]) => bank('english', 6, unit, vocabQuestions(unit, list))),
  ...bank('english', 6, 'e6-phrase', phraseQs),
  ...bank('english', 6, 'e6-listen', listeningQuestions()),
  ...bank('english', 7, 'e7-be', beQs),
  ...bank('english', 7, 'e7-ippan', ippanQs),
  ...bank('english', 7, 'e7-gimon', gimonQs),
  ...bank('english', 7, 'e7-spell', spellQs),
];
