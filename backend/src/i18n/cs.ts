export const cs = {
  errors: {
    internal: 'Na naší straně se něco pokazilo. Zkuste to prosím později.',
    generic: 'Akci se nepodařilo dokončit.',
    badRequest: 'Neplatný požadavek.',
    validation: 'Některá pole nejsou vyplněná správně.',
    notFound: 'Nenalezeno.',
    conflict:
      'Akce je v rozporu s aktuálním stavem. Obnovte stránku a zkuste to znovu.',
    payloadTooLarge: 'Požadavek je příliš velký.',
    tooManyRequests: 'Příliš mnoho požadavků. Zpomalte prosím.',
    unauthorized: 'K tomu se musíte přihlásit.',
    forbidden: 'K tomu nemáte oprávnění.',
    auth: {
      captchaRequired: 'Potvrďte prosím, že nejste robot.',
      captchaFailed: 'Ověření neprošlo. Zkuste to prosím znovu.',
      captchaUnavailable:
        'Ověření teď není k dispozici. Zkuste to prosím později.',
      invalidCredentials: 'Nesprávný e-mail nebo heslo.',
      registrationClosed:
        'Registrace jsou tu uzavřené. O účet požádejte toho, kdo tento web spravuje.',
      emailTaken: 'Účet s tímto e-mailem už existuje.',
      usernameTaken: 'Toto uživatelské jméno je už obsazené.',
      usernameInvalid:
        'Uživatelské jméno má 3–30 znaků: malá písmena, číslice a podtržítka.',
      usernameReserved: 'Toto uživatelské jméno je rezervované.',
      usernameChangeTooSoon_one:
        'Uživatelské jméno můžete znovu změnit za {{count}} den.',
      usernameChangeTooSoon_few:
        'Uživatelské jméno můžete znovu změnit za {{count}} dny.',
      usernameChangeTooSoon_many:
        'Uživatelské jméno můžete znovu změnit za {{count}} dne.',
      usernameChangeTooSoon_other:
        'Uživatelské jméno můžete znovu změnit za {{count}} dní.',
      passwordWeak:
        'Heslo musí mít alespoň 8 znaků a obsahovat písmeno a číslici.',
      tokenInvalid: 'Tento odkaz je neplatný nebo už byl použit.',
      tokenExpired: 'Platnost tohoto odkazu vypršela. Nechte si poslat nový.',
      emailNotVerified: 'Nejdřív prosím potvrďte svou e-mailovou adresu.',
      emailAlreadyVerified: 'Váš e-mail už je potvrzený.',
      accountBanned: 'Tento účet byl pozastaven.',
      sessionExpired: 'Vaše relace vypršela. Přihlaste se prosím znovu.',
      tooManyAttempts_one:
        'Příliš mnoho pokusů o přihlášení. Zkuste to znovu za {{count}} minutu.',
      tooManyAttempts_few:
        'Příliš mnoho pokusů o přihlášení. Zkuste to znovu za {{count}} minuty.',
      tooManyAttempts_many:
        'Příliš mnoho pokusů o přihlášení. Zkuste to znovu za {{count}} minuty.',
      tooManyAttempts_other:
        'Příliš mnoho pokusů o přihlášení. Zkuste to znovu za {{count}} minut.',
      googleNotConfigured: 'Přihlášení přes Google není k dispozici.',
      googleFailed:
        'Přihlášení přes Google se nezdařilo. Zkuste to prosím znovu.',
      googleSignupExpired:
        'Platnost registrace vypršela. Začněte prosím znovu.',
      wrongPassword: 'Současné heslo není správné.',
      csrf: 'Požadavek byl z bezpečnostních důvodů zablokován. Obnovte stránku a zkuste to znovu.',
      twoFactorLogin: 'Zadejte kód z ověřovací aplikace.',
      adminGoogle:
        'Administrátoři se přihlašují heslem a druhým krokem, ne přes Google.',
      googleLinkTwoFactor:
        'Tento e-mail patří k účtu s dvoufázovým přihlášením. Přihlaste se jeho heslem.',
    },
    twoFactor: {
      required:
        'Administrace vyžaduje dvoufázové přihlášení: zapněte ho v Nastavení → Zabezpečení.',
      confirm: 'Nejdřív druhým krokem potvrďte, že jste to vy.',
      invalidCode: 'Tento kód nesedí. Zkontrolujte ho a zkuste to znovu.',
      expired: 'Přihlášení trvalo příliš dlouho. Zadejte heslo znovu.',
      setupExpired: 'Nastavení trvalo příliš dlouho. Začněte prosím znovu.',
      needsPassword:
        'Dvoufázové přihlášení chrání heslo. Nejdřív si heslo nastavte.',
      admin: 'Administrátor se bez druhého kroku přihlásit nemůže.',
      appExists: 'Ověřovací aplikace už je nastavená.',
      passkeyInvalid: 'Přístupový klíč neodpověděl. Zkuste to prosím znovu.',
      passkeyLimit: 'Už máte 10 přístupových klíčů.',
      passkeyNotFound: 'Tento přístupový klíč už neexistuje.',
      noPasskey: 'Tento účet nemá žádný přístupový klíč.',
      off: 'Dvoufázové přihlášení je vypnuté.',
    },
    users: {
      notFound: 'Tento uživatel neexistuje.',
      pageHidingNotAllowed: 'Skrytí stránky je součástí Pro.',
      invalidImage:
        'Tento soubor není podporovaný obrázek (JPEG, PNG, WebP nebo GIF).',
    },
    exchange: {
      notFound: 'Tato žádost neexistuje.',
      notAllowed: 'S touto žádostí to udělat nemůžete.',
      offerChanged:
        'Nabídka se mezitím změnila. Projděte si vyjednávání a zkuste to znovu.',
      videoBeingEdited:
        'Autor právě upravuje jedno z videí této výměny. Zkuste to znovu, až bude hotové.',
      nothingToRequest: 'O žádné z vybraných videí nelze požádat.',
      hintTooEarly: 'Nápovědu půjde skrýt až po několika dalších zobrazeních.',
      selfRequest: 'O vlastní videa žádat nemůžete.',
      invalidOffer:
        'Nabídka potřebuje na každé straně alespoň jedno video a všechna musí mít jejich vlastníci k dispozici.',
      blocked: 'Tomuto uživateli nemůžete posílat žádosti.',
      alreadyBlocked: 'Tento uživatel už je zablokovaný.',
      selfBlock: 'Sami sebe zablokovat nemůžete.',
    },
    social: {
      selfFollow: 'Sami sebe sledovat nemůžete.',
      followNotAllowed: 'Tohoto uživatele si do přátel přidat nemůžete.',
    },
    editor: {
      invalid: 'Tuto úpravu nelze uložit: zkontrolujte její časy a oblasti.',
      nothing: 'Nic se nezměnilo.',
      inProgress:
        'Toto video se už upravuje. Počkejte, až úprava skončí, nebo ji zrušte.',
      notReady: 'Video půjde upravit, až bude zpracované.',
      proOnly: 'Editor videa je součástí Pro.',
      copyOwnOnly: 'Jako kopii lze uložit jen vlastní videa.',
    },
    invites: {
      notFound: 'Tento odkaz s pozvánkou neexistuje.',
      expired: 'Platnost této pozvánky vypršela. Požádejte o nový odkaz.',
      usedUp: 'Tato pozvánka už je vyčerpaná. Požádejte o nový odkaz.',
      own: 'Tohle je vaše vlastní pozvánka: pošlete ji někomu.',
    },
    deals: {
      notFound:
        'Tento obchod neexistuje (nebo nebyl zahájen v tomto prohlížeči).',
      closed: 'Tento obchod už skončil.',
      linkNotFound: 'Tento odkaz na výměnu už nefunguje.',
      linkVideos:
        'Pro odkaz na výměnu vyberte vlastní hotová videa (nejvýš 50).',
      guestsOff: 'Tento člověk přijímá výměny jen od registrovaných uživatelů.',
      uploadsMax: 'Počet vašich videí v jednom obchodu je omezen na {{max}}.',
      videoInOffer:
        'Toto video je v nabídce, o které se právě jedná: nejdřív nabídku změňte.',
      nothingOffered: 'Nahrajte alespoň jedno své video, které nabídnete.',
      tooMany:
        'Rozjednaných obchodů máte: {{max}}. Než začnete další, některý dokončete.',
    },
    links: {
      notFound: 'Tento odkaz neexistuje nebo už nefunguje.',
      passwordPro: 'Heslo u odkazu je součástí Pro.',
      tooMany: 'Platných odkazů máte: {{max}}. Nejdřív některé zrušte.',
      videoNotAllowed:
        'Odkazem lze poslat jen videa, která jste nahráli nebo dostali, a to hotová a nesmazaná.',
      locked: 'Nejdřív zadejte heslo nebo kód z e-mailu.',
      wrongPassword: 'Nesprávné heslo.',
      wrongCode: 'Kód je nesprávný nebo vypršel. Nechte si poslat nový.',
      codeTooSoon: 'Kód jsme právě poslali. Další si můžete vyžádat za minutu.',
      codeLimit:
        'K tomuto odkazu bylo vyžádáno příliš mnoho kódů. Zkuste to znovu za hodinu.',
      noEmail: 'Tento odkaz není určený pro konkrétní e-mail.',
      blocked: 'Videa od tohoto člověka si přidat nemůžete.',
    },
    anonymousLinks: {
      pro: 'Anonymní odkazy jsou součástí Pro.',
      tooMany:
        'Máte už {{max}} anonymních odkazů. Nejdřív jeden z nich smažte.',
      notFound: 'Tento odkaz neexistuje nebo už nefunguje.',
      nameNeeded:
        'Vaše jméno prozrazuje uživatelské jméno. Zvolte pro tento odkaz jméno.',
      nameNamesNickname:
        'Toto jméno prozrazuje vaše uživatelské jméno. Zvolte jiné.',
    },
    appTokens: {
      scope: 'Rozšíření prohlížeče tohle udělat nemůže.',
      invalid: 'Rozšíření už není připojené. Připojte ho znovu.',
      code: 'Kód pro připojení vypršel nebo je nesprávný. Zkuste rozšíření připojit znovu.',
      redirect: 'Tohle nevypadá jako rozšíření tapeshelf.',
      notFound: 'Toto připojení neexistuje.',
    },
    chat: {
      notFriends: 'Psát můžete jen přátelům: musíte se přidat navzájem.',
      unavailable: 'Tomuto uživateli nelze psát.',
      emptyMessage: 'Napište něco nebo přiložte video.',
      videoNotAttachable:
        'Toto video nelze přiložit. Vyberte hotové video, které je vidět na vaší stránce.',
      selfMessage: 'Sami sobě psát nemůžete.',
      notFound: 'Tato konverzace neexistuje.',
    },
    reports: {
      self: 'Nemůžete nahlásit sami sebe ani svá videa.',
    },
    support: {
      notFound: 'Tento požadavek se nenašel.',
      tooMany:
        'Otevřených požadavků máte: {{count}}. Počkejte na odpověď u některého z nich, nebo jeden označte jako vyřešený.',
      closed:
        'Tento požadavek je uzavřený. Pokud problém trvá, založte prosím nový.',
      empty: 'Napište zprávu nebo přidejte obrázek.',
      tooManyFiles: 'Počet obrázků v jedné zprávě je omezen na {{count}}.',
      badImage:
        'Tento obrázek se nepodařilo načíst. Povolené jsou PNG, JPG nebo WebP do 10 MB.',
      notYourVideo: 'Přiložit můžete jen video, které jste sami nahráli.',
      notRated: 'Požadavek lze ohodnotit, až bude vyřešený nebo uzavřený.',
    },
    site: {
      legalNotFound: 'Provozovatel tohoto webu tento dokument nezveřejnil.',
    },
    account: {
      confirmMismatch: 'Pro potvrzení napište své uživatelské jméno přesně.',
      deleted: 'Tento účet byl smazán.',
    },
    billing: {
      disabled: 'Na tomto serveru nejsou platby k dispozici.',
      unavailable: 'Platby teď nejsou k dispozici. Zkuste to prosím později.',
      signature: 'Podpis nesouhlasí.',
      noSubscription: 'Nemáte žádné předplatné.',
    },
    downloads: {
      limitReached:
        'Všech {{limit}} stažení na tento měsíc jste už vyčerpali. Další bude k dispozici {{date}}.',
      busy: 'Ještě probíhá jiné stahování. Počkejte, až skončí, a zkuste to znovu.',
      ticketInvalid:
        'Platnost odkazu ke stažení vypršela. Spusťte stahování znovu ze stránky videa.',
      range: 'Tato část souboru neexistuje.',
    },
    admin: {
      selfAction: 'Tohle se svým vlastním účtem udělat nemůžete.',
      adminTarget: 'Nejdřív odeberte roli administrátora.',
      notInTrash: 'Toto video není v koši.',
      purged: 'Toto video už bylo z úložiště vymazáno.',
      authorDeleted: 'Autor smazal svůj účet, takže video nelze obnovit.',
      alreadyProcessed: 'Toto video už je zpracované.',
      tierUntilPast: 'Datum konce musí být v budoucnosti.',
      tiersDisabled: 'Tento server nemá tarify.',
      reportClosed: 'Toto nahlášení už bylo vyřízeno.',
      reportAction: 'Tato akce k nahlášení nepasuje.',
      noEmail: 'Tento účet nemá e-mailovou adresu.',
      viewAsReadOnly: 'Prohlížíte web jako jiný uživatel: nic nelze měnit.',
    },
    categories: {
      exists: 'Kategorii s tímto názvem už máte.',
      tooMany: 'Kategorií můžete mít nejvýš {{max}}.',
    },
    uploads: {
      fileTooLarge: 'Soubor je větší než limit {{max}}.',
      quotaExceeded: 'Nedostatek místa: využito už je {{used}} z {{quota}}.',
      notFound: 'Toto nahrávání neexistuje.',
      notActive: 'Toto nahrávání už skončilo nebo bylo zrušeno.',
      expired: 'Toto nahrávání vypršelo. Spusťte ho prosím znovu.',
      incomplete:
        'Některé části souboru chybí nebo jsou poškozené. Zkuste nahrávání zopakovat.',
      sizeMismatch: 'Nahraný soubor neodpovídá ohlášené velikosti.',
      extensionDailyLimit:
        'Dnes jste přes rozšíření uložili už nejvyšší povolený počet videí ({{limit}}). Počítadlo se vynuluje o půlnoci (UTC).',
    },
    videos: {
      deleteInAdminPanel:
        'Videa jiných lidí mažte v administraci: autor se tak dozví pravidlo i vaši poznámku.',
      notFound: 'Toto video neexistuje.',
      notReady: 'Video se ještě zpracovává.',
      categoryNotFound: 'Tato kategorie neexistuje.',
      stackNotFound: 'Tento stoh neexistuje.',
      stackTooSmall: 'Stoh potřebuje alespoň dvě videa.',
      stackCategories:
        'Videa ve stohu mají jednu společnou kategorii: nejdřív ji vyberte.',
      frameNotFound: 'Tento snímek neexistuje.',
      timestampOutOfRange: 'Tento čas je až za koncem videa.',
      notWatchable: 'K tomuto videu nemáte přístup.',
      playbackTokenInvalid:
        'Platnost odkazu pro přehrávání vypršela. Obnovte prosím stránku.',
      downloadNotAllowed: 'Toto video nelze stáhnout.',
      alreadyInCollection: 'Toto video už ve své sbírce máte.',
      cannotAddToCollection: 'Toto video nelze přidat do vaší sbírky.',
      cannotHide: 'Toto video na vaší polici není.',
      ownVideoRename:
        'Vlastní video přejmenujete v údajích o videu, a to pro všechny.',
    },
  },
  editor: {
    copySuffix: '(upraveno)',
  },
  notifications: {
    failReason: {
      corrupted: 'soubor je poškozený nebo to není video',
      noVideoStream: 'soubor nemá obrazovou stopu',
      zeroDuration: 'video má nulovou délku',
      tooLong: 'videa delší než 12 hodin nejsou podporovaná',
      tooLarge: 'snímky větší než 4096 px nejsou podporované',
      fpsTooHigh: 'snímková frekvence nad 60 fps není podporovaná',
      tooManyStreams: 'soubor má příliš mnoho stop',
      transcodeFailed: 'video se nepodařilo převést',
      blocked:
        'tento soubor byl odstraněn za porušení pravidel a nelze ho nahrát znovu',
      internal: 'Zpracování selhalo. Zkuste soubor nahrát znovu',
    },
  },
  mail: {
    notifications: {
      guest: 'Host',
      anonymous: 'Anonym',
      manage: 'Změnit, jaká oznámení dostáváte: {{url}}',
      andMore_one: ' a {{count}} další',
      andMore_few: ' a {{count}} další',
      andMore_many: ' a {{count}} dalšího',
      andMore_other: ' a {{count}} dalších',
      REQUEST_RECEIVED: {
        subject: '{{name}} žádá o „{{title}}“',
        title: 'Nová žádost o video',
        body_one:
          '{{name}} vás žádá o video „{{title}}“. Můžete ho sdílet zdarma, odmítnout, nebo navrhnout výměnu.',
        body_few:
          '{{name}} vás žádá o {{count}} videa, první z nich je „{{title}}“. Můžete je sdílet zdarma, odmítnout, nebo navrhnout výměnu.',
        body_many:
          '{{name}} vás žádá o {{count}} videa, první z nich je „{{title}}“. Můžete je sdílet zdarma, odmítnout, nebo navrhnout výměnu.',
        body_other:
          '{{name}} vás žádá o {{count}} videí, první z nich je „{{title}}“. Můžete je sdílet zdarma, odmítnout, nebo navrhnout výměnu.',
        message: 'Zpráva: „{{message}}“',
        offered_one: 'Na oplátku nabízí {{count}} své video.',
        offered_few: 'Na oplátku nabízí {{count}} svá videa.',
        offered_many: 'Na oplátku nabízí {{count}} svého videa.',
        offered_other: 'Na oplátku nabízí {{count}} svých videí.',
        button: 'Otevřít žádost',
      },
      OFFER_RECEIVED: {
        subject: '{{name}} vám posílá nabídku',
        title: 'Přišla protinabídka',
        body: '{{name}} navrhuje výměnu (kolo {{round}}). Můžete ji přijmout, odmítnout, nebo poslat vlastní nabídku.',
        bodyDeal:
          '{{name}} nabízí „{{gives}}“{{givesMore}} za vaše „{{wants}}“{{wantsMore}}. Nabídku můžete přijmout, odmítnout, nebo poslat vlastní.',
        message: 'Zpráva: „{{message}}“',
        button: 'Otevřít vyjednávání',
      },
      REQUEST_SHARED: {
        subject: '{{name}} s vámi sdílí „{{title}}“',
        title: 'Sdíleno s vámi',
        body_one:
          '{{name}} s vámi zdarma sdílí video „{{title}}“. Už ho máte ve sbírce.',
        body_few:
          '{{name}} s vámi zdarma sdílí {{count}} videa, první z nich je „{{title}}“. Už je máte ve sbírce.',
        body_many:
          '{{name}} s vámi zdarma sdílí {{count}} videa, první z nich je „{{title}}“. Už je máte ve sbírce.',
        body_other:
          '{{name}} s vámi zdarma sdílí {{count}} videí, první z nich je „{{title}}“. Už je máte ve sbírce.',
        button: 'Zobrazit, co jste dostali',
      },
      EXCHANGE_COMPLETED: {
        subject: 'Výměna s {{name}} proběhla',
        title: 'Výměna proběhla',
        body: 'Vaše výměna s {{name}} je hotová. Získaná videa: {{received}}, odevzdaná: {{given}}. Co jste získali, už máte ve sbírce.',
        button: 'Zobrazit, co jste dostali',
      },
      REQUEST_DECLINED: {
        subject: '{{name}} odmítá vaši žádost o „{{title}}“',
        title: 'Žádost odmítnuta',
        body: '{{name}} vaši žádost odmítá. {{comment}}',
        again_one: 'Znovu o video můžete požádat za {{count}} den.',
        again_few: 'Znovu o video můžete požádat za {{count}} dny.',
        again_many: 'Znovu o video můžete požádat za {{count}} dne.',
        again_other: 'Znovu o video můžete požádat za {{count}} dní.',
        button: 'Otevřít žádost',
      },
      REQUEST_CANCELLED: {
        subject: '{{name}} bere zpět žádost o „{{title}}“',
        title: 'Žádost vzata zpět',
        body: '{{name}} bere zpět svou žádost o „{{title}}“.',
        button: 'Otevřít žádost',
      },
      REQUEST_INVALIDATED: {
        subject: 'Žádost o „{{title}}“ se změnila',
        title: 'Systém žádost upravil',
        body: 'Jedno z videí v žádosti o „{{title}}“ už není dostupné, a proto se vyjednávání upravilo.',
        bodyClosed:
          'Žádost o „{{title}}“ byla uzavřena: druhý účet už není dostupný.',
        bodyExpired:
          'Obchod s hostem o „{{title}}“ vypršel: tři dny nikdo neudělal další krok. Videa hosta byla smazána.',
        button: 'Otevřít žádost',
      },
      NEW_FOLLOWER: {
        subject: 'Nový sledující: {{name}}',
        title: 'Nový sledující',
        body: '{{name}} teď sleduje vaši sbírku. Když si tohoto člověka přidáte také, budete přátelé a můžete si psát.',
        button: 'Zobrazit stránku',
      },
      FRIEND_ACCEPTED: {
        subject: 'Vy a {{name}} jste teď přátelé',
        title: 'Nové přátelství',
        body: 'Vy a {{name}} se teď sledujete navzájem. Můžete si posílat zprávy i videa.',
        button: 'Zobrazit stránku',
      },
      FOLLOWED_NEW_VIDEO: {
        subject: 'Nové video od {{name}}: „{{title}}“',
        title: 'Nové video od {{name}}',
        body: 'Na polici uživatele {{name}} je nové video „{{title}}“.',
        bodyPrivate:
          'Na polici uživatele {{name}} je nové soukromé video „{{title}}“. Můžete o něj požádat.',
        button: 'Otevřít video',
      },
      NEW_MESSAGE: {
        subject: 'Nová zpráva od {{name}}',
        title: 'Nová zpráva',
        body: '{{name}}: „{{preview}}“',
        bodyVideo: '{{name}} vám v konverzaci posílá video.',
        button: 'Otevřít konverzaci',
      },
      VIDEO_PROCESSED: {
        subject: 'Video „{{title}}“ je připravené',
        title: 'Vaše video je připravené',
        body: 'Video „{{title}}“ je zpracované a můžete ho přehrát.',
        button: 'Otevřít video',
      },
      VIDEO_FAILED: {
        subject: 'Video „{{title}}“ se nepodařilo zpracovat',
        title: 'Zpracování selhalo',
        body: 'Video „{{title}}“ se nepodařilo zpracovat: {{reason}}. Soubor můžete nahrát znovu.',
        button: 'Otevřít moji stránku',
      },
      VIDEO_REMOVED: {
        subject: 'Autor smazal video „{{title}}“',
        title: 'Video zmizelo z vaší sbírky',
        body: 'Video „{{title}}“, které bylo ve vaší sbírce, smazal jeho autor {{author}}. Už není dostupné nikomu.',
        button: 'Otevřít oznámení',
      },
      REPORT_RESOLVED: {
        subject: 'Vaše nahlášení jsme posoudili',
        title: 'Nahlášení posouzeno',
        bodyVideo:
          'Posoudili jsme vaše nahlášení videa „{{title}}“ a zakročili jsme. Děkujeme, že pomáháte udržet {{site}} bezpečný.',
        bodyUser:
          'Posoudili jsme vaše nahlášení uživatele {{title}} a zakročili jsme. Děkujeme, že pomáháte udržet {{site}} bezpečný.',
        bodyVideoNone:
          'Posoudili jsme vaše nahlášení videa „{{title}}“ a porušení pravidel jsme nenašli.',
        bodyUserNone:
          'Posoudili jsme vaše nahlášení uživatele {{title}} a porušení pravidel jsme nenašli.',
        button: 'Otevřít oznámení',
      },
      ADMIN_NOTICE: {
        subject: 'Zpráva od {{site}}',
        title: 'Zpráva od týmu {{site}}',
        body: '{{message}}',
        button: 'Otevřít oznámení',
      },
      VIDEO_EDITED: {
        subject: 'Moderátor upravil vaše video „{{title}}“',
        title: 'Video upraveno',
        body: 'Moderátor {{site}} upravil vaše video „{{title}}“ (třeba v něm rozmazal nějakou část). Odkaz i všechno ostatní zůstává stejné.',
        button: 'Otevřít video',
      },
      VIDEO_EDIT_FAILED: {
        subject: 'Úprava videa „{{title}}“ se nepovedla',
        title: 'Úprava nebyla uložena',
        body: 'Úpravu vašeho videa „{{title}}“ se nepodařilo provést. Video zůstává, jak bylo; editor si vaše změny pamatuje, takže to můžete zkusit znovu.',
        button: 'Otevřít editor',
      },
      SUPPORT_REPLY: {
        subject: 'Podpora odpověděla na váš požadavek #{{number}}',
        title: 'Podpora odpověděla',
        body: '#{{number}} „{{subject}}“: {{preview}}',
        bodyResolved:
          'Podpora označila váš požadavek #{{number}} „{{subject}}“ jako vyřešený. Pokud problém trvá, založte nový požadavek.',
        bodyResolvedWith:
          'Podpora odpověděla na váš požadavek #{{number}} „{{subject}}“ a označila ho jako vyřešený: {{preview}}',
        button: 'Otevřít požadavek',
      },
      SUPPORT_TICKET: {
        subject: 'Podpora #{{number}}: {{subject}}',
        title: 'Požadavek na podporu #{{number}}',
        body: '@{{name}} žádá o pomoc ({{topic}}): „{{subject}}“. {{preview}}',
        bodyReply:
          'Nová zpráva od @{{name}} v #{{number}} „{{subject}}“: {{preview}}',
        button: 'Otevřít v administraci',
      },
      LINK_OPENED: {
        subject: 'Někdo otevřel váš dočasný odkaz',
        title: 'Odkaz otevřen',
        body_one:
          'Váš dočasný odkaz s videem „{{title}}“ otevřel uživatel @{{name}}.',
        body_few:
          'Váš dočasný odkaz otevřel uživatel @{{name}}. Jsou v něm {{count}} videa, první je „{{title}}“.',
        body_many:
          'Váš dočasný odkaz otevřel uživatel @{{name}}. Je v něm {{count}} videa, první je „{{title}}“.',
        body_other:
          'Váš dočasný odkaz otevřel uživatel @{{name}}. Je v něm {{count}} videí, první je „{{title}}“.',
        bodyGuest_one: 'Někdo otevřel váš dočasný odkaz s videem „{{title}}“.',
        bodyGuest_few:
          'Někdo otevřel váš dočasný odkaz. Jsou v něm {{count}} videa, první je „{{title}}“.',
        bodyGuest_many:
          'Někdo otevřel váš dočasný odkaz. Je v něm {{count}} videa, první je „{{title}}“.',
        bodyGuest_other:
          'Někdo otevřel váš dočasný odkaz. Je v něm {{count}} videí, první je „{{title}}“.',
        button: 'Otevřít „Moje odkazy“',
      },
      LINK_SAVED: {
        subject: 'Uživatel @{{name}} si uložil videa z vašeho odkazu',
        title: 'Uloženo z vašeho odkazu',
        body_one:
          'Uživatel @{{name}} si z vašeho dočasného odkazu dal na svou polici video „{{title}}“.',
        body_few:
          'Uživatel @{{name}} si z vašeho dočasného odkazu dal na svou polici {{count}} videa, první z nich je „{{title}}“.',
        body_many:
          'Uživatel @{{name}} si z vašeho dočasného odkazu dal na svou polici {{count}} videa, první z nich je „{{title}}“.',
        body_other:
          'Uživatel @{{name}} si z vašeho dočasného odkazu dal na svou polici {{count}} videí, první z nich je „{{title}}“.',
        button: 'Otevřít „Moje odkazy“',
      },
      VIDEO_TAKEN_DOWN: {
        subject: 'Vaše video „{{title}}“ bylo odstraněno',
        title: 'Video odstraněno',
        body: 'Vaše video „{{title}}“ jsme z {{site}} odstranili: {{rule}}. Už není dostupné nikomu.',
        message: 'Poznámka moderátora: {{message}}',
        appeal: 'Pokud si myslíte, že jde o omyl, napište na {{email}}.',
        button: 'Otevřít oznámení',
      },
      PLAN_EXPIRING: {
        subject: 'Váš tarif Pro končí {{date}}',
        title: 'Pro brzy končí',
        body: 'Váš tarif Pro na {{site}} končí {{date}} (UTC). Potom bude mít vaše police limity Free; nic se nesmaže.',
        page: 'Vaše stránka je teď skrytá; až Pro skončí, uvidí ji zase všichni.',
        anonymousLinks:
          'Až Pro skončí, vaše anonymní odkazy se přestanou otevírat; s Pro zase začnou fungovat.',
        button: 'Otevřít tarif',
      },
      PLAN_PAYMENT_FAILED: {
        subject: 'Váš tarif Pro se nepodařilo prodloužit',
        title: 'Platba se nezdařila',
        body: 'Platba za váš tarif Pro na {{site}} neprošla. Aktualizujte platební metodu do {{date}} (UTC), jinak bude mít vaše police limity Free; nic se nesmaže.',
        button: 'Aktualizovat platební metodu',
      },
      PLAN_EXPIRED: {
        subject: 'Váš tarif Pro skončil',
        title: 'Tarif Pro skončil',
        body: 'Vaše police na {{site}} má teď limity Free: {{file}} na video a {{shelf}} celkem. Nic nebylo smazáno.',
        bodyOverQuota:
          'Vaše police na {{site}} má teď limity Free: {{file}} na video a {{shelf}} celkem. Na polici máte víc, takže nové nahrávání je pozastavené, dokud neuvolníte místo. Nic nebylo smazáno.',
        page: 'Vaši stránku teď zase vidí všichni: skrytí stránky je součástí Pro.',
        anonymousLinks:
          'Vaše anonymní odkazy se už neotevírají; s Pro zase začnou fungovat.',
        button: 'Otevřít tarif',
      },
    },
    supportTopics: {
      QUESTION: 'dotaz',
      BUG: 'hlášení chyby',
      ACCOUNT: 'účet',
      IDEA: 'nápad',
    },
    takedownRules: {
      SPAM: 'spam nebo reklama',
      ILLEGAL: 'nelegální obsah',
      COPYRIGHT: 'porušení autorských práv',
      ABUSE: 'urážky nebo obtěžování',
      UNMARKED_ADULT: 'citlivý obsah bez označení',
      OTHER: 'porušení pravidel',
    },
    footer:
      'Tento e-mail jste dostali, protože na {{site}} byl s touto adresou založen účet.',
    verify: {
      subject: 'Potvrďte svůj e-mail pro {{site}}',
      title: 'Vítejte na {{site}}, {{name}}!',
      body: 'Potvrďte svou e-mailovou adresu, abyste mohli nahrávat videa, žádat o videa, přidávat si přátele a psát zprávy.',
      button: 'Potvrdit e-mail',
      expires: 'Odkaz platí 24 hodin.',
    },
    reset: {
      subject: 'Obnovení hesla k {{site}}',
      title: 'Obnovení hesla',
      body: 'Dobrý den, {{name}}, někdo (snad vy) požádal o obnovení hesla k vašemu účtu na {{site}}.',
      button: 'Nastavit nové heslo',
      expires:
        'Odkaz platí 1 hodinu. Pokud jste o to nežádali, můžete tento e-mail ignorovat.',
    },
    guestDeal: {
      button: 'Otevřít obchod',
      footer:
        'Tento e-mail jste dostali, protože jste tuto adresu zadali na stránce obchodu na {{site}}. Žádný účet nebyl vytvořen.',
      saved: {
        subject: 'Váš obchod s {{name}}',
        title: 'Tento e-mail si nechte',
        body: 'Tímto tlačítkem se k obchodu s {{name}} vrátíte z jakéhokoli zařízení. Až {{name}} odpoví, napíšeme vám sem.',
      },
      offer: {
        subject: '{{name}} odpovídá na vaši nabídku',
        title: 'Nová nabídka',
        body: '{{name}} navrhuje jinou výměnu. Můžete ji přijmout, odpovědět vlastní nabídkou, nebo odmítnout. Obchod počká další tři dny.',
      },
      accepted: {
        subject: 'Výměna s {{name}} proběhla',
        title: 'Výměna proběhla',
        body: 'Získaná videa můžete 7 dní sledovat a stahovat na stránce obchodu. Když se tam přihlásíte nebo si vytvoříte účet, zůstanou vám natrvalo.',
      },
      shared: {
        subject: '{{name}} s vámi sdílí videa',
        title: 'Sdíleno s vámi',
        body: '{{name}} vám dává videa a vaše si nebere; vaše videa jsme smazali z našich serverů. Získaná videa můžete 7 dní sledovat a stahovat na stránce obchodu.',
      },
      declined: {
        subject: '{{name}} výměnu odmítá',
        title: 'Výměna byla odmítnuta',
        body: 'Obchod skončil. Vaše videa jsme hned smazali z našich serverů; nikdo je nedostal.',
      },
      closed: {
        subject: 'Obchod s {{name}} je uzavřený',
        title: 'Obchod je uzavřený',
        body: 'Obchod nemohl pokračovat (některé video už neexistuje nebo byl účet zrušen). Vaše videa jsme hned smazali z našich serverů; nikdo je nedostal.',
      },
      expired: {
        subject: 'Obchod s {{name}} vypršel',
        title: 'Obchod vypršel',
        body: 'Tři dny nikdo neudělal další krok, a tak obchod skončil. Vaše videa jsme hned smazali z našich serverů; nikdo je nedostal.',
      },
    },
    twoFactor: {
      button: 'Otevřít nastavení zabezpečení',
      notYou: 'Pokud jste to nebyli vy, hned si změňte heslo a napište nám.',
      on: {
        subject: 'Dvoufázové přihlášení je zapnuté',
        title: 'Dvoufázové přihlášení je zapnuté',
        body: 'Dobrý den, {{name}}, přihlášení heslem k vašemu účtu na {{site}} teď vyžaduje i druhý krok. Ostatní zařízení byla odhlášena.',
      },
      off: {
        subject: 'Dvoufázové přihlášení je vypnuté',
        title: 'Dvoufázové přihlášení je vypnuté',
        body: 'Dobrý den, {{name}}, přihlášení k vašemu účtu na {{site}} už druhý krok nevyžaduje.',
      },
      reset: {
        subject: 'Dvoufázové přihlášení bylo zrušeno',
        title: 'Dvoufázové přihlášení bylo zrušeno',
        body: 'Dobrý den, {{name}}, administrátor {{site}} na vaši žádost vypnul dvoufázové přihlášení k vašemu účtu. Znovu ho můžete zapnout v nastavení zabezpečení.',
      },
      recoveryUsed: {
        subject: 'Byl použit záložní kód',
        title: 'Byl použit záložní kód',
        body: 'Dobrý den, {{name}}, právě byl použit záložní kód k vašemu účtu na {{site}}. Zbývá kódů: {{left}}.',
      },
    },
    links: {
      footer:
        'Tento e-mail jste dostali, protože uživatel @{{username}} na {{site}} poslal videa na tuto adresu.',
      invite: {
        subject: '@{{username}} s vámi sdílí videa',
        title: '{{name}} s vámi sdílí videa',
        body_one: '@{{username}} vám na {{site}} posílá video „{{title}}“.',
        body_few:
          '@{{username}} vám na {{site}} posílá {{count}} videa, první z nich je „{{title}}“.',
        body_many:
          '@{{username}} vám na {{site}} posílá {{count}} videa, první z nich je „{{title}}“.',
        body_other:
          '@{{username}} vám na {{site}} posílá {{count}} videí, první z nich je „{{title}}“.',
        how: 'Podívejte se na ně a stáhněte si je, dokud odkaz platí: funguje do {{date}} (UTC). K otevření si vyžádejte kód, přijde na tuto adresu.',
        button: 'Otevřít videa',
      },
      code: {
        subject: 'Kód {{code}} k otevření videí',
        title: 'Váš kód: {{code}}',
        body: 'Zadejte ho na stránce dočasného odkazu od @{{username}}.',
        expires:
          'Kód platí 15 minut. Pokud jste o něj nežádali, tento e-mail ignorujte.',
      },
    },
  },
};
