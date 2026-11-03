export const de = {
  errors: {
    internal:
      'Bei uns ist etwas schiefgelaufen. Bitte versuch es später noch einmal.',
    generic: 'Die Anfrage konnte nicht ausgeführt werden.',
    badRequest: 'Die Anfrage ist ungültig.',
    validation: 'Einige Felder sind ungültig.',
    notFound: 'Nicht gefunden.',
    conflict:
      'Das passt nicht zum aktuellen Stand. Lade die Seite neu und versuch es noch einmal.',
    payloadTooLarge: 'Die Anfrage ist zu groß.',
    tooManyRequests: 'Zu viele Anfragen. Bitte etwas langsamer.',
    unauthorized: 'Dafür musst du angemeldet sein.',
    forbidden: 'Dazu hast du keine Berechtigung.',
    auth: {
      captchaRequired: 'Bitte bestätige, dass du ein Mensch bist.',
      captchaFailed:
        'Die Prüfung ist fehlgeschlagen. Bitte versuch es noch einmal.',
      captchaUnavailable:
        'Die Prüfung ist gerade nicht verfügbar. Bitte versuch es später noch einmal.',
      invalidCredentials: 'E-Mail-Adresse oder Passwort ist falsch.',
      registrationClosed:
        'Registrierungen sind hier geschlossen. Für ein Konto frag die Person, die diese Seite betreibt.',
      emailTaken: 'Mit dieser E-Mail-Adresse gibt es schon ein Konto.',
      usernameTaken: 'Dieser Nutzername ist schon vergeben.',
      usernameInvalid:
        'Ein Nutzername hat 3–30 Zeichen: Kleinbuchstaben, Ziffern und Unterstriche.',
      usernameReserved: 'Dieser Nutzername ist reserviert.',
      usernameChangeTooSoon_one:
        'Du kannst deinen Nutzernamen in {{count}} Tag wieder ändern.',
      usernameChangeTooSoon_other:
        'Du kannst deinen Nutzernamen in {{count}} Tagen wieder ändern.',
      passwordWeak:
        'Das Passwort muss mindestens 8 Zeichen lang sein und einen Buchstaben und eine Ziffer enthalten.',
      tokenInvalid: 'Dieser Link ist ungültig oder wurde schon benutzt.',
      tokenExpired: 'Dieser Link ist abgelaufen. Bitte fordere einen neuen an.',
      emailNotVerified: 'Bitte bestätige zuerst deine E-Mail-Adresse.',
      emailAlreadyVerified: 'Deine E-Mail-Adresse ist schon bestätigt.',
      accountBanned: 'Dieses Konto wurde gesperrt.',
      sessionExpired:
        'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.',
      tooManyAttempts_one:
        'Zu viele Anmeldeversuche. Versuch es in {{count}} Minute noch einmal.',
      tooManyAttempts_other:
        'Zu viele Anmeldeversuche. Versuch es in {{count}} Minuten noch einmal.',
      googleNotConfigured: 'Die Anmeldung mit Google ist nicht verfügbar.',
      googleFailed:
        'Die Anmeldung mit Google ist fehlgeschlagen. Bitte versuch es noch einmal.',
      googleSignupExpired:
        'Die Registrierung hat zu lange gedauert. Bitte fang noch einmal an.',
      wrongPassword: 'Das aktuelle Passwort ist falsch.',
      csrf: 'Die Anfrage wurde aus Sicherheitsgründen blockiert. Lade die Seite neu und versuch es noch einmal.',
      twoFactorLogin: 'Gib den Code aus deiner Authentifizierungs-App ein.',
      adminGoogle:
        'Admins melden sich mit Passwort und zweitem Schritt an, nicht mit Google.',
      googleLinkTwoFactor:
        'Diese E-Mail-Adresse gehört zu einem Konto mit zweistufiger Anmeldung. Melde dich mit dem Passwort dieses Kontos an.',
    },
    twoFactor: {
      required:
        'Für den Adminbereich ist die zweistufige Anmeldung Pflicht: Schalte sie unter Einstellungen → Sicherheit ein.',
      confirm: 'Bestätige zuerst mit dem zweiten Schritt, dass du es bist.',
      invalidCode:
        'Dieser Code passt nicht. Prüfe ihn und versuch es noch einmal.',
      expired:
        'Die Anmeldung hat zu lange gedauert. Gib dein Passwort noch einmal ein.',
      setupExpired:
        'Die Einrichtung hat zu lange gedauert. Bitte fang noch einmal an.',
      needsPassword:
        'Die zweistufige Anmeldung schützt ein Passwort. Leg zuerst ein Passwort fest.',
      admin: 'Admins können sich nicht ohne den zweiten Schritt anmelden.',
      appExists: 'Es ist schon eine Authentifizierungs-App eingerichtet.',
      passkeyInvalid:
        'Der Passkey hat nicht geantwortet. Bitte versuch es noch einmal.',
      passkeyLimit: 'Du hast schon 10 Passkeys.',
      passkeyNotFound: 'Diesen Passkey gibt es nicht mehr.',
      noPasskey: 'Dieses Konto hat keinen Passkey.',
      off: 'Die zweistufige Anmeldung ist aus.',
    },
    users: {
      notFound: 'Diesen Nutzer gibt es nicht.',
      pageHidingNotAllowed: 'Die Seite verstecken kannst du mit Pro.',
      invalidImage:
        'Diese Datei ist kein unterstütztes Bild (JPEG, PNG, WebP oder GIF).',
    },
    exchange: {
      notFound: 'Diese Anfrage gibt es nicht.',
      notAllowed: 'Das kannst du mit dieser Anfrage nicht tun.',
      offerChanged:
        'Das Angebot hat sich inzwischen geändert. Sieh dir den Verlauf an und versuch es noch einmal.',
      videoBeingEdited:
        'Ein Video aus diesem Tausch wird gerade vom Autor bearbeitet. Versuch es noch einmal, sobald es fertig ist.',
      nothingToRequest: 'Keines der ausgewählten Videos kann angefragt werden.',
      hintTooEarly:
        'Du kannst den Hinweis nach ein paar weiteren Aufrufen ausblenden.',
      selfRequest: 'Deine eigenen Videos kannst du nicht anfragen.',
      invalidOffer:
        'Ein Angebot braucht auf jeder Seite mindestens ein Video, und alle müssen für ihre Besitzer verfügbar sein.',
      blocked: 'Du kannst diesem Nutzer keine Anfragen schicken.',
      alreadyBlocked: 'Dieser Nutzer ist schon blockiert.',
      selfBlock: 'Du kannst dich nicht selbst blockieren.',
    },
    social: {
      selfFollow: 'Du kannst dir nicht selbst folgen.',
      followNotAllowed: 'Du kannst diesen Nutzer nicht als Freund hinzufügen.',
    },
    editor: {
      invalid:
        'Diese Bearbeitung lässt sich nicht speichern: Prüfe die Zeiten und Bereiche.',
      nothing: 'Es hat sich nichts geändert.',
      inProgress:
        'Dieses Video wird schon bearbeitet. Warte darauf oder brich die Bearbeitung ab.',
      notReady: 'Das Video kann bearbeitet werden, sobald es verarbeitet ist.',
      proOnly: 'Den Videoeditor gibt es mit Pro.',
      copyOwnOnly: 'Nur deine eigenen Videos lassen sich als Kopie speichern.',
    },
    invites: {
      notFound: 'Diesen Einladungslink gibt es nicht.',
      expired: 'Diese Einladung ist abgelaufen. Bitte um einen neuen Link.',
      usedUp: 'Diese Einladung ist aufgebraucht. Bitte um einen neuen Link.',
      own: 'Das ist deine eigene Einladung: Schick sie jemandem.',
    },
    deals: {
      notFound:
        'Diesen Deal gibt es hier nicht (oder er wurde in einem anderen Browser begonnen).',
      closed: 'Dieser Deal ist vorbei.',
      linkNotFound: 'Dieser Tauschlink funktioniert nicht mehr.',
      linkVideos:
        'Wähle für einen Tauschlink eigene, fertige Videos aus (bis zu 50).',
      guestsOff: 'Diese Person tauscht nur mit registrierten Nutzern.',
      uploadsMax: 'Ein Deal nimmt bis zu {{max}} deiner Videos auf.',
      videoInOffer:
        'Dieses Video ist Teil des aktuellen Angebots: Ändere zuerst das Angebot.',
      nothingOffered: 'Lade mindestens eines deiner Videos zum Anbieten hoch.',
      tooMany:
        'Bei dir laufen {{max}} Deals. Schließ einen ab, bevor du einen neuen beginnst.',
    },
    links: {
      notFound: 'Diesen Link gibt es nicht, oder er funktioniert nicht mehr.',
      passwordPro: 'Ein Passwort für Links gibt es mit Pro.',
      tooMany:
        'Du hast {{max}} Links, die noch gelten. Widerrufe zuerst einige davon.',
      videoNotAllowed:
        'Per Link senden kannst du nur eigene Uploads und erhaltene Videos, und nur, wenn sie fertig und nicht gelöscht sind.',
      locked: 'Gib zuerst das Passwort oder den Code aus der E-Mail ein.',
      wrongPassword: 'Falsches Passwort.',
      wrongCode: 'Der Code ist falsch oder abgelaufen. Fordere einen neuen an.',
      codeTooSoon:
        'Gerade wurde ein Code gesendet. In einer Minute kannst du einen weiteren anfordern.',
      codeLimit:
        'Zu viele Codes für diesen Link. Versuch es in einer Stunde noch einmal.',
      noEmail: 'Dieser Link ist nicht für eine bestimmte E-Mail-Adresse.',
      emailOff:
        'Dieser Server verschickt keine E-Mails, daher sind Links für eine einzelne Person nicht verfügbar.',
      blocked: 'Von dieser Person kannst du keine Videos hinzufügen.',
    },
    anonymousLinks: {
      pro: 'Anonyme Links gibt es mit Pro.',
      tooMany: 'Du hast {{max}} anonyme Links. Lösche zuerst einen davon.',
      notFound: 'Diesen Link gibt es nicht, oder er funktioniert nicht mehr.',
      nameNeeded:
        'Dein Name verrät deinen Nutzernamen. Wähle einen Namen für diesen Link.',
      nameNamesNickname:
        'Dieser Name verrät deinen Nutzernamen. Wähle einen anderen.',
    },
    appTokens: {
      scope: 'Das kann die Browsererweiterung nicht.',
      invalid: 'Die Erweiterung ist nicht mehr verbunden. Verbinde sie erneut.',
      code: 'Der Verbindungscode ist abgelaufen oder falsch. Verbinde die Erweiterung noch einmal.',
      redirect: 'Das sieht nicht nach der tapeshelf-Erweiterung aus.',
      notFound: 'Diese Verbindung gibt es nicht.',
    },
    chat: {
      notFriends:
        'Schreiben kannst du nur Freunden: Ihr müsst euch gegenseitig hinzufügen.',
      unavailable: 'Diese Person kann keine Nachrichten empfangen.',
      emptyMessage: 'Schreib etwas oder häng ein Video an.',
      videoNotAttachable:
        'Dieses Video lässt sich nicht anhängen. Wähle ein fertiges Video, das auf deiner Seite sichtbar ist.',
      selfMessage: 'Du kannst dir nicht selbst schreiben.',
      notFound: 'Diese Unterhaltung gibt es nicht.',
    },
    reports: {
      self: 'Dich selbst oder deine eigenen Videos kannst du nicht melden.',
    },
    support: {
      notFound: 'Diese Anfrage wurde nicht gefunden.',
      tooMany:
        'Du hast {{count}} offene Anfragen. Warte auf eine Antwort zu einer davon oder markiere eine als gelöst.',
      closed:
        'Diese Anfrage ist geschlossen. Wenn das Problem noch besteht, stell bitte eine neue.',
      empty: 'Schreib eine Nachricht oder füge ein Bild hinzu.',
      tooManyFiles: 'Bis zu {{count}} Bilder pro Nachricht.',
      badImage:
        'Dieses Bild konnte nicht gelesen werden. PNG, JPG oder WebP, bis 10 MB.',
      notYourVideo:
        'Du kannst nur ein Video anhängen, das du selbst hochgeladen hast.',
      notRated:
        'Eine Anfrage kann bewertet werden, sobald sie gelöst oder geschlossen ist.',
    },
    site: {
      legalNotFound:
        'Der Betreiber dieser Website hat dieses Dokument nicht veröffentlicht.',
    },
    account: {
      confirmMismatch: 'Gib zur Bestätigung deinen Nutzernamen genau so ein.',
      deleted: 'Dieses Konto wurde gelöscht.',
    },
    billing: {
      disabled: 'Auf diesem Server gibt es keine Zahlungen.',
      unavailable:
        'Zahlungen sind gerade nicht verfügbar. Bitte versuch es später noch einmal.',
      signature: 'Die Signatur stimmt nicht.',
      noSubscription: 'Du hast kein Abo.',
    },
    downloads: {
      limitReached:
        'Du hast alle {{limit}} Downloads für diesen Monat verbraucht. Der nächste ist am {{date}} möglich.',
      busy: 'Ein anderer Download läuft noch. Warte, bis er fertig ist, und versuch es dann noch einmal.',
      ticketInvalid:
        'Dieser Download-Link ist abgelaufen. Starte den Download auf der Videoseite neu.',
      range: 'Diesen Teil der Datei gibt es nicht.',
    },
    admin: {
      selfAction: 'Das kannst du mit deinem eigenen Konto nicht tun.',
      adminTarget: 'Entferne zuerst die Admin-Rolle.',
      notInTrash: 'Dieses Video ist nicht im Papierkorb.',
      purged: 'Dieses Video wurde schon aus dem Speicher gelöscht.',
      authorDeleted:
        'Der Autor hat sein Konto gelöscht, deshalb lässt sich das Video nicht wiederherstellen.',
      alreadyProcessed: 'Dieses Video ist schon verarbeitet.',
      tierUntilPast: 'Das Enddatum muss in der Zukunft liegen.',
      tiersDisabled: 'Auf diesem Server gibt es keine Tarife.',
      reportClosed: 'Diese Meldung wurde schon bearbeitet.',
      reportAction: 'Diese Aktion passt nicht zur Meldung.',
      noEmail: 'Dieses Konto hat keine E-Mail-Adresse.',
      viewAsReadOnly:
        'Du siehst die Website als anderer Nutzer: Hier lässt sich nichts ändern.',
    },
    categories: {
      exists: 'Du hast schon eine Kategorie mit diesem Namen.',
      tooMany: 'Du kannst bis zu {{max}} Kategorien haben.',
    },
    uploads: {
      fileTooLarge: 'Die Datei ist größer als das Limit von {{max}}.',
      quotaExceeded:
        'Nicht genug Speicherplatz: {{used}} von {{quota}} sind schon belegt.',
      notFound: 'Diesen Upload gibt es nicht.',
      notActive:
        'Dieser Upload ist schon abgeschlossen oder wurde abgebrochen.',
      expired: 'Dieser Upload ist abgelaufen. Bitte starte ihn neu.',
      incomplete:
        'Teile der Datei fehlen oder sind beschädigt. Bitte lade sie noch einmal hoch.',
      sizeMismatch: 'Die hochgeladene Datei hat nicht die angekündigte Größe.',
      extensionDailyLimit:
        'Du hast heute schon {{limit}} Videos über die Erweiterung gespeichert, das ist das Maximum. Der Zähler beginnt um Mitternacht (UTC) von vorn.',
    },
    videos: {
      deleteInAdminPanel:
        'Videos anderer Leute löschst du im Adminbereich: Der Autor erfährt dort die Regel und deinen Hinweis.',
      notFound: 'Dieses Video gibt es nicht.',
      notReady: 'Das Video wird noch verarbeitet.',
      categoryNotFound: 'Diese Kategorie gibt es nicht.',
      stackNotFound: 'Diesen Stapel gibt es nicht.',
      stackTooSmall: 'Ein Stapel braucht mindestens zwei Videos.',
      stackCategories:
        'Die Videos eines Stapels haben eine gemeinsame Kategorie: Wähle sie zuerst.',
      frameNotFound: 'Dieses Bild gibt es nicht.',
      timestampOutOfRange: 'Dieser Zeitpunkt liegt hinter dem Ende des Videos.',
      notWatchable: 'Du hast keinen Zugriff auf dieses Video.',
      playbackTokenInvalid:
        'Der Wiedergabelink ist abgelaufen. Bitte lade die Seite neu.',
      downloadNotAllowed: 'Dieses Video darf nicht heruntergeladen werden.',
      alreadyInCollection: 'Dieses Video ist schon in deiner Sammlung.',
      cannotAddToCollection:
        'Dieses Video kann nicht zu deiner Sammlung hinzugefügt werden.',
      cannotHide: 'Dieses Video ist nicht in deinem Regal.',
      ownVideoRename:
        'Dein eigenes Video benennst du in seinem Bearbeitungsformular um, und zwar für alle.',
    },
  },
  editor: {
    copySuffix: '(bearbeitet)',
  },
  notifications: {
    failReason: {
      corrupted: 'die Datei ist beschädigt oder kein Video',
      noVideoStream: 'die Datei hat keine Videospur',
      zeroDuration: 'das Video hat keine Länge',
      tooLong: 'Videos über 12 Stunden werden nicht unterstützt',
      tooLarge: 'Bilder über 4096 px werden nicht unterstützt',
      fpsTooHigh: 'Bildraten über 60 fps werden nicht unterstützt',
      tooManyStreams: 'die Datei hat zu viele Spuren',
      transcodeFailed: 'das Video konnte nicht konvertiert werden',
      blocked:
        'diese Datei wurde wegen eines Regelverstoßes entfernt und kann nicht erneut hochgeladen werden',
      internal:
        'Die Verarbeitung ist fehlgeschlagen. Bitte lade das Video noch einmal hoch',
    },
  },
  mail: {
    notifications: {
      guest: 'Ein Gast',
      anonymous: 'Anonym',
      manage: 'Welche Benachrichtigungen du bekommst, änderst du hier: {{url}}',
      unsubscribe: 'Solche E-Mails abbestellen: {{url}}',
      andMore_one: ' und {{count}} weiteres',
      andMore_other: ' und {{count}} weitere',
      REQUEST_RECEIVED: {
        subject: '{{name}} fragt „{{title}}“ an',
        title: 'Neue Videoanfrage',
        body_one:
          '{{name}} möchte, dass du „{{title}}“ teilst. Teile es kostenlos, lehne ab oder schlag einen Tausch vor.',
        body_other:
          '{{name}} möchte, dass du {{count}} Videos teilst, darunter „{{title}}“. Teile sie kostenlos, lehne ab oder schlag einen Tausch vor.',
        message: 'Nachricht: „{{message}}“',
        offered_one:
          'Im Gegenzug bietet die Person {{count}} eigenes Video an.',
        offered_other:
          'Im Gegenzug bietet die Person {{count}} eigene Videos an.',
        button: 'Anfrage öffnen',
      },
      OFFER_RECEIVED: {
        subject: '{{name}} hat dir ein Angebot gemacht',
        title: 'Gegenangebot erhalten',
        body: '{{name}} hat einen Tausch vorgeschlagen (Runde {{round}}). Nimm ihn an, lehne ab oder mach ein eigenes Angebot.',
        bodyDeal:
          '{{name}} bietet „{{gives}}“{{givesMore}} für dein „{{wants}}“{{wantsMore}}. Nimm an, lehne ab oder mach ein eigenes Angebot.',
        message: 'Nachricht: „{{message}}“',
        button: 'Verlauf öffnen',
      },
      REQUEST_SHARED: {
        subject: '{{name}} hat „{{title}}“ mit dir geteilt',
        title: 'Mit dir geteilt',
        body_one:
          '{{name}} hat „{{title}}“ kostenlos mit dir geteilt. Es ist jetzt in deiner Sammlung.',
        body_other:
          '{{name}} hat {{count}} Videos kostenlos mit dir geteilt, darunter „{{title}}“. Sie sind jetzt in deiner Sammlung.',
        button: 'Ansehen, was du bekommen hast',
      },
      EXCHANGE_COMPLETED: {
        subject: 'Tausch mit {{name}} abgeschlossen',
        title: 'Tausch abgeschlossen',
        body: 'Dein Tausch mit {{name}} ist erledigt: Du hast {{received}} bekommen und {{given}} gegeben. Was du bekommen hast, ist jetzt in deiner Sammlung.',
        button: 'Ansehen, was du bekommen hast',
      },
      REQUEST_DECLINED: {
        subject: '{{name}} hat die Anfrage für „{{title}}“ abgelehnt',
        title: 'Anfrage abgelehnt',
        body: '{{name}} hat abgelehnt. {{comment}}',
        again_one: 'Du kannst es in {{count}} Tag wieder anfragen.',
        again_other: 'Du kannst es in {{count}} Tagen wieder anfragen.',
        button: 'Anfrage öffnen',
      },
      REQUEST_CANCELLED: {
        subject: '{{name}} hat die Anfrage für „{{title}}“ zurückgezogen',
        title: 'Anfrage zurückgezogen',
        body: '{{name}} hat die Anfrage für „{{title}}“ zurückgezogen.',
        button: 'Anfrage öffnen',
      },
      REQUEST_INVALIDATED: {
        subject: 'Die Anfrage für „{{title}}“ hat sich geändert',
        title: 'Anfrage vom System aktualisiert',
        body: 'Ein Video aus der Anfrage für „{{title}}“ ist nicht mehr verfügbar, deshalb wurde die Verhandlung angepasst.',
        bodyClosed:
          'Die Anfrage für „{{title}}“ wurde geschlossen: Das andere Konto ist nicht mehr verfügbar.',
        bodyExpired:
          'Der Deal mit einem Gast für „{{title}}“ ist abgelaufen: Drei Tage lang hat niemand reagiert. Die Videos des Gastes wurden gelöscht.',
        button: 'Anfrage öffnen',
      },
      NEW_FOLLOWER: {
        subject: 'Neuer Follower: {{name}}',
        title: 'Neuer Follower',
        body: '{{name}} folgt jetzt deiner Sammlung. Füg {{name}} ebenfalls hinzu, dann seid ihr Freunde und könnt euch schreiben.',
        button: 'Seite öffnen',
      },
      FRIEND_ACCEPTED: {
        subject: 'Du und {{name}} seid jetzt Freunde',
        title: 'Neuer Freund',
        body: 'Du und {{name}} folgt euch jetzt gegenseitig. Ihr könnt euch Nachrichten und Videos schicken.',
        button: 'Seite öffnen',
      },
      FOLLOWED_NEW_VIDEO: {
        subject: 'Neues Video von {{name}}: „{{title}}“',
        title: 'Neues Video von {{name}}',
        body: '{{name}} hat ein neues Video hinzugefügt: „{{title}}“.',
        bodyPrivate:
          '{{name}} hat ein neues privates Video hinzugefügt: „{{title}}“. Du kannst es anfragen.',
        button: 'Video öffnen',
      },
      NEW_MESSAGE: {
        subject: 'Neue Nachricht von {{name}}',
        title: 'Neue Nachricht',
        body: '{{name}}: „{{preview}}“',
        bodyVideo: '{{name}} hat dir im Chat ein Video geschickt.',
        button: 'Chat öffnen',
      },
      VIDEO_PROCESSED: {
        subject: '„{{title}}“ ist fertig',
        title: 'Dein Video ist fertig',
        body: '„{{title}}“ wurde verarbeitet und kann jetzt angesehen werden.',
        button: 'Video öffnen',
      },
      VIDEO_FAILED: {
        subject: '„{{title}}“ konnte nicht verarbeitet werden',
        title: 'Verarbeitung fehlgeschlagen',
        body: '„{{title}}“ konnte nicht verarbeitet werden: {{reason}}. Du kannst die Datei noch einmal hochladen.',
        button: 'Meine Seite öffnen',
      },
      VIDEO_REMOVED: {
        subject: '„{{title}}“ wurde vom Autor entfernt',
        title: 'Ein Video ist aus deiner Sammlung verschwunden',
        body: '{{author}} hat „{{title}}“ gelöscht. Es war in deiner Sammlung und ist jetzt für niemanden mehr verfügbar.',
        button: 'Benachrichtigungen öffnen',
      },
      REPORT_RESOLVED: {
        subject: 'Deine Meldung wurde geprüft',
        title: 'Meldung geprüft',
        bodyVideo:
          'Wir haben deine Meldung zu „{{title}}“ geprüft und Maßnahmen ergriffen. Danke, dass du hilfst, {{site}} sicher zu halten.',
        bodyUser:
          'Wir haben deine Meldung zu {{title}} geprüft und Maßnahmen ergriffen. Danke, dass du hilfst, {{site}} sicher zu halten.',
        bodyVideoNone:
          'Wir haben deine Meldung zu „{{title}}“ geprüft und keinen Regelverstoß gefunden.',
        bodyUserNone:
          'Wir haben deine Meldung zu {{title}} geprüft und keinen Regelverstoß gefunden.',
        button: 'Benachrichtigungen öffnen',
      },
      ADMIN_NOTICE: {
        subject: 'Eine Nachricht von {{site}}',
        title: 'Nachricht vom {{site}}-Team',
        body: '{{message}}',
        button: 'Benachrichtigungen öffnen',
      },
      VIDEO_EDITED: {
        subject: 'Dein Video „{{title}}“ wurde von einem Moderator bearbeitet',
        title: 'Video bearbeitet',
        body: 'Ein Moderator von {{site}} hat dein Video „{{title}}“ bearbeitet (zum Beispiel einen Teil unkenntlich gemacht). Der Link und alles andere bleiben gleich.',
        button: 'Video öffnen',
      },
      VIDEO_EDIT_FAILED: {
        subject: 'Die Bearbeitung von „{{title}}“ hat nicht geklappt',
        title: 'Bearbeitung nicht gespeichert',
        body: 'Die Bearbeitung deines Videos „{{title}}“ hat nicht geklappt. Das Video bleibt, wie es war; deine Änderungen sind im Editor gespeichert, du kannst es also noch einmal versuchen.',
        button: 'Editor öffnen',
      },
      SUPPORT_REPLY: {
        subject: 'Der Support hat auf deine Anfrage #{{number}} geantwortet',
        title: 'Antwort vom Support',
        body: '#{{number}} „{{subject}}“: {{preview}}',
        bodyResolved:
          'Der Support hat deine Anfrage #{{number}} „{{subject}}“ als gelöst markiert. Wenn das Problem noch besteht, stell eine neue Anfrage.',
        bodyResolvedWith:
          'Der Support hat auf deine Anfrage #{{number}} „{{subject}}“ geantwortet und sie als gelöst markiert: {{preview}}',
        button: 'Anfrage öffnen',
      },
      SUPPORT_TICKET: {
        subject: 'Support #{{number}}: {{subject}}',
        title: 'Supportanfrage #{{number}}',
        body: '@{{name}} bittet um Hilfe ({{topic}}): „{{subject}}“. {{preview}}',
        bodyReply:
          '@{{name}} hat erneut in #{{number}} „{{subject}}“ geschrieben: {{preview}}',
        button: 'Im Adminbereich öffnen',
      },
      LINK_OPENED: {
        subject: 'Dein temporärer Link wurde geöffnet',
        title: 'Link geöffnet',
        body_one:
          '@{{name}} hat deinen temporären Link mit „{{title}}“ geöffnet.',
        body_other:
          '@{{name}} hat deinen temporären Link mit {{count}} Videos geöffnet, darunter „{{title}}“.',
        bodyGuest_one:
          'Jemand hat deinen temporären Link mit „{{title}}“ geöffnet.',
        bodyGuest_other:
          'Jemand hat deinen temporären Link mit {{count}} Videos geöffnet, darunter „{{title}}“.',
        button: 'Meine Links öffnen',
      },
      LINK_SAVED: {
        subject: '@{{name}} hat Videos von deinem Link gespeichert',
        title: 'Von deinem Link gespeichert',
        body_one:
          '@{{name}} hat „{{title}}“ von deinem temporären Link ins eigene Regal gelegt.',
        body_other:
          '@{{name}} hat {{count}} Videos von deinem temporären Link ins eigene Regal gelegt, darunter „{{title}}“.',
        button: 'Meine Links öffnen',
      },
      VIDEO_TAKEN_DOWN: {
        subject: 'Dein Video „{{title}}“ wurde entfernt',
        title: 'Video entfernt',
        body: 'Wir haben dein Video „{{title}}“ von {{site}} entfernt: {{rule}}. Es ist für niemanden mehr verfügbar.',
        message: 'Hinweis der Moderation: {{message}}',
        appeal: 'Wenn du das für einen Fehler hältst, schreib an {{email}}.',
        button: 'Benachrichtigungen öffnen',
      },
      PLAN_EXPIRING: {
        subject: 'Dein Pro-Tarif endet am {{date}}',
        title: 'Pro endet bald',
        body: 'Dein Pro-Tarif auf {{site}} endet am {{date}} (UTC). Danach gelten für dein Regal die Limits von Free; gelöscht wird nichts.',
        page: 'Deine Seite ist gerade versteckt; wenn Pro endet, ist sie wieder für alle sichtbar.',
        anonymousLinks:
          'Wenn Pro endet, öffnen sich deine anonymen Links nicht mehr; mit Pro funktionieren sie wieder.',
        button: 'Tarif öffnen',
      },
      PLAN_PAYMENT_FAILED: {
        subject: 'Wir konnten deinen Pro-Tarif nicht verlängern',
        title: 'Zahlung fehlgeschlagen',
        body: 'Die Zahlung für deinen Pro-Tarif auf {{site}} ist nicht durchgegangen. Aktualisiere deine Zahlungsmethode bis zum {{date}} (UTC), sonst gelten für dein Regal die Limits von Free; gelöscht wird nichts.',
        button: 'Zahlungsmethode aktualisieren',
      },
      PLAN_EXPIRED: {
        subject: 'Dein Pro-Tarif ist abgelaufen',
        title: 'Pro ist abgelaufen',
        body: 'Für dein Regal auf {{site}} gelten jetzt die Limits von Free: {{file}} pro Video und {{shelf}} insgesamt. Es wurde nichts gelöscht.',
        bodyOverQuota:
          'Für dein Regal auf {{site}} gelten jetzt die Limits von Free: {{file}} pro Video und {{shelf}} insgesamt. In deinem Regal liegt mehr, deshalb sind neue Uploads pausiert, bis du Platz schaffst. Es wurde nichts gelöscht.',
        page: 'Deine Seite ist wieder für alle sichtbar: Verstecken kannst du sie mit Pro.',
        anonymousLinks:
          'Deine anonymen Links öffnen sich nicht mehr; mit Pro funktionieren sie wieder.',
        button: 'Tarif öffnen',
      },
    },
    supportTopics: {
      QUESTION: 'Frage',
      BUG: 'Fehlermeldung',
      ACCOUNT: 'Konto',
      IDEA: 'Idee',
    },
    takedownRules: {
      SPAM: 'Spam oder Werbung',
      ILLEGAL: 'illegale Inhalte',
      COPYRIGHT: 'Urheberrechtsverletzung',
      ABUSE: 'Beleidigung oder Belästigung',
      UNMARKED_ADULT: 'sensible Inhalte ohne Markierung',
      OTHER: 'ein Verstoß gegen die Regeln',
    },
    footer:
      'Du bekommst diese E-Mail, weil mit dieser Adresse ein Konto auf {{site}} erstellt wurde.',
    verify: {
      subject: 'Bestätige deine E-Mail-Adresse für {{site}}',
      title: 'Willkommen bei {{site}}, {{name}}!',
      body: 'Bestätige deine E-Mail-Adresse, um Uploads, Videoanfragen, Freunde und Nachrichten freizuschalten.',
      button: 'E-Mail-Adresse bestätigen',
      expires: 'Der Link gilt 24 Stunden.',
    },
    reset: {
      subject: 'Setze dein Passwort für {{site}} zurück',
      title: 'Passwort zurücksetzen',
      body: 'Hallo {{name}}, jemand (hoffentlich du) möchte das Passwort für dein Konto auf {{site}} zurücksetzen.',
      button: 'Neues Passwort festlegen',
      expires:
        'Der Link gilt 1 Stunde. Wenn du das nicht angefordert hast, kannst du diese E-Mail ignorieren.',
    },
    guestDeal: {
      button: 'Deal öffnen',
      footer:
        'Du bekommst diese E-Mail, weil du diese Adresse auf einer Deal-Seite von {{site}} eingegeben hast. Es wurde kein Konto erstellt.',
      saved: {
        subject: 'Dein Deal mit {{name}}',
        title: 'Heb diese E-Mail auf',
        body: 'Mit diesem Button kommst du von jedem Gerät zurück zu deinem Deal mit {{name}}. Wenn {{name}} antwortet, schreiben wir dir hierher.',
      },
      offer: {
        subject: '{{name}} hat auf dein Angebot geantwortet',
        title: 'Ein neues Angebot',
        body: '{{name}} hat einen anderen Tausch vorgeschlagen. Nimm ihn an, antworte mit einem eigenen Angebot oder lehne ab. Der Deal wartet noch drei Tage.',
      },
      accepted: {
        subject: 'Der Tausch mit {{name}} ist erledigt',
        title: 'Der Tausch ist erledigt',
        body: 'Die Videos, die du bekommen hast, kannst du 7 Tage lang auf der Deal-Seite ansehen und herunterladen. Melde dich dort an oder erstelle ein Konto, um sie dauerhaft zu behalten.',
      },
      shared: {
        subject: '{{name}} hat die Videos mit dir geteilt',
        title: 'Mit dir geteilt',
        body: '{{name}} hat dir die Videos gegeben, ohne deine zu nehmen; deine Videos wurden von unseren Servern gelöscht. Deine neuen Videos kannst du 7 Tage lang auf der Deal-Seite ansehen und herunterladen.',
      },
      declined: {
        subject: '{{name}} hat den Tausch abgelehnt',
        title: 'Der Tausch wurde abgelehnt',
        body: 'Der Deal ist vorbei. Deine Videos wurden sofort von unseren Servern gelöscht; niemand hat sie bekommen.',
      },
      closed: {
        subject: 'Der Deal mit {{name}} ist geschlossen',
        title: 'Der Deal ist geschlossen',
        body: 'Der Deal konnte nicht weitergehen (ein Video ist nicht mehr da, oder das Konto wurde geschlossen). Deine Videos wurden sofort von unseren Servern gelöscht; niemand hat sie bekommen.',
      },
      expired: {
        subject: 'Der Deal mit {{name}} ist abgelaufen',
        title: 'Der Deal ist abgelaufen',
        body: 'Drei Tage lang hat niemand reagiert, deshalb ist der Deal beendet. Deine Videos wurden sofort von unseren Servern gelöscht; niemand hat sie bekommen.',
      },
    },
    twoFactor: {
      button: 'Sicherheitseinstellungen öffnen',
      notYou:
        'Wenn du das nicht warst, ändere sofort dein Passwort und schreib uns.',
      on: {
        subject: 'Die zweistufige Anmeldung ist an',
        title: 'Die zweistufige Anmeldung ist an',
        body: 'Hallo {{name}}, wenn du dich mit Passwort bei deinem Konto auf {{site}} anmeldest, wird jetzt auch der zweite Schritt abgefragt. Auf anderen Geräten wurdest du abgemeldet.',
      },
      off: {
        subject: 'Die zweistufige Anmeldung ist aus',
        title: 'Die zweistufige Anmeldung ist aus',
        body: 'Hallo {{name}}, bei der Anmeldung in deinem Konto auf {{site}} wird der zweite Schritt nicht mehr abgefragt.',
      },
      reset: {
        subject: 'Die zweistufige Anmeldung wurde zurückgesetzt',
        title: 'Die zweistufige Anmeldung wurde zurückgesetzt',
        body: 'Hallo {{name}}, auf deine Bitte hat ein Admin von {{site}} die zweistufige Anmeldung für dein Konto ausgeschaltet. In den Sicherheitseinstellungen kannst du sie wieder einschalten.',
      },
      recoveryUsed: {
        subject: 'Ein Wiederherstellungscode wurde benutzt',
        title: 'Ein Wiederherstellungscode wurde benutzt',
        body: 'Hallo {{name}}, gerade wurde ein Wiederherstellungscode deines Kontos auf {{site}} benutzt. Übrige Codes: {{left}}.',
      },
    },
    links: {
      footer:
        'Du bekommst diese E-Mail, weil @{{username}} auf {{site}} Videos an diese Adresse geschickt hat.',
      invite: {
        subject: '@{{username}} teilt Videos mit dir',
        title: '{{name}} teilt Videos mit dir',
        body_one:
          '@{{username}} hat dir auf {{site}} ein Video geschickt: „{{title}}“.',
        body_other:
          '@{{username}} hat dir auf {{site}} {{count}} Videos geschickt, darunter „{{title}}“.',
        how: 'Sieh sie dir an und lade sie herunter, bevor der Link abläuft: Er gilt bis {{date}} (UTC). Zum Öffnen forderst du einen Code an, der an diese Adresse geht.',
        button: 'Videos öffnen',
      },
      code: {
        subject: 'Code {{code}} zum Öffnen der Videos',
        title: 'Dein Code: {{code}}',
        body: 'Gib ihn auf der Seite des temporären Links von @{{username}} ein.',
        expires:
          'Der Code gilt 15 Minuten. Wenn du ihn nicht angefordert hast, ignoriere diese E-Mail.',
      },
    },
  },
} as const;
