export const es = {
  errors: {
    internal: 'Algo salió mal por nuestra parte. Inténtalo más tarde.',
    generic: 'No se pudo completar la solicitud.',
    badRequest: 'La solicitud no es válida.',
    validation: 'Algunos campos no son válidos.',
    notFound: 'No se encontró.',
    conflict:
      'Esto choca con el estado actual. Actualiza la página e inténtalo de nuevo.',
    payloadTooLarge: 'La solicitud es demasiado grande.',
    tooManyRequests: 'Demasiadas solicitudes. Ve un poco más despacio.',
    unauthorized: 'Tienes que iniciar sesión para hacer eso.',
    forbidden: 'No tienes permiso para hacer eso.',
    auth: {
      captchaRequired: 'Confirma que eres una persona.',
      captchaFailed: 'No se superó la verificación. Inténtalo de nuevo.',
      captchaUnavailable:
        'La verificación no está disponible ahora mismo. Inténtalo más tarde.',
      invalidCredentials: 'Correo o contraseña incorrectos.',
      registrationClosed:
        'El registro está cerrado aquí. Para tener una cuenta, pregunta a quien administra este sitio.',
      emailTaken: 'Ya existe una cuenta con este correo.',
      usernameTaken: 'Este nombre de usuario ya está en uso.',
      usernameInvalid:
        'Un nombre de usuario tiene de 3 a 30 caracteres: letras minúsculas, números y guiones bajos.',
      usernameReserved: 'Este nombre de usuario está reservado.',
      usernameChangeTooSoon_one:
        'Podrás volver a cambiar tu nombre de usuario dentro de {{count}} día.',
      usernameChangeTooSoon_many:
        'Podrás volver a cambiar tu nombre de usuario dentro de {{count}} de días.',
      usernameChangeTooSoon_other:
        'Podrás volver a cambiar tu nombre de usuario dentro de {{count}} días.',
      passwordWeak:
        'La contraseña debe tener al menos 8 caracteres, con al menos una letra y un número.',
      tokenInvalid: 'Este enlace no es válido o ya se usó.',
      tokenExpired: 'Este enlace caducó. Pide uno nuevo.',
      emailNotVerified: 'Primero confirma tu dirección de correo.',
      emailAlreadyVerified: 'Tu correo ya está confirmado.',
      accountBanned: 'Esta cuenta está suspendida.',
      sessionExpired: 'Tu sesión caducó. Vuelve a iniciar sesión.',
      tooManyAttempts_one:
        'Demasiados intentos de inicio de sesión. Inténtalo de nuevo dentro de {{count}} minuto.',
      tooManyAttempts_many:
        'Demasiados intentos de inicio de sesión. Inténtalo de nuevo dentro de {{count}} de minutos.',
      tooManyAttempts_other:
        'Demasiados intentos de inicio de sesión. Inténtalo de nuevo dentro de {{count}} minutos.',
      googleNotConfigured: 'El inicio de sesión con Google no está disponible.',
      googleFailed: 'No se pudo iniciar sesión con Google. Inténtalo de nuevo.',
      googleSignupExpired: 'La sesión de registro caducó. Vuelve a empezar.',
      wrongPassword: 'La contraseña actual no es correcta.',
      csrf: 'La solicitud se bloqueó por seguridad. Vuelve a cargar la página e inténtalo de nuevo.',
      twoFactorLogin: 'Escribe el código de tu app de autenticación.',
      adminGoogle:
        'Los administradores inician sesión con su contraseña y el segundo paso, no con Google.',
      googleLinkTwoFactor:
        'Este correo pertenece a una cuenta con verificación en dos pasos. Inicia sesión con su contraseña.',
    },
    twoFactor: {
      required:
        'El panel de administración requiere la verificación en dos pasos: actívala en Configuración → Seguridad.',
      confirm: 'Primero confirma que eres tú con el segundo paso.',
      invalidCode: 'Este código no es válido. Revísalo e inténtalo de nuevo.',
      expired:
        'El inicio de sesión tardó demasiado. Vuelve a escribir tu contraseña.',
      setupExpired: 'La configuración tardó demasiado. Vuelve a empezar.',
      needsPassword:
        'La verificación en dos pasos protege una contraseña. Primero crea una contraseña.',
      admin: 'Un administrador no puede iniciar sesión sin el segundo paso.',
      appExists: 'Ya hay una app de autenticación configurada.',
      passkeyInvalid: 'La llave de acceso no respondió. Inténtalo de nuevo.',
      passkeyLimit: 'Ya tienes 10 llaves de acceso.',
      passkeyNotFound: 'Esta llave de acceso ya no existe.',
      noPasskey: 'Esta cuenta no tiene ninguna llave de acceso.',
      off: 'La verificación en dos pasos está desactivada.',
    },
    users: {
      notFound: 'Este usuario no existe.',
      pageHidingNotAllowed: 'Ocultar la página es parte de Pro.',
      invalidImage:
        'Este archivo no es una imagen compatible (JPEG, PNG, WebP o GIF).',
    },
    exchange: {
      notFound: 'Esta solicitud no existe.',
      notAllowed: 'No puedes hacer eso con esta solicitud.',
      offerChanged:
        'La oferta cambió mientras tanto. Revisa la conversación e inténtalo de nuevo.',
      videoBeingEdited:
        'El autor está editando ahora mismo un video de este intercambio. Inténtalo de nuevo cuando esté listo.',
      nothingToRequest: 'No se puede pedir ninguno de los videos elegidos.',
      hintTooEarly:
        'Podrás ocultar la ayuda después de verla unas cuantas veces más.',
      selfRequest: 'No puedes pedir tus propios videos.',
      invalidOffer:
        'Una oferta necesita al menos un video de cada parte, y todos tienen que estar disponibles para sus dueños.',
      blocked: 'No puedes enviar solicitudes a este usuario.',
      alreadyBlocked: 'Este usuario ya está bloqueado.',
      selfBlock: 'No puedes bloquearte a ti mismo.',
    },
    social: {
      selfFollow: 'No puedes seguirte a ti mismo.',
      followNotAllowed: 'No puedes añadir a este usuario a tus amigos.',
    },
    editor: {
      invalid:
        'No se puede guardar esta edición: revisa los tiempos y las zonas.',
      nothing: 'No ha cambiado nada.',
      inProgress:
        'Este video ya se está editando. Espera a que termine o cancela la edición.',
      notReady: 'El video se podrá editar cuando termine de procesarse.',
      proOnly: 'El editor de video es parte de Pro.',
      copyOwnOnly: 'Solo puedes guardar como copia tus propios videos.',
    },
    invites: {
      notFound: 'Este enlace de invitación no existe.',
      expired: 'Esta invitación caducó. Pide un enlace nuevo.',
      usedUp:
        'Esta invitación ya se usó todas las veces posibles. Pide un enlace nuevo.',
      own: 'Esta es tu propia invitación: envíasela a alguien.',
    },
    deals: {
      notFound: 'Este trato no existe (o no se empezó en este navegador).',
      closed: 'Este trato terminó.',
      linkNotFound: 'Este enlace de intercambio ya no funciona.',
      linkVideos:
        'Para un enlace de intercambio, elige videos tuyos que estén listos (hasta 50).',
      guestsOff:
        'Esta persona solo acepta intercambios de usuarios registrados.',
      uploadsMax: 'En un trato caben hasta {{max}} videos tuyos.',
      videoInOffer:
        'Este video está en la oferta actual: primero cambia la oferta.',
      nothingOffered: 'Sube al menos un video tuyo para ofrecerlo.',
      tooMany:
        'Tienes {{max}} tratos en curso. Termina uno antes de empezar otro.',
    },
    links: {
      notFound: 'Este enlace no existe o ya no funciona.',
      passwordPro: 'La contraseña en un enlace es parte de Pro.',
      tooMany: 'Tienes {{max}} enlaces activos. Primero revoca algunos.',
      videoNotAllowed:
        'Por enlace solo se pueden enviar videos que subiste tú o que recibiste, listos y sin eliminar.',
      locked: 'Primero escribe la contraseña o el código del correo.',
      wrongPassword: 'Contraseña incorrecta.',
      wrongCode: 'El código no es correcto o caducó. Pide uno nuevo.',
      codeTooSoon:
        'Se acaba de enviar un código. Podrás pedir otro dentro de un minuto.',
      codeLimit:
        'Demasiados códigos para este enlace. Inténtalo dentro de una hora.',
      noEmail: 'Este enlace no es para ningún correo en concreto.',
      blocked: 'No puedes añadir videos de esta persona.',
    },
    anonymousLinks: {
      pro: 'Los enlaces anónimos son parte de Pro.',
      tooMany: 'Tienes {{max}} enlaces anónimos. Primero elimina uno.',
      notFound: 'Este enlace no existe o ya no funciona.',
      nameNeeded:
        'Tu nombre delata tu nombre de usuario. Elige un nombre para este enlace.',
      nameNamesNickname: 'Este nombre delata tu nombre de usuario. Elige otro.',
    },
    appTokens: {
      scope: 'La extensión del navegador no puede hacer esto.',
      invalid: 'La extensión ya no está conectada. Vuelve a conectarla.',
      code: 'El código de conexión caducó o no es correcto. Vuelve a intentar la conexión.',
      redirect: 'Esto no parece la extensión de tapeshelf.',
      notFound: 'Esta conexión no existe.',
    },
    chat: {
      notFriends:
        'Solo puedes escribir a tus amigos: cada uno tiene que añadir al otro.',
      unavailable: 'Este usuario no puede recibir mensajes.',
      emptyMessage: 'Escribe algo o adjunta un video.',
      videoNotAttachable:
        'No se puede adjuntar este video. Elige un video listo y visible en tu página.',
      selfMessage: 'No puedes escribirte a ti mismo.',
      notFound: 'Esta conversación no existe.',
    },
    reports: {
      self: 'No puedes denunciarte a ti mismo ni tus propios videos.',
    },
    support: {
      notFound: 'No se encontró esta consulta.',
      tooMany:
        'Tienes {{count}} consultas abiertas. Espera la respuesta a alguna o marca una como resuelta.',
      closed:
        'Esta consulta está cerrada. Si el problema sigue, abre una nueva.',
      empty: 'Escribe un mensaje o añade una imagen.',
      tooManyFiles: 'Hasta {{count}} imágenes por mensaje.',
      badImage:
        'No se pudo leer esta imagen. Debe ser PNG, JPG o WebP, de hasta 10 MB.',
      notYourVideo: 'Solo puedes adjuntar un video que hayas subido tú.',
      notRated: 'Una consulta se puede valorar cuando está resuelta o cerrada.',
    },
    site: {
      legalNotFound:
        'El operador de este sitio no ha publicado este documento.',
    },
    account: {
      confirmMismatch:
        'Escribe tu nombre de usuario exactamente para confirmar.',
      deleted: 'Esta cuenta se eliminó.',
    },
    billing: {
      disabled: 'Este servidor no tiene pagos.',
      unavailable:
        'Los pagos no están disponibles ahora mismo. Inténtalo más tarde.',
      signature: 'La firma no coincide.',
      noSubscription: 'No tienes ninguna suscripción.',
    },
    downloads: {
      limitReached:
        'Ya usaste las {{limit}} descargas de este mes. La próxima estará disponible el {{date}}.',
      busy: 'Todavía hay otra descarga en curso. Espera a que termine y vuelve a intentarlo.',
      ticketInvalid:
        'Este enlace de descarga caducó. Vuelve a iniciar la descarga desde la página del video.',
      range: 'Esta parte del archivo no existe.',
    },
    admin: {
      selfAction: 'No puedes hacer esto con tu propia cuenta.',
      adminTarget: 'Primero quita el rol de administrador.',
      notInTrash: 'Este video no está en la papelera.',
      purged: 'Este video ya se borró del almacenamiento.',
      authorDeleted:
        'El autor eliminó su cuenta, así que el video no se puede restaurar.',
      alreadyProcessed: 'Este video ya está procesado.',
      tierUntilPast: 'La fecha de fin tiene que ser futura.',
      tiersDisabled: 'Este servidor no tiene planes.',
      reportClosed: 'Esta denuncia ya se gestionó.',
      reportAction: 'Esta acción no corresponde a la denuncia.',
      noEmail: 'Esta cuenta no tiene dirección de correo.',
      viewAsReadOnly:
        'Estás viendo el sitio como otro usuario: no se puede cambiar nada.',
    },
    categories: {
      exists: 'Ya tienes una categoría con este nombre.',
      tooMany: 'Puedes tener hasta {{max}} categorías.',
    },
    uploads: {
      fileTooLarge: 'El archivo supera el límite de {{max}}.',
      quotaExceeded:
        'No hay espacio suficiente: ya se usan {{used}} de {{quota}}.',
      notFound: 'Esta subida no existe.',
      notActive: 'Esta subida ya terminó o se canceló.',
      expired: 'Esta subida caducó. Vuelve a empezarla.',
      incomplete:
        'Faltan partes del archivo o están dañadas. Vuelve a intentar la subida.',
      sizeMismatch: 'El archivo subido no coincide con el tamaño indicado.',
      extensionDailyLimit:
        'Hoy ya guardaste {{limit}} videos con la extensión, el máximo permitido. El contador vuelve a empezar a medianoche (UTC).',
    },
    videos: {
      deleteInAdminPanel:
        'Los videos de otras personas se eliminan desde el panel de administración: el autor recibe la norma incumplida y tu nota.',
      notFound: 'Este video no existe.',
      notReady: 'El video todavía se está procesando.',
      categoryNotFound: 'Esta categoría no existe.',
      stackNotFound: 'Esta pila no existe.',
      stackTooSmall: 'Una pila necesita al menos dos videos.',
      stackCategories:
        'Los videos de una pila comparten una sola categoría: elígela primero.',
      frameNotFound: 'Este fotograma no existe.',
      timestampOutOfRange: 'Este momento está después del final del video.',
      notWatchable: 'No tienes acceso a este video.',
      playbackTokenInvalid:
        'El enlace de reproducción caducó. Vuelve a cargar la página.',
      downloadNotAllowed: 'No se permite descargar este video.',
      alreadyInCollection: 'Este video ya está en tu colección.',
      cannotAddToCollection: 'Este video no se puede añadir a tu colección.',
      cannotHide: 'Este video no está en tu estante.',
      ownVideoRename:
        'Tus propios videos se renombran en su formulario de edición, y para todos.',
    },
  },
  editor: {
    copySuffix: '(editado)',
  },
  notifications: {
    failReason: {
      corrupted: 'el archivo está dañado o no es un video',
      noVideoStream: 'el archivo no tiene pista de video',
      zeroDuration: 'el video no tiene duración',
      tooLong: 'no se admiten videos de más de 12 horas',
      tooLarge: 'no se admiten fotogramas de más de 4096 px',
      fpsTooHigh: 'no se admiten más de 60 fps',
      tooManyStreams: 'el archivo tiene demasiadas pistas',
      transcodeFailed: 'no se pudo convertir el video',
      blocked:
        'este archivo se eliminó por incumplir las normas y no se puede volver a subir',
      internal: 'Falló el procesamiento. Prueba a subirlo de nuevo',
    },
  },
  mail: {
    notifications: {
      guest: 'Un invitado',
      anonymous: 'Anónimo',
      manage: 'Elige qué notificaciones recibes: {{url}}',
      andMore_one: ' y {{count}} más',
      andMore_many: ' y {{count}} más',
      andMore_other: ' y {{count}} más',
      REQUEST_RECEIVED: {
        subject: '{{name}} te pide «{{title}}»',
        title: 'Nueva solicitud de video',
        body_one:
          '{{name}} quiere que compartas «{{title}}». Compártelo gratis, rechaza la solicitud o propón un intercambio.',
        body_many:
          '{{name}} quiere que compartas {{count}} de videos, empezando por «{{title}}». Compártelos gratis, rechaza la solicitud o propón un intercambio.',
        body_other:
          '{{name}} quiere que compartas {{count}} videos, empezando por «{{title}}». Compártelos gratis, rechaza la solicitud o propón un intercambio.',
        message: 'Su mensaje: «{{message}}»',
        offered_one: 'A cambio te ofrece uno de sus videos.',
        offered_many: 'A cambio te ofrece {{count}} de sus videos.',
        offered_other: 'A cambio te ofrece {{count}} de sus videos.',
        button: 'Abrir la solicitud',
      },
      OFFER_RECEIVED: {
        subject: '{{name}} te hizo una oferta',
        title: 'Recibiste una contraoferta',
        body: '{{name}} propuso un intercambio (ronda {{round}}). Acéptalo, recházalo o haz tu propia oferta.',
        bodyDeal:
          '{{name}} ofrece «{{gives}}»{{givesMore}} a cambio de tu «{{wants}}»{{wantsMore}}. Acéptalo, recházalo o haz tu propia oferta.',
        message: 'Su mensaje: «{{message}}»',
        button: 'Abrir la conversación',
      },
      REQUEST_SHARED: {
        subject: '{{name}} compartió contigo «{{title}}»',
        title: 'Compartido contigo',
        body_one:
          '{{name}} compartió contigo «{{title}}» gratis. Ya está en tu colección.',
        body_many:
          '{{name}} compartió contigo {{count}} de videos gratis, empezando por «{{title}}». Ya están en tu colección.',
        body_other:
          '{{name}} compartió contigo {{count}} videos gratis, empezando por «{{title}}». Ya están en tu colección.',
        button: 'Ver lo que recibiste',
      },
      EXCHANGE_COMPLETED: {
        subject: 'Intercambio con {{name}} completado',
        title: 'Intercambio completado',
        body: 'Tu intercambio con {{name}} está hecho: recibiste {{received}} y diste {{given}}. Lo que recibiste ya está en tu colección.',
        button: 'Ver lo que recibiste',
      },
      REQUEST_DECLINED: {
        subject: '{{name}} rechazó la solicitud de «{{title}}»',
        title: 'Solicitud rechazada',
        body: '{{name}} la rechazó. {{comment}}',
        again_one: 'Puedes volver a pedirlo dentro de {{count}} día.',
        again_many: 'Puedes volver a pedirlo dentro de {{count}} de días.',
        again_other: 'Puedes volver a pedirlo dentro de {{count}} días.',
        button: 'Abrir la solicitud',
      },
      REQUEST_CANCELLED: {
        subject: '{{name}} retiró la solicitud de «{{title}}»',
        title: 'Solicitud retirada',
        body: '{{name}} canceló su solicitud de «{{title}}».',
        button: 'Abrir la solicitud',
      },
      REQUEST_INVALIDATED: {
        subject: 'La solicitud de «{{title}}» cambió',
        title: 'El sistema actualizó la solicitud',
        body: 'Un video de la solicitud de «{{title}}» ya no está disponible, así que la negociación se actualizó.',
        bodyClosed:
          'Se cerró la solicitud de «{{title}}»: la otra cuenta ya no está disponible.',
        bodyExpired:
          'El trato con un invitado por «{{title}}» venció: no hubo movimiento en tres días. Los videos del invitado se eliminaron.',
        button: 'Abrir la solicitud',
      },
      NEW_FOLLOWER: {
        subject: 'Nuevo seguidor: {{name}}',
        title: 'Nuevo seguidor',
        body: '{{name}} ahora sigue tu colección. Añade también a esta persona para ser amigos y poder escribirse mensajes.',
        button: 'Abrir su página',
      },
      FRIEND_ACCEPTED: {
        subject: '{{name}} ya está entre tus amigos',
        title: 'Nuevo amigo',
        body: 'Ahora sigues a {{name}} y esa persona te sigue a ti. Ya puedes enviarle mensajes y videos.',
        button: 'Abrir su página',
      },
      FOLLOWED_NEW_VIDEO: {
        subject: 'Nuevo video de {{name}}: «{{title}}»',
        title: 'Nuevo video de {{name}}',
        body: '{{name}} añadió un video nuevo, «{{title}}».',
        bodyPrivate:
          '{{name}} añadió un video privado nuevo, «{{title}}». Puedes pedirle que lo comparta.',
        button: 'Abrir el video',
      },
      NEW_MESSAGE: {
        subject: 'Nuevo mensaje de {{name}}',
        title: 'Nuevo mensaje',
        body: '{{name}}: «{{preview}}»',
        bodyVideo: '{{name}} te envió un video por el chat.',
        button: 'Abrir el chat',
      },
      VIDEO_PROCESSED: {
        subject: '«{{title}}» está listo',
        title: 'Tu video está listo',
        body: '«{{title}}» ya se procesó y se puede ver.',
        button: 'Abrir el video',
      },
      VIDEO_FAILED: {
        subject: '«{{title}}» no se pudo procesar',
        title: 'Falló el procesamiento',
        body: '«{{title}}» no se pudo procesar: {{reason}}. Puedes volver a subir el archivo.',
        button: 'Abrir mi página',
      },
      VIDEO_REMOVED: {
        subject: 'Su autor eliminó «{{title}}»',
        title: 'Un video salió de tu colección',
        body: '{{author}} eliminó «{{title}}», que estaba en tu colección. Ya no está disponible para nadie.',
        button: 'Abrir las notificaciones',
      },
      REPORT_RESOLVED: {
        subject: 'Revisamos tu denuncia',
        title: 'Denuncia revisada',
        bodyVideo:
          'Revisamos tu denuncia sobre «{{title}}» y tomamos medidas. Gracias por ayudar a que {{site}} sea un lugar seguro.',
        bodyUser:
          'Revisamos tu denuncia sobre {{title}} y tomamos medidas. Gracias por ayudar a que {{site}} sea un lugar seguro.',
        bodyVideoNone:
          'Revisamos tu denuncia sobre «{{title}}» y no encontramos ningún incumplimiento de las normas.',
        bodyUserNone:
          'Revisamos tu denuncia sobre {{title}} y no encontramos ningún incumplimiento de las normas.',
        button: 'Abrir las notificaciones',
      },
      ADMIN_NOTICE: {
        subject: 'Un mensaje de {{site}}',
        title: 'Mensaje del equipo de {{site}}',
        body: '{{message}}',
        button: 'Abrir las notificaciones',
      },
      VIDEO_EDITED: {
        subject: 'Un moderador editó tu video «{{title}}»',
        title: 'Video editado',
        body: 'Un moderador de {{site}} editó tu video «{{title}}» (por ejemplo, desenfocó una parte). El enlace y todo lo demás siguen igual.',
        button: 'Abrir el video',
      },
      VIDEO_EDIT_FAILED: {
        subject: 'La edición de «{{title}}» no salió bien',
        title: 'Edición no guardada',
        body: 'No se pudo hacer la edición de tu video «{{title}}». El video sigue como estaba; el editor conserva tus cambios para que puedas volver a intentarlo.',
        button: 'Abrir el editor',
      },
      SUPPORT_REPLY: {
        subject: 'Soporte respondió a tu consulta #{{number}}',
        title: 'Soporte respondió',
        body: '#{{number}} «{{subject}}»: {{preview}}',
        bodyResolved:
          'Soporte marcó tu consulta #{{number}} «{{subject}}» como resuelta. Si el problema sigue, abre una consulta nueva.',
        bodyResolvedWith:
          'Soporte respondió a tu consulta #{{number}} «{{subject}}» y la marcó como resuelta: {{preview}}',
        button: 'Abrir la consulta',
      },
      SUPPORT_TICKET: {
        subject: 'Soporte #{{number}}: {{subject}}',
        title: 'Consulta de soporte #{{number}}',
        body: '@{{name}} pide ayuda ({{topic}}): «{{subject}}». {{preview}}',
        bodyReply:
          '@{{name}} volvió a escribir en #{{number}} «{{subject}}»: {{preview}}',
        button: 'Abrir en el panel de administración',
      },
      LINK_OPENED: {
        subject: 'Alguien abrió tu enlace temporal',
        title: 'Enlace abierto',
        body_one: '@{{name}} abrió tu enlace temporal con «{{title}}».',
        body_many:
          '@{{name}} abrió tu enlace temporal con {{count}} de videos, empezando por «{{title}}».',
        body_other:
          '@{{name}} abrió tu enlace temporal con {{count}} videos, empezando por «{{title}}».',
        bodyGuest_one: 'Alguien abrió tu enlace temporal con «{{title}}».',
        bodyGuest_many:
          'Alguien abrió tu enlace temporal con {{count}} de videos, empezando por «{{title}}».',
        bodyGuest_other:
          'Alguien abrió tu enlace temporal con {{count}} videos, empezando por «{{title}}».',
        button: 'Abrir mis enlaces',
      },
      LINK_SAVED: {
        subject: '@{{name}} guardó videos de tu enlace',
        title: 'Guardado desde tu enlace',
        body_one:
          '@{{name}} guardó en su estante «{{title}}», de tu enlace temporal.',
        body_many:
          '@{{name}} guardó en su estante {{count}} de videos de tu enlace temporal, empezando por «{{title}}».',
        body_other:
          '@{{name}} guardó en su estante {{count}} videos de tu enlace temporal, empezando por «{{title}}».',
        button: 'Abrir mis enlaces',
      },
      VIDEO_TAKEN_DOWN: {
        subject: 'Se eliminó tu video «{{title}}»',
        title: 'Video eliminado',
        body: 'Eliminamos tu video «{{title}}» de {{site}}: {{rule}}. Ya no está disponible para nadie.',
        message: 'Nota del moderador: {{message}}',
        appeal: 'Si crees que es un error, escribe a {{email}}.',
        button: 'Abrir las notificaciones',
      },
      PLAN_EXPIRING: {
        subject: 'Tu plan Pro termina el {{date}}',
        title: 'Pro termina pronto',
        body: 'Tu plan Pro en {{site}} termina el {{date}} (UTC). Después, tu estante tendrá los límites de Free; no se elimina nada.',
        page: 'Ahora tu página está oculta; cuando termine Pro, todos podrán volver a verla.',
        anonymousLinks:
          'Cuando termine Pro, tus enlaces anónimos dejarán de abrirse; con Pro volverán a funcionar.',
        button: 'Abrir tu plan',
      },
      PLAN_PAYMENT_FAILED: {
        subject: 'No pudimos renovar tu plan Pro',
        title: 'Falló el pago',
        body: 'El pago de tu plan Pro en {{site}} no se completó. Actualiza tu método de pago antes del {{date}} (UTC) o tu estante tendrá los límites de Free; no se elimina nada.',
        button: 'Actualizar el método de pago',
      },
      PLAN_EXPIRED: {
        subject: 'Tu plan Pro terminó',
        title: 'Pro terminó',
        body: 'Tu estante en {{site}} tiene ahora los límites de Free: {{file}} por video y {{shelf}} en total. No se eliminó nada.',
        bodyOverQuota:
          'Tu estante en {{site}} tiene ahora los límites de Free: {{file}} por video y {{shelf}} en total. Tu estante ocupa más que eso, así que las subidas nuevas quedan en pausa hasta que liberes espacio. No se eliminó nada.',
        page: 'Tu página vuelve a ser visible para todos: ocultarla es parte de Pro.',
        anonymousLinks:
          'Tus enlaces anónimos ya no se abren; con Pro volverán a funcionar.',
        button: 'Abrir tu plan',
      },
    },
    supportTopics: {
      QUESTION: 'pregunta',
      BUG: 'informe de error',
      ACCOUNT: 'cuenta',
      IDEA: 'idea',
    },
    takedownRules: {
      SPAM: 'spam o publicidad',
      ILLEGAL: 'contenido ilegal',
      COPYRIGHT: 'infracción de derechos de autor',
      ABUSE: 'insultos o acoso',
      UNMARKED_ADULT: 'contenido sensible sin marcar',
      OTHER: 'un incumplimiento de las normas',
    },
    footer:
      'Recibiste este correo porque se creó una cuenta en {{site}} con esta dirección.',
    verify: {
      subject: 'Confirma tu correo para {{site}}',
      title: '¡Te damos la bienvenida a {{site}}, {{name}}!',
      body: 'Confirma tu dirección de correo para poder subir videos, pedir videos, tener amigos y escribir mensajes.',
      button: 'Confirmar correo',
      expires: 'El enlace es válido durante 24 horas.',
    },
    reset: {
      subject: 'Restablece tu contraseña de {{site}}',
      title: 'Restablecer la contraseña',
      body: 'Hola, {{name}}: alguien (esperamos que tú) pidió restablecer la contraseña de tu cuenta de {{site}}.',
      button: 'Crear una contraseña nueva',
      expires:
        'El enlace es válido durante 1 hora. Si no lo pediste tú, puedes ignorar este correo.',
    },
    guestDeal: {
      button: 'Abrir el trato',
      footer:
        'Recibiste este correo porque escribiste esta dirección en la página de un trato en {{site}}. No se creó ninguna cuenta.',
      saved: {
        subject: 'Tu trato con {{name}}',
        title: 'Guarda este correo',
        body: 'Este botón te lleva de vuelta a tu trato con {{name}} desde cualquier dispositivo. Cuando {{name}} responda, te escribiremos aquí.',
      },
      offer: {
        subject: '{{name}} respondió a tu oferta',
        title: 'Una oferta nueva',
        body: '{{name}} propuso otro intercambio. Acéptalo, responde con tu propia oferta o recházalo; el trato espera tres días más.',
      },
      accepted: {
        subject: 'El intercambio con {{name}} está hecho',
        title: 'El intercambio está hecho',
        body: 'Durante 7 días puedes ver y descargar en la página del trato los videos que recibiste. Inicia sesión o crea una cuenta allí mismo para quedártelos para siempre.',
      },
      shared: {
        subject: '{{name}} compartió los videos contigo',
        title: 'Compartido contigo',
        body: '{{name}} te dio los videos sin quedarse con los tuyos; tus videos se eliminaron de nuestros servidores. Durante 7 días puedes ver y descargar los que recibiste en la página del trato.',
      },
      declined: {
        subject: '{{name}} rechazó el intercambio',
        title: 'Se rechazó el intercambio',
        body: 'El trato terminó. Tus videos se eliminaron de nuestros servidores en el acto; nadie los recibió.',
      },
      closed: {
        subject: 'Se cerró el trato con {{name}}',
        title: 'El trato está cerrado',
        body: 'El trato no pudo seguir (un video ya no existe o la cuenta se cerró). Tus videos se eliminaron de nuestros servidores en el acto; nadie los recibió.',
      },
      expired: {
        subject: 'Venció el trato con {{name}}',
        title: 'El trato venció',
        body: 'No hubo movimiento en tres días, así que el trato terminó. Tus videos se eliminaron de nuestros servidores en el acto; nadie los recibió.',
      },
    },
    twoFactor: {
      button: 'Abrir la configuración de seguridad',
      notYou:
        'Si no fuiste tú, cambia tu contraseña de inmediato y escríbenos.',
      on: {
        subject: 'La verificación en dos pasos está activada',
        title: 'La verificación en dos pasos está activada',
        body: 'Hola, {{name}}: al iniciar sesión con contraseña en tu cuenta de {{site}}, ahora también se pide el segundo paso. Se cerró la sesión en los demás dispositivos.',
      },
      off: {
        subject: 'La verificación en dos pasos está desactivada',
        title: 'La verificación en dos pasos está desactivada',
        body: 'Hola, {{name}}: al iniciar sesión en tu cuenta de {{site}} ya no se pide el segundo paso.',
      },
      reset: {
        subject: 'Se restableció la verificación en dos pasos',
        title: 'Se restableció la verificación en dos pasos',
        body: 'Hola, {{name}}: a petición tuya, un administrador de {{site}} desactivó la verificación en dos pasos de tu cuenta. Puedes volver a activarla en la configuración de seguridad.',
      },
      recoveryUsed: {
        subject: 'Se usó un código de recuperación',
        title: 'Se usó un código de recuperación',
        body: 'Hola, {{name}}: se acaba de usar un código de recuperación de tu cuenta de {{site}}. Códigos restantes: {{left}}.',
      },
    },
    links: {
      footer:
        'Recibiste este correo porque @{{username}} envió videos a esta dirección en {{site}}.',
      invite: {
        subject: '@{{username}} comparte videos contigo',
        title: '{{name}} comparte videos contigo',
        body_one: '@{{username}} te envió un video en {{site}}: «{{title}}».',
        body_many:
          '@{{username}} te envió {{count}} de videos en {{site}}, empezando por «{{title}}».',
        body_other:
          '@{{username}} te envió {{count}} videos en {{site}}, empezando por «{{title}}».',
        how: 'Míralos y descárgalos antes de que caduque el enlace: funciona hasta el {{date}} (UTC). Para abrirlo, pide un código; llegará a esta dirección.',
        button: 'Abrir los videos',
      },
      code: {
        subject: 'Código {{code}} para abrir los videos',
        title: 'Tu código: {{code}}',
        body: 'Escríbelo en la página del enlace temporal de @{{username}}.',
        expires:
          'El código funciona durante 15 minutos. Si no lo pediste, ignora este correo.',
      },
    },
  },
};
