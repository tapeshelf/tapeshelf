export const sv = {
  errors: {
    internal: 'Något gick fel hos oss. Försök igen senare.',
    generic: 'Begäran kunde inte genomföras.',
    badRequest: 'Begäran är ogiltig.',
    validation: 'Några fält är ogiltiga.',
    notFound: 'Hittades inte.',
    conflict:
      'Det här krockar med det aktuella läget. Ladda om och försök igen.',
    payloadTooLarge: 'Begäran är för stor.',
    tooManyRequests: 'För många förfrågningar. Ta det lite lugnare.',
    unauthorized: 'Du måste logga in för att göra det.',
    forbidden: 'Du har inte behörighet att göra det.',
    auth: {
      captchaRequired: 'Bekräfta att du är en människa.',
      captchaFailed: 'Kontrollen gick inte igenom. Försök igen.',
      captchaUnavailable:
        'Kontrollen är inte tillgänglig just nu. Försök igen senare.',
      invalidCredentials: 'Fel e-postadress eller lösenord.',
      registrationClosed:
        'Registreringen är stängd här. Fråga den som driver webbplatsen om ett konto.',
      emailTaken: 'Det finns redan ett konto med den här e-postadressen.',
      usernameTaken: 'Användarnamnet är redan upptaget.',
      usernameInvalid:
        'Ett användarnamn har 3–30 tecken: små bokstäver, siffror och understreck.',
      usernameReserved: 'Användarnamnet är reserverat.',
      usernameChangeTooSoon_one:
        'Du kan byta användarnamn igen om {{count}} dag.',
      usernameChangeTooSoon_other:
        'Du kan byta användarnamn igen om {{count}} dagar.',
      passwordWeak:
        'Lösenordet måste ha minst 8 tecken och innehålla en bokstav och en siffra.',
      tokenInvalid: 'Länken är ogiltig eller har redan använts.',
      tokenExpired: 'Länken har gått ut. Begär en ny.',
      emailNotVerified: 'Bekräfta din e-postadress först.',
      emailAlreadyVerified: 'Din e-postadress är redan bekräftad.',
      accountBanned: 'Det här kontot är avstängt.',
      sessionExpired: 'Din session har gått ut. Logga in igen.',
      tooManyAttempts_one:
        'För många inloggningsförsök. Försök igen om {{count}} minut.',
      tooManyAttempts_other:
        'För många inloggningsförsök. Försök igen om {{count}} minuter.',
      googleNotConfigured: 'Inloggning med Google är inte tillgänglig.',
      googleFailed: 'Inloggningen med Google misslyckades. Försök igen.',
      googleSignupExpired: 'Registreringen tog för lång tid. Börja om.',
      wrongPassword: 'Det nuvarande lösenordet är fel.',
      csrf: 'Begäran stoppades av säkerhetsskäl. Ladda om sidan och försök igen.',
      twoFactorLogin: 'Ange koden från din autentiseringsapp.',
      adminGoogle:
        'Administratörer loggar in med lösenord och andra steget, inte med Google.',
      googleLinkTwoFactor:
        'Den här adressen hör till ett konto med tvåstegsinloggning. Logga in med kontots lösenord.',
    },
    twoFactor: {
      required:
        'Adminpanelen kräver tvåstegsinloggning: slå på den under Inställningar → Säkerhet.',
      confirm: 'Bekräfta först att det är du med andra steget.',
      invalidCode: 'Koden stämmer inte. Kontrollera den och försök igen.',
      expired: 'Inloggningen tog för lång tid. Ange ditt lösenord igen.',
      setupExpired: 'Konfigurationen tog för lång tid. Börja om.',
      needsPassword:
        'Tvåstegsinloggning skyddar ett lösenord. Välj ett lösenord först.',
      admin: 'En administratör kan inte logga in utan andra steget.',
      appExists: 'En autentiseringsapp är redan tillagd.',
      passkeyInvalid: 'Lösennyckeln svarade inte. Försök igen.',
      passkeyLimit: 'Du har redan 10 lösennycklar.',
      passkeyNotFound: 'Lösennyckeln finns inte längre.',
      noPasskey: 'Kontot har ingen lösennyckel.',
      off: 'Tvåstegsinloggning är av.',
    },
    users: {
      notFound: 'Användaren finns inte.',
      pageHidingNotAllowed: 'Att dölja sidan ingår i Pro.',
      invalidImage:
        'Filen är ingen bild som stöds (JPEG, PNG, WebP eller GIF).',
    },
    exchange: {
      notFound: 'Förfrågan finns inte.',
      notAllowed: 'Du kan inte göra det med den här förfrågan.',
      offerChanged:
        'Erbjudandet har ändrats under tiden. Titta igenom konversationen och försök igen.',
      videoBeingEdited:
        'En video i det här bytet redigeras av sin skapare just nu. Försök igen när den är klar.',
      nothingToRequest: 'Ingen av de valda videorna går att be om.',
      hintTooEarly: 'Du kan dölja tipset efter några visningar till.',
      selfRequest: 'Du kan inte be om dina egna videor.',
      invalidOffer:
        'Ett erbjudande behöver minst en video på varje sida, och alla måste vara tillgängliga för sina ägare.',
      blocked: 'Du kan inte skicka förfrågningar till den här användaren.',
      alreadyBlocked: 'Användaren är redan blockerad.',
      selfBlock: 'Du kan inte blockera dig själv.',
    },
    social: {
      selfFollow: 'Du kan inte följa dig själv.',
      followNotAllowed: 'Du kan inte lägga till den här användaren som vän.',
    },
    editor: {
      invalid:
        'Redigeringen kan inte sparas: kontrollera tiderna och områdena.',
      nothing: 'Inget har ändrats.',
      inProgress:
        'Videon redigeras redan. Vänta tills det är klart eller avbryt.',
      notReady: 'Videon kan redigeras när den är bearbetad.',
      proOnly: 'Videoredigeraren ingår i Pro.',
      copyOwnOnly: 'Bara dina egna videor kan sparas som kopia.',
    },
    invites: {
      notFound: 'Den här inbjudningslänken finns inte.',
      expired: 'Inbjudan har gått ut. Be om en ny länk.',
      usedUp: 'Inbjudan har redan använts fullt ut. Be om en ny länk.',
      own: 'Det här är din egen inbjudan: skicka den till någon.',
    },
    deals: {
      notFound:
        'Bytet finns inte (eller så är det inte i den här webbläsaren som det startades).',
      closed: 'Bytet är avslutat.',
      linkNotFound: 'Byteslänken fungerar inte längre.',
      linkVideos: 'Välj dina egna färdiga videor (högst 50) för en byteslänk.',
      guestsOff: 'Den här personen byter bara med registrerade användare.',
      uploadsMax: 'Ett byte rymmer högst {{max}} av dina videor.',
      videoInOffer:
        'Videon ingår i erbjudandet som gäller nu: ändra erbjudandet först.',
      nothingOffered: 'Ladda upp minst en egen video att erbjuda.',
      tooMany:
        'Du har {{max}} pågående byten. Avsluta ett innan du startar ett nytt.',
    },
    links: {
      notFound: 'Länken finns inte eller fungerar inte längre.',
      passwordPro: 'Lösenord på länkar ingår i Pro.',
      tooMany:
        'Du har {{max}} länkar som fortfarande fungerar. Återkalla några först.',
      videoNotAllowed:
        'Bara dina egna uppladdningar och videor du har fått kan skickas via länk, och de måste vara färdiga och inte raderade.',
      locked: 'Ange lösenordet eller koden från mejlet först.',
      wrongPassword: 'Fel lösenord.',
      wrongCode: 'Koden är fel eller har gått ut. Be om en ny.',
      codeTooSoon: 'En kod skickades nyss. Du kan be om en ny om en minut.',
      codeLimit: 'För många koder för den här länken. Försök igen om en timme.',
      noEmail:
        'Den här länken är inte kopplad till någon särskild e-postadress.',
      emailOff:
        'Den här servern skickar inte e-post, så länkar för en person är inte tillgängliga.',
      blocked: 'Du kan inte lägga till videor från den här personen.',
    },
    anonymousLinks: {
      pro: 'Anonyma länkar ingår i Pro.',
      tooMany:
        'Du har redan {{max}} anonyma länkar. Radera någon av dem först.',
      notFound: 'Länken finns inte eller fungerar inte längre.',
      nameNeeded:
        'Ditt namn avslöjar ditt användarnamn. Välj ett namn för den här länken.',
      nameNamesNickname:
        'Det här namnet avslöjar ditt användarnamn. Välj ett annat.',
    },
    appTokens: {
      scope: 'Webbläsartillägget kan inte göra det här.',
      invalid: 'Tillägget är inte anslutet längre. Anslut det igen.',
      code: 'Anslutningskoden har gått ut eller är fel. Försök ansluta igen.',
      redirect: 'Det här ser inte ut som tillägget från tapeshelf.',
      notFound: 'Anslutningen finns inte.',
    },
    chat: {
      notFriends:
        'Du kan bara skriva till vänner: ni behöver båda lägga till varandra.',
      unavailable: 'Den här användaren kan inte ta emot meddelanden.',
      emptyMessage: 'Skriv något eller bifoga en video.',
      videoNotAttachable:
        'Videon kan inte bifogas. Välj en färdig video som syns på din sida.',
      selfMessage: 'Du kan inte skriva till dig själv.',
      notFound: 'Konversationen finns inte.',
    },
    reports: {
      self: 'Du kan inte anmäla dig själv eller dina egna videor.',
    },
    support: {
      notFound: 'Ärendet hittades inte.',
      tooMany:
        'Du har {{count}} öppna ärenden. Vänta på svar i ett av dem eller markera ett som löst.',
      closed:
        'Ärendet är stängt. Om problemet finns kvar kan du skapa ett nytt.',
      empty: 'Skriv ett meddelande eller lägg till en bild.',
      tooManyFiles: 'Högst {{count}} bilder per meddelande.',
      badImage: 'Bilden kunde inte läsas. PNG, JPG eller WebP, högst 10 MB.',
      notYourVideo: 'Du kan bara bifoga en video som du själv har laddat upp.',
      notRated: 'Ett ärende kan betygsättas när det är löst eller stängt.',
    },
    site: {
      legalNotFound:
        'Den som driver webbplatsen har inte publicerat det här dokumentet.',
    },
    account: {
      confirmMismatch: 'Skriv ditt användarnamn exakt för att bekräfta.',
      deleted: 'Det här kontot är raderat.',
    },
    billing: {
      disabled: 'Den här servern har inga betalningar.',
      unavailable:
        'Betalningar är inte tillgängliga just nu. Försök igen senare.',
      signature: 'Signaturen stämmer inte.',
      noSubscription: 'Du har inget abonnemang.',
    },
    downloads: {
      limitReached:
        'Du har använt alla {{limit}} nedladdningar för den här månaden. Nästa blir tillgänglig den {{date}}.',
      busy: 'En annan nedladdning pågår fortfarande. Vänta tills den är klar och försök sedan igen.',
      ticketInvalid:
        'Nedladdningslänken har gått ut. Starta nedladdningen igen från videons sida.',
      range: 'Den här delen av filen finns inte.',
    },
    admin: {
      selfAction: 'Du kan inte göra så med ditt eget konto.',
      adminTarget: 'Ta bort administratörsrollen först.',
      notInTrash: 'Videon ligger inte i papperskorgen.',
      purged: 'Videon har redan raderats från lagringen.',
      authorDeleted:
        'Skaparen har raderat sitt konto, så videon kan inte återställas.',
      alreadyProcessed: 'Videon är redan bearbetad.',
      tierUntilPast: 'Slutdatumet måste ligga i framtiden.',
      tiersDisabled: 'Den här servern har inga abonnemang.',
      reportClosed: 'Anmälan är redan hanterad.',
      reportAction: 'Åtgärden passar inte anmälan.',
      noEmail: 'Kontot har ingen e-postadress.',
      viewAsReadOnly:
        'Du ser webbplatsen som en annan användare: inget kan ändras.',
    },
    categories: {
      exists: 'Du har redan en kategori med det namnet.',
      tooMany: 'Du kan ha högst {{max}} kategorier.',
    },
    uploads: {
      fileTooLarge: 'Filen är större än gränsen på {{max}}.',
      quotaExceeded:
        'Inte tillräckligt med lagringsutrymme: {{used}} av {{quota}} används redan.',
      notFound: 'Uppladdningen finns inte.',
      notActive: 'Uppladdningen är redan klar eller avbruten.',
      expired: 'Uppladdningen har gått ut. Starta den igen.',
      incomplete:
        'Delar av filen saknas eller är skadade. Försök ladda upp igen.',
      sizeMismatch:
        'Den uppladdade filen stämmer inte med den angivna storleken.',
      extensionDailyLimit:
        'I dag har du redan sparat det högsta tillåtna antalet videor via tillägget ({{limit}}). Räkningen börjar om vid midnatt (UTC).',
    },
    videos: {
      deleteInAdminPanel:
        'Radera andras videor i adminpanelen: skaparen får veta vilken regel det gäller och din kommentar.',
      notFound: 'Videon finns inte.',
      notReady: 'Videon bearbetas fortfarande.',
      categoryNotFound: 'Kategorin finns inte.',
      stackNotFound: 'Stapeln finns inte.',
      stackTooSmall: 'En stapel behöver minst två videor.',
      stackCategories:
        'Videorna i en stapel har samma kategori: välj den först.',
      frameNotFound: 'Bildrutan finns inte.',
      timestampOutOfRange: 'Tidpunkten ligger efter videons slut.',
      notWatchable: 'Du har inte tillgång till den här videon.',
      playbackTokenInvalid: 'Uppspelningslänken har gått ut. Ladda om sidan.',
      downloadNotAllowed: 'Det är inte tillåtet att ladda ner den här videon.',
      alreadyInCollection: 'Videon finns redan i din samling.',
      cannotAddToCollection: 'Videon kan inte läggas till i din samling.',
      cannotHide: 'Videon finns inte på din hylla.',
      ownVideoRename:
        'Din egen video byter namn i redigeringsformuläret, och då för alla.',
    },
  },
  editor: {
    copySuffix: '(redigerad)',
  },
  notifications: {
    failReason: {
      corrupted: 'filen är skadad eller är ingen video',
      noVideoStream: 'filen har inget videospår',
      zeroDuration: 'videon har ingen längd',
      tooLong: 'videor som är längre än 12 timmar stöds inte',
      tooLarge: 'bildrutor större än 4096 px stöds inte',
      fpsTooHigh: 'bildfrekvenser över 60 fps stöds inte',
      tooManyStreams: 'filen har för många strömmar',
      transcodeFailed: 'videon kunde inte konverteras',
      blocked:
        'filen har tagits bort för brott mot reglerna och kan inte laddas upp igen',
      internal: 'Bearbetningen misslyckades. Försök ladda upp igen',
    },
  },
  mail: {
    notifications: {
      guest: 'En gäst',
      anonymous: 'Anonym',
      manage: 'Ändra vilka aviseringar du får: {{url}}',
      unsubscribe: 'Sluta få mejl som detta: {{url}}',
      andMore_one: ' och {{count}} till',
      andMore_other: ' och {{count}} till',
      REQUEST_RECEIVED: {
        subject: '{{name}} ber om ”{{title}}”',
        title: 'Ny förfrågan om en video',
        body_one:
          '{{name}} vill att du delar ”{{title}}”. Dela den gratis, tacka nej eller föreslå ett byte.',
        body_other:
          '{{name}} vill att du delar {{count}} videor, bland annat ”{{title}}”. Dela dem gratis, tacka nej eller föreslå ett byte.',
        message: 'Meddelande: ”{{message}}”',
        offered_one:
          'I utbyte erbjuder personen {{count}} av sina egna videor.',
        offered_other:
          'I utbyte erbjuder personen {{count}} av sina egna videor.',
        button: 'Öppna förfrågan',
      },
      OFFER_RECEIVED: {
        subject: '{{name}} har gett dig ett erbjudande',
        title: 'Du har fått ett motbud',
        body: '{{name}} föreslog ett byte (omgång {{round}}). Godkänn det, tacka nej eller lägg ett eget erbjudande.',
        bodyDeal:
          '{{name}} erbjuder ”{{gives}}”{{givesMore}} för din ”{{wants}}”{{wantsMore}}. Godkänn det, tacka nej eller lägg ett eget erbjudande.',
        message: 'Meddelande: ”{{message}}”',
        button: 'Öppna konversationen',
      },
      REQUEST_SHARED: {
        subject: '{{name}} delade ”{{title}}” med dig',
        title: 'Delad med dig',
        body_one:
          '{{name}} delade ”{{title}}” med dig gratis. Den finns nu i din samling.',
        body_other:
          '{{name}} delade {{count}} videor med dig gratis, bland annat ”{{title}}”. De finns nu i din samling.',
        button: 'Se vad du har fått',
      },
      EXCHANGE_COMPLETED: {
        subject: 'Bytet med {{name}} är genomfört',
        title: 'Bytet är genomfört',
        body: 'Ditt byte med {{name}} är klart: du fick {{received}} och gav {{given}}. Det du fick finns nu i din samling.',
        button: 'Se vad du har fått',
      },
      REQUEST_DECLINED: {
        subject: '{{name}} tackade nej till förfrågan om ”{{title}}”',
        title: 'Förfrågan avböjd',
        body: '{{name}} tackade nej. {{comment}}',
        again_one: 'Du kan be om den igen om {{count}} dag.',
        again_other: 'Du kan be om den igen om {{count}} dagar.',
        button: 'Öppna förfrågan',
      },
      REQUEST_CANCELLED: {
        subject: '{{name}} drog tillbaka förfrågan om ”{{title}}”',
        title: 'Förfrågan tillbakadragen',
        body: '{{name}} drog tillbaka sin förfrågan om ”{{title}}”.',
        button: 'Öppna förfrågan',
      },
      REQUEST_INVALIDATED: {
        subject: 'Förfrågan om ”{{title}}” har ändrats',
        title: 'Förfrågan uppdaterad av systemet',
        body: 'En video i förfrågan om ”{{title}}” finns inte längre, så förhandlingen har uppdaterats.',
        bodyClosed:
          'Förfrågan om ”{{title}}” stängdes: det andra kontot finns inte längre.',
        bodyExpired:
          'Bytet med en gäst om ”{{title}}” löpte ut: ingen gjorde något på tre dagar. Gästens videor har raderats.',
        button: 'Öppna förfrågan',
      },
      NEW_FOLLOWER: {
        subject: 'Ny följare: {{name}}',
        title: 'Ny följare',
        body: '{{name}} följer nu din samling. Lägg till tillbaka för att bli vänner och kunna skriva till varandra.',
        button: 'Öppna personens sida',
      },
      FRIEND_ACCEPTED: {
        subject: 'Du och {{name}} är nu vänner',
        title: 'Ny vän',
        body: 'Du och {{name}} följer nu varandra. Ni kan skicka meddelanden och videor till varandra.',
        button: 'Öppna personens sida',
      },
      FOLLOWED_NEW_VIDEO: {
        subject: 'Ny video från {{name}}: ”{{title}}”',
        title: 'Ny video från {{name}}',
        body: '{{name}} har lagt till en ny video, ”{{title}}”.',
        bodyPrivate:
          '{{name}} har lagt till en ny privat video, ”{{title}}”. Du kan be om att få den delad med dig.',
        button: 'Öppna videon',
      },
      NEW_MESSAGE: {
        subject: 'Nytt meddelande från {{name}}',
        title: 'Nytt meddelande',
        body: '{{name}}: ”{{preview}}”',
        bodyVideo: '{{name}} skickade en video till dig i chatten.',
        button: 'Öppna chatten',
      },
      VIDEO_PROCESSED: {
        subject: '”{{title}}” är klar',
        title: 'Din video är klar',
        body: '”{{title}}” är bearbetad och går att titta på nu.',
        button: 'Öppna videon',
      },
      VIDEO_FAILED: {
        subject: '”{{title}}” kunde inte bearbetas',
        title: 'Bearbetningen misslyckades',
        body: '”{{title}}” kunde inte bearbetas: {{reason}}. Du kan ladda upp filen igen.',
        button: 'Öppna min sida',
      },
      VIDEO_REMOVED: {
        subject: '”{{title}}” har tagits bort av skaparen',
        title: 'En video har försvunnit från din samling',
        body: '{{author}} raderade ”{{title}}”, som fanns i din samling. Den är inte längre tillgänglig för någon.',
        button: 'Öppna aviseringar',
      },
      REPORT_RESOLVED: {
        subject: 'Din anmälan har granskats',
        title: 'Anmälan granskad',
        bodyVideo:
          'Vi har granskat din anmälan om ”{{title}}” och vidtagit åtgärder. Tack för att du hjälper till att hålla {{site}} säkert.',
        bodyUser:
          'Vi har granskat din anmälan om {{title}} och vidtagit åtgärder. Tack för att du hjälper till att hålla {{site}} säkert.',
        bodyVideoNone:
          'Vi har granskat din anmälan om ”{{title}}” och hittade inget brott mot reglerna.',
        bodyUserNone:
          'Vi har granskat din anmälan om {{title}} och hittade inget brott mot reglerna.',
        button: 'Öppna aviseringar',
      },
      ADMIN_NOTICE: {
        subject: 'Ett meddelande från {{site}}',
        title: 'Meddelande från teamet bakom {{site}}',
        body: '{{message}}',
        button: 'Öppna aviseringar',
      },
      VIDEO_EDITED: {
        subject: 'Din video ”{{title}}” har redigerats av en moderator',
        title: 'Videon har redigerats',
        body: 'En moderator på {{site}} har redigerat din video ”{{title}}” (till exempel gjort en del av den suddig). Länken och allt annat är som förut.',
        button: 'Öppna videon',
      },
      VIDEO_EDIT_FAILED: {
        subject: 'Redigeringen av ”{{title}}” lyckades inte',
        title: 'Redigeringen sparades inte',
        body: 'Redigeringen av din video ”{{title}}” kunde inte göras. Videon är som förut, och redigeraren har kvar dina ändringar så att du kan försöka igen.',
        button: 'Öppna redigeraren',
      },
      SUPPORT_REPLY: {
        subject: 'Supporten har svarat på ditt ärende #{{number}}',
        title: 'Supporten har svarat',
        body: '#{{number}} ”{{subject}}”: {{preview}}',
        bodyResolved:
          'Supporten har markerat ditt ärende #{{number}} ”{{subject}}” som löst. Om problemet finns kvar kan du skapa ett nytt ärende.',
        bodyResolvedWith:
          'Supporten har svarat på ditt ärende #{{number}} ”{{subject}}” och markerat det som löst: {{preview}}',
        button: 'Öppna ärendet',
      },
      SUPPORT_TICKET: {
        subject: 'Support #{{number}}: {{subject}}',
        title: 'Supportärende #{{number}}',
        body: '@{{name}} ber om hjälp ({{topic}}): ”{{subject}}”. {{preview}}',
        bodyReply:
          '@{{name}} skrev igen i #{{number}} ”{{subject}}”: {{preview}}',
        button: 'Öppna i adminpanelen',
      },
      LINK_OPENED: {
        subject: 'Din tillfälliga länk har öppnats',
        title: 'Länken har öppnats',
        body_one: '@{{name}} öppnade din tillfälliga länk med ”{{title}}”.',
        body_other:
          '@{{name}} öppnade din tillfälliga länk med {{count}} videor, bland annat ”{{title}}”.',
        bodyGuest_one: 'Någon öppnade din tillfälliga länk med ”{{title}}”.',
        bodyGuest_other:
          'Någon öppnade din tillfälliga länk med {{count}} videor, bland annat ”{{title}}”.',
        button: 'Öppna mina länkar',
      },
      LINK_SAVED: {
        subject: '@{{name}} har sparat videor från din länk',
        title: 'Sparat från din länk',
        body_one:
          '@{{name}} lade ”{{title}}” från din tillfälliga länk på sin hylla.',
        body_other:
          '@{{name}} lade {{count}} videor från din tillfälliga länk på sin hylla, bland annat ”{{title}}”.',
        button: 'Öppna mina länkar',
      },
      VIDEO_TAKEN_DOWN: {
        subject: 'Din video ”{{title}}” har tagits bort',
        title: 'Videon har tagits bort',
        body: 'Vi har tagit bort din video ”{{title}}” från {{site}}: {{rule}}. Den är inte längre tillgänglig för någon.',
        message: 'Kommentar från moderatorn: {{message}}',
        appeal:
          'Om du tror att det är ett misstag kan du skriva till {{email}}.',
        button: 'Öppna aviseringar',
      },
      PLAN_EXPIRING: {
        subject: 'Ditt Pro-abonnemang tar slut den {{date}}',
        title: 'Pro tar snart slut',
        body: 'Ditt Pro-abonnemang på {{site}} tar slut den {{date}} (UTC). Efter det gäller gränserna för Free på din hylla. Inget raderas.',
        page: 'Din sida är dold nu. När Pro tar slut kan alla se den igen.',
        anonymousLinks:
          'Dina anonyma länkar slutar fungera när Pro tar slut. De fungerar igen när du har Pro.',
        button: 'Öppna ditt abonnemang',
      },
      PLAN_PAYMENT_FAILED: {
        subject: 'Vi kunde inte förnya ditt Pro-abonnemang',
        title: 'Betalningen misslyckades',
        body: 'Betalningen för ditt Pro-abonnemang på {{site}} gick inte igenom. Uppdatera betalningssättet senast {{date}} (UTC), annars gäller gränserna för Free på din hylla. Inget raderas.',
        button: 'Uppdatera betalningssätt',
      },
      PLAN_EXPIRED: {
        subject: 'Ditt Pro-abonnemang har tagit slut',
        title: 'Pro har tagit slut',
        body: 'På din hylla på {{site}} gäller nu gränserna för Free: {{file}} per video och {{shelf}} totalt. Inget har raderats.',
        bodyOverQuota:
          'På din hylla på {{site}} gäller nu gränserna för Free: {{file}} per video och {{shelf}} totalt. Din hylla innehåller mer än så, så nya uppladdningar är pausade tills du frigör utrymme. Inget har raderats.',
        page: 'Din sida är synlig för alla igen: att dölja den ingår i Pro.',
        anonymousLinks:
          'Dina anonyma länkar öppnas inte längre. De fungerar igen när du har Pro.',
        button: 'Öppna ditt abonnemang',
      },
    },
    supportTopics: {
      QUESTION: 'fråga',
      BUG: 'felrapport',
      ACCOUNT: 'konto',
      IDEA: 'idé',
    },
    takedownRules: {
      SPAM: 'spam eller reklam',
      ILLEGAL: 'olagligt innehåll',
      COPYRIGHT: 'upphovsrättsintrång',
      ABUSE: 'förolämpningar eller trakasserier',
      UNMARKED_ADULT: 'känsligt innehåll utan märkning',
      OTHER: 'brott mot reglerna',
    },
    footer:
      'Du får det här mejlet eftersom ett konto på {{site}} skapades med den här adressen.',
    verify: {
      subject: 'Bekräfta din e-postadress för {{site}}',
      title: 'Välkommen till {{site}}, {{name}}!',
      body: 'Bekräfta din e-postadress för att kunna ladda upp, be om videor, lägga till vänner och skicka meddelanden.',
      button: 'Bekräfta e-postadressen',
      expires: 'Länken gäller i 24 timmar.',
    },
    reset: {
      subject: 'Återställ ditt lösenord på {{site}}',
      title: 'Återställ lösenordet',
      body: 'Hej {{name}}! Någon (förhoppningsvis du) har bett om att få återställa lösenordet till ditt konto på {{site}}.',
      button: 'Välj ett nytt lösenord',
      expires:
        'Länken gäller i 1 timme. Om det inte var du som bad om det kan du strunta i det här mejlet.',
    },
    guestDeal: {
      button: 'Öppna bytet',
      footer:
        'Du får det här mejlet eftersom du angav den här adressen på en bytessida på {{site}}. Inget konto har skapats.',
      saved: {
        subject: 'Ditt byte med {{name}}',
        title: 'Spara det här mejlet',
        body: 'Med den här knappen kommer du tillbaka till ditt byte med {{name}} från vilken enhet som helst. När {{name}} svarar skriver vi till dig här.',
      },
      offer: {
        subject: '{{name}} har svarat på ditt erbjudande',
        title: 'Ett nytt erbjudande',
        body: '{{name}} föreslog ett annat byte. Godkänn det, svara med ett eget erbjudande eller tacka nej – bytet väntar tre dagar till.',
      },
      accepted: {
        subject: 'Bytet med {{name}} är klart',
        title: 'Bytet är klart',
        body: 'Du kan titta på och ladda ner videorna du fick på bytessidan i 7 dagar. Logga in eller skapa ett konto där för att behålla dem för gott.',
      },
      shared: {
        subject: '{{name}} har delat videorna med dig',
        title: 'Delat med dig',
        body: '{{name}} gav dig videorna utan att ta dina, och dina videor har raderats från våra servrar. Titta på och ladda ner dina nya videor på bytessidan i 7 dagar.',
      },
      declined: {
        subject: '{{name}} tackade nej till bytet',
        title: 'Bytet avböjdes',
        body: 'Bytet är avslutat. Dina videor raderades från våra servrar direkt, och ingen fick dem.',
      },
      closed: {
        subject: 'Bytet med {{name}} är stängt',
        title: 'Bytet är stängt',
        body: 'Bytet kunde inte fortsätta (en video finns inte längre eller kontot har stängts). Dina videor raderades från våra servrar direkt, och ingen fick dem.',
      },
      expired: {
        subject: 'Bytet med {{name}} har löpt ut',
        title: 'Bytet har löpt ut',
        body: 'Ingen gjorde något på tre dagar, så bytet avslutades. Dina videor raderades från våra servrar direkt, och ingen fick dem.',
      },
    },
    twoFactor: {
      button: 'Öppna säkerhetsinställningarna',
      notYou: 'Om det inte var du, byt lösenord direkt och skriv till oss.',
      on: {
        subject: 'Tvåstegsinloggning är på',
        title: 'Tvåstegsinloggning är på',
        body: 'Hej {{name}}! När du loggar in på ditt konto på {{site}} med lösenord krävs nu även andra steget. Andra enheter har loggats ut.',
      },
      off: {
        subject: 'Tvåstegsinloggning är av',
        title: 'Tvåstegsinloggning är av',
        body: 'Hej {{name}}! Inloggning på ditt konto på {{site}} kräver inte längre andra steget.',
      },
      reset: {
        subject: 'Tvåstegsinloggning har återställts',
        title: 'Tvåstegsinloggning har återställts',
        body: 'Hej {{name}}! På din begäran har en administratör på {{site}} stängt av tvåstegsinloggning för ditt konto. Du kan slå på den igen i säkerhetsinställningarna.',
      },
      recoveryUsed: {
        subject: 'En återställningskod har använts',
        title: 'En återställningskod har använts',
        body: 'Hej {{name}}! En återställningskod för ditt konto på {{site}} användes nyss. Koder kvar: {{left}}.',
      },
    },
    links: {
      footer:
        'Du får det här mejlet eftersom @{{username}} skickade videor till den här adressen på {{site}}.',
      invite: {
        subject: '@{{username}} delar videor med dig',
        title: '{{name}} delar videor med dig',
        body_one:
          '@{{username}} har skickat en video till dig på {{site}}: ”{{title}}”.',
        body_other:
          '@{{username}} har skickat {{count}} videor till dig på {{site}}, bland annat ”{{title}}”.',
        how: 'Titta på dem och ladda ner dem innan länken går ut: den gäller till {{date}} (UTC). För att öppna den ber du om en kod, som skickas till den här adressen.',
        button: 'Öppna videorna',
      },
      code: {
        subject: 'Kod {{code}} för att öppna videorna',
        title: 'Din kod: {{code}}',
        body: 'Ange den på sidan för den tillfälliga länken från @{{username}}.',
        expires:
          'Koden gäller i 15 minuter. Om du inte har bett om den kan du strunta i det här mejlet.',
      },
    },
  },
} as const;
