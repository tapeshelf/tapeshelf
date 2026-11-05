export const it = {
  errors: {
    deviceUnknown: 'Questo telefono non ha più l’accesso. Apri l’app.',
    clientTooOld:
      'Questa versione dell’app è troppo vecchia per questo server.',
    internal: 'Qualcosa è andato storto da parte nostra. Riprova più tardi.',
    generic: 'Non è stato possibile completare l’operazione.',
    badRequest: 'Richiesta non valida.',
    validation: 'Alcuni campi non sono validi.',
    notFound: 'Non trovato.',
    conflict:
      'I dati sono cambiati nel frattempo. Aggiorna la pagina e riprova.',
    payloadTooLarge: 'La richiesta è troppo grande.',
    tooManyRequests: 'Troppe richieste. Rallenta un po’.',
    unauthorized: 'Per farlo devi accedere.',
    forbidden: 'Non hai il permesso di farlo.',
    auth: {
      captchaRequired: 'Conferma di non essere un robot.',
      captchaFailed: 'La verifica non è andata a buon fine. Riprova.',
      captchaUnavailable:
        'Al momento la verifica non è disponibile. Riprova più tardi.',
      invalidCredentials: 'Email o password errate.',
      registrationClosed:
        'Le iscrizioni qui sono chiuse. Per avere un account, chiedi a chi gestisce questo sito.',
      emailTaken: 'Esiste già un account con questa email.',
      usernameTaken: 'Questo nome utente è già in uso.',
      usernameInvalid:
        'Un nome utente ha da 3 a 30 caratteri: lettere minuscole, cifre e trattino basso.',
      usernameReserved: 'Questo nome utente è riservato.',
      usernameChangeTooSoon_one:
        'Potrai cambiare di nuovo il nome utente tra {{count}} giorno.',
      usernameChangeTooSoon_many:
        'Potrai cambiare di nuovo il nome utente tra {{count}} giorni.',
      usernameChangeTooSoon_other:
        'Potrai cambiare di nuovo il nome utente tra {{count}} giorni.',
      passwordWeak:
        'La password deve avere almeno 8 caratteri e contenere una lettera e una cifra.',
      tokenInvalid: 'Questo link non è valido o è già stato usato.',
      tokenExpired: 'Questo link è scaduto. Richiedine uno nuovo.',
      emailNotVerified: 'Prima conferma il tuo indirizzo email.',
      emailAlreadyVerified: 'La tua email è già confermata.',
      accountBanned: 'Questo account è stato sospeso.',
      sessionExpired: 'La sessione è scaduta. Accedi di nuovo.',
      tooManyAttempts_one:
        'Troppi tentativi di accesso. Riprova tra {{count}} minuto.',
      tooManyAttempts_many:
        'Troppi tentativi di accesso. Riprova tra {{count}} minuti.',
      tooManyAttempts_other:
        'Troppi tentativi di accesso. Riprova tra {{count}} minuti.',
      googleNotConfigured: 'L’accesso con Google non è disponibile.',
      googleFailed: 'Accesso con Google non riuscito. Riprova.',
      googleSignupExpired:
        'La sessione di registrazione è scaduta. Ricomincia da capo.',
      wrongPassword: 'La password attuale è sbagliata.',
      csrf: 'La richiesta è stata bloccata per motivi di sicurezza. Ricarica la pagina e riprova.',
      twoFactorLogin: 'Inserisci il codice dell’app di autenticazione.',
      adminGoogle:
        'Gli amministratori accedono con la password e il secondo passaggio, non con Google.',
      googleLinkTwoFactor:
        'Questa email appartiene a un account con l’accesso in due passaggi. Accedi con la sua password.',
    },
    twoFactor: {
      required:
        'Il pannello di amministrazione richiede l’accesso in due passaggi: attivalo in Impostazioni → Sicurezza.',
      confirm: 'Prima conferma che sei tu con il secondo passaggio.',
      invalidCode: 'Questo codice non va bene. Controllalo e riprova.',
      expired:
        'L’accesso ha richiesto troppo tempo. Inserisci di nuovo la password.',
      setupExpired:
        'La configurazione ha richiesto troppo tempo. Ricomincia da capo.',
      needsPassword:
        'L’accesso in due passaggi protegge una password. Prima imposta una password.',
      admin: 'Un amministratore non può accedere senza il secondo passaggio.',
      appExists: 'Un’app di autenticazione è già configurata.',
      passkeyInvalid: 'La passkey non ha risposto. Riprova.',
      passkeyLimit: 'Hai già 10 passkey.',
      passkeyNotFound: 'Questa passkey non c’è più.',
      noPasskey: 'Questo account non ha passkey.',
      off: 'L’accesso in due passaggi è disattivato.',
    },
    users: {
      notFound: 'Questo utente non esiste.',
      pageHidingNotAllowed: 'Nascondere la pagina è una funzione di Pro.',
      invalidImage:
        'Questo file non è un’immagine supportata (JPEG, PNG, WebP o GIF).',
    },
    exchange: {
      notFound: 'Questa richiesta non esiste.',
      notAllowed: 'Non puoi farlo con questa richiesta.',
      offerChanged:
        'Nel frattempo l’offerta è cambiata. Ricontrolla la richiesta e riprova.',
      videoBeingEdited:
        'L’autore sta modificando proprio ora un video di questo scambio. Riprova quando è pronto.',
      nothingToRequest: 'Nessuno dei video selezionati si può richiedere.',
      hintTooEarly:
        'Potrai nascondere il suggerimento dopo averlo visto ancora qualche volta.',
      selfRequest: 'Non puoi richiedere i tuoi video.',
      invalidOffer:
        'Un’offerta deve avere almeno un video per parte, tutti disponibili per chi li possiede.',
      blocked: 'Non puoi inviare richieste a questo utente.',
      alreadyBlocked: 'Questo utente è già bloccato.',
      selfBlock: 'Non puoi bloccare il tuo stesso account.',
    },
    social: {
      selfFollow: 'Non puoi seguire il tuo stesso account.',
      followNotAllowed: 'Non puoi aggiungere questo utente agli amici.',
    },
    editor: {
      invalid:
        'Questa modifica non si può salvare: controlla i tempi e le aree.',
      nothing: 'Non è cambiato nulla.',
      inProgress:
        'Questo video è già in fase di modifica. Aspetta che finisca o annullala.',
      notReady: 'Potrai modificare il video quando sarà elaborato.',
      proOnly: 'L’editor video è una funzione di Pro.',
      copyOwnOnly: 'Solo i tuoi video si possono salvare come copia.',
    },
    invites: {
      notFound: 'Questo link di invito non esiste.',
      expired: 'Questo invito è scaduto. Chiedi un nuovo link.',
      usedUp:
        'Questo invito è stato usato il numero massimo di volte. Chiedi un nuovo link.',
      own: 'Questo è il tuo invito: mandalo a qualcuno.',
    },
    deals: {
      notFound:
        'Questa trattativa non c’è (oppure è stata avviata in un altro browser).',
      closed: 'Questa trattativa è conclusa.',
      linkNotFound: 'Questo link di scambio non funziona più.',
      linkVideos:
        'Per un link di scambio scegli tuoi video già pronti (fino a 50).',
      guestsOff: 'Questa persona accetta scambi solo da utenti registrati.',
      uploadsMax: 'In una trattativa puoi mettere fino a {{max}} tuoi video.',
      videoInOffer:
        'Questo video è nell’offerta sul tavolo: prima cambia l’offerta.',
      nothingOffered: 'Carica almeno uno dei tuoi video da offrire.',
      tooMany:
        'Hai {{max}} trattative in corso. Concludine una prima di avviarne un’altra.',
    },
    links: {
      notFound: 'Questo link non esiste o non funziona più.',
      passwordPro: 'La password su un link è una funzione di Pro.',
      tooMany: 'Hai {{max}} link ancora attivi. Prima revocane qualcuno.',
      videoNotAllowed:
        'Con un link puoi inviare solo i video che hai caricato e quelli che hai ricevuto, pronti e non eliminati.',
      locked: 'Prima inserisci la password o il codice dell’email.',
      wrongPassword: 'Password errata.',
      wrongCode: 'Il codice è sbagliato o scaduto. Chiedine uno nuovo.',
      codeTooSoon:
        'Un codice è appena stato inviato. Potrai chiederne un altro tra un minuto.',
      codeLimit: 'Troppi codici per questo link. Riprova tra un’ora.',
      noEmail: 'Questo link non è legato a un indirizzo email.',
      emailOff:
        'Questo server non invia email, quindi i link per una sola persona non sono disponibili.',
      blocked: 'Non puoi aggiungere video di questa persona.',
    },
    anonymousLinks: {
      pro: 'I link anonimi sono una funzione di Pro.',
      tooMany: 'Hai {{max}} link anonimi. Prima eliminane uno.',
      notFound: 'Questo link non esiste o non funziona più.',
      nameNeeded:
        'Il tuo nome rivela il tuo nome utente. Scegli un nome per questo link.',
      nameNamesNickname:
        'Questo nome rivela il tuo nome utente. Scegline un altro.',
    },
    appTokens: {
      scope: 'L’estensione del browser non può farlo.',
      invalid: 'L’estensione non è più collegata. Collegala di nuovo.',
      code: 'Il codice di collegamento è scaduto o non è corretto. Riprova a collegare l’estensione.',
      redirect: 'Questa non sembra l’estensione di tapeshelf.',
      notFound: 'Questo collegamento non esiste.',
    },
    chat: {
      notFriends:
        'Puoi scrivere solo agli amici: dovete aggiungervi a vicenda.',
      unavailable: 'Questo utente non può ricevere messaggi.',
      emptyMessage: 'Scrivi qualcosa o allega un video.',
      videoNotAttachable:
        'Questo video non si può allegare. Scegli un video pronto e visibile sulla tua pagina.',
      selfMessage: 'Non puoi scrivere al tuo stesso account.',
      notFound: 'Questa conversazione non esiste.',
    },
    reports: {
      self: 'Non puoi segnalare il tuo account o i tuoi video.',
    },
    support: {
      notFound: 'Ticket non trovato.',
      tooMany:
        'Hai {{count}} ticket aperti. Aspetta la risposta a uno di questi, oppure segnane uno come risolto.',
      closed:
        'Questo ticket è chiuso. Se il problema persiste, aprine uno nuovo.',
      empty: 'Scrivi un messaggio o aggiungi un’immagine.',
      tooManyFiles: 'Al massimo {{count}} immagini per messaggio.',
      badImage:
        'Non è stato possibile leggere questa immagine. PNG, JPG o WebP, fino a 10 MB.',
      notYourVideo: 'Puoi allegare solo un video caricato da te.',
      notRated: 'Un ticket si può valutare solo quando è risolto o chiuso.',
    },
    site: {
      legalNotFound:
        'Il gestore di questo sito non ha pubblicato questo documento.',
    },
    account: {
      confirmMismatch: 'Per confermare, scrivi esattamente il tuo nome utente.',
      deleted: 'Questo account è stato eliminato.',
    },
    billing: {
      disabled: 'Su questo server non ci sono pagamenti.',
      unavailable:
        'Al momento i pagamenti non sono disponibili. Riprova più tardi.',
      signature: 'La firma non corrisponde.',
      noSubscription: 'Non hai un abbonamento.',
    },
    downloads: {
      limitReached:
        'Hai usato tutti i {{limit}} download di questo mese. Il prossimo sarà disponibile il {{date}}.',
      busy: 'C’è ancora un altro download in corso. Aspetta che finisca, poi riprova.',
      ticketInvalid:
        'Questo link di download è scaduto. Avvia di nuovo il download dalla pagina del video.',
      range: 'Questa parte del file non esiste.',
    },
    traffic: {
      limitReached:
        'Hai esaurito il traffico del tuo piano per questo mese. Si rinnova all’inizio del mese prossimo.',
      sharerLimitReached:
        'Chi ha condiviso questo video ha esaurito il traffico di questo mese. Si rinnova all’inizio del mese prossimo.',
    },
    admin: {
      selfAction: 'Non puoi farlo sul tuo stesso account.',
      adminTarget: 'Prima togli il ruolo di amministratore.',
      notInTrash: 'Questo video non è nel cestino.',
      purged: 'Questo video è già stato cancellato dallo storage.',
      authorDeleted:
        'L’autore ha eliminato il suo account, quindi il video non si può ripristinare.',
      alreadyProcessed: 'Questo video è già stato elaborato.',
      tierUntilPast: 'La data di fine deve essere nel futuro.',
      tiersDisabled: 'Su questo server non ci sono piani.',
      reportClosed: 'Questa segnalazione è già stata gestita.',
      reportAction: 'Questa azione non è adatta alla segnalazione.',
      noEmail: 'Questo account non ha un indirizzo email.',
      viewAsReadOnly:
        'Stai guardando il sito come un altro utente: non puoi cambiare nulla.',
    },
    categories: {
      exists: 'Hai già una categoria con questo nome.',
      tooMany: 'Puoi avere al massimo {{max}} categorie.',
    },
    uploads: {
      fileTooLarge: 'Il file supera il limite di {{max}}.',
      quotaExceeded:
        'Spazio insufficiente: sono già occupati {{used}} su {{quota}}.',
      notFound: 'Questo caricamento non esiste.',
      notActive: 'Questo caricamento è già terminato o è stato annullato.',
      expired: 'Questo caricamento è scaduto. Ricomincialo.',
      incomplete:
        'Alcune parti del file mancano o sono danneggiate. Riprova il caricamento.',
      sizeMismatch:
        'Il file caricato non corrisponde alla dimensione dichiarata.',
      extensionDailyLimit:
        'Oggi hai già salvato {{limit}} video con l’estensione, il massimo consentito. Il conteggio riparte a mezzanotte (UTC).',
    },
    videos: {
      deleteInAdminPanel:
        'I video degli altri si eliminano nel pannello di amministrazione: l’autore riceve la regola violata e la tua nota.',
      notFound: 'Questo video non esiste.',
      notReady: 'Il video è ancora in elaborazione.',
      categoryNotFound: 'Questa categoria non esiste.',
      stackNotFound: 'Questa pila non esiste.',
      stackTooSmall: 'Una pila deve contenere almeno due video.',
      stackCategories:
        'I video di una pila hanno una sola categoria in comune: prima sceglila.',
      frameNotFound: 'Questo fotogramma non esiste.',
      timestampOutOfRange: 'Questo momento è oltre la fine del video.',
      notWatchable: 'Non hai accesso a questo video.',
      playbackTokenInvalid:
        'Il link di riproduzione è scaduto. Ricarica la pagina.',
      downloadNotAllowed: 'Non è consentito scaricare questo video.',
      alreadyInCollection: 'Questo video è già nella tua collezione.',
      cannotAddToCollection:
        'Questo video non si può aggiungere alla tua collezione.',
      cannotHide: 'Questo video non è sul tuo scaffale.',
      ownVideoRename:
        'Un video tuo si rinomina dal suo modulo di modifica, e per tutti.',
    },
  },
  editor: {
    copySuffix: '(modificato)',
  },
  notifications: {
    failReason: {
      corrupted: 'il file è danneggiato o non è un video',
      noVideoStream: 'il file non ha una traccia video',
      zeroDuration: 'il video ha durata zero',
      tooLong: 'i video più lunghi di 12 ore non sono supportati',
      tooLarge: 'i fotogrammi più grandi di 4096 px non sono supportati',
      fpsTooHigh: 'le frequenze sopra i 60 fps non sono supportate',
      tooManyStreams: 'il file contiene troppi flussi',
      transcodeFailed: 'non è stato possibile convertire il video',
      blocked:
        'questo file è stato rimosso perché violava le regole e non può essere caricato di nuovo',
      internal: 'Elaborazione non riuscita. Prova a caricarlo di nuovo',
    },
  },
  mail: {
    notifications: {
      guest: 'Un ospite',
      anonymous: 'Anonimo',
      manage: 'Scegli quali notifiche ricevere: {{url}}',
      unsubscribe: 'Non ricevere più email come questa: {{url}}',
      andMore_one: ' e un altro',
      andMore_many: ' e altri {{count}}',
      andMore_other: ' e altri {{count}}',
      REQUEST_RECEIVED: {
        subject: '{{name}} chiede «{{title}}»',
        title: 'Nuova richiesta di video',
        body_one:
          '{{name}} vorrebbe che condividessi «{{title}}». Condividilo gratis, rifiuta o proponi uno scambio.',
        body_many:
          '{{name}} vorrebbe che condividessi {{count}} video, a partire da «{{title}}». Condividili gratis, rifiuta o proponi uno scambio.',
        body_other:
          '{{name}} vorrebbe che condividessi {{count}} video, a partire da «{{title}}». Condividili gratis, rifiuta o proponi uno scambio.',
        message: 'Il suo messaggio: «{{message}}»',
        offered_one: 'In cambio offre uno dei suoi video.',
        offered_many: 'In cambio offre {{count}} dei suoi video.',
        offered_other: 'In cambio offre {{count}} dei suoi video.',
        button: 'Apri la richiesta',
      },
      OFFER_RECEIVED: {
        subject: '{{name}} ti ha fatto un’offerta',
        title: 'Controfferta ricevuta',
        body: '{{name}} ha proposto uno scambio (round {{round}}). Accettalo, rifiutalo o fai la tua offerta.',
        bodyDeal:
          '{{name}} offre «{{gives}}»{{givesMore}} in cambio del tuo «{{wants}}»{{wantsMore}}. Accetta, rifiuta o fai la tua offerta.',
        message: 'Il suo messaggio: «{{message}}»',
        button: 'Apri la richiesta',
      },
      REQUEST_SHARED: {
        subject: '{{name}} ha condiviso con te «{{title}}»',
        title: 'Condiviso con te',
        body_one:
          '{{name}} ha condiviso gratis con te «{{title}}». Ora è nella tua collezione.',
        body_many:
          '{{name}} ha condiviso gratis con te {{count}} video, a partire da «{{title}}». Ora sono nella tua collezione.',
        body_other:
          '{{name}} ha condiviso gratis con te {{count}} video, a partire da «{{title}}». Ora sono nella tua collezione.',
        button: 'Guarda cosa hai ricevuto',
      },
      EXCHANGE_COMPLETED: {
        subject: 'Scambio con {{name}} concluso',
        title: 'Scambio concluso',
        body: 'Il tuo scambio con {{name}} è fatto: hai ricevuto {{received}} e dato {{given}}. Quello che hai ricevuto ora è nella tua collezione.',
        button: 'Guarda cosa hai ricevuto',
      },
      REQUEST_DECLINED: {
        subject: '{{name}} ha rifiutato la richiesta per «{{title}}»',
        title: 'Richiesta rifiutata',
        body: '{{name}} ha rifiutato. {{comment}}',
        again_one: 'Potrai chiederlo di nuovo tra {{count}} giorno.',
        again_many: 'Potrai chiederlo di nuovo tra {{count}} giorni.',
        again_other: 'Potrai chiederlo di nuovo tra {{count}} giorni.',
        button: 'Apri la richiesta',
      },
      REQUEST_CANCELLED: {
        subject: '{{name}} ha ritirato la richiesta per «{{title}}»',
        title: 'Richiesta ritirata',
        body: '{{name}} ha annullato la sua richiesta per «{{title}}».',
        button: 'Apri la richiesta',
      },
      REQUEST_INVALIDATED: {
        subject: 'La richiesta per «{{title}}» è cambiata',
        title: 'Richiesta aggiornata dal sistema',
        body: 'Un video coinvolto nella richiesta per «{{title}}» non è più disponibile, quindi la richiesta è stata aggiornata.',
        bodyClosed:
          'La richiesta per «{{title}}» è stata chiusa: l’altro account non è più disponibile.',
        bodyExpired:
          'La trattativa con un ospite per «{{title}}» è scaduta: per tre giorni nessuno ha fatto una mossa. I video dell’ospite sono stati eliminati.',
        button: 'Apri la richiesta',
      },
      NEW_FOLLOWER: {
        subject: 'Nuovo follower: {{name}}',
        title: 'Nuovo follower',
        body: '{{name}} ora segue la tua collezione. Ricambia per diventare amici e potervi scrivere.',
        button: 'Apri la sua pagina',
      },
      FRIEND_ACCEPTED: {
        subject: 'Tu e {{name}} ora siete amici',
        title: 'Una nuova amicizia',
        body: 'Tu e {{name}} ora vi seguite a vicenda. Potete scambiarvi messaggi e video.',
        button: 'Apri la sua pagina',
      },
      FOLLOWED_NEW_VIDEO: {
        subject: 'Nuovo video di {{name}}: «{{title}}»',
        title: 'Nuovo video di {{name}}',
        body: '{{name}} ha aggiunto un nuovo video, «{{title}}».',
        bodyPrivate:
          '{{name}} ha aggiunto un nuovo video privato, «{{title}}». Puoi chiedere che lo condivida con te.',
        button: 'Apri il video',
      },
      NEW_MESSAGE: {
        subject: 'Nuovo messaggio da {{name}}',
        title: 'Nuovo messaggio',
        body: '{{name}}: «{{preview}}»',
        bodyVideo: '{{name}} ti ha inviato un video in chat.',
        button: 'Apri la chat',
      },
      VIDEO_PROCESSED: {
        subject: '«{{title}}» è pronto',
        title: 'Il tuo video è pronto',
        body: '«{{title}}» è stato elaborato e ora si può guardare.',
        button: 'Apri il video',
      },
      VIDEO_FAILED: {
        subject: 'Non è stato possibile elaborare «{{title}}»',
        title: 'Elaborazione non riuscita',
        body: 'Non è stato possibile elaborare «{{title}}»: {{reason}}. Puoi caricare di nuovo il file.',
        button: 'Apri la mia pagina',
      },
      VIDEO_REMOVED: {
        subject: '«{{title}}» è stato rimosso dal suo autore',
        title: 'Un video ha lasciato la tua collezione',
        body: '{{author}} ha eliminato «{{title}}», che era nella tua collezione. Non è più disponibile per nessuno.',
        button: 'Apri le notifiche',
      },
      REPORT_RESOLVED: {
        subject: 'La tua segnalazione è stata esaminata',
        title: 'Segnalazione esaminata',
        bodyVideo:
          'Abbiamo esaminato la tua segnalazione su «{{title}}» e siamo intervenuti. Grazie per aiutarci a mantenere {{site}} un posto sicuro.',
        bodyUser:
          'Abbiamo esaminato la tua segnalazione su {{title}} e siamo intervenuti. Grazie per aiutarci a mantenere {{site}} un posto sicuro.',
        bodyVideoNone:
          'Abbiamo esaminato la tua segnalazione su «{{title}}» e non abbiamo trovato violazioni delle regole.',
        bodyUserNone:
          'Abbiamo esaminato la tua segnalazione su {{title}} e non abbiamo trovato violazioni delle regole.',
        button: 'Apri le notifiche',
      },
      ADMIN_NOTICE: {
        subject: 'Un messaggio da {{site}}',
        title: 'Messaggio dal team di {{site}}',
        body: '{{message}}',
        button: 'Apri le notifiche',
      },
      VIDEO_EDITED: {
        subject: 'Un moderatore ha modificato il tuo video «{{title}}»',
        title: 'Video modificato',
        body: 'Un moderatore di {{site}} ha modificato il tuo video «{{title}}» (per esempio, ne ha sfocato una parte). Il link e tutto il resto restano uguali.',
        button: 'Apri il video',
      },
      VIDEO_EDIT_FAILED: {
        subject: 'La modifica di «{{title}}» non è riuscita',
        title: 'Modifica non salvata',
        body: 'Non è stato possibile applicare la modifica al tuo video «{{title}}». Il video è rimasto com’era; l’editor conserva le tue modifiche, così puoi riprovare.',
        button: 'Apri l’editor',
      },
      SUPPORT_REPLY: {
        subject: 'L’assistenza ha risposto al tuo ticket #{{number}}',
        title: 'Risposta dell’assistenza',
        body: '#{{number}} «{{subject}}»: {{preview}}',
        bodyResolved:
          'L’assistenza ha segnato come risolto il tuo ticket #{{number}} «{{subject}}». Se il problema persiste, apri un nuovo ticket.',
        bodyResolvedWith:
          'L’assistenza ha risposto al tuo ticket #{{number}} «{{subject}}» e l’ha segnato come risolto: {{preview}}',
        button: 'Apri il ticket',
      },
      SUPPORT_TICKET: {
        subject: 'Assistenza #{{number}}: {{subject}}',
        title: 'Ticket di assistenza #{{number}}',
        body: '@{{name}} chiede aiuto ({{topic}}): «{{subject}}». {{preview}}',
        bodyReply:
          '@{{name}} ha scritto di nuovo in #{{number}} «{{subject}}»: {{preview}}',
        button: 'Apri nel pannello di amministrazione',
      },
      LINK_OPENED: {
        subject: 'Il tuo link temporaneo è stato aperto',
        title: 'Link aperto',
        body_one: '@{{name}} ha aperto il tuo link temporaneo con «{{title}}».',
        body_many:
          '@{{name}} ha aperto il tuo link temporaneo con {{count}} video, a partire da «{{title}}».',
        body_other:
          '@{{name}} ha aperto il tuo link temporaneo con {{count}} video, a partire da «{{title}}».',
        bodyGuest_one:
          'Qualcuno ha aperto il tuo link temporaneo con «{{title}}».',
        bodyGuest_many:
          'Qualcuno ha aperto il tuo link temporaneo con {{count}} video, a partire da «{{title}}».',
        bodyGuest_other:
          'Qualcuno ha aperto il tuo link temporaneo con {{count}} video, a partire da «{{title}}».',
        button: 'Apri i miei link',
      },
      LINK_SAVED: {
        subject: '@{{name}} ha salvato dei video dal tuo link',
        title: 'Salvati dal tuo link',
        body_one:
          '@{{name}} ha messo sul suo scaffale «{{title}}» dal tuo link temporaneo.',
        body_many:
          '@{{name}} ha messo sul suo scaffale {{count}} video dal tuo link temporaneo, a partire da «{{title}}».',
        body_other:
          '@{{name}} ha messo sul suo scaffale {{count}} video dal tuo link temporaneo, a partire da «{{title}}».',
        button: 'Apri i miei link',
      },
      VIDEO_TAKEN_DOWN: {
        subject: 'Il tuo video «{{title}}» è stato rimosso',
        title: 'Video rimosso',
        body: 'Abbiamo rimosso il tuo video «{{title}}» da {{site}}: {{rule}}. Non è più disponibile per nessuno.',
        message: 'Nota del moderatore: {{message}}',
        appeal: 'Se pensi che sia un errore, scrivi a {{email}}.',
        button: 'Apri le notifiche',
      },
      PLAN_EXPIRING: {
        subject: 'Il tuo piano Pro scade il {{date}}',
        title: 'Pro scade a breve',
        body: 'Il tuo piano Pro su {{site}} scade il {{date}} (UTC). Dopo, il tuo scaffale avrà i limiti di Free; non verrà eliminato nulla.',
        page: 'Ora la tua pagina è nascosta; quando Pro finisce, tutti potranno vederla di nuovo.',
        anonymousLinks:
          'Quando Pro finisce, i tuoi link anonimi smetteranno di aprirsi; con Pro torneranno a funzionare.',
        button: 'Apri il tuo piano',
      },
      PLAN_PAYMENT_FAILED: {
        subject: 'Non siamo riusciti a rinnovare il tuo piano Pro',
        title: 'Pagamento non riuscito',
        body: 'Il pagamento del tuo piano Pro su {{site}} non è andato a buon fine. Aggiorna il metodo di pagamento entro il {{date}} (UTC), altrimenti il tuo scaffale avrà i limiti di Free; non verrà eliminato nulla.',
        button: 'Aggiorna il metodo di pagamento',
      },
      PLAN_EXPIRED: {
        subject: 'Il tuo piano Pro è scaduto',
        title: 'Pro è scaduto',
        body: 'Il tuo scaffale su {{site}} ora ha i limiti di Free: {{file}} per video e {{shelf}} in totale. Non è stato eliminato nulla.',
        bodyOverQuota:
          'Il tuo scaffale su {{site}} ora ha i limiti di Free: {{file}} per video e {{shelf}} in totale. Il tuo scaffale contiene di più, quindi i nuovi caricamenti sono sospesi finché non liberi spazio. Non è stato eliminato nulla.',
        page: 'La tua pagina è di nuovo visibile a tutti: per nasconderla serve Pro.',
        anonymousLinks:
          'I tuoi link anonimi non si aprono più; con Pro torneranno a funzionare.',
        button: 'Apri il tuo piano',
      },
      TRAFFIC_RUNNING_OUT: {
        subject: 'Il tuo traffico sta per esaurirsi',
        title: 'Il traffico sta per esaurirsi',
        body: 'Su {{site}} hai usato {{used}} dei {{limit}} di traffico di questo mese. Quando si esaurirà, i tuoi video pubblici e i tuoi link smetteranno di aprirsi per gli altri fino al {{date}} (UTC).',
        button: 'Apri il tuo piano',
      },
      TRAFFIC_USED_UP: {
        subject: 'Il traffico di questo mese è esaurito',
        title: 'Traffico esaurito',
        body: 'Il traffico di questo mese ({{limit}}) su {{site}} è esaurito. Fino al {{date}} (UTC) i tuoi video pubblici e i tuoi link non si aprono per gli altri, e tu non puoi guardare i video degli altri. I tuoi video continui a vederli come sempre.',
        button: 'Apri il tuo piano',
      },
    },
    supportTopics: {
      QUESTION: 'domanda',
      BUG: 'segnalazione di un problema',
      ACCOUNT: 'account',
      IDEA: 'idea',
    },
    takedownRules: {
      SPAM: 'spam o pubblicità',
      ILLEGAL: 'contenuto illegale',
      COPYRIGHT: 'violazione del copyright',
      ABUSE: 'insulti o molestie',
      UNMARKED_ADULT: 'contenuto sensibile non segnato',
      OTHER: 'una violazione delle regole',
    },
    footer:
      'Ricevi questa email perché con questo indirizzo è stato creato un account su {{site}}.',
    verify: {
      subject: 'Conferma la tua email per {{site}}',
      title: 'Ti diamo il benvenuto su {{site}}, {{name}}!',
      body: 'Conferma il tuo indirizzo email per sbloccare caricamenti, richieste di video, amici e messaggi.',
      button: 'Conferma l’email',
      expires: 'Il link è valido per 24 ore.',
    },
    reset: {
      subject: 'Reimposta la password di {{site}}',
      title: 'Reimpostazione della password',
      body: 'Ciao {{name}}, qualcuno (speriamo tu) ha chiesto di reimpostare la password del tuo account {{site}}.',
      button: 'Imposta una nuova password',
      expires:
        'Il link è valido per 1 ora. Se non l’hai chiesto tu, puoi ignorare questa email.',
    },
    guestDeal: {
      button: 'Apri la trattativa',
      footer:
        'Ricevi questa email perché hai inserito questo indirizzo nella pagina di una trattativa su {{site}}. Non è stato creato nessun account.',
      saved: {
        subject: 'La tua trattativa con {{name}}',
        title: 'Conserva questa email',
        body: 'Questo pulsante ti riporta alla tua trattativa con {{name}} da qualsiasi dispositivo. Quando {{name}} risponde, ti scriviamo qui.',
      },
      offer: {
        subject: '{{name}} ha risposto alla tua offerta',
        title: 'Una nuova offerta',
        body: '{{name}} ha proposto uno scambio diverso. Accettalo, rispondi con una tua offerta o rifiuta: la trattativa aspetta altri tre giorni.',
      },
      accepted: {
        subject: 'Lo scambio con {{name}} è fatto',
        title: 'Lo scambio è fatto',
        body: 'Per 7 giorni puoi guardare e scaricare i video ricevuti nella pagina della trattativa. Accedi o crea lì un account per tenerli per sempre.',
      },
      shared: {
        subject: '{{name}} ha condiviso i video con te',
        title: 'Condiviso con te',
        body: '{{name}} ti ha dato i video senza prendere i tuoi; i tuoi video sono stati eliminati dai nostri server. Per 7 giorni puoi guardare e scaricare quelli ricevuti nella pagina della trattativa.',
      },
      declined: {
        subject: '{{name}} ha rifiutato lo scambio',
        title: 'Lo scambio è stato rifiutato',
        body: 'La trattativa è finita. I tuoi video sono stati eliminati subito dai nostri server; nessuno li ha ricevuti.',
      },
      closed: {
        subject: 'La trattativa con {{name}} è chiusa',
        title: 'La trattativa è chiusa',
        body: 'La trattativa non poteva proseguire (un video non c’è più o l’account è stato chiuso). I tuoi video sono stati eliminati subito dai nostri server; nessuno li ha ricevuti.',
      },
      expired: {
        subject: 'La trattativa con {{name}} è scaduta',
        title: 'La trattativa è scaduta',
        body: 'Per tre giorni nessuno ha fatto una mossa, quindi la trattativa è finita. I tuoi video sono stati eliminati subito dai nostri server; nessuno li ha ricevuti.',
      },
    },
    twoFactor: {
      button: 'Apri le impostazioni di sicurezza',
      notYou: 'Se non è opera tua, cambia subito la password e scrivici.',
      on: {
        subject: 'Accesso in due passaggi attivato',
        title: 'Accesso in due passaggi attivato',
        body: 'Ciao {{name}}, ora l’accesso al tuo account {{site}} con la password chiede anche il secondo passaggio. Gli altri dispositivi sono stati disconnessi.',
      },
      off: {
        subject: 'Accesso in due passaggi disattivato',
        title: 'Accesso in due passaggi disattivato',
        body: 'Ciao {{name}}, l’accesso al tuo account {{site}} non chiede più il secondo passaggio.',
      },
      reset: {
        subject: 'Accesso in due passaggi reimpostato',
        title: 'Accesso in due passaggi reimpostato',
        body: 'Ciao {{name}}, su tua richiesta un amministratore di {{site}} ha disattivato l’accesso in due passaggi per il tuo account. Puoi riattivarlo nelle impostazioni di sicurezza.',
      },
      recoveryUsed: {
        subject: 'È stato usato un codice di recupero',
        title: 'È stato usato un codice di recupero',
        body: 'Ciao {{name}}, è appena stato usato un codice di recupero del tuo account {{site}}. Codici rimasti: {{left}}.',
      },
    },
    links: {
      footer:
        'Ricevi questa email perché @{{username}} ha inviato dei video a questo indirizzo su {{site}}.',
      invite: {
        subject: '@{{username}} condivide dei video con te',
        title: '{{name}} condivide dei video con te',
        body_one:
          '@{{username}} ti ha inviato un video su {{site}}: «{{title}}».',
        body_many:
          '@{{username}} ti ha inviato {{count}} video su {{site}}, a partire da «{{title}}».',
        body_other:
          '@{{username}} ti ha inviato {{count}} video su {{site}}, a partire da «{{title}}».',
        how: 'Guardali e scaricali prima che il link scada: funziona fino al {{date}} (UTC). Per aprirlo, chiedi un codice: arriva a questo indirizzo.',
        button: 'Apri i video',
      },
      code: {
        subject: 'Codice {{code}} per aprire i video',
        title: 'Il tuo codice: {{code}}',
        body: 'Inseriscilo nella pagina del link temporaneo di @{{username}}.',
        expires:
          'Il codice vale 15 minuti. Se non l’hai chiesto tu, ignora questa email.',
      },
    },
  },
} as const;
