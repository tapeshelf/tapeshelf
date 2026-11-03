export const fr = {
  errors: {
    internal:
      'Un problème est survenu de notre côté. Veuillez réessayer plus tard.',
    generic: 'La requête n’a pas pu aboutir.',
    badRequest: 'La requête n’est pas valide.',
    validation: 'Certains champs ne sont pas valides.',
    notFound: 'Introuvable.',
    conflict:
      'Cette action ne correspond plus à l’état actuel. Actualisez la page et réessayez.',
    payloadTooLarge: 'La requête est trop volumineuse.',
    tooManyRequests: 'Trop de requêtes. Merci de patienter un peu.',
    unauthorized: 'Vous devez vous connecter pour faire cela.',
    forbidden: 'Vous n’avez pas l’autorisation de faire cela.',
    auth: {
      captchaRequired: 'Veuillez confirmer que vous n’êtes pas un robot.',
      captchaFailed: 'La vérification a échoué. Veuillez réessayer.',
      captchaUnavailable:
        'La vérification est indisponible pour le moment. Veuillez réessayer plus tard.',
      invalidCredentials: 'Adresse e-mail ou mot de passe incorrect.',
      registrationClosed:
        'Les inscriptions sont fermées ici. Pour obtenir un compte, demandez à la personne qui gère ce site.',
      emailTaken: 'Un compte existe déjà avec cette adresse e-mail.',
      usernameTaken: 'Ce nom d’utilisateur est déjà pris.',
      usernameInvalid:
        'Un nom d’utilisateur compte 3 à 30 caractères : lettres minuscules, chiffres et tirets bas.',
      usernameReserved: 'Ce nom d’utilisateur est réservé.',
      usernameChangeTooSoon_one:
        'Vous pourrez changer à nouveau de nom d’utilisateur dans {{count}} jour.',
      usernameChangeTooSoon_many:
        'Vous pourrez changer à nouveau de nom d’utilisateur dans {{count}} jours.',
      usernameChangeTooSoon_other:
        'Vous pourrez changer à nouveau de nom d’utilisateur dans {{count}} jours.',
      passwordWeak:
        'Le mot de passe doit compter au moins 8 caractères, dont une lettre et un chiffre.',
      tokenInvalid: 'Ce lien n’est pas valide ou a déjà été utilisé.',
      tokenExpired: 'Ce lien a expiré. Demandez-en un nouveau.',
      emailNotVerified: 'Confirmez d’abord votre adresse e-mail.',
      emailAlreadyVerified: 'Votre adresse e-mail est déjà confirmée.',
      accountBanned: 'Ce compte a été suspendu.',
      sessionExpired: 'Votre session a expiré. Veuillez vous reconnecter.',
      tooManyAttempts_one:
        'Trop de tentatives de connexion. Réessayez dans {{count}} minute.',
      tooManyAttempts_many:
        'Trop de tentatives de connexion. Réessayez dans {{count}} minutes.',
      tooManyAttempts_other:
        'Trop de tentatives de connexion. Réessayez dans {{count}} minutes.',
      googleNotConfigured: 'La connexion avec Google n’est pas disponible.',
      googleFailed: 'La connexion avec Google a échoué. Veuillez réessayer.',
      googleSignupExpired:
        'La session d’inscription a expiré. Veuillez recommencer.',
      wrongPassword: 'Le mot de passe actuel est incorrect.',
      csrf: 'La requête a été bloquée pour des raisons de sécurité. Rechargez la page et réessayez.',
      twoFactorLogin:
        'Saisissez le code de votre application d’authentification.',
      adminGoogle:
        'Les administrateurs se connectent avec leur mot de passe et la deuxième étape, pas avec Google.',
      googleLinkTwoFactor:
        'Cette adresse e-mail appartient à un compte protégé par la connexion en deux étapes. Connectez-vous avec son mot de passe.',
    },
    twoFactor: {
      required:
        'L’administration exige la connexion en deux étapes : activez-la dans Paramètres → Sécurité.',
      confirm: 'Confirmez d’abord votre identité avec la deuxième étape.',
      invalidCode: 'Ce code ne correspond pas. Vérifiez-le et réessayez.',
      expired:
        'La connexion a pris trop de temps. Saisissez à nouveau votre mot de passe.',
      setupExpired:
        'La configuration a pris trop de temps. Veuillez recommencer.',
      needsPassword:
        'La connexion en deux étapes protège un mot de passe. Définissez d’abord un mot de passe.',
      admin:
        'Un administrateur ne peut pas se connecter sans la deuxième étape.',
      appExists: 'Une application d’authentification est déjà configurée.',
      passkeyInvalid: 'La clé d’accès n’a pas répondu. Veuillez réessayer.',
      passkeyLimit: 'Vous avez déjà 10 clés d’accès.',
      passkeyNotFound: 'Cette clé d’accès n’existe plus.',
      noPasskey: 'Ce compte n’a pas de clé d’accès.',
      off: 'La connexion en deux étapes est désactivée.',
    },
    users: {
      notFound: 'Cet utilisateur n’existe pas.',
      pageHidingNotAllowed: 'Masquer sa page est réservé à Pro.',
      invalidImage:
        'Ce fichier n’est pas une image prise en charge (JPEG, PNG, WebP ou GIF).',
    },
    exchange: {
      notFound: 'Cette demande n’existe pas.',
      notAllowed: 'Vous ne pouvez pas faire cela avec cette demande.',
      offerChanged:
        'La proposition a changé entre-temps. Relisez l’échange et réessayez.',
      videoBeingEdited:
        'Une vidéo de cet échange est en cours de montage par son auteur. Réessayez quand elle sera prête.',
      nothingToRequest:
        'Aucune des vidéos sélectionnées ne peut être demandée.',
      hintTooEarly:
        'Vous pourrez masquer cette aide après quelques affichages de plus.',
      selfRequest: 'Vous ne pouvez pas demander vos propres vidéos.',
      invalidOffer:
        'Une proposition doit contenir au moins une vidéo de chaque côté, toutes disponibles pour leurs propriétaires.',
      blocked: 'Vous ne pouvez pas envoyer de demandes à cet utilisateur.',
      alreadyBlocked: 'Cet utilisateur est déjà bloqué.',
      selfBlock: 'Vous ne pouvez pas vous bloquer vous-même.',
    },
    social: {
      selfFollow: 'Vous ne pouvez pas vous suivre vous-même.',
      followNotAllowed: 'Vous ne pouvez pas ajouter cet utilisateur en ami.',
    },
    editor: {
      invalid:
        'Ce montage ne peut pas être enregistré : vérifiez ses moments et ses zones.',
      nothing: 'Rien n’a changé.',
      inProgress:
        'Cette vidéo est déjà en cours de montage. Attendez la fin ou annulez-le.',
      notReady: 'La vidéo pourra être montée une fois traitée.',
      proOnly: 'L’éditeur vidéo est réservé à Pro.',
      copyOwnOnly:
        'Seules vos propres vidéos peuvent être enregistrées en copie.',
    },
    invites: {
      notFound: 'Ce lien d’invitation n’existe pas.',
      expired: 'Cette invitation a expiré. Demandez un nouveau lien.',
      usedUp:
        'Cette invitation a déjà servi autant de fois que prévu. Demandez un nouveau lien.',
      own: 'C’est votre propre invitation : envoyez-la à quelqu’un.',
    },
    deals: {
      notFound:
        'Cet échange est introuvable (ou ce navigateur n’est pas celui où il a commencé).',
      closed: 'Cet échange est terminé.',
      linkNotFound: 'Ce lien d’échange ne fonctionne plus.',
      linkVideos:
        'Pour un lien d’échange, choisissez vos propres vidéos prêtes (50 au maximum).',
      guestsOff:
        'Cette personne n’accepte les échanges qu’avec des utilisateurs inscrits.',
      uploadsMax: 'Un échange accepte jusqu’à {{max}} de vos vidéos.',
      videoInOffer:
        'Cette vidéo fait partie de la proposition en cours : modifiez d’abord la proposition.',
      nothingOffered: 'Importez au moins une de vos vidéos à proposer.',
      tooMany:
        'Vous avez {{max}} échanges en cours. Terminez-en un avant d’en commencer un autre.',
    },
    links: {
      notFound: 'Ce lien n’existe pas ou ne fonctionne plus.',
      passwordPro: 'Un mot de passe sur un lien est réservé à Pro.',
      tooMany:
        'Vous avez {{max}} liens encore valides. Révoquez-en quelques-uns d’abord.',
      videoNotAllowed:
        'Seules vos vidéos importées et les vidéos que vous avez reçues peuvent être envoyées par lien, à condition d’être prêtes et non supprimées.',
      locked: 'Saisissez d’abord le mot de passe ou le code reçu par e-mail.',
      wrongPassword: 'Mot de passe incorrect.',
      wrongCode: 'Le code est incorrect ou a expiré. Demandez-en un nouveau.',
      codeTooSoon:
        'Un code vient d’être envoyé. Vous pourrez en demander un autre dans une minute.',
      codeLimit: 'Trop de codes pour ce lien. Réessayez dans une heure.',
      noEmail: 'Ce lien n’est pas destiné à une adresse e-mail précise.',
      blocked: 'Vous ne pouvez pas ajouter de vidéos de cette personne.',
    },
    anonymousLinks: {
      pro: 'Les liens anonymes sont réservés à Pro.',
      tooMany: 'Vous avez {{max}} liens anonymes. Supprimez-en un d’abord.',
      notFound: 'Ce lien n’existe pas ou ne fonctionne plus.',
      nameNeeded:
        'Votre nom révèle votre nom d’utilisateur. Choisissez un nom pour ce lien.',
      nameNamesNickname:
        'Ce nom révèle votre nom d’utilisateur. Choisissez-en un autre.',
    },
    appTokens: {
      scope: 'L’extension de navigateur ne peut pas faire cela.',
      invalid: 'L’extension n’est plus connectée. Connectez-la de nouveau.',
      code: 'Le code de connexion a expiré ou est incorrect. Réessayez de connecter l’extension.',
      redirect: 'Ceci ne ressemble pas à l’extension tapeshelf.',
      notFound: 'Cette connexion n’existe pas.',
    },
    chat: {
      notFriends:
        'Vous ne pouvez écrire qu’à vos amis : chacun doit avoir ajouté l’autre.',
      unavailable: 'Cet utilisateur ne peut pas recevoir de messages.',
      emptyMessage: 'Écrivez quelque chose ou joignez une vidéo.',
      videoNotAttachable:
        'Cette vidéo ne peut pas être jointe. Choisissez une vidéo prête et visible sur votre page.',
      selfMessage: 'Vous ne pouvez pas vous écrire à vous-même.',
      notFound: 'Cette conversation n’existe pas.',
    },
    reports: {
      self: 'Vous ne pouvez pas vous signaler vous-même ni signaler vos propres vidéos.',
    },
    support: {
      notFound: 'Cette demande est introuvable.',
      tooMany:
        'Vous avez {{count}} demandes ouvertes. Attendez la réponse à l’une d’elles, ou marquez-en une comme résolue.',
      closed:
        'Cette demande est fermée. Si le problème persiste, créez-en une nouvelle.',
      empty: 'Écrivez un message ou ajoutez une image.',
      tooManyFiles: '{{count}} images au maximum par message.',
      badImage:
        'Cette image n’a pas pu être lue. PNG, JPG ou WebP, jusqu’à 10 Mo.',
      notYourVideo:
        'Vous ne pouvez joindre qu’une vidéo que vous avez importée vous-même.',
      notRated: 'Une demande peut être évaluée une fois résolue ou fermée.',
    },
    site: {
      legalNotFound: 'L’exploitant de ce site n’a pas publié ce document.',
    },
    account: {
      confirmMismatch:
        'Saisissez exactement votre nom d’utilisateur pour confirmer.',
      deleted: 'Ce compte a été supprimé.',
    },
    billing: {
      disabled: 'Ce serveur ne gère pas de paiements.',
      unavailable:
        'Les paiements sont indisponibles pour le moment. Veuillez réessayer plus tard.',
      signature: 'La signature ne correspond pas.',
      noSubscription: 'Vous n’avez pas d’abonnement.',
    },
    downloads: {
      limitReached:
        'Vous avez utilisé vos {{limit}} téléchargements de ce mois. Le prochain sera possible le {{date}}.',
      busy: 'Un autre téléchargement est en cours. Attendez qu’il se termine, puis réessayez.',
      ticketInvalid:
        'Ce lien de téléchargement a expiré. Relancez le téléchargement depuis la page de la vidéo.',
      range: 'Cette partie du fichier n’existe pas.',
    },
    admin: {
      selfAction: 'Vous ne pouvez pas faire cela sur votre propre compte.',
      adminTarget: 'Retirez d’abord le rôle d’administrateur.',
      notInTrash: 'Cette vidéo n’est pas dans la corbeille.',
      purged: 'Cette vidéo a déjà été effacée du stockage.',
      authorDeleted:
        'L’auteur a supprimé son compte : la vidéo ne peut pas être restaurée.',
      alreadyProcessed: 'Cette vidéo est déjà traitée.',
      tierUntilPast: 'La date de fin doit être dans le futur.',
      tiersDisabled: 'Ce serveur ne gère pas de formules.',
      reportClosed: 'Ce signalement a déjà été traité.',
      reportAction: 'Cette action ne correspond pas au signalement.',
      noEmail: 'Ce compte n’a pas d’adresse e-mail.',
      viewAsReadOnly:
        'Vous voyez le site en tant qu’un autre utilisateur : rien ne peut être modifié.',
    },
    categories: {
      exists: 'Vous avez déjà une catégorie portant ce nom.',
      tooMany: 'Vous pouvez avoir jusqu’à {{max}} catégories.',
    },
    uploads: {
      fileTooLarge: 'Le fichier dépasse la limite de {{max}}.',
      quotaExceeded:
        'Pas assez d’espace : {{used}} sur {{quota}} sont déjà utilisés.',
      notFound: 'Cet import n’existe pas.',
      notActive: 'Cet import est déjà terminé ou a été annulé.',
      expired: 'Cet import a expiré. Veuillez le relancer.',
      incomplete:
        'Des parties du fichier manquent ou sont endommagées. Veuillez relancer l’import.',
      sizeMismatch:
        'Le fichier importé ne correspond pas à la taille annoncée.',
      extensionDailyLimit:
        'Vous avez déjà enregistré {{limit}} vidéos avec l’extension aujourd’hui, le maximum autorisé. Le compteur repart à zéro à minuit (UTC).',
    },
    videos: {
      deleteInAdminPanel:
        'Supprimez les vidéos des autres depuis l’administration : l’auteur est informé de la règle enfreinte et de votre remarque.',
      notFound: 'Cette vidéo n’existe pas.',
      notReady: 'La vidéo est encore en cours de traitement.',
      categoryNotFound: 'Cette catégorie n’existe pas.',
      stackNotFound: 'Cette pile n’existe pas.',
      stackTooSmall: 'Une pile doit contenir au moins deux vidéos.',
      stackCategories:
        'Les vidéos d’une pile partagent une seule catégorie : choisissez-la d’abord.',
      frameNotFound: 'Cette image n’existe pas.',
      timestampOutOfRange: 'Ce moment se situe après la fin de la vidéo.',
      notWatchable: 'Vous n’avez pas accès à cette vidéo.',
      playbackTokenInvalid:
        'Le lien de lecture a expiré. Veuillez recharger la page.',
      downloadNotAllowed:
        'Le téléchargement de cette vidéo n’est pas autorisé.',
      alreadyInCollection: 'Cette vidéo est déjà dans votre collection.',
      cannotAddToCollection:
        'Cette vidéo ne peut pas être ajoutée à votre collection.',
      cannotHide: 'Cette vidéo n’est pas sur votre étagère.',
      ownVideoRename:
        'Votre propre vidéo se renomme dans son formulaire de modification, et pour tout le monde.',
    },
  },
  editor: {
    copySuffix: '(montage)',
  },
  notifications: {
    failReason: {
      corrupted: 'le fichier est endommagé ou n’est pas une vidéo',
      noVideoStream: 'le fichier ne contient pas de piste vidéo',
      zeroDuration: 'la vidéo n’a pas de durée',
      tooLong: 'les vidéos de plus de 12 heures ne sont pas prises en charge',
      tooLarge: 'les images de plus de 4096 px ne sont pas prises en charge',
      fpsTooHigh:
        'les fréquences au-delà de 60 i/s ne sont pas prises en charge',
      tooManyStreams: 'le fichier contient trop de flux',
      transcodeFailed: 'la vidéo n’a pas pu être convertie',
      blocked:
        'ce fichier a été retiré pour non-respect des règles et ne peut plus être importé',
      internal: 'Le traitement a échoué. Essayez de l’importer à nouveau',
    },
  },
  mail: {
    notifications: {
      guest: 'Un invité',
      anonymous: 'Anonyme',
      manage: 'Choisir les notifications que vous recevez : {{url}}',
      unsubscribe: 'Ne plus recevoir ce type d’e-mail : {{url}}',
      andMore_one: ' et {{count}} autre',
      andMore_many: ' et {{count}} autres',
      andMore_other: ' et {{count}} autres',
      REQUEST_RECEIVED: {
        subject: '{{name}} demande « {{title}} »',
        title: 'Nouvelle demande de vidéo',
        body_one:
          '{{name}} aimerait que vous partagiez « {{title}} ». Partagez-la gratuitement, refusez ou proposez un échange.',
        body_many:
          '{{name}} aimerait que vous partagiez {{count}} vidéos, à commencer par « {{title}} ». Partagez-les gratuitement, refusez ou proposez un échange.',
        body_other:
          '{{name}} aimerait que vous partagiez {{count}} vidéos, à commencer par « {{title}} ». Partagez-les gratuitement, refusez ou proposez un échange.',
        message: 'Son message : « {{message}} »',
        offered_one: 'En échange, {{count}} de ses vidéos vous est proposée.',
        offered_many:
          'En échange, {{count}} de ses vidéos vous sont proposées.',
        offered_other:
          'En échange, {{count}} de ses vidéos vous sont proposées.',
        button: 'Ouvrir la demande',
      },
      OFFER_RECEIVED: {
        subject: '{{name}} vous a fait une proposition',
        title: 'Contre-proposition reçue',
        body: '{{name}} a proposé un échange (tour {{round}}). Acceptez-le, refusez ou faites votre propre proposition.',
        bodyDeal:
          '{{name}} propose « {{gives}} »{{givesMore}} contre votre « {{wants}} »{{wantsMore}}. Acceptez, refusez ou faites votre propre proposition.',
        message: 'Son message : « {{message}} »',
        button: 'Ouvrir l’échange',
      },
      REQUEST_SHARED: {
        subject: '{{name}} a partagé « {{title}} » avec vous',
        title: 'Partagé avec vous',
        body_one:
          '{{name}} a partagé gratuitement « {{title}} » avec vous. La vidéo est maintenant dans votre collection.',
        body_many:
          '{{name}} a partagé gratuitement {{count}} vidéos avec vous, à commencer par « {{title}} ». Elles sont maintenant dans votre collection.',
        body_other:
          '{{name}} a partagé gratuitement {{count}} vidéos avec vous, à commencer par « {{title}} ». Elles sont maintenant dans votre collection.',
        button: 'Voir ce que vous avez reçu',
      },
      EXCHANGE_COMPLETED: {
        subject: 'Échange avec {{name}} conclu',
        title: 'Échange conclu',
        body: 'Votre échange avec {{name}} est conclu : vous avez reçu {{received}} et donné {{given}}. Ce que vous avez reçu est maintenant dans votre collection.',
        button: 'Voir ce que vous avez reçu',
      },
      REQUEST_DECLINED: {
        subject: '{{name}} a refusé la demande pour « {{title}} »',
        title: 'Demande refusée',
        body: '{{name}} a refusé. {{comment}}',
        again_one: 'Vous pourrez la refaire dans {{count}} jour.',
        again_many: 'Vous pourrez la refaire dans {{count}} jours.',
        again_other: 'Vous pourrez la refaire dans {{count}} jours.',
        button: 'Ouvrir la demande',
      },
      REQUEST_CANCELLED: {
        subject: '{{name}} a retiré sa demande pour « {{title}} »',
        title: 'Demande retirée',
        body: '{{name}} a annulé sa demande pour « {{title}} ».',
        button: 'Ouvrir la demande',
      },
      REQUEST_INVALIDATED: {
        subject: 'La demande pour « {{title}} » a changé',
        title: 'Demande mise à jour par le système',
        body: 'Une vidéo concernée par la demande pour « {{title}} » n’est plus disponible : la négociation a donc été mise à jour.',
        bodyClosed:
          'La demande pour « {{title}} » a été clôturée : l’autre compte n’est plus disponible.',
        bodyExpired:
          'L’échange avec un invité pour « {{title}} » a expiré : personne n’a répondu pendant trois jours. Les vidéos de l’invité ont été supprimées.',
        button: 'Ouvrir la demande',
      },
      NEW_FOLLOWER: {
        subject: 'Nouvel abonné : {{name}}',
        title: 'Nouvel abonné',
        body: '{{name}} suit désormais votre collection. Ajoutez cette personne en retour pour devenir amis et pouvoir vous écrire.',
        button: 'Ouvrir sa page',
      },
      FRIEND_ACCEPTED: {
        subject: '{{name}} et vous êtes maintenant amis',
        title: 'Nouvel ami',
        body: '{{name}} et vous vous suivez mutuellement. Vous pouvez maintenant vous envoyer des messages et des vidéos.',
        button: 'Ouvrir sa page',
      },
      FOLLOWED_NEW_VIDEO: {
        subject: 'Nouvelle vidéo de {{name}} : « {{title}} »',
        title: 'Nouvelle vidéo de {{name}}',
        body: '{{name}} a ajouté une nouvelle vidéo, « {{title}} ».',
        bodyPrivate:
          '{{name}} a ajouté une nouvelle vidéo privée, « {{title}} ». Vous pouvez demander à la recevoir.',
        button: 'Ouvrir la vidéo',
      },
      NEW_MESSAGE: {
        subject: 'Nouveau message de {{name}}',
        title: 'Nouveau message',
        body: '{{name}} : « {{preview}} »',
        bodyVideo: '{{name}} vous a envoyé une vidéo dans la conversation.',
        button: 'Ouvrir la conversation',
      },
      VIDEO_PROCESSED: {
        subject: 'Votre vidéo « {{title}} » est prête',
        title: 'Votre vidéo est prête',
        body: 'La vidéo « {{title}} » a été traitée : vous pouvez maintenant la regarder.',
        button: 'Ouvrir la vidéo',
      },
      VIDEO_FAILED: {
        subject: 'La vidéo « {{title}} » n’a pas pu être traitée',
        title: 'Échec du traitement',
        body: 'La vidéo « {{title}} » n’a pas pu être traitée : {{reason}}. Vous pouvez importer le fichier à nouveau.',
        button: 'Ouvrir ma page',
      },
      VIDEO_REMOVED: {
        subject: 'L’auteur a supprimé « {{title}} »',
        title: 'Une vidéo a quitté votre collection',
        body: '{{author}} a supprimé « {{title}} », qui était dans votre collection. Elle n’est plus accessible à personne.',
        button: 'Ouvrir les notifications',
      },
      REPORT_RESOLVED: {
        subject: 'Votre signalement a été examiné',
        title: 'Signalement examiné',
        bodyVideo:
          'Nous avons examiné votre signalement concernant « {{title}} » et pris des mesures. Merci de contribuer à la sécurité de {{site}}.',
        bodyUser:
          'Nous avons examiné votre signalement concernant {{title}} et pris des mesures. Merci de contribuer à la sécurité de {{site}}.',
        bodyVideoNone:
          'Nous avons examiné votre signalement concernant « {{title}} » et n’avons constaté aucune infraction aux règles.',
        bodyUserNone:
          'Nous avons examiné votre signalement concernant {{title}} et n’avons constaté aucune infraction aux règles.',
        button: 'Ouvrir les notifications',
      },
      ADMIN_NOTICE: {
        subject: 'Un message de {{site}}',
        title: 'Message de l’équipe {{site}}',
        body: '{{message}}',
        button: 'Ouvrir les notifications',
      },
      VIDEO_EDITED: {
        subject: 'Un modérateur a modifié votre vidéo « {{title}} »',
        title: 'Vidéo modifiée',
        body: 'Un modérateur de {{site}} a modifié votre vidéo « {{title}} » (par exemple en floutant une partie de l’image). Le lien et tout le reste ne changent pas.',
        button: 'Ouvrir la vidéo',
      },
      VIDEO_EDIT_FAILED: {
        subject: 'Le montage de « {{title}} » n’a pas abouti',
        title: 'Montage non enregistré',
        body: 'Le montage de votre vidéo « {{title}} » n’a pas pu être réalisé. La vidéo reste telle quelle ; l’éditeur garde vos modifications, vous pouvez donc réessayer.',
        button: 'Ouvrir l’éditeur',
      },
      SUPPORT_REPLY: {
        subject: 'L’assistance a répondu à votre demande n° {{number}}',
        title: 'Réponse de l’assistance',
        body: 'N° {{number}} « {{subject}} » : {{preview}}',
        bodyResolved:
          'L’assistance a marqué votre demande n° {{number}} « {{subject}} » comme résolue. Si le problème persiste, créez une nouvelle demande.',
        bodyResolvedWith:
          'L’assistance a répondu à votre demande n° {{number}} « {{subject}} » et l’a marquée comme résolue : {{preview}}',
        button: 'Ouvrir la demande',
      },
      SUPPORT_TICKET: {
        subject: 'Assistance n° {{number}} : {{subject}}',
        title: 'Demande d’assistance n° {{number}}',
        body: '@{{name}} demande de l’aide ({{topic}}) : « {{subject}} ». {{preview}}',
        bodyReply:
          '@{{name}} a écrit à nouveau dans la demande n° {{number}} « {{subject}} » : {{preview}}',
        button: 'Ouvrir dans l’administration',
      },
      LINK_OPENED: {
        subject: 'Votre lien temporaire a été ouvert',
        title: 'Lien ouvert',
        body_one:
          '@{{name}} a ouvert votre lien temporaire avec « {{title}} ».',
        body_many:
          '@{{name}} a ouvert votre lien temporaire avec {{count}} vidéos, à commencer par « {{title}} ».',
        body_other:
          '@{{name}} a ouvert votre lien temporaire avec {{count}} vidéos, à commencer par « {{title}} ».',
        bodyGuest_one:
          'Quelqu’un a ouvert votre lien temporaire avec « {{title}} ».',
        bodyGuest_many:
          'Quelqu’un a ouvert votre lien temporaire avec {{count}} vidéos, à commencer par « {{title}} ».',
        bodyGuest_other:
          'Quelqu’un a ouvert votre lien temporaire avec {{count}} vidéos, à commencer par « {{title}} ».',
        button: 'Ouvrir mes liens',
      },
      LINK_SAVED: {
        subject: '@{{name}} a enregistré des vidéos de votre lien',
        title: 'Enregistré depuis votre lien',
        body_one:
          '@{{name}} a mis « {{title}} », reçue par votre lien temporaire, sur son étagère.',
        body_many:
          '@{{name}} a mis {{count}} vidéos de votre lien temporaire sur son étagère, à commencer par « {{title}} ».',
        body_other:
          '@{{name}} a mis {{count}} vidéos de votre lien temporaire sur son étagère, à commencer par « {{title}} ».',
        button: 'Ouvrir mes liens',
      },
      VIDEO_TAKEN_DOWN: {
        subject: 'Votre vidéo « {{title}} » a été retirée',
        title: 'Vidéo retirée',
        body: 'Nous avons retiré votre vidéo « {{title}} » de {{site}} : {{rule}}. Elle n’est plus accessible à personne.',
        message: 'Remarque du modérateur : {{message}}',
        appeal:
          'Si vous pensez qu’il s’agit d’une erreur, écrivez à {{email}}.',
        button: 'Ouvrir les notifications',
      },
      PLAN_EXPIRING: {
        subject: 'Votre formule Pro prend fin le {{date}}',
        title: 'Pro se termine bientôt',
        body: 'Votre formule Pro sur {{site}} prend fin le {{date}} (UTC). Ensuite, votre étagère passe aux limites de Free ; rien n’est supprimé.',
        page: 'Votre page est actuellement masquée ; quand Pro prendra fin, tout le monde pourra de nouveau la voir.',
        anonymousLinks:
          'Quand Pro prendra fin, vos liens anonymes cesseront de s’ouvrir ; ils fonctionneront de nouveau dès que vous aurez Pro.',
        button: 'Voir votre formule',
      },
      PLAN_PAYMENT_FAILED: {
        subject: 'Nous n’avons pas pu renouveler votre formule Pro',
        title: 'Échec du paiement',
        body: 'Le paiement de votre formule Pro sur {{site}} n’est pas passé. Mettez à jour votre moyen de paiement d’ici le {{date}} (UTC), sinon votre étagère passera aux limites de Free ; rien n’est supprimé.',
        button: 'Mettre à jour le moyen de paiement',
      },
      PLAN_EXPIRED: {
        subject: 'Votre formule Pro a pris fin',
        title: 'Pro a pris fin',
        body: 'Votre étagère sur {{site}} a désormais les limites de Free : {{file}} par vidéo et {{shelf}} au total. Rien n’a été supprimé.',
        bodyOverQuota:
          'Votre étagère sur {{site}} a désormais les limites de Free : {{file}} par vidéo et {{shelf}} au total. Votre étagère contient davantage, les nouveaux imports sont donc suspendus jusqu’à ce que vous libériez de l’espace. Rien n’a été supprimé.',
        page: 'Votre page est de nouveau visible pour tous : la masquer est réservé à Pro.',
        anonymousLinks:
          'Vos liens anonymes ne s’ouvrent plus ; ils fonctionneront de nouveau dès que vous aurez Pro.',
        button: 'Voir votre formule',
      },
    },
    supportTopics: {
      QUESTION: 'question',
      BUG: 'signalement de bug',
      ACCOUNT: 'compte',
      IDEA: 'idée',
    },
    takedownRules: {
      SPAM: 'spam ou publicité',
      ILLEGAL: 'contenu illégal',
      COPYRIGHT: 'atteinte au droit d’auteur',
      ABUSE: 'insultes ou harcèlement',
      UNMARKED_ADULT: 'contenu sensible sans la mention',
      OTHER: 'infraction aux règles',
    },
    footer:
      'Vous recevez cet e-mail parce qu’un compte {{site}} a été créé avec cette adresse.',
    verify: {
      subject: 'Confirmez votre adresse e-mail pour {{site}}',
      title: 'Bienvenue sur {{site}}, {{name}} !',
      body: 'Confirmez votre adresse e-mail pour pouvoir importer des vidéos, faire des demandes, ajouter des amis et envoyer des messages.',
      button: 'Confirmer l’adresse e-mail',
      expires: 'Le lien est valable 24 heures.',
    },
    reset: {
      subject: 'Réinitialisation de votre mot de passe {{site}}',
      title: 'Réinitialisation du mot de passe',
      body: 'Bonjour {{name}}, quelqu’un (vous, espérons-le) a demandé à réinitialiser le mot de passe de votre compte {{site}}.',
      button: 'Choisir un nouveau mot de passe',
      expires:
        'Le lien est valable 1 heure. Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.',
    },
    guestDeal: {
      button: 'Ouvrir l’échange',
      footer:
        'Vous recevez cet e-mail parce que vous avez saisi cette adresse sur la page d’un échange sur {{site}}. Aucun compte n’a été créé.',
      saved: {
        subject: 'Votre échange avec {{name}}',
        title: 'Gardez cet e-mail',
        body: 'Ce bouton vous ramène à votre échange avec {{name}} depuis n’importe quel appareil. Quand {{name}} répondra, nous vous écrirons ici.',
      },
      offer: {
        subject: '{{name}} a répondu à votre proposition',
        title: 'Une nouvelle proposition',
        body: '{{name}} a proposé un autre échange. Acceptez-le, répondez par votre propre proposition ou refusez : l’échange attend encore trois jours.',
      },
      accepted: {
        subject: 'L’échange avec {{name}} est conclu',
        title: 'L’échange est conclu',
        body: 'Vous pouvez regarder et télécharger les vidéos reçues sur la page de l’échange pendant 7 jours. Connectez-vous ou créez un compte depuis cette page pour les garder pour de bon.',
      },
      shared: {
        subject: '{{name}} a partagé les vidéos avec vous',
        title: 'Partagé avec vous',
        body: '{{name}} vous a donné les vidéos sans prendre les vôtres ; vos vidéos ont été supprimées de nos serveurs. Regardez et téléchargez celles que vous avez reçues sur la page de l’échange pendant 7 jours.',
      },
      declined: {
        subject: '{{name}} a refusé l’échange',
        title: 'L’échange a été refusé',
        body: 'L’échange est terminé. Vos vidéos ont été supprimées de nos serveurs immédiatement ; personne ne les a reçues.',
      },
      closed: {
        subject: 'L’échange avec {{name}} est clôturé',
        title: 'L’échange est clôturé',
        body: 'L’échange ne pouvait pas continuer (une vidéo n’existe plus ou le compte a été fermé). Vos vidéos ont été supprimées de nos serveurs immédiatement ; personne ne les a reçues.',
      },
      expired: {
        subject: 'L’échange avec {{name}} a expiré',
        title: 'L’échange a expiré',
        body: 'Personne n’a répondu pendant trois jours, l’échange a donc pris fin. Vos vidéos ont été supprimées de nos serveurs immédiatement ; personne ne les a reçues.',
      },
    },
    twoFactor: {
      button: 'Ouvrir les paramètres de sécurité',
      notYou:
        'Si ce n’était pas vous, changez immédiatement votre mot de passe et écrivez-nous.',
      on: {
        subject: 'La connexion en deux étapes est activée',
        title: 'La connexion en deux étapes est activée',
        body: 'Bonjour {{name}}, la connexion par mot de passe à votre compte {{site}} demande désormais aussi la deuxième étape. Les autres appareils ont été déconnectés.',
      },
      off: {
        subject: 'La connexion en deux étapes est désactivée',
        title: 'La connexion en deux étapes est désactivée',
        body: 'Bonjour {{name}}, la connexion à votre compte {{site}} ne demande plus la deuxième étape.',
      },
      reset: {
        subject: 'La connexion en deux étapes a été réinitialisée',
        title: 'La connexion en deux étapes a été réinitialisée',
        body: 'Bonjour {{name}}, à votre demande, un administrateur de {{site}} a désactivé la connexion en deux étapes de votre compte. Vous pouvez la réactiver dans les paramètres de sécurité.',
      },
      recoveryUsed: {
        subject: 'Un code de secours a été utilisé',
        title: 'Un code de secours a été utilisé',
        body: 'Bonjour {{name}}, un code de secours de votre compte {{site}} vient d’être utilisé. Codes restants : {{left}}.',
      },
    },
    links: {
      footer:
        'Vous recevez cet e-mail parce que @{{username}} a envoyé des vidéos à cette adresse sur {{site}}.',
      invite: {
        subject: '@{{username}} partage des vidéos avec vous',
        title: '{{name}} partage des vidéos avec vous',
        body_one:
          '@{{username}} vous a envoyé une vidéo sur {{site}} : « {{title}} ».',
        body_many:
          '@{{username}} vous a envoyé {{count}} vidéos sur {{site}}, à commencer par « {{title}} ».',
        body_other:
          '@{{username}} vous a envoyé {{count}} vidéos sur {{site}}, à commencer par « {{title}} ».',
        how: 'Regardez-les et téléchargez-les avant l’expiration du lien : il fonctionne jusqu’au {{date}} (UTC). Pour l’ouvrir, demandez un code : il arrivera à cette adresse.',
        button: 'Ouvrir les vidéos',
      },
      code: {
        subject: 'Code {{code}} pour ouvrir les vidéos',
        title: 'Votre code : {{code}}',
        body: 'Saisissez-le sur la page du lien temporaire de @{{username}}.',
        expires:
          'Le code est valable 15 minutes. Si vous ne l’avez pas demandé, ignorez cet e-mail.',
      },
    },
  },
};
