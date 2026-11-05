export const ja = {
  errors: {
    clientTooOld:
      'このバージョンのアプリは古すぎて、このサーバーでは使えません。',
    internal:
      'サーバー側で問題が発生しました。しばらくしてからもう一度お試しください。',
    generic: '処理を完了できませんでした。',
    badRequest: '送信内容が正しくありません。',
    validation: '入力内容に誤りがあります。',
    notFound: '見つかりません。',
    conflict:
      '現在の状態と食い違っています。ページを再読み込みして、もう一度お試しください。',
    payloadTooLarge: '送信データが大きすぎます。',
    tooManyRequests: '操作が多すぎます。少し時間をおいてからお試しください。',
    unauthorized: 'この操作にはログインが必要です。',
    forbidden: 'この操作を行う権限がありません。',
    auth: {
      captchaRequired: 'ロボットではないことを確認してください。',
      captchaFailed: '確認に失敗しました。もう一度お試しください。',
      captchaUnavailable:
        '現在、確認を利用できません。しばらくしてからもう一度お試しください。',
      invalidCredentials: 'メールアドレスまたはパスワードが正しくありません。',
      registrationClosed:
        'このサイトの新規登録は締め切られています。アカウントが必要な場合は、サイトの管理者にお問い合わせください。',
      emailTaken: 'このメールアドレスのアカウントはすでに存在します。',
      usernameTaken: 'このユーザー名はすでに使われています。',
      usernameInvalid:
        'ユーザー名は3〜30文字で、半角英小文字・数字・アンダースコアが使えます。',
      usernameReserved: 'このユーザー名は予約されています。',
      usernameChangeTooSoon_other:
        'ユーザー名を次に変更できるのは{{count}}日後です。',
      passwordWeak: 'パスワードは8文字以上で、英字と数字を両方含めてください。',
      tokenInvalid: 'このリンクは無効か、すでに使用されています。',
      tokenExpired:
        'このリンクは有効期限が切れています。新しいリンクを取得してください。',
      emailNotVerified: '先にメールアドレスを確認してください。',
      emailAlreadyVerified: 'メールアドレスはすでに確認済みです。',
      accountBanned: 'このアカウントは停止されています。',
      sessionExpired:
        'セッションの有効期限が切れました。もう一度ログインしてください。',
      tooManyAttempts_other:
        'ログインの試行回数が多すぎます。{{count}}分後にもう一度お試しください。',
      googleNotConfigured: 'Googleでのログインは利用できません。',
      googleFailed:
        'Googleでログインできませんでした。もう一度お試しください。',
      googleSignupExpired:
        '登録の有効期限が切れました。最初からやり直してください。',
      wrongPassword: '現在のパスワードが正しくありません。',
      csrf: 'セキュリティ上の理由でブロックされました。ページを再読み込みして、もう一度お試しください。',
      twoFactorLogin: '認証アプリに表示されたコードを入力してください。',
      adminGoogle:
        '管理者はGoogleではなく、パスワードと2段階目の認証でログインします。',
      googleLinkTwoFactor:
        'このメールアドレスは2段階認証を設定したアカウントのものです。そのアカウントのパスワードでログインしてください。',
    },
    twoFactor: {
      required:
        '管理画面を使うには2段階認証が必要です。「設定 → セキュリティ」でオンにしてください。',
      confirm: '先に2段階目の認証で本人確認をしてください。',
      invalidCode: 'コードが一致しません。確認して、もう一度お試しください。',
      expired:
        'ログインに時間がかかりすぎました。パスワードをもう一度入力してください。',
      setupExpired:
        '設定に時間がかかりすぎました。最初からやり直してください。',
      needsPassword:
        '2段階認証はパスワードを守るための仕組みです。先にパスワードを設定してください。',
      admin: '管理者は2段階目の認証なしではログインできません。',
      appExists: '認証アプリはすでに設定されています。',
      passkeyInvalid:
        'パスキーから応答がありませんでした。もう一度お試しください。',
      passkeyLimit: 'パスキーはすでに10個登録されています。',
      passkeyNotFound: 'このパスキーはもう登録されていません。',
      noPasskey: 'このアカウントにはパスキーがありません。',
      off: '2段階認証はオフです。',
    },
    users: {
      notFound: 'このユーザーは存在しません。',
      pageHidingNotAllowed: 'ページの非表示はProの機能です。',
      invalidImage:
        '対応していない画像ファイルです（JPEG、PNG、WebP、GIFに対応しています）。',
    },
    exchange: {
      notFound: 'このリクエストは存在しません。',
      notAllowed: 'このリクエストではその操作はできません。',
      offerChanged:
        'その間に提案が変わりました。やり取りを確認して、もう一度お試しください。',
      videoBeingEdited:
        'この交換に含まれる動画を、投稿者がいま編集しています。編集が終わってからもう一度お試しください。',
      nothingToRequest: '選択した動画はどれもリクエストできません。',
      hintTooEarly: 'このヒントは、あと何回か表示されると非表示にできます。',
      selfRequest: '自分の動画はリクエストできません。',
      invalidOffer:
        '提案には双方に1本以上の動画が必要です。どの動画も持ち主の手元で利用できる状態でなければなりません。',
      blocked: 'このユーザーにはリクエストを送れません。',
      alreadyBlocked: 'このユーザーはすでにブロックしています。',
      selfBlock: '自分をブロックすることはできません。',
    },
    social: {
      selfFollow: '自分をフォローすることはできません。',
      followNotAllowed: 'このユーザーを友達に追加することはできません。',
    },
    editor: {
      invalid: 'この編集は保存できません。時間と範囲を確認してください。',
      nothing: '変更点がありません。',
      inProgress:
        'この動画はすでに編集の処理中です。終わるまで待つか、キャンセルしてください。',
      notReady: '動画の処理が終わると編集できるようになります。',
      proOnly: '動画エディターはProの機能です。',
      copyOwnOnly: 'コピーとして保存できるのは自分の動画だけです。',
    },
    invites: {
      notFound: 'この招待リンクは存在しません。',
      expired:
        'この招待は有効期限が切れています。新しいリンクを頼んでください。',
      usedUp:
        'この招待は使用回数の上限に達しました。新しいリンクを頼んでください。',
      own: 'これはあなた自身の招待です。誰かに送ってください。',
    },
    deals: {
      notFound:
        'この取引は見つかりません（取引を始めたときとは別のブラウザで開いている可能性があります）。',
      closed: 'この取引は終了しています。',
      linkNotFound: 'この交換リンクはもう使えません。',
      linkVideos:
        '交換リンクには、処理済みの自分の動画を選んでください（50本まで）。',
      guestsOff: 'この人は登録ユーザーとだけ交換しています。',
      uploadsMax: '1つの取引に出せる動画は{{max}}本までです。',
      videoInOffer:
        'この動画はいま検討中の提案に含まれています。先に提案を変更してください。',
      nothingOffered: '提案する動画を1本以上アップロードしてください。',
      tooMany:
        '進行中の取引が{{max}}件あります。どれかを終えてから新しい取引を始めてください。',
    },
    links: {
      notFound: 'このリンクは存在しないか、もう使えません。',
      passwordPro: 'リンクのパスワードはProの機能です。',
      tooMany:
        '有効なリンクが{{max}}件あります。先にいくつか無効にしてください。',
      videoNotAllowed:
        'リンクで送れるのは、自分でアップロードした動画と受け取った動画のうち、処理済みで削除されていないものだけです。',
      locked: '先にパスワードか、メールに届いたコードを入力してください。',
      wrongPassword: 'パスワードが違います。',
      wrongCode:
        'コードが違うか、有効期限が切れています。新しいコードを送信してください。',
      codeTooSoon:
        'コードを送信したばかりです。次のコードは1分後に送信できます。',
      codeLimit:
        'このリンクのコードを送信した回数が多すぎます。1時間後にもう一度お試しください。',
      noEmail: 'このリンクは特定のメールアドレス宛てではありません。',
      emailOff:
        'このサーバーはメールを送信しないため、1人専用のリンクは使えません。',
      blocked: 'この人の動画は追加できません。',
    },
    anonymousLinks: {
      pro: '匿名リンクはProの機能です。',
      tooMany:
        '匿名リンクが{{max}}件あります。先にどれか1件を削除してください。',
      notFound: 'このリンクは存在しないか、もう使えません。',
      nameNeeded:
        '表示名からユーザー名が分かってしまいます。このリンク用の名前を決めてください。',
      nameNamesNickname:
        'この名前からユーザー名が分かってしまいます。別の名前を選んでください。',
    },
    appTokens: {
      scope: 'ブラウザ拡張機能ではこの操作はできません。',
      invalid: '拡張機能の連携が解除されています。もう一度連携してください。',
      code: '連携コードの有効期限が切れているか、正しくありません。もう一度連携してみてください。',
      redirect: 'tapeshelfの拡張機能ではないようです。',
      notFound: 'この連携は存在しません。',
    },
    chat: {
      notFriends:
        'メッセージを送れるのは友達だけです。お互いに友達に追加する必要があります。',
      unavailable: 'このユーザーにはメッセージを送れません。',
      emptyMessage: 'メッセージを入力するか、動画を添付してください。',
      videoNotAttachable:
        'この動画は添付できません。マイページに表示されている処理済みの動画を選んでください。',
      selfMessage: '自分にメッセージを送ることはできません。',
      notFound: 'この会話は存在しません。',
    },
    reports: {
      self: '自分自身や自分の動画は報告できません。',
    },
    support: {
      notFound: 'このお問い合わせは見つかりません。',
      tooMany:
        '未解決のお問い合わせが{{count}}件あります。どれかへの回答を待つか、解決済みにしてください。',
      closed:
        'このお問い合わせは終了しています。問題が解決していない場合は、新しいお問い合わせを作成してください。',
      empty: 'メッセージを入力するか、画像を追加してください。',
      tooManyFiles: '1つのメッセージに添付できる画像は{{count}}枚までです。',
      badImage:
        'この画像を読み込めませんでした。PNG、JPG、WebPで、10MBまでです。',
      notYourVideo: '添付できるのは自分でアップロードした動画だけです。',
      notRated: 'お問い合わせは、解決済みか終了になってから評価できます。',
    },
    site: {
      legalNotFound: 'このサイトの運営者はこの文書を公開していません。',
    },
    account: {
      confirmMismatch: '確認のため、ユーザー名を正確に入力してください。',
      deleted: 'このアカウントは削除されています。',
    },
    billing: {
      disabled: 'このサーバーでは支払いを利用できません。',
      unavailable:
        '現在、支払いを利用できません。しばらくしてからもう一度お試しください。',
      signature: '署名が一致しません。',
      noSubscription: 'サブスクリプションがありません。',
    },
    downloads: {
      limitReached:
        '今月のダウンロード{{limit}}回をすべて使いました。次は{{date}}からダウンロードできます。',
      busy: '別のダウンロードがまだ進行中です。終わるのを待ってから、もう一度お試しください。',
      ticketInvalid:
        'このダウンロードリンクは有効期限が切れています。動画のページからもう一度ダウンロードしてください。',
      range: 'ファイルのこの部分は存在しません。',
    },
    traffic: {
      limitReached:
        'プランの今月の転送量を使い切りました。来月の初めにリセットされます。',
      sharerLimitReached:
        'この動画を共有した人が今月の転送量を使い切りました。来月の初めにリセットされます。',
    },
    admin: {
      selfAction: '自分のアカウントにはこの操作はできません。',
      adminTarget: '先に管理者の権限を外してください。',
      notInTrash: 'この動画はゴミ箱にありません。',
      purged: 'この動画はすでにストレージから消去されています。',
      authorDeleted:
        '投稿者がアカウントを削除したため、この動画は復元できません。',
      alreadyProcessed: 'この動画はすでに処理済みです。',
      tierUntilPast: '終了日は未来の日付にしてください。',
      tiersDisabled: 'このサーバーにはプランがありません。',
      reportClosed: 'この報告はすでに対応済みです。',
      reportAction: 'この操作は報告の内容に合いません。',
      noEmail: 'このアカウントにはメールアドレスがありません。',
      viewAsReadOnly:
        '別のユーザーとしてサイトを表示しています。変更はできません。',
    },
    categories: {
      exists: '同じ名前のカテゴリがすでにあります。',
      tooMany: 'カテゴリは{{max}}個まで作成できます。',
    },
    uploads: {
      fileTooLarge: 'ファイルが上限の{{max}}を超えています。',
      quotaExceeded:
        '容量が足りません。すでに{{quota}}中{{used}}を使用しています。',
      notFound: 'このアップロードは存在しません。',
      notActive: 'このアップロードはすでに完了したか、キャンセルされています。',
      expired:
        'このアップロードは有効期限が切れました。最初からやり直してください。',
      incomplete:
        'ファイルの一部が欠けているか壊れています。もう一度アップロードしてください。',
      sizeMismatch:
        'アップロードされたファイルが、事前に伝えられたサイズと一致しません。',
      extensionDailyLimit:
        '今日はすでに拡張機能で動画を{{limit}}本保存しました。これが1日の上限です。カウントは午前0時（UTC）にリセットされます。',
    },
    videos: {
      deleteInAdminPanel:
        'ほかの人の動画は管理画面で削除してください。投稿者には該当するルールとあなたのメモが伝えられます。',
      notFound: 'この動画は存在しません。',
      notReady: 'この動画はまだ処理中です。',
      categoryNotFound: 'このカテゴリは存在しません。',
      stackNotFound: 'このスタックは存在しません。',
      stackTooSmall: 'スタックには2本以上の動画が必要です。',
      stackCategories:
        'スタック内の動画はすべて同じカテゴリになります。先にカテゴリを選んでください。',
      frameNotFound: 'このコマは存在しません。',
      timestampOutOfRange: 'この時間は動画の長さを超えています。',
      notWatchable: 'この動画へのアクセス権がありません。',
      playbackTokenInvalid:
        '再生用リンクの有効期限が切れました。ページを再読み込みしてください。',
      downloadNotAllowed: 'この動画はダウンロードできません。',
      alreadyInCollection: 'この動画はすでにコレクションにあります。',
      cannotAddToCollection: 'この動画はコレクションに追加できません。',
      cannotHide: 'この動画はあなたの棚にありません。',
      ownVideoRename:
        '自分の動画の名前は「情報を編集」で変更してください。変更はすべての人に反映されます。',
    },
  },
  editor: {
    copySuffix: '（編集版）',
  },
  notifications: {
    failReason: {
      corrupted: 'ファイルが壊れているか、動画ではありません',
      noVideoStream: 'ファイルに映像トラックがありません',
      zeroDuration: '動画の長さが0です',
      tooLong: '12時間を超える動画には対応していません',
      tooLarge: '4096pxを超えるフレームサイズには対応していません',
      fpsTooHigh: '60fpsを超えるフレームレートには対応していません',
      tooManyStreams: 'ファイルに含まれるストリームが多すぎます',
      transcodeFailed: '動画を変換できませんでした',
      blocked:
        'このファイルはルール違反で削除されたため、再びアップロードすることはできません',
      internal: '処理に失敗しました。もう一度アップロードしてください',
    },
  },
  mail: {
    notifications: {
      guest: 'ゲスト',
      anonymous: '匿名',
      manage: '受け取る通知の設定はこちら：{{url}}',
      unsubscribe: 'このようなメールを停止: {{url}}',
      andMore_other: 'ほか{{count}}本',
      REQUEST_RECEIVED: {
        subject: '{{name}}さんが「{{title}}」をリクエストしています',
        title: '動画のリクエストが届きました',
        body_other:
          '{{name}}さんが「{{title}}」（{{count}}本）の共有を希望しています。無料で共有するか、断るか、交換を提案してください。',
        message: 'メッセージ：「{{message}}」',
        offered_other:
          'お返しとして、相手の動画{{count}}本が提案されています。',
        button: 'リクエストを開く',
      },
      OFFER_RECEIVED: {
        subject: '{{name}}さんから提案が届きました',
        title: '別の提案が届きました',
        body: '{{name}}さんが交換を提案しました（{{round}}回目）。受け入れるか、断るか、別の提案をしてください。',
        bodyDeal:
          '{{name}}さんが、あなたの「{{wants}}」{{wantsMore}}と引き換えに「{{gives}}」{{givesMore}}を提案しています。受け入れるか、断るか、別の提案をしてください。',
        message: 'メッセージ：「{{message}}」',
        button: 'やり取りを開く',
      },
      REQUEST_SHARED: {
        subject: '{{name}}さんが「{{title}}」を共有しました',
        title: '動画が共有されました',
        body_other:
          '{{name}}さんが「{{title}}」（{{count}}本）を無料で共有してくれました。すでにあなたのコレクションに入っています。',
        button: '受け取った動画を見る',
      },
      EXCHANGE_COMPLETED: {
        subject: '{{name}}さんとの交換が成立しました',
        title: '交換が成立しました',
        body: '{{name}}さんとの交換が完了しました。受け取った動画は{{received}}本、渡した動画は{{given}}本です。受け取った動画はすでにコレクションに入っています。',
        button: '受け取った動画を見る',
      },
      REQUEST_DECLINED: {
        subject: '{{name}}さんが「{{title}}」のリクエストを断りました',
        title: 'リクエストが断られました',
        body: '{{name}}さんがリクエストを断りました。{{comment}}',
        again_other: '{{count}}日後にもう一度リクエストできます。',
        button: 'リクエストを開く',
      },
      REQUEST_CANCELLED: {
        subject: '{{name}}さんが「{{title}}」のリクエストを取り下げました',
        title: 'リクエストが取り下げられました',
        body: '{{name}}さんが「{{title}}」のリクエストを取り下げました。',
        button: 'リクエストを開く',
      },
      REQUEST_INVALIDATED: {
        subject: '「{{title}}」のリクエストに変更がありました',
        title: 'リクエストが自動で更新されました',
        body: '「{{title}}」のリクエストに含まれる動画が利用できなくなったため、やり取りの内容が更新されました。',
        bodyClosed:
          '相手のアカウントが利用できなくなったため、「{{title}}」のリクエストは終了しました。',
        bodyExpired:
          'ゲストとの「{{title}}」の取引は期限切れになりました。3日間、どちらからも動きがありませんでした。ゲストの動画は削除されました。',
        button: 'リクエストを開く',
      },
      NEW_FOLLOWER: {
        subject: '新しいフォロワー：{{name}}さん',
        title: '新しいフォロワー',
        body: '{{name}}さんがあなたのコレクションをフォローしました。こちらも追加すると友達になり、メッセージを送り合えるようになります。',
        button: '相手のページを開く',
      },
      FRIEND_ACCEPTED: {
        subject: '{{name}}さんと友達になりました',
        title: '新しい友達',
        body: '{{name}}さんとお互いにフォローし合いました。メッセージや動画を送り合えます。',
        button: '相手のページを開く',
      },
      FOLLOWED_NEW_VIDEO: {
        subject: '{{name}}さんの新しい動画：「{{title}}」',
        title: '{{name}}さんの新しい動画',
        body: '{{name}}さんが新しい動画「{{title}}」を追加しました。',
        bodyPrivate:
          '{{name}}さんが新しい非公開動画「{{title}}」を追加しました。共有をリクエストできます。',
        button: '動画を開く',
      },
      NEW_MESSAGE: {
        subject: '{{name}}さんから新しいメッセージ',
        title: '新しいメッセージ',
        body: '{{name}}さん：「{{preview}}」',
        bodyVideo: '{{name}}さんがチャットで動画を送りました。',
        button: 'チャットを開く',
      },
      VIDEO_PROCESSED: {
        subject: '「{{title}}」の準備ができました',
        title: '動画の準備ができました',
        body: '「{{title}}」の処理が終わり、再生できるようになりました。',
        button: '動画を開く',
      },
      VIDEO_FAILED: {
        subject: '「{{title}}」を処理できませんでした',
        title: '処理に失敗しました',
        body: '「{{title}}」を処理できませんでした：{{reason}}。ファイルはもう一度アップロードできます。',
        button: 'マイページを開く',
      },
      VIDEO_REMOVED: {
        subject: '「{{title}}」が投稿者によって削除されました',
        title: 'コレクションから動画がなくなりました',
        body: '{{author}}さんが、あなたのコレクションにあった「{{title}}」を削除しました。この動画はもう誰も見ることができません。',
        button: '通知を開く',
      },
      REPORT_RESOLVED: {
        subject: '報告の確認が終わりました',
        title: '報告を確認しました',
        bodyVideo:
          '「{{title}}」についての報告を確認し、対応しました。{{site}}の安全を守るためのご協力、ありがとうございます。',
        bodyUser:
          '{{title}}さんについての報告を確認し、対応しました。{{site}}の安全を守るためのご協力、ありがとうございます。',
        bodyVideoNone:
          '「{{title}}」についての報告を確認しましたが、ルール違反は見つかりませんでした。',
        bodyUserNone:
          '{{title}}さんについての報告を確認しましたが、ルール違反は見つかりませんでした。',
        button: '通知を開く',
      },
      ADMIN_NOTICE: {
        subject: '{{site}}からのお知らせ',
        title: '{{site}}運営チームからのメッセージ',
        body: '{{message}}',
        button: '通知を開く',
      },
      VIDEO_EDITED: {
        subject: '動画「{{title}}」がモデレーターによって編集されました',
        title: '動画が編集されました',
        body: '{{site}}のモデレーターが、あなたの動画「{{title}}」を編集しました（一部にぼかしを入れるなど）。リンクなど、そのほかはすべてそのままです。',
        button: '動画を開く',
      },
      VIDEO_EDIT_FAILED: {
        subject: '「{{title}}」の編集を完了できませんでした',
        title: '編集は保存されませんでした',
        body: '動画「{{title}}」の編集を完了できませんでした。動画は元のままです。変更内容はエディターに残っているので、もう一度お試しいただけます。',
        button: 'エディターを開く',
      },
      SUPPORT_REPLY: {
        subject: 'お問い合わせ #{{number}}にサポートが回答しました',
        title: 'サポートからの回答',
        body: '#{{number}}「{{subject}}」：{{preview}}',
        bodyResolved:
          'サポートがお問い合わせ #{{number}}「{{subject}}」を解決済みにしました。問題が解決していない場合は、新しいお問い合わせを作成してください。',
        bodyResolvedWith:
          'サポートがお問い合わせ #{{number}}「{{subject}}」に回答し、解決済みにしました：{{preview}}',
        button: 'お問い合わせを開く',
      },
      SUPPORT_TICKET: {
        subject: 'サポート #{{number}}：{{subject}}',
        title: 'お問い合わせ #{{number}}',
        body: '@{{name}}さんからのお問い合わせ（{{topic}}）：「{{subject}}」。{{preview}}',
        bodyReply:
          '@{{name}}さんが #{{number}}「{{subject}}」に再び書き込みました：{{preview}}',
        button: '管理画面で開く',
      },
      LINK_OPENED: {
        subject: '期限付きリンクが開かれました',
        title: 'リンクが開かれました',
        body_other:
          '@{{name}}さんが「{{title}}」（{{count}}本）の期限付きリンクを開きました。',
        bodyGuest_other:
          '「{{title}}」（{{count}}本）の期限付きリンクが開かれました。',
        button: 'マイリンクを開く',
      },
      LINK_SAVED: {
        subject: '@{{name}}さんがリンクの動画を保存しました',
        title: 'リンクから保存されました',
        body_other:
          '@{{name}}さんが、期限付きリンクの「{{title}}」（{{count}}本）を自分の棚に追加しました。',
        button: 'マイリンクを開く',
      },
      VIDEO_TAKEN_DOWN: {
        subject: '動画「{{title}}」が削除されました',
        title: '動画が削除されました',
        body: 'あなたの動画「{{title}}」を{{site}}から削除しました。理由：{{rule}}。この動画はもう誰も見ることができません。',
        message: 'モデレーターからのメモ：{{message}}',
        appeal: '誤りだと思われる場合は、{{email}}までご連絡ください。',
        button: '通知を開く',
      },
      PLAN_EXPIRING: {
        subject: 'Proプランは{{date}}に終了します',
        title: 'Proプランがまもなく終了します',
        body: '{{site}}のProプランは{{date}}（UTC）に終了します。その後、棚にはFreeプランの上限が適用されます。削除されるものはありません。',
        page: '現在ページは非表示ですが、Proが終了すると再びすべての人に表示されます。',
        anonymousLinks:
          'Proが終了すると匿名リンクは開けなくなりますが、Proを再開すると再び使えるようになります。',
        button: 'プランを開く',
      },
      PLAN_PAYMENT_FAILED: {
        subject: 'Proプランを更新できませんでした',
        title: '支払いに失敗しました',
        body: '{{site}}のProプランの支払いが完了しませんでした。{{date}}（UTC）までにお支払い方法を更新してください。更新されない場合、棚にはFreeプランの上限が適用されます。削除されるものはありません。',
        button: 'お支払い方法を更新',
      },
      PLAN_EXPIRED: {
        subject: 'Proプランが終了しました',
        title: 'Proプランが終了しました',
        body: '{{site}}の棚にFreeプランの上限が適用されました：動画1本あたり{{file}}、合計{{shelf}}までです。削除されたものはありません。',
        bodyOverQuota:
          '{{site}}の棚にFreeプランの上限が適用されました：動画1本あたり{{file}}、合計{{shelf}}までです。棚の使用量がこれを超えているため、容量を空けるまで新しいアップロードは停止されます。削除されたものはありません。',
        page: 'ページは再びすべての人に表示されるようになりました。ページの非表示はProの機能です。',
        anonymousLinks:
          '匿名リンクは開けなくなりました。Proを再開すると再び使えるようになります。',
        button: 'プランを開く',
      },
      TRAFFIC_RUNNING_OUT: {
        subject: '転送量が残り少なくなっています',
        title: '転送量が残り少なくなっています',
        body: '{{site}}の今月の転送量{{limit}}のうち{{used}}を使用しました。使い切ると、{{date}}（UTC）まで公開動画とリンクをほかの人が開けなくなります。',
        button: 'プランを開く',
      },
      TRAFFIC_USED_UP: {
        subject: '今月の転送量を使い切りました',
        title: '転送量を使い切りました',
        body: '{{site}}の今月の転送量（{{limit}}）を使い切りました。{{date}}（UTC）まで、公開動画とリンクはほかの人が開けず、ほかの人の動画も視聴できません。自分の動画はこれまでどおり再生できます。',
        button: 'プランを開く',
      },
    },
    supportTopics: {
      QUESTION: '質問',
      BUG: '不具合の報告',
      ACCOUNT: 'アカウント',
      IDEA: 'アイデア',
    },
    takedownRules: {
      SPAM: 'スパムまたは広告',
      ILLEGAL: '違法なコンテンツ',
      COPYRIGHT: '著作権の侵害',
      ABUSE: '侮辱や嫌がらせ',
      UNMARKED_ADULT: 'センシティブのマークがないセンシティブな内容',
      OTHER: 'ルール違反',
    },
    footer:
      'このメールは、このアドレスで{{site}}のアカウントが作成されたためお送りしています。',
    verify: {
      subject: '{{site}}のメールアドレスを確認してください',
      title: '{{site}}へようこそ、{{name}}さん！',
      body: 'メールアドレスを確認すると、アップロード、動画のリクエスト、友達、メッセージが使えるようになります。',
      button: 'メールアドレスを確認',
      expires: 'このリンクの有効期限は24時間です。',
    },
    reset: {
      subject: '{{site}}のパスワードの再設定',
      title: 'パスワードの再設定',
      body: '{{name}}さん、{{site}}アカウントのパスワードを再設定する申請がありました。',
      button: '新しいパスワードを設定',
      expires:
        'このリンクの有効期限は1時間です。心当たりがない場合は、このメールを無視してください。',
    },
    guestDeal: {
      button: '取引を開く',
      footer:
        'このメールは、{{site}}の取引ページでこのアドレスが入力されたためお送りしています。アカウントは作成されていません。',
      saved: {
        subject: '{{name}}さんとの取引',
        title: 'このメールは保存しておいてください',
        body: 'このボタンから、どの端末でも{{name}}さんとの取引に戻れます。{{name}}さんから返事があれば、このアドレスにお知らせします。',
      },
      offer: {
        subject: '{{name}}さんが提案に返事をしました',
        title: '新しい提案',
        body: '{{name}}さんが別の交換を提案しました。受け入れるか、別の提案で返すか、断ってください。取引はさらに3日間有効です。',
      },
      accepted: {
        subject: '{{name}}さんとの交換が成立しました',
        title: '交換が成立しました',
        body: '受け取った動画は、取引ページで7日間視聴・ダウンロードできます。ずっと残しておくには、そのページでログインするか、アカウントを作成してください。',
      },
      shared: {
        subject: '{{name}}さんが動画を共有しました',
        title: '動画が共有されました',
        body: '{{name}}さんは、あなたの動画を受け取らずに動画を渡してくれました。あなたの動画はサーバーから削除されています。受け取った動画は取引ページで7日間視聴・ダウンロードできます。',
      },
      declined: {
        subject: '{{name}}さんが交換を断りました',
        title: '交換は断られました',
        body: '取引は終了しました。あなたの動画はすぐにサーバーから削除され、誰の手にも渡っていません。',
      },
      closed: {
        subject: '{{name}}さんとの取引は終了しました',
        title: '取引は終了しました',
        body: '取引を続けられなくなりました（動画がなくなったか、アカウントが閉鎖されました）。あなたの動画はすぐにサーバーから削除され、誰の手にも渡っていません。',
      },
      expired: {
        subject: '{{name}}さんとの取引は期限切れになりました',
        title: '取引は期限切れになりました',
        body: '3日間どちらからも動きがなかったため、取引は終了しました。あなたの動画はすぐにサーバーから削除され、誰の手にも渡っていません。',
      },
    },
    twoFactor: {
      button: 'セキュリティ設定を開く',
      notYou:
        '心当たりがない場合は、すぐにパスワードを変更して、私たちにご連絡ください。',
      on: {
        subject: '2段階認証がオンになりました',
        title: '2段階認証がオンになりました',
        body: '{{name}}さん、{{site}}アカウントにパスワードでログインするとき、2段階目の認証も求められるようになりました。ほかの端末はログアウトされました。',
      },
      off: {
        subject: '2段階認証がオフになりました',
        title: '2段階認証がオフになりました',
        body: '{{name}}さん、{{site}}アカウントへのログインで、2段階目の認証が求められなくなりました。',
      },
      reset: {
        subject: '2段階認証がリセットされました',
        title: '2段階認証がリセットされました',
        body: '{{name}}さん、ご依頼により、{{site}}の管理者があなたのアカウントの2段階認証をオフにしました。セキュリティ設定から再びオンにできます。',
      },
      recoveryUsed: {
        subject: 'リカバリーコードが使用されました',
        title: 'リカバリーコードが使用されました',
        body: '{{name}}さん、{{site}}アカウントのリカバリーコードがたった今使用されました。残りのコード：{{left}}個。',
      },
    },
    links: {
      footer:
        'このメールは、@{{username}}さんが{{site}}でこのアドレス宛てに動画を送ったためお送りしています。',
      invite: {
        subject: '@{{username}}さんから動画が届いています',
        title: '{{name}}さんから動画が届いています',
        body_other:
          '@{{username}}さんが{{site}}で動画を送りました：「{{title}}」（{{count}}本）。',
        how: 'リンクの期限が切れる前に視聴・ダウンロードしてください。リンクは{{date}}（UTC）まで有効です。開くにはコードを送信してください。コードはこのアドレスに届きます。',
        button: '動画を開く',
      },
      code: {
        subject: '動画を開くためのコード：{{code}}',
        title: 'あなたのコード：{{code}}',
        body: '@{{username}}さんの期限付きリンクのページで入力してください。',
        expires:
          'コードの有効期限は15分です。心当たりがない場合は、このメールを無視してください。',
      },
    },
  },
} as const;
