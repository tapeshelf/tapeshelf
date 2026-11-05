export const nl = {
  errors: {
    deviceUnknown: 'Deze telefoon is niet meer aangemeld. Open de app.',
    clientTooOld: 'Deze versie van de app is te oud voor deze server.',
    internal: 'Er ging bij ons iets mis. Probeer het later opnieuw.',
    generic: 'Het verzoek kon niet worden uitgevoerd.',
    badRequest: 'Het verzoek is ongeldig.',
    validation: 'Sommige velden zijn ongeldig.',
    notFound: 'Niet gevonden.',
    conflict:
      'Dit botst met de huidige stand van zaken. Vernieuw de pagina en probeer het opnieuw.',
    payloadTooLarge: 'Het verzoek is te groot.',
    tooManyRequests: 'Te veel verzoeken. Doe het even rustiger aan.',
    unauthorized: 'Daarvoor moet je ingelogd zijn.',
    forbidden: 'Daar heb je geen toestemming voor.',
    auth: {
      captchaRequired: 'Bevestig dat je een mens bent.',
      captchaFailed: 'De controle is mislukt. Probeer het opnieuw.',
      captchaUnavailable:
        'De controle is nu niet beschikbaar. Probeer het later opnieuw.',
      invalidCredentials: 'Verkeerd e-mailadres of wachtwoord.',
      registrationClosed:
        'Aanmelden is hier gesloten. Vraag voor een account de beheerder van deze site.',
      emailTaken: 'Er bestaat al een account met dit e-mailadres.',
      usernameTaken: 'Deze gebruikersnaam is al bezet.',
      usernameInvalid:
        'Een gebruikersnaam heeft 3–30 tekens: kleine letters, cijfers en underscores.',
      usernameReserved: 'Deze gebruikersnaam is gereserveerd.',
      usernameChangeTooSoon_one:
        'Je kunt je gebruikersnaam over {{count}} dag weer wijzigen.',
      usernameChangeTooSoon_other:
        'Je kunt je gebruikersnaam over {{count}} dagen weer wijzigen.',
      passwordWeak:
        'Het wachtwoord moet minstens 8 tekens hebben, met een letter en een cijfer.',
      tokenInvalid: 'Deze link is ongeldig of al gebruikt.',
      tokenExpired: 'Deze link is verlopen. Vraag een nieuwe aan.',
      emailNotVerified: 'Bevestig eerst je e-mailadres.',
      emailAlreadyVerified: 'Je e-mailadres is al bevestigd.',
      accountBanned: 'Dit account is geblokkeerd.',
      sessionExpired: 'Je sessie is verlopen. Log opnieuw in.',
      tooManyAttempts_one:
        'Te veel inlogpogingen. Probeer het over {{count}} minuut opnieuw.',
      tooManyAttempts_other:
        'Te veel inlogpogingen. Probeer het over {{count}} minuten opnieuw.',
      googleNotConfigured: 'Inloggen met Google is niet beschikbaar.',
      googleFailed: 'Inloggen met Google is mislukt. Probeer het opnieuw.',
      googleSignupExpired: 'De registratiesessie is verlopen. Begin opnieuw.',
      wrongPassword: 'Het huidige wachtwoord klopt niet.',
      csrf: 'Het verzoek is om veiligheidsredenen geblokkeerd. Laad de pagina opnieuw en probeer het nog eens.',
      twoFactorLogin: 'Vul de code uit je authenticator-app in.',
      adminGoogle:
        'Beheerders loggen in met hun wachtwoord en de tweede stap, niet met Google.',
      googleLinkTwoFactor:
        'Dit e-mailadres hoort bij een account met tweestapsverificatie. Log in met het wachtwoord van dat account.',
    },
    twoFactor: {
      required:
        'Voor het beheerpaneel is tweestapsverificatie nodig: zet die aan in Instellingen → Beveiliging.',
      confirm: 'Bevestig eerst met de tweede stap dat jij het bent.',
      invalidCode:
        'Deze code klopt niet. Controleer hem en probeer het opnieuw.',
      expired: 'Het inloggen duurde te lang. Vul je wachtwoord opnieuw in.',
      setupExpired: 'Het instellen duurde te lang. Begin opnieuw.',
      needsPassword:
        'Tweestapsverificatie beveiligt een wachtwoord. Stel eerst een wachtwoord in.',
      admin: 'Een beheerder kan niet inloggen zonder de tweede stap.',
      appExists: 'Er is al een authenticator-app ingesteld.',
      passkeyInvalid:
        'De toegangssleutel gaf geen antwoord. Probeer het opnieuw.',
      passkeyLimit: 'Je hebt al 10 toegangssleutels.',
      passkeyNotFound: 'Deze toegangssleutel bestaat niet meer.',
      noPasskey: 'Dit account heeft geen toegangssleutel.',
      off: 'Tweestapsverificatie staat uit.',
    },
    users: {
      notFound: 'Deze gebruiker bestaat niet.',
      pageHidingNotAllowed: 'Je pagina verbergen kan met Pro.',
      invalidImage:
        'Dit bestand is geen ondersteunde afbeelding (JPEG, PNG, WebP of GIF).',
    },
    exchange: {
      notFound: 'Dit verzoek bestaat niet.',
      notAllowed: 'Dat kun je met dit verzoek niet doen.',
      offerChanged:
        'Het aanbod is intussen gewijzigd. Bekijk het gesprek en probeer het opnieuw.',
      videoBeingEdited:
        'De maker bewerkt nu een video uit deze ruil. Probeer het opnieuw als die klaar is.',
      nothingToRequest: 'Geen van de gekozen video’s kan worden aangevraagd.',
      hintTooEarly:
        'Je kunt de uitleg verbergen nadat je hem nog een paar keer hebt gezien.',
      selfRequest: 'Je kunt je eigen video’s niet aanvragen.',
      invalidOffer:
        'Een aanbod heeft aan elke kant minstens één video nodig, en alle video’s moeten beschikbaar zijn voor hun eigenaar.',
      blocked: 'Je kunt deze gebruiker geen verzoeken sturen.',
      alreadyBlocked: 'Deze gebruiker is al geblokkeerd.',
      selfBlock: 'Je kunt jezelf niet blokkeren.',
    },
    social: {
      selfFollow: 'Je kunt jezelf niet volgen.',
      followNotAllowed: 'Je kunt deze gebruiker niet als vriend toevoegen.',
    },
    editor: {
      invalid:
        'Deze bewerking kan niet worden opgeslagen: controleer de tijden en gebieden.',
      nothing: 'Er is niets veranderd.',
      inProgress:
        'Deze video wordt al bewerkt. Wacht tot dat klaar is of annuleer het.',
      notReady: 'Je kunt de video bewerken zodra hij is verwerkt.',
      proOnly: 'De video-editor hoort bij Pro.',
      copyOwnOnly: 'Alleen je eigen video’s kun je als kopie opslaan.',
    },
    invites: {
      notFound: 'Deze uitnodigingslink bestaat niet.',
      expired: 'Deze uitnodiging is verlopen. Vraag om een nieuwe link.',
      usedUp:
        'Deze uitnodiging is al helemaal gebruikt. Vraag om een nieuwe link.',
      own: 'Dit is je eigen uitnodiging: stuur hem naar iemand anders.',
    },
    deals: {
      notFound:
        'Deze deal bestaat niet (of hij is in een andere browser begonnen).',
      closed: 'Deze deal is afgelopen.',
      linkNotFound: 'Deze ruillink werkt niet meer.',
      linkVideos:
        'Kies voor een ruillink je eigen video’s die klaar zijn (maximaal 50).',
      guestsOff: 'Deze persoon ruilt alleen met geregistreerde gebruikers.',
      uploadsMax: 'In een deal passen maximaal {{max}} video’s van jou.',
      videoInOffer:
        'Deze video zit in het aanbod dat nu op tafel ligt: pas eerst het aanbod aan.',
      nothingOffered: 'Upload minstens één eigen video om aan te bieden.',
      tooMany:
        'Je hebt {{max}} lopende deals. Rond er een af voordat je een nieuwe begint.',
    },
    links: {
      notFound: 'Deze link bestaat niet of werkt niet meer.',
      passwordPro: 'Een wachtwoord op een link hoort bij Pro.',
      tooMany:
        'Je hebt {{max}} links die nog werken. Trek er eerst een paar in.',
      videoNotAllowed:
        'Via een link kun je alleen je eigen uploads en video’s die je hebt gekregen versturen, als ze klaar zijn en niet verwijderd.',
      locked: 'Vul eerst het wachtwoord of de code uit de e-mail in.',
      wrongPassword: 'Verkeerd wachtwoord.',
      wrongCode: 'De code klopt niet of is verlopen. Vraag een nieuwe aan.',
      codeTooSoon:
        'Er is net een code verstuurd. Over een minuut kun je een nieuwe aanvragen.',
      codeLimit:
        'Te veel codes voor deze link. Probeer het over een uur opnieuw.',
      noEmail: 'Deze link is niet voor één bepaald e-mailadres.',
      emailOff:
        'Deze server verstuurt geen e-mail, dus links voor één persoon zijn niet beschikbaar.',
      blocked: 'Je kunt geen video’s van deze persoon toevoegen.',
    },
    anonymousLinks: {
      pro: 'Anonieme links horen bij Pro.',
      tooMany: 'Je hebt al {{max}} anonieme links. Verwijder er eerst een.',
      notFound: 'Deze link bestaat niet of werkt niet meer.',
      nameNeeded:
        'Je naam verraadt je gebruikersnaam. Kies een naam voor deze link.',
      nameNamesNickname:
        'Deze naam verraadt je gebruikersnaam. Kies een andere.',
    },
    appTokens: {
      scope: 'Dit kan de browserextensie niet.',
      invalid:
        'De extensie is niet meer gekoppeld. Koppel de extensie opnieuw.',
      code: 'De koppelcode is verlopen of klopt niet. Probeer opnieuw te koppelen.',
      redirect: 'Dit lijkt niet op de extensie van tapeshelf.',
      notFound: 'Deze koppeling bestaat niet.',
    },
    chat: {
      notFriends:
        'Je kunt alleen vrienden berichten sturen: jullie moeten elkaar allebei toevoegen.',
      unavailable: 'Deze gebruiker kan geen berichten ontvangen.',
      emptyMessage: 'Schrijf iets of voeg een video toe.',
      videoNotAttachable:
        'Deze video kan niet worden bijgevoegd. Kies een video die klaar is en op je pagina zichtbaar is.',
      selfMessage: 'Je kunt jezelf geen bericht sturen.',
      notFound: 'Dit gesprek bestaat niet.',
    },
    reports: {
      self: 'Je kunt jezelf of je eigen video’s niet melden.',
    },
    support: {
      notFound: 'Dit ticket is niet gevonden.',
      tooMany:
        'Je hebt {{count}} open tickets. Wacht op een antwoord op een van die tickets, of markeer er een als opgelost.',
      closed:
        'Dit ticket is gesloten. Is het probleem er nog? Maak dan een nieuw ticket.',
      empty: 'Schrijf een bericht of voeg een afbeelding toe.',
      tooManyFiles: 'Maximaal {{count}} afbeeldingen per bericht.',
      badImage:
        'Deze afbeelding kon niet worden gelezen. PNG, JPG of WebP, tot 10 MB.',
      notYourVideo:
        'Je kunt alleen een video bijvoegen die je zelf hebt geüpload.',
      notRated:
        'Je kunt een ticket beoordelen zodra het is opgelost of gesloten.',
    },
    site: {
      legalNotFound:
        'De beheerder van deze site heeft dit document niet gepubliceerd.',
    },
    account: {
      confirmMismatch: 'Typ je gebruikersnaam precies over om te bevestigen.',
      deleted: 'Dit account is verwijderd.',
    },
    billing: {
      disabled: 'Op deze server kun je niet betalen.',
      unavailable: 'Betalen is nu niet mogelijk. Probeer het later opnieuw.',
      signature: 'De handtekening klopt niet.',
      noSubscription: 'Je hebt geen abonnement.',
    },
    downloads: {
      limitReached:
        'Je hebt alle {{limit}} downloads van deze maand gebruikt. De volgende kan weer op {{date}}.',
      busy: 'Er loopt nog een andere download. Wacht tot die klaar is en probeer het dan opnieuw.',
      ticketInvalid:
        'Deze downloadlink is verlopen. Start de download opnieuw vanaf de videopagina.',
      range: 'Dit deel van het bestand bestaat niet.',
    },
    traffic: {
      limitReached:
        'Je hebt het dataverkeer van je abonnement voor deze maand opgebruikt. Het wordt aan het begin van volgende maand weer aangevuld.',
      sharerLimitReached:
        'Degene die deze video heeft gedeeld, heeft het dataverkeer van deze maand opgebruikt. Het wordt aan het begin van volgende maand weer aangevuld.',
    },
    admin: {
      selfAction: 'Dit kun je niet met je eigen account doen.',
      adminTarget: 'Haal eerst de beheerdersrol weg.',
      notInTrash: 'Deze video staat niet in de prullenbak.',
      purged: 'Deze video is al uit de opslag gewist.',
      authorDeleted:
        'De maker heeft het account verwijderd, dus de video kan niet worden teruggezet.',
      alreadyProcessed: 'Deze video is al verwerkt.',
      tierUntilPast: 'De einddatum moet in de toekomst liggen.',
      tiersDisabled: 'Op deze server zijn er geen abonnementen.',
      reportClosed: 'Deze melding is al afgehandeld.',
      reportAction: 'Deze actie past niet bij de melding.',
      noEmail: 'Dit account heeft geen e-mailadres.',
      viewAsReadOnly:
        'Je bekijkt de site als een andere gebruiker: je kunt niets wijzigen.',
    },
    categories: {
      exists: 'Je hebt al een categorie met deze naam.',
      tooMany: 'Je kunt maximaal {{max}} categorieën hebben.',
    },
    uploads: {
      fileTooLarge: 'Het bestand is groter dan de limiet van {{max}}.',
      quotaExceeded:
        'Niet genoeg opslagruimte: {{used}} van {{quota}} is al in gebruik.',
      notFound: 'Deze upload bestaat niet.',
      notActive: 'Deze upload is al klaar of geannuleerd.',
      expired: 'Deze upload is verlopen. Begin opnieuw.',
      incomplete:
        'Er ontbreken delen van het bestand of ze zijn beschadigd. Probeer de upload opnieuw.',
      sizeMismatch: 'Het geüploade bestand heeft niet de opgegeven grootte.',
      extensionDailyLimit:
        'Je hebt vandaag al het maximum aantal video’s via de extensie opgeslagen ({{limit}}). De telling begint om middernacht (UTC) opnieuw.',
    },
    videos: {
      deleteInAdminPanel:
        'Verwijder video’s van anderen in het beheerpaneel: de maker krijgt dan de regel en je toelichting te zien.',
      notFound: 'Deze video bestaat niet.',
      notReady: 'De video wordt nog verwerkt.',
      categoryNotFound: 'Deze categorie bestaat niet.',
      stackNotFound: 'Deze stapel bestaat niet.',
      stackTooSmall: 'Een stapel heeft minstens twee video’s nodig.',
      stackCategories:
        'De video’s in een stapel hebben samen één categorie: kies die eerst.',
      frameNotFound: 'Dit frame bestaat niet.',
      timestampOutOfRange: 'Dit tijdstip ligt na het einde van de video.',
      notWatchable: 'Je hebt geen toegang tot deze video.',
      playbackTokenInvalid:
        'De afspeellink is verlopen. Laad de pagina opnieuw.',
      downloadNotAllowed: 'Deze video mag niet worden gedownload.',
      alreadyInCollection: 'Deze video staat al in je verzameling.',
      cannotAddToCollection:
        'Deze video kan niet aan je verzameling worden toegevoegd.',
      cannotHide: 'Deze video staat niet op je plank.',
      ownVideoRename:
        'Je eigen video geef je een andere naam in het bewerkformulier, en dan voor iedereen.',
    },
  },
  editor: {
    copySuffix: '(bewerkt)',
  },
  notifications: {
    failReason: {
      corrupted: 'het bestand is beschadigd of is geen video',
      noVideoStream: 'het bestand heeft geen videospoor',
      zeroDuration: 'de video heeft geen lengte',
      tooLong: 'video’s langer dan 12 uur worden niet ondersteund',
      tooLarge: 'frames groter dan 4096 px worden niet ondersteund',
      fpsTooHigh: 'framerates boven 60 fps worden niet ondersteund',
      tooManyStreams: 'het bestand heeft te veel streams',
      transcodeFailed: 'de video kon niet worden geconverteerd',
      blocked:
        'dit bestand is verwijderd omdat het de regels overtrad en kan niet opnieuw worden geüpload',
      internal: 'Verwerken is mislukt. Probeer de video opnieuw te uploaden',
    },
  },
  mail: {
    notifications: {
      guest: 'Een gast',
      anonymous: 'Anoniem',
      manage: 'Kies welke meldingen je krijgt: {{url}}',
      unsubscribe: 'Stop met e-mails zoals deze: {{url}}',
      andMore_one: ' en nog {{count}}',
      andMore_other: ' en nog {{count}}',
      REQUEST_RECEIVED: {
        subject: '{{name}} vraagt om “{{title}}”',
        title: 'Nieuw verzoek om een video',
        body_one:
          '{{name}} zou graag willen dat je “{{title}}” deelt. Deel de video gratis, wijs het verzoek af of stel een ruil voor.',
        body_other:
          '{{name}} zou graag willen dat je {{count}} video’s deelt, te beginnen met “{{title}}”. Deel ze gratis, wijs het verzoek af of stel een ruil voor.',
        message: 'Bericht erbij: “{{message}}”',
        offered_one: 'In ruil biedt de ander {{count}} eigen video aan.',
        offered_other: 'In ruil biedt de ander {{count}} eigen video’s aan.',
        button: 'Verzoek openen',
      },
      OFFER_RECEIVED: {
        subject: '{{name}} heeft je een aanbod gedaan',
        title: 'Tegenbod ontvangen',
        body: '{{name}} heeft een ruil voorgesteld (ronde {{round}}). Accepteer het, wijs het af of doe zelf een aanbod.',
        bodyDeal:
          '{{name}} biedt “{{gives}}”{{givesMore}} voor jouw “{{wants}}”{{wantsMore}}. Accepteer het, wijs het af of doe zelf een aanbod.',
        message: 'Bericht erbij: “{{message}}”',
        button: 'Gesprek openen',
      },
      REQUEST_SHARED: {
        subject: '{{name}} heeft “{{title}}” met je gedeeld',
        title: 'Met je gedeeld',
        body_one:
          '{{name}} heeft “{{title}}” gratis met je gedeeld. De video staat nu in je verzameling.',
        body_other:
          '{{name}} heeft {{count}} video’s gratis met je gedeeld, te beginnen met “{{title}}”. Ze staan nu in je verzameling.',
        button: 'Bekijk wat je hebt gekregen',
      },
      EXCHANGE_COMPLETED: {
        subject: 'Ruil met {{name}} is rond',
        title: 'Ruil rond',
        body: 'Je ruil met {{name}} is rond: je kreeg {{received}} en gaf {{given}}. Wat je hebt gekregen, staat nu in je verzameling.',
        button: 'Bekijk wat je hebt gekregen',
      },
      REQUEST_DECLINED: {
        subject: '{{name}} heeft het verzoek om “{{title}}” afgewezen',
        title: 'Verzoek afgewezen',
        body: '{{name}} heeft nee gezegd. {{comment}}',
        again_one: 'Je kunt er over {{count}} dag opnieuw om vragen.',
        again_other: 'Je kunt er over {{count}} dagen opnieuw om vragen.',
        button: 'Verzoek openen',
      },
      REQUEST_CANCELLED: {
        subject: '{{name}} heeft het verzoek om “{{title}}” ingetrokken',
        title: 'Verzoek ingetrokken',
        body: '{{name}} heeft het verzoek om “{{title}}” geannuleerd.',
        button: 'Verzoek openen',
      },
      REQUEST_INVALIDATED: {
        subject: 'Het verzoek om “{{title}}” is gewijzigd',
        title: 'Verzoek bijgewerkt door het systeem',
        body: 'Een video uit het verzoek om “{{title}}” is niet meer beschikbaar, daarom is het gesprek bijgewerkt.',
        bodyClosed:
          'Het verzoek om “{{title}}” is gesloten: het andere account is niet meer beschikbaar.',
        bodyExpired:
          'De deal met een gast voor “{{title}}” is verlopen: drie dagen lang deed niemand een zet. De video’s van de gast zijn verwijderd.',
        button: 'Verzoek openen',
      },
      NEW_FOLLOWER: {
        subject: 'Nieuwe volger: {{name}}',
        title: 'Nieuwe volger',
        body: '{{name}} volgt nu je verzameling. Voeg {{name}} terug toe om vrienden te worden en elkaar berichten te sturen.',
        button: 'Pagina openen',
      },
      FRIEND_ACCEPTED: {
        subject: 'Jij en {{name}} zijn nu vrienden',
        title: 'Nieuwe vriend',
        body: 'Jij en {{name}} volgen elkaar nu. Jullie kunnen elkaar berichten en video’s sturen.',
        button: 'Pagina openen',
      },
      FOLLOWED_NEW_VIDEO: {
        subject: 'Nieuwe video van {{name}}: “{{title}}”',
        title: 'Nieuwe video van {{name}}',
        body: '{{name}} heeft een nieuwe video toegevoegd: “{{title}}”.',
        bodyPrivate:
          '{{name}} heeft een nieuwe privévideo toegevoegd: “{{title}}”. Je kunt vragen of {{name}} hem met je wil delen.',
        button: 'Video openen',
      },
      NEW_MESSAGE: {
        subject: 'Nieuw bericht van {{name}}',
        title: 'Nieuw bericht',
        body: '{{name}}: “{{preview}}”',
        bodyVideo: '{{name}} heeft je in de chat een video gestuurd.',
        button: 'Chat openen',
      },
      VIDEO_PROCESSED: {
        subject: '“{{title}}” is klaar',
        title: 'Je video is klaar',
        body: '“{{title}}” is verwerkt en je kunt hem nu bekijken.',
        button: 'Video openen',
      },
      VIDEO_FAILED: {
        subject: '“{{title}}” kon niet worden verwerkt',
        title: 'Verwerken mislukt',
        body: '“{{title}}” kon niet worden verwerkt: {{reason}}. Je kunt het bestand opnieuw uploaden.',
        button: 'Mijn pagina openen',
      },
      VIDEO_REMOVED: {
        subject: '“{{title}}” is door de maker verwijderd',
        title: 'Er is een video uit je verzameling verdwenen',
        body: '{{author}} heeft “{{title}}” verwijderd. De video stond in je verzameling en is nu voor niemand meer beschikbaar.',
        button: 'Meldingen openen',
      },
      REPORT_RESOLVED: {
        subject: 'Je melding is bekeken',
        title: 'Melding bekeken',
        bodyVideo:
          'We hebben je melding over “{{title}}” bekeken en maatregelen genomen. Bedankt dat je helpt {{site}} veilig te houden.',
        bodyUser:
          'We hebben je melding over {{title}} bekeken en maatregelen genomen. Bedankt dat je helpt {{site}} veilig te houden.',
        bodyVideoNone:
          'We hebben je melding over “{{title}}” bekeken en geen overtreding van de regels gevonden.',
        bodyUserNone:
          'We hebben je melding over {{title}} bekeken en geen overtreding van de regels gevonden.',
        button: 'Meldingen openen',
      },
      ADMIN_NOTICE: {
        subject: 'Een bericht van {{site}}',
        title: 'Bericht van het team van {{site}}',
        body: '{{message}}',
        button: 'Meldingen openen',
      },
      VIDEO_EDITED: {
        subject: 'Je video “{{title}}” is door een moderator bewerkt',
        title: 'Video bewerkt',
        body: 'Een moderator van {{site}} heeft je video “{{title}}” bewerkt (bijvoorbeeld een deel ervan vervaagd). De link en al het andere blijven hetzelfde.',
        button: 'Video openen',
      },
      VIDEO_EDIT_FAILED: {
        subject: 'De bewerking van “{{title}}” is niet gelukt',
        title: 'Bewerking niet opgeslagen',
        body: 'De bewerking van je video “{{title}}” is niet gelukt. De video blijft zoals hij was; de editor bewaart je wijzigingen, dus je kunt het opnieuw proberen.',
        button: 'Editor openen',
      },
      SUPPORT_REPLY: {
        subject: 'Support heeft geantwoord op je ticket #{{number}}',
        title: 'Support heeft geantwoord',
        body: '#{{number}} “{{subject}}”: {{preview}}',
        bodyResolved:
          'Support heeft je ticket #{{number}} “{{subject}}” als opgelost gemarkeerd. Is het probleem er nog? Maak dan een nieuw ticket.',
        bodyResolvedWith:
          'Support heeft geantwoord op je ticket #{{number}} “{{subject}}” en het als opgelost gemarkeerd: {{preview}}',
        button: 'Ticket openen',
      },
      SUPPORT_TICKET: {
        subject: 'Support #{{number}}: {{subject}}',
        title: 'Supportticket #{{number}}',
        body: '@{{name}} vraagt om hulp ({{topic}}): “{{subject}}”. {{preview}}',
        bodyReply:
          '@{{name}} schreef opnieuw in #{{number}} “{{subject}}”: {{preview}}',
        button: 'Openen in het beheerpaneel',
      },
      LINK_OPENED: {
        subject: 'Je tijdelijke link is geopend',
        title: 'Link geopend',
        body_one: '@{{name}} heeft je tijdelijke link met “{{title}}” geopend.',
        body_other:
          '@{{name}} heeft je tijdelijke link met {{count}} video’s geopend, te beginnen met “{{title}}”.',
        bodyGuest_one:
          'Iemand heeft je tijdelijke link met “{{title}}” geopend.',
        bodyGuest_other:
          'Iemand heeft je tijdelijke link met {{count}} video’s geopend, te beginnen met “{{title}}”.',
        button: 'Mijn links openen',
      },
      LINK_SAVED: {
        subject: '@{{name}} heeft video’s uit je link bewaard',
        title: 'Bewaard uit je link',
        body_one:
          '@{{name}} heeft “{{title}}” uit je tijdelijke link op de eigen plank gezet.',
        body_other:
          '@{{name}} heeft {{count}} video’s uit je tijdelijke link op de eigen plank gezet, te beginnen met “{{title}}”.',
        button: 'Mijn links openen',
      },
      VIDEO_TAKEN_DOWN: {
        subject: 'Je video “{{title}}” is verwijderd',
        title: 'Video verwijderd',
        body: 'We hebben je video “{{title}}” van {{site}} verwijderd: {{rule}}. Hij is voor niemand meer beschikbaar.',
        message: 'Toelichting van de moderator: {{message}}',
        appeal:
          'Denk je dat dit een vergissing is? Schrijf dan naar {{email}}.',
        button: 'Meldingen openen',
      },
      PLAN_EXPIRING: {
        subject: 'Je Pro-abonnement loopt af op {{date}}',
        title: 'Pro loopt bijna af',
        body: 'Je Pro-abonnement op {{site}} loopt af op {{date}} (UTC). Daarna gelden op je plank de limieten van Free; er wordt niets verwijderd.',
        page: 'Je pagina is nu verborgen; als Pro afloopt, kan iedereen hem weer zien.',
        anonymousLinks:
          'Als Pro afloopt, gaan je anonieme links niet meer open; ze werken weer zodra je opnieuw Pro hebt.',
        button: 'Je abonnement openen',
      },
      PLAN_PAYMENT_FAILED: {
        subject: 'We konden je Pro-abonnement niet verlengen',
        title: 'Betaling mislukt',
        body: 'De betaling voor je Pro-abonnement op {{site}} is niet gelukt. Werk je betaalmethode bij vóór {{date}} (UTC), anders gelden op je plank de limieten van Free; er wordt niets verwijderd.',
        button: 'Betaalmethode bijwerken',
      },
      PLAN_EXPIRED: {
        subject: 'Je Pro-abonnement is afgelopen',
        title: 'Pro is afgelopen',
        body: 'Op je plank op {{site}} gelden nu de limieten van Free: {{file}} per video en {{shelf}} in totaal. Er is niets verwijderd.',
        bodyOverQuota:
          'Op je plank op {{site}} gelden nu de limieten van Free: {{file}} per video en {{shelf}} in totaal. Er staat meer op je plank, dus nieuwe uploads liggen stil tot je ruimte vrijmaakt. Er is niets verwijderd.',
        page: 'Je pagina is weer voor iedereen zichtbaar: een pagina verbergen hoort bij Pro.',
        anonymousLinks:
          'Je anonieme links gaan niet meer open; ze werken weer zodra je opnieuw Pro hebt.',
        button: 'Je abonnement openen',
      },
      TRAFFIC_RUNNING_OUT: {
        subject: 'Je dataverkeer raakt op',
        title: 'Dataverkeer raakt op',
        body: 'Je hebt op {{site}} deze maand {{used}} van {{limit}} dataverkeer gebruikt. Als het op is, gaan je openbare video’s en links tot {{date}} (UTC) niet meer open voor anderen.',
        button: 'Je abonnement openen',
      },
      TRAFFIC_USED_UP: {
        subject: 'Het dataverkeer van deze maand is opgebruikt',
        title: 'Dataverkeer opgebruikt',
        body: 'Je dataverkeer op {{site}} voor deze maand ({{limit}}) is opgebruikt. Tot {{date}} (UTC) gaan je openbare video’s en links niet open voor anderen, en kun je geen video’s van anderen bekijken. Je eigen video’s bekijk je gewoon zoals altijd.',
        button: 'Je abonnement openen',
      },
    },
    supportTopics: {
      QUESTION: 'vraag',
      BUG: 'foutmelding',
      ACCOUNT: 'account',
      IDEA: 'idee',
    },
    takedownRules: {
      SPAM: 'spam of reclame',
      ILLEGAL: 'illegale inhoud',
      COPYRIGHT: 'schending van auteursrecht',
      ABUSE: 'beledigingen of intimidatie',
      UNMARKED_ADULT: 'gevoelige inhoud zonder markering',
      OTHER: 'een overtreding van de regels',
    },
    footer:
      'Je krijgt deze e-mail omdat er met dit adres een account op {{site}} is gemaakt.',
    verify: {
      subject: 'Bevestig je e-mailadres voor {{site}}',
      title: 'Welkom bij {{site}}, {{name}}!',
      body: 'Bevestig je e-mailadres, dan kun je uploaden, video’s aanvragen, vrienden toevoegen en berichten sturen.',
      button: 'E-mailadres bevestigen',
      expires: 'De link is 24 uur geldig.',
    },
    reset: {
      subject: 'Je wachtwoord voor {{site}} opnieuw instellen',
      title: 'Wachtwoord opnieuw instellen',
      body: 'Hoi {{name}}, iemand (hopelijk jij) heeft gevraagd om het wachtwoord van je account op {{site}} opnieuw in te stellen.',
      button: 'Nieuw wachtwoord instellen',
      expires:
        'De link is 1 uur geldig. Heb je dit niet aangevraagd? Dan kun je deze e-mail negeren.',
    },
    guestDeal: {
      button: 'Deal openen',
      footer:
        'Je krijgt deze e-mail omdat je dit adres hebt ingevuld op een dealpagina van {{site}}. Er is geen account gemaakt.',
      saved: {
        subject: 'Je deal met {{name}}',
        title: 'Bewaar deze e-mail',
        body: 'Met deze knop kom je vanaf elk apparaat terug bij je deal met {{name}}. Zodra {{name}} antwoordt, schrijven we je hier.',
      },
      offer: {
        subject: '{{name}} heeft op je aanbod geantwoord',
        title: 'Een nieuw aanbod',
        body: '{{name}} stelt een andere ruil voor. Accepteer die, antwoord met een eigen aanbod of wijs hem af. De deal wacht nog drie dagen.',
      },
      accepted: {
        subject: 'De ruil met {{name}} is rond',
        title: 'De ruil is rond',
        body: 'Op de dealpagina kun je de video’s die je hebt gekregen 7 dagen lang bekijken en downloaden. Log daar in of maak een account om ze voorgoed te houden.',
      },
      shared: {
        subject: '{{name}} heeft de video’s met je gedeeld',
        title: 'Met je gedeeld',
        body: '{{name}} heeft je de video’s gegeven zonder de jouwe te nemen; jouw video’s zijn van onze servers verwijderd. Op de dealpagina kun je wat je hebt gekregen 7 dagen lang bekijken en downloaden.',
      },
      declined: {
        subject: '{{name}} heeft de ruil afgewezen',
        title: 'De ruil is afgewezen',
        body: 'De deal is afgelopen. Je video’s zijn meteen van onze servers verwijderd; niemand heeft ze gekregen.',
      },
      closed: {
        subject: 'De deal met {{name}} is gesloten',
        title: 'De deal is gesloten',
        body: 'De deal kon niet verder (een video bestaat niet meer of het account is opgeheven). Je video’s zijn meteen van onze servers verwijderd; niemand heeft ze gekregen.',
      },
      expired: {
        subject: 'De deal met {{name}} is verlopen',
        title: 'De deal is verlopen',
        body: 'Drie dagen lang deed niemand een zet, dus de deal is afgelopen. Je video’s zijn meteen van onze servers verwijderd; niemand heeft ze gekregen.',
      },
    },
    twoFactor: {
      button: 'Beveiligingsinstellingen openen',
      notYou:
        'Was jij dit niet? Wijzig dan meteen je wachtwoord en schrijf ons.',
      on: {
        subject: 'Tweestapsverificatie staat aan',
        title: 'Tweestapsverificatie staat aan',
        body: 'Hoi {{name}}, als je met je wachtwoord inlogt op je account op {{site}}, wordt nu ook om de tweede stap gevraagd. Op andere apparaten ben je uitgelogd.',
      },
      off: {
        subject: 'Tweestapsverificatie staat uit',
        title: 'Tweestapsverificatie staat uit',
        body: 'Hoi {{name}}, bij het inloggen op je account op {{site}} wordt niet meer om de tweede stap gevraagd.',
      },
      reset: {
        subject: 'Tweestapsverificatie is gereset',
        title: 'Tweestapsverificatie is gereset',
        body: 'Hoi {{name}}, op jouw verzoek heeft een beheerder van {{site}} de tweestapsverificatie van je account uitgezet. Je kunt hem weer aanzetten in de beveiligingsinstellingen.',
      },
      recoveryUsed: {
        subject: 'Er is een herstelcode gebruikt',
        title: 'Er is een herstelcode gebruikt',
        body: 'Hoi {{name}}, er is zojuist een herstelcode van je account op {{site}} gebruikt. Codes over: {{left}}.',
      },
    },
    links: {
      footer:
        'Je krijgt deze e-mail omdat @{{username}} via {{site}} video’s naar dit adres heeft gestuurd.',
      invite: {
        subject: '@{{username}} deelt video’s met je',
        title: '{{name}} deelt video’s met je',
        body_one:
          '@{{username}} heeft je via {{site}} een video gestuurd: “{{title}}”.',
        body_other:
          '@{{username}} heeft je via {{site}} {{count}} video’s gestuurd, te beginnen met “{{title}}”.',
        how: 'Bekijk en download ze voordat de link verloopt: hij werkt tot {{date}} (UTC). Om hem te openen, vraag je een code aan; die komt naar dit adres.',
        button: 'Video’s openen',
      },
      code: {
        subject: 'Code {{code}} om de video’s te openen',
        title: 'Je code: {{code}}',
        body: 'Vul hem in op de pagina van de tijdelijke link van @{{username}}.',
        expires:
          'De code werkt 15 minuten. Heb je hem niet aangevraagd? Negeer deze e-mail dan.',
      },
    },
  },
} as const;
