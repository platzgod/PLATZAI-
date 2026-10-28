// ============================================================
// 配信シナリオの設定ファイル
// 配信文・プレゼントのリンク・決済リンク・配信日はここだけ直せば差し替えられます。
// 変更後は `npx wrangler deploy` で反映されます（データは消えません）。
//
// 文中で使える差し込み：
//   {{paymentUrl}}  … その人専用のフロント商品決済リンク（購入者を自動で判別するため必須）
//   {{refCode}}     … その人の申込番号（銀行振込の振込名義に入れてもらう）
//   {{consultUrl}}  … 個別相談の予約ページ
//   {{name}}        … LINE の表示名（取得できなかった場合は空）
//
// messages には LINE のメッセージオブジェクトを1回につき5件まで並べられます。
// 一番かんたんなのは { type: 'text', text: '...' } です。
// ============================================================

export const links = {
  // プレゼント（中身は後で決定。決まったら URL を差し替える）
  present1Url: 'https://example.com/present1',
  present2Url: 'https://example.com/present2',

  // Stripe の Payment Link（フロント商品）。例: https://buy.stripe.com/xxxxxxxx
  frontPaymentLinkUrl: 'https://buy.stripe.com/REPLACE_ME',

  // 個別相談の予約ページ（Googleフォーム・TimeRex など）
  consultUrl: 'https://example.com/consult',
};

export const frontProduct = {
  name: '総合型・推薦対策 スタートパック', // 仮称
  priceText: '9,800円（税込）', // 仮
  // Stripe の Payment Link の ID（plink_ で始まる）。設定すると、この商品の決済だけを購入として扱う。
  // 空のままなら、LINE ユーザーIDが付いた決済はすべてフロント購入として扱う。
  stripePaymentLinkId: '',
  // 銀行振込の案内（Stripe を使わない場合）。不要なら空文字にする。
  bankTransferText:
    '【銀行振込をご希望の方】\n' +
    '〇〇銀行 〇〇支店 普通 1234567 カ）〇〇〇〇\n' +
    '振込名義の前に申込番号「{{refCode}}」を入れてください（例：{{refCode}} ヤマダハナコ）。\n' +
    '入金を確認しだい、こちらのLINEでご連絡します。',
};

// 配信日（登録日を0日目として、何日目に送るか。日本時間の日付で数えます）
export const schedule = {
  present2Day: 7,
  frontOfferDay: 14,
  backendConsultDay: 21, // フロント購入者のみ。21日目より後に購入した人には購入翌日以降の定期処理で送る
  monthlyIntervalDays: 30, // フロント未購入者へのお役立ち情報の間隔（フロント案内の日から数える）
};

export const scenario = {
  // 1. 登録直後：プレゼント1（応答メッセージで送るため、無料プランの通数に数えられません）
  welcome: {
    messages: [
      {
        type: 'text',
        text:
          'ご登録ありがとうございます！\n' +
          '総合型選抜・学校推薦型選抜の対策情報をお届けします。\n\n' +
          '【登録プレゼント①】\n' +
          '（プレゼントの内容は後で決定）\n' +
          '{{present1Url}}',
      },
    ],
  },

  // 2. 登録7日後：プレゼント2
  present2: {
    messages: [
      {
        type: 'text',
        text: '【登録プレゼント②】\n（プレゼントの内容は後で決定）\n{{present2Url}}',
      },
    ],
  },

  // 3. 登録14日後：フロントエンド商品の案内（フロント未購入者のみ）
  frontOffer: {
    messages: [
      {
        type: 'text',
        text:
          '【ご案内】{{frontName}}\n' +
          '（商品説明は後で決定）\n\n' +
          '価格：{{frontPrice}}\n' +
          'お申込み（カード決済）はこちら\n{{paymentUrl}}\n\n' +
          '{{bankTransferText}}',
      },
    ],
  },

  // 4. フロント購入者のみ：バックエンド商品の個別相談案内
  backendConsult: {
    messages: [
      {
        type: 'text',
        text:
          '【個別相談のご案内】\n' +
          '志望校に合わせた対策プランを個別にご提案します。\n' +
          'ご予約はこちら\n{{consultUrl}}',
      },
    ],
  },

  // 購入直後のお礼（購入を検知したときに即時送信。通数に数えられます。不要なら enabled: false）
  purchaseThanks: {
    enabled: true,
    messages: [
      {
        type: 'text',
        text: 'お申込みありがとうございます！\n{{frontName}}のご案内をこちらのLINEでお送りします。',
      },
    ],
  },

  // 5. フロント未購入者：月1回のお役立ち情報（上から順に送り、最後まで行ったら先頭に戻る）
  monthly: [
    {
      messages: [{ type: 'text', text: '【お役立ち情報 1】\n（内容は後で決定）' }],
    },
    {
      messages: [{ type: 'text', text: '【お役立ち情報 2】\n（内容は後で決定）' }],
    },
    {
      messages: [{ type: 'text', text: '【お役立ち情報 3】\n（内容は後で決定）' }],
    },
  ],
};
