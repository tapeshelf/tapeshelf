export const pl = {
  errors: {
    clientTooOld: 'Ta wersja aplikacji jest za stara dla tego serwera.',
    internal: 'Coś poszło nie tak po naszej stronie. Spróbuj ponownie później.',
    generic: 'Nie udało się wykonać żądania.',
    badRequest: 'Nieprawidłowe żądanie.',
    validation: 'Niektóre pola są wypełnione nieprawidłowo.',
    notFound: 'Nie znaleziono.',
    conflict:
      'To koliduje z bieżącym stanem. Odśwież stronę i spróbuj ponownie.',
    payloadTooLarge: 'Żądanie jest za duże.',
    tooManyRequests: 'Zbyt wiele żądań. Odczekaj chwilę.',
    unauthorized: 'Aby to zrobić, musisz się zalogować.',
    forbidden: 'Nie masz uprawnień, aby to zrobić.',
    auth: {
      captchaRequired: 'Potwierdź, że nie jesteś robotem.',
      captchaFailed: 'Weryfikacja się nie powiodła. Spróbuj ponownie.',
      captchaUnavailable:
        'Weryfikacja jest teraz niedostępna. Spróbuj ponownie później.',
      invalidCredentials: 'Nieprawidłowy e-mail lub hasło.',
      registrationClosed:
        'Rejestracja jest tu zamknięta. Aby dostać konto, zapytaj osobę, która prowadzi tę stronę.',
      emailTaken: 'Konto z tym adresem e-mail już istnieje.',
      usernameTaken: 'Ta nazwa użytkownika jest już zajęta.',
      usernameInvalid:
        'Nazwa użytkownika ma od 3 do 30 znaków: małe litery, cyfry i podkreślenia.',
      usernameReserved: 'Ta nazwa użytkownika jest zarezerwowana.',
      usernameChangeTooSoon_one:
        'Nazwę użytkownika możesz znowu zmienić za {{count}} dzień.',
      usernameChangeTooSoon_few:
        'Nazwę użytkownika możesz znowu zmienić za {{count}} dni.',
      usernameChangeTooSoon_many:
        'Nazwę użytkownika możesz znowu zmienić za {{count}} dni.',
      usernameChangeTooSoon_other:
        'Nazwę użytkownika możesz znowu zmienić za {{count}} dnia.',
      passwordWeak:
        'Hasło musi mieć co najmniej 8 znaków i zawierać literę oraz cyfrę.',
      tokenInvalid: 'Ten link jest nieprawidłowy albo został już użyty.',
      tokenExpired: 'Ten link wygasł. Poproś o nowy.',
      emailNotVerified: 'Najpierw potwierdź swój adres e-mail.',
      emailAlreadyVerified: 'Twój e-mail jest już potwierdzony.',
      accountBanned: 'To konto zostało zawieszone.',
      sessionExpired: 'Sesja wygasła. Zaloguj się ponownie.',
      tooManyAttempts_one:
        'Zbyt wiele prób logowania. Spróbuj ponownie za {{count}} minutę.',
      tooManyAttempts_few:
        'Zbyt wiele prób logowania. Spróbuj ponownie za {{count}} minuty.',
      tooManyAttempts_many:
        'Zbyt wiele prób logowania. Spróbuj ponownie za {{count}} minut.',
      tooManyAttempts_other:
        'Zbyt wiele prób logowania. Spróbuj ponownie za {{count}} minuty.',
      googleNotConfigured: 'Logowanie przez Google jest niedostępne.',
      googleFailed: 'Nie udało się zalogować przez Google. Spróbuj ponownie.',
      googleSignupExpired: 'Sesja rejestracji wygasła. Zacznij od nowa.',
      wrongPassword: 'Obecne hasło jest nieprawidłowe.',
      csrf: 'Żądanie zostało zablokowane ze względów bezpieczeństwa. Odśwież stronę i spróbuj ponownie.',
      twoFactorLogin: 'Wpisz kod z aplikacji uwierzytelniającej.',
      adminGoogle:
        'Administratorzy logują się hasłem i drugim krokiem, a nie przez Google.',
      googleLinkTwoFactor:
        'Ten adres należy do konta z logowaniem dwuetapowym. Zaloguj się hasłem do tego konta.',
    },
    twoFactor: {
      required:
        'Panel administratora wymaga logowania dwuetapowego: włącz je w Ustawieniach → Bezpieczeństwo.',
      confirm: 'Najpierw potwierdź drugim krokiem, że to Ty.',
      invalidCode: 'Ten kod nie pasuje. Sprawdź go i spróbuj ponownie.',
      expired: 'Logowanie trwało zbyt długo. Wpisz hasło jeszcze raz.',
      setupExpired: 'Konfiguracja trwała zbyt długo. Zacznij od nowa.',
      needsPassword: 'Logowanie dwuetapowe chroni hasło. Najpierw ustaw hasło.',
      admin: 'Administrator nie może logować się bez drugiego kroku.',
      appExists: 'Aplikacja uwierzytelniająca jest już skonfigurowana.',
      passkeyInvalid: 'Klucz dostępu nie odpowiedział. Spróbuj ponownie.',
      passkeyLimit: 'Masz już 10 kluczy dostępu.',
      passkeyNotFound: 'Tego klucza dostępu już nie ma.',
      noPasskey: 'To konto nie ma klucza dostępu.',
      off: 'Logowanie dwuetapowe jest wyłączone.',
    },
    users: {
      notFound: 'Taki użytkownik nie istnieje.',
      pageHidingNotAllowed: 'Ukrywanie strony jest dostępne w Pro.',
      invalidImage:
        'Ten plik nie jest obsługiwanym obrazem (JPEG, PNG, WebP lub GIF).',
    },
    exchange: {
      notFound: 'Taka prośba nie istnieje.',
      notAllowed: 'Z tą prośbą nie można tego zrobić.',
      offerChanged:
        'Oferta w międzyczasie się zmieniła. Sprawdź przebieg negocjacji i spróbuj ponownie.',
      videoBeingEdited:
        'Autor właśnie edytuje jeden z filmów tej wymiany. Spróbuj ponownie, gdy edycja się zakończy.',
      nothingToRequest: 'O żaden z zaznaczonych filmów nie można poprosić.',
      hintTooEarly:
        'Podpowiedź możesz ukryć po kilku kolejnych wyświetleniach.',
      selfRequest: 'Nie możesz prosić o własne filmy.',
      invalidOffer:
        'Oferta wymaga co najmniej jednego filmu po każdej stronie, a wszystkie muszą być dostępne dla swoich właścicieli.',
      blocked: 'Nie możesz wysyłać próśb do tego użytkownika.',
      alreadyBlocked: 'Ten użytkownik jest już zablokowany.',
      selfBlock: 'Nie możesz zablokować siebie.',
    },
    social: {
      selfFollow: 'Nie możesz obserwować siebie.',
      followNotAllowed: 'Nie możesz dodać tego użytkownika do znajomych.',
    },
    editor: {
      invalid: 'Tej edycji nie można zapisać: sprawdź jej czasy i obszary.',
      nothing: 'Nic się nie zmieniło.',
      inProgress:
        'Ten film jest już edytowany. Poczekaj na koniec albo anuluj edycję.',
      notReady: 'Film można edytować, gdy zostanie przetworzony.',
      proOnly: 'Edytor wideo jest dostępny w Pro.',
      copyOwnOnly: 'Jako kopię można zapisać tylko własne filmy.',
    },
    invites: {
      notFound: 'Taki link z zaproszeniem nie istnieje.',
      expired: 'To zaproszenie wygasło. Poproś o nowy link.',
      usedUp: 'To zaproszenie zostało już wykorzystane. Poproś o nowy link.',
      own: 'To Twoje własne zaproszenie: wyślij je komuś.',
    },
    deals: {
      notFound:
        'Nie ma takiej transakcji (albo została rozpoczęta w innej przeglądarce).',
      closed: 'Ta transakcja jest zakończona.',
      linkNotFound: 'Ten link do wymiany już nie działa.',
      linkVideos: 'Do linku do wymiany wybierz własne gotowe filmy (do 50).',
      guestsOff:
        'Ta osoba wymienia się tylko z zarejestrowanymi użytkownikami.',
      uploadsMax: 'Transakcja mieści najwyżej {{max}} Twoich filmów.',
      videoInOffer: 'Ten film jest w bieżącej ofercie: najpierw zmień ofertę.',
      nothingOffered:
        'Prześlij co najmniej jeden swój film, aby coś zaproponować.',
      tooMany:
        'Osiągnięto limit trwających transakcji ({{max}}). Zakończ jedną, zanim zaczniesz kolejną.',
    },
    links: {
      notFound: 'Ten link nie istnieje albo już nie działa.',
      passwordPro: 'Hasło do linku jest dostępne w Pro.',
      tooMany:
        'Osiągnięto limit działających linków ({{max}}). Najpierw unieważnij część z nich.',
      videoNotAllowed:
        'Linkiem można wysłać tylko filmy przesłane przez Ciebie i otrzymane, jeśli są gotowe i nieusunięte.',
      locked: 'Najpierw wpisz hasło albo kod z e-maila.',
      wrongPassword: 'Nieprawidłowe hasło.',
      wrongCode: 'Kod jest nieprawidłowy lub wygasł. Poproś o nowy.',
      codeTooSoon:
        'Kod został właśnie wysłany. O kolejny możesz poprosić za minutę.',
      codeLimit: 'Za dużo kodów dla tego linku. Spróbuj ponownie za godzinę.',
      noEmail: 'Ten link nie jest przypisany do konkretnego adresu e-mail.',
      emailOff:
        'Ten serwer nie wysyła e-maili, więc linki dla jednej osoby są niedostępne.',
      blocked: 'Nie możesz dodawać filmów od tej osoby.',
    },
    anonymousLinks: {
      pro: 'Anonimowe linki są dostępne w Pro.',
      tooMany:
        'Osiągnięto limit anonimowych linków ({{max}}). Najpierw usuń jeden z nich.',
      notFound: 'Ten link nie istnieje albo już nie działa.',
      nameNeeded:
        'Twoja wyświetlana nazwa zdradza nazwę użytkownika. Wybierz nazwę dla tego linku.',
      nameNamesNickname:
        'Ta nazwa zdradza Twoją nazwę użytkownika. Wybierz inną.',
    },
    appTokens: {
      scope: 'Rozszerzenie przeglądarki nie może tego zrobić.',
      invalid: 'Rozszerzenie nie jest już połączone. Połącz je ponownie.',
      code: 'Kod połączenia wygasł albo jest nieprawidłowy. Spróbuj połączyć rozszerzenie jeszcze raz.',
      redirect: 'To nie wygląda na rozszerzenie tapeshelf.',
      notFound: 'Takie połączenie nie istnieje.',
    },
    chat: {
      notFriends:
        'Pisać możesz tylko do znajomych: musicie dodać się nawzajem.',
      unavailable: 'Do tego użytkownika nie można pisać.',
      emptyMessage: 'Napisz coś albo załącz film.',
      videoNotAttachable:
        'Tego filmu nie można załączyć. Wybierz gotowy film widoczny na Twojej stronie.',
      selfMessage: 'Nie możesz pisać do siebie.',
      notFound: 'Taka rozmowa nie istnieje.',
    },
    reports: {
      self: 'Nie możesz zgłosić siebie ani swoich filmów.',
    },
    support: {
      notFound: 'Nie znaleziono tego zgłoszenia.',
      tooMany:
        'Masz otwarte zgłoszenia: {{count}}. Poczekaj na odpowiedź na jedno z nich albo oznacz któreś jako rozwiązane.',
      closed:
        'To zgłoszenie jest zamknięte. Jeśli problem nadal występuje, utwórz nowe.',
      empty: 'Napisz wiadomość albo dodaj obraz.',
      tooManyFiles: 'Limit obrazów w jednej wiadomości: {{count}}.',
      badImage:
        'Nie udało się odczytać obrazu. Obsługujemy PNG, JPG lub WebP do 10 MB.',
      notYourVideo: 'Możesz załączyć tylko film przesłany przez Ciebie.',
      notRated: 'Zgłoszenie można ocenić, gdy jest rozwiązane lub zamknięte.',
    },
    site: {
      legalNotFound: 'Operator tej strony nie opublikował tego dokumentu.',
    },
    account: {
      confirmMismatch:
        'Aby potwierdzić, wpisz dokładnie swoją nazwę użytkownika.',
      deleted: 'To konto zostało usunięte.',
    },
    billing: {
      disabled: 'Na tym serwerze nie ma płatności.',
      unavailable: 'Płatności są teraz niedostępne. Spróbuj ponownie później.',
      signature: 'Podpis się nie zgadza.',
      noSubscription: 'Nie masz subskrypcji.',
    },
    downloads: {
      limitReached:
        'Wykorzystano wszystkie pobrania w tym miesiącu ({{limit}}). Następne będzie możliwe {{date}}.',
      busy: 'Trwa jeszcze inne pobieranie. Poczekaj, aż się skończy, i spróbuj ponownie.',
      ticketInvalid:
        'Ten link do pobrania wygasł. Zacznij pobieranie od nowa na stronie filmu.',
      range: 'Taka część pliku nie istnieje.',
    },
    traffic: {
      limitReached:
        'Transfer z Twojego planu na ten miesiąc się wyczerpał. Odnowi się na początku następnego miesiąca.',
      sharerLimitReached:
        'Osobie, która udostępniła ten film, wyczerpał się transfer na ten miesiąc. Odnowi się na początku następnego miesiąca.',
    },
    admin: {
      selfAction: 'Nie możesz tego zrobić z własnym kontem.',
      adminTarget: 'Najpierw odbierz rolę administratora.',
      notInTrash: 'Tego filmu nie ma w koszu.',
      purged: 'Ten film został już wymazany z magazynu.',
      authorDeleted: 'Autor usunął konto, więc filmu nie można przywrócić.',
      alreadyProcessed: 'Ten film jest już przetworzony.',
      tierUntilPast: 'Data końcowa musi być w przyszłości.',
      tiersDisabled: 'Na tym serwerze nie ma planów.',
      reportClosed: 'To zgłoszenie zostało już rozpatrzone.',
      reportAction: 'To działanie nie pasuje do zgłoszenia.',
      noEmail: 'To konto nie ma adresu e-mail.',
      viewAsReadOnly:
        'Oglądasz serwis jako inny użytkownik: nic nie można zmienić.',
    },
    categories: {
      exists: 'Masz już kategorię o tej nazwie.',
      tooMany: 'Limit kategorii to {{max}}.',
    },
    uploads: {
      fileTooLarge: 'Plik przekracza limit {{max}}.',
      quotaExceeded: 'Za mało miejsca: zajęte jest już {{used}} z {{quota}}.',
      notFound: 'Takie przesyłanie nie istnieje.',
      notActive: 'To przesyłanie już się zakończyło albo zostało anulowane.',
      expired: 'To przesyłanie wygasło. Zacznij je od nowa.',
      incomplete:
        'Brakuje części pliku albo są uszkodzone. Prześlij plik ponownie.',
      sizeMismatch: 'Przesłany plik ma inny rozmiar niż zapowiedziany.',
      extensionDailyLimit:
        'Osiągnięto dzisiejszy limit filmów zapisywanych przez rozszerzenie ({{limit}}). Licznik zeruje się o północy (UTC).',
    },
    videos: {
      deleteInAdminPanel:
        'Cudze filmy usuwaj w panelu administratora: autor dostanie informację o naruszonej zasadzie i Twoją notatkę.',
      notFound: 'Taki film nie istnieje.',
      notReady: 'Film jest jeszcze przetwarzany.',
      categoryNotFound: 'Taka kategoria nie istnieje.',
      stackNotFound: 'Taki stos nie istnieje.',
      stackTooSmall: 'Stos musi mieć co najmniej dwa filmy.',
      stackCategories:
        'Filmy w stosie mają jedną wspólną kategorię: najpierw ją wybierz.',
      frameNotFound: 'Taka klatka nie istnieje.',
      timestampOutOfRange: 'Ten moment wypada po końcu filmu.',
      notWatchable: 'Nie masz dostępu do tego filmu.',
      playbackTokenInvalid: 'Link do odtwarzania wygasł. Odśwież stronę.',
      downloadNotAllowed: 'Pobieranie tego filmu jest niedozwolone.',
      alreadyInCollection: 'Ten film jest już w Twojej kolekcji.',
      cannotAddToCollection: 'Tego filmu nie można dodać do Twojej kolekcji.',
      cannotHide: 'Tego filmu nie ma na Twojej półce.',
      ownVideoRename:
        'Nazwę własnego filmu zmieniasz w jego formularzu edycji, i to dla wszystkich.',
    },
  },
  editor: {
    copySuffix: '(po edycji)',
  },
  notifications: {
    failReason: {
      corrupted: 'plik jest uszkodzony albo nie jest filmem',
      noVideoStream: 'plik nie ma ścieżki wideo',
      zeroDuration: 'film ma zerową długość',
      tooLong: 'filmy dłuższe niż 12 godzin nie są obsługiwane',
      tooLarge: 'klatki większe niż 4096 px nie są obsługiwane',
      fpsTooHigh: 'liczba klatek powyżej 60 fps nie jest obsługiwana',
      tooManyStreams: 'plik ma za dużo strumieni',
      transcodeFailed: 'nie udało się przekonwertować filmu',
      blocked:
        'ten plik został usunięty za łamanie zasad i nie można go przesłać ponownie',
      internal:
        'Przetwarzanie się nie powiodło. Spróbuj przesłać plik jeszcze raz',
    },
  },
  mail: {
    notifications: {
      guest: 'Gość',
      anonymous: 'Anonim',
      manage: 'Zmień, jakie powiadomienia dostajesz: {{url}}',
      unsubscribe: 'Zrezygnuj z takich e-maili: {{url}}',
      andMore_one: ' i jeszcze {{count}}',
      andMore_few: ' i jeszcze {{count}}',
      andMore_many: ' i jeszcze {{count}}',
      andMore_other: ' i jeszcze {{count}}',
      REQUEST_RECEIVED: {
        subject: '{{name}} prosi o „{{title}}”',
        title: 'Nowa prośba o film',
        body_one:
          '{{name}} prosi Cię o udostępnienie filmu „{{title}}”. Udostępnij go za darmo, odmów albo zaproponuj wymianę.',
        body_few:
          '{{name}} prosi Cię o udostępnienie {{count}} filmów, począwszy od „{{title}}”. Udostępnij je za darmo, odmów albo zaproponuj wymianę.',
        body_many:
          '{{name}} prosi Cię o udostępnienie {{count}} filmów, począwszy od „{{title}}”. Udostępnij je za darmo, odmów albo zaproponuj wymianę.',
        body_other:
          '{{name}} prosi Cię o udostępnienie {{count}} filmów, począwszy od „{{title}}”. Udostępnij je za darmo, odmów albo zaproponuj wymianę.',
        message: 'Wiadomość: „{{message}}”',
        offered_one: 'W zamian proponuje jeden swój film.',
        offered_few: 'W zamian proponuje {{count}} swoje filmy.',
        offered_many: 'W zamian proponuje {{count}} swoich filmów.',
        offered_other: 'W zamian proponuje {{count}} swojego filmu.',
        button: 'Otwórz prośbę',
      },
      OFFER_RECEIVED: {
        subject: '{{name}} składa Ci ofertę',
        title: 'Nowa kontroferta',
        body: '{{name}} proponuje wymianę (runda {{round}}). Przyjmij ją, odrzuć albo złóż własną ofertę.',
        bodyDeal:
          '{{name}} proponuje „{{gives}}”{{givesMore}} w zamian za Twój film „{{wants}}”{{wantsMore}}. Przyjmij ofertę, odrzuć ją albo złóż własną.',
        message: 'Wiadomość: „{{message}}”',
        button: 'Otwórz negocjacje',
      },
      REQUEST_SHARED: {
        subject: '{{name}} udostępnia Ci „{{title}}”',
        title: 'Udostępniono Ci film',
        body_one:
          '{{name}} udostępnia Ci za darmo film „{{title}}”. Jest już w Twojej kolekcji.',
        body_few:
          '{{name}} udostępnia Ci za darmo {{count}} filmy, począwszy od „{{title}}”. Są już w Twojej kolekcji.',
        body_many:
          '{{name}} udostępnia Ci za darmo {{count}} filmów, począwszy od „{{title}}”. Są już w Twojej kolekcji.',
        body_other:
          '{{name}} udostępnia Ci za darmo {{count}} filmu, począwszy od „{{title}}”. Są już w Twojej kolekcji.',
        button: 'Zobacz otrzymane filmy',
      },
      EXCHANGE_COMPLETED: {
        subject: 'Wymiana z {{name}} zakończona',
        title: 'Wymiana zakończona',
        body: 'Twoja wymiana z {{name}} jest zakończona. Otrzymane filmy: {{received}}, oddane: {{given}}. Otrzymane filmy są już w Twojej kolekcji.',
        button: 'Zobacz otrzymane filmy',
      },
      REQUEST_DECLINED: {
        subject: '{{name}} odrzuca prośbę o „{{title}}”',
        title: 'Prośba odrzucona',
        body: '{{name}} odmawia. {{comment}}',
        again_one: 'Możesz poprosić ponownie za {{count}} dzień.',
        again_few: 'Możesz poprosić ponownie za {{count}} dni.',
        again_many: 'Możesz poprosić ponownie za {{count}} dni.',
        again_other: 'Możesz poprosić ponownie za {{count}} dnia.',
        button: 'Otwórz prośbę',
      },
      REQUEST_CANCELLED: {
        subject: '{{name}} wycofuje prośbę o „{{title}}”',
        title: 'Prośba wycofana',
        body: '{{name}} wycofuje swoją prośbę o „{{title}}”.',
        button: 'Otwórz prośbę',
      },
      REQUEST_INVALIDATED: {
        subject: 'Prośba o „{{title}}” się zmieniła',
        title: 'Prośba zaktualizowana przez system',
        body: 'Jeden z filmów objętych prośbą o „{{title}}” nie jest już dostępny, więc negocjacje zostały zaktualizowane.',
        bodyClosed:
          'Prośba o „{{title}}” została zamknięta: drugie konto nie jest już dostępne.',
        bodyExpired:
          'Transakcja z gościem dotycząca „{{title}}” wygasła: przez trzy dni nikt nie wykonał ruchu. Filmy gościa zostały usunięte.',
        button: 'Otwórz prośbę',
      },
      NEW_FOLLOWER: {
        subject: '{{name}} Cię obserwuje',
        title: 'Nowy obserwujący',
        body: '{{name}} obserwuje teraz Twoją kolekcję. Dodaj tę osobę też, aby zostać znajomymi i pisać do siebie.',
        button: 'Otwórz profil',
      },
      FRIEND_ACCEPTED: {
        subject: 'Ty i {{name}} jesteście teraz znajomymi',
        title: 'Jesteście znajomymi',
        body: 'Ty i {{name}} obserwujecie się nawzajem. Możecie wysyłać sobie wiadomości i filmy.',
        button: 'Otwórz profil',
      },
      FOLLOWED_NEW_VIDEO: {
        subject: 'Nowy film od {{name}}: „{{title}}”',
        title: 'Nowy film od {{name}}',
        body: 'Na półce {{name}} jest nowy film: „{{title}}”.',
        bodyPrivate:
          'Na półce {{name}} jest nowy prywatny film: „{{title}}”. Możesz poprosić o jego udostępnienie.',
        button: 'Otwórz film',
      },
      NEW_MESSAGE: {
        subject: 'Nowa wiadomość od {{name}}',
        title: 'Nowa wiadomość',
        body: '{{name}}: „{{preview}}”',
        bodyVideo: '{{name}} wysyła Ci film na czacie.',
        button: 'Otwórz czat',
      },
      VIDEO_PROCESSED: {
        subject: 'Film „{{title}}” jest gotowy',
        title: 'Twój film jest gotowy',
        body: 'Film „{{title}}” został przetworzony i możesz go już obejrzeć.',
        button: 'Otwórz film',
      },
      VIDEO_FAILED: {
        subject: 'Nie udało się przetworzyć filmu „{{title}}”',
        title: 'Przetwarzanie się nie powiodło',
        body: 'Nie udało się przetworzyć filmu „{{title}}”: {{reason}}. Możesz przesłać plik ponownie.',
        button: 'Otwórz moją stronę',
      },
      VIDEO_REMOVED: {
        subject: 'Autor usunął film „{{title}}”',
        title: 'Film zniknął z Twojej kolekcji',
        body: 'Film „{{title}}”, który był w Twojej kolekcji, został usunięty przez {{author}}. Nie jest już dostępny dla nikogo.',
        button: 'Otwórz powiadomienia',
      },
      REPORT_RESOLVED: {
        subject: 'Twoje zgłoszenie zostało rozpatrzone',
        title: 'Zgłoszenie rozpatrzone',
        bodyVideo:
          'Sprawdziliśmy Twoje zgłoszenie dotyczące „{{title}}” i podjęliśmy działania. Dziękujemy, że pomagasz dbać o bezpieczeństwo {{site}}.',
        bodyUser:
          'Sprawdziliśmy Twoje zgłoszenie dotyczące {{title}} i podjęliśmy działania. Dziękujemy, że pomagasz dbać o bezpieczeństwo {{site}}.',
        bodyVideoNone:
          'Sprawdziliśmy Twoje zgłoszenie dotyczące „{{title}}” i nie znaleźliśmy naruszenia zasad.',
        bodyUserNone:
          'Sprawdziliśmy Twoje zgłoszenie dotyczące {{title}} i nie znaleźliśmy naruszenia zasad.',
        button: 'Otwórz powiadomienia',
      },
      ADMIN_NOTICE: {
        subject: 'Wiadomość od {{site}}',
        title: 'Wiadomość od zespołu {{site}}',
        body: '{{message}}',
        button: 'Otwórz powiadomienia',
      },
      VIDEO_EDITED: {
        subject: 'Moderator edytował Twój film „{{title}}”',
        title: 'Film edytowany',
        body: 'Moderator {{site}} edytował Twój film „{{title}}” (na przykład rozmył jego fragment). Link i cała reszta pozostają bez zmian.',
        button: 'Otwórz film',
      },
      VIDEO_EDIT_FAILED: {
        subject: 'Edycja filmu „{{title}}” się nie udała',
        title: 'Zmiany nie zostały zapisane',
        body: 'Nie udało się zapisać zmian w Twoim filmie „{{title}}”. Film pozostał bez zmian, a edytor zachował Twoje poprawki, więc możesz spróbować ponownie.',
        button: 'Otwórz edytor',
      },
      SUPPORT_REPLY: {
        subject: 'Zespół pomocy odpowiedział na Twoje zgłoszenie #{{number}}',
        title: 'Odpowiedź zespołu pomocy',
        body: '#{{number}} „{{subject}}”: {{preview}}',
        bodyResolved:
          'Zespół pomocy oznaczył Twoje zgłoszenie #{{number}} „{{subject}}” jako rozwiązane. Jeśli problem nadal występuje, utwórz nowe zgłoszenie.',
        bodyResolvedWith:
          'Zespół pomocy odpowiedział na Twoje zgłoszenie #{{number}} „{{subject}}” i oznaczył je jako rozwiązane: {{preview}}',
        button: 'Otwórz zgłoszenie',
      },
      SUPPORT_TICKET: {
        subject: 'Pomoc #{{number}}: {{subject}}',
        title: 'Zgłoszenie do pomocy #{{number}}',
        body: '@{{name}} prosi o pomoc ({{topic}}): „{{subject}}”. {{preview}}',
        bodyReply:
          'Nowa wiadomość od @{{name}} w #{{number}} „{{subject}}”: {{preview}}',
        button: 'Otwórz w panelu administratora',
      },
      LINK_OPENED: {
        subject: 'Twój link tymczasowy został otwarty',
        title: 'Link otwarty',
        body_one:
          'Twój link tymczasowy z „{{title}}” został otwarty przez @{{name}}.',
        body_few:
          'Twój link tymczasowy z {{count}} filmami, począwszy od „{{title}}”, został otwarty przez @{{name}}.',
        body_many:
          'Twój link tymczasowy z {{count}} filmami, począwszy od „{{title}}”, został otwarty przez @{{name}}.',
        body_other:
          'Twój link tymczasowy z {{count}} filmami, począwszy od „{{title}}”, został otwarty przez @{{name}}.',
        bodyGuest_one: 'Ktoś otworzył Twój link tymczasowy z „{{title}}”.',
        bodyGuest_few:
          'Ktoś otworzył Twój link tymczasowy z {{count}} filmami, począwszy od „{{title}}”.',
        bodyGuest_many:
          'Ktoś otworzył Twój link tymczasowy z {{count}} filmami, począwszy od „{{title}}”.',
        bodyGuest_other:
          'Ktoś otworzył Twój link tymczasowy z {{count}} filmami, począwszy od „{{title}}”.',
        button: 'Otwórz moje linki',
      },
      LINK_SAVED: {
        subject: 'Filmy z Twojego linku trafiły na półkę @{{name}}',
        title: 'Zapisane z Twojego linku',
        body_one:
          'Film „{{title}}” z Twojego linku tymczasowego trafił na półkę @{{name}}.',
        body_few:
          '{{count}} filmy z Twojego linku tymczasowego, począwszy od „{{title}}”, trafiły na półkę @{{name}}.',
        body_many:
          '{{count}} filmów z Twojego linku tymczasowego, począwszy od „{{title}}”, trafiło na półkę @{{name}}.',
        body_other:
          '{{count}} filmu z Twojego linku tymczasowego, począwszy od „{{title}}”, trafiło na półkę @{{name}}.',
        button: 'Otwórz moje linki',
      },
      VIDEO_TAKEN_DOWN: {
        subject: 'Twój film „{{title}}” został usunięty',
        title: 'Film usunięty',
        body: 'Usunęliśmy Twój film „{{title}}” z {{site}}: {{rule}}. Nie jest już dostępny dla nikogo.',
        message: 'Notatka moderatora: {{message}}',
        appeal: 'Jeśli uważasz, że to pomyłka, napisz na {{email}}.',
        button: 'Otwórz powiadomienia',
      },
      PLAN_EXPIRING: {
        subject: 'Twój plan Pro kończy się {{date}}',
        title: 'Pro wkrótce się skończy',
        body: 'Twój plan Pro w {{site}} kończy się {{date}} (UTC). Potem na Twojej półce zaczną obowiązywać limity Free; nic nie zostanie usunięte.',
        page: 'Twoja strona jest teraz ukryta; gdy Pro się skończy, znów wszyscy będą ją widzieć.',
        anonymousLinks:
          'Gdy Pro się skończy, Twoje anonimowe linki przestaną się otwierać; z Pro znów zaczną działać.',
        button: 'Otwórz swój plan',
      },
      PLAN_PAYMENT_FAILED: {
        subject: 'Nie udało się odnowić Twojego planu Pro',
        title: 'Płatność nie powiodła się',
        body: 'Płatność za Twój plan Pro w {{site}} nie przeszła. Zaktualizuj metodę płatności do {{date}} (UTC), inaczej na Twojej półce zaczną obowiązywać limity Free; nic nie zostanie usunięte.',
        button: 'Zaktualizuj metodę płatności',
      },
      PLAN_EXPIRED: {
        subject: 'Twój plan Pro się skończył',
        title: 'Pro się skończyło',
        body: 'Na Twojej półce w {{site}} obowiązują teraz limity Free: {{file}} na film i {{shelf}} łącznie. Nic nie zostało usunięte.',
        bodyOverQuota:
          'Na Twojej półce w {{site}} obowiązują teraz limity Free: {{file}} na film i {{shelf}} łącznie. Na półce masz więcej, więc przesyłanie nowych filmów jest wstrzymane, dopóki nie zwolnisz miejsca. Nic nie zostało usunięte.',
        page: 'Twoja strona znów jest widoczna dla wszystkich: ukrywanie strony jest dostępne w Pro.',
        anonymousLinks:
          'Twoje anonimowe linki już się nie otwierają; z Pro znów zaczną działać.',
        button: 'Otwórz swój plan',
      },
      TRAFFIC_RUNNING_OUT: {
        subject: 'Twój transfer się kończy',
        title: 'Transfer się kończy',
        body: 'W {{site}} zużyto już {{used}} z {{limit}} transferu na ten miesiąc. Gdy się wyczerpie, Twoje filmy publiczne i linki przestaną się otwierać u innych do {{date}} (UTC).',
        button: 'Otwórz swój plan',
      },
      TRAFFIC_USED_UP: {
        subject: 'Transfer na ten miesiąc się wyczerpał',
        title: 'Transfer się wyczerpał',
        body: 'Transfer na ten miesiąc ({{limit}}) w {{site}} się wyczerpał. Do {{date}} (UTC) Twoje filmy publiczne i linki nie otwierają się u innych, a Ty nie możesz oglądać filmów innych osób. Własne filmy oglądasz jak zwykle.',
        button: 'Otwórz swój plan',
      },
    },
    supportTopics: {
      QUESTION: 'pytanie',
      BUG: 'zgłoszenie błędu',
      ACCOUNT: 'konto',
      IDEA: 'pomysł',
    },
    takedownRules: {
      SPAM: 'spam lub reklama',
      ILLEGAL: 'nielegalne treści',
      COPYRIGHT: 'naruszenie praw autorskich',
      ABUSE: 'obelgi lub nękanie',
      UNMARKED_ADULT: 'treści wrażliwe bez oznaczenia',
      OTHER: 'naruszenie zasad',
    },
    footer:
      'Otrzymujesz ten e-mail, ponieważ w {{site}} założono konto z tym adresem.',
    verify: {
      subject: 'Potwierdź swój e-mail w {{site}}',
      title: 'Witaj w {{site}}, {{name}}!',
      body: 'Potwierdź adres e-mail, aby przesyłać filmy, prosić o filmy, dodawać znajomych i pisać wiadomości.',
      button: 'Potwierdź e-mail',
      expires: 'Link jest ważny przez 24 godziny.',
    },
    reset: {
      subject: 'Zmiana hasła w {{site}}',
      title: 'Resetowanie hasła',
      body: 'Cześć, {{name}}! Ktoś (mamy nadzieję, że Ty) poprosił o zresetowanie hasła do Twojego konta w {{site}}.',
      button: 'Ustaw nowe hasło',
      expires:
        'Link jest ważny przez 1 godzinę. Jeśli to nie Ty, zignoruj tę wiadomość.',
    },
    guestDeal: {
      button: 'Otwórz transakcję',
      footer:
        'Otrzymujesz ten e-mail, ponieważ ten adres został podany na stronie transakcji w {{site}}. Nie założono żadnego konta.',
      saved: {
        subject: 'Twoja transakcja z {{name}}',
        title: 'Zachowaj ten e-mail',
        body: 'Ten przycisk zaprowadzi Cię z powrotem do transakcji z {{name}} z dowolnego urządzenia. Gdy {{name}} odpowie, napiszemy do Ciebie tutaj.',
      },
      offer: {
        subject: '{{name}} odpowiada na Twoją ofertę',
        title: 'Nowa oferta',
        body: '{{name}} proponuje inną wymianę. Przyjmij ją, odpowiedz własną ofertą albo ją odrzuć. Transakcja poczeka jeszcze trzy dni.',
      },
      accepted: {
        subject: 'Wymiana z {{name}} zakończona',
        title: 'Wymiana zakończona',
        body: 'Otrzymane filmy możesz przez 7 dni oglądać i pobierać na stronie transakcji. Zaloguj się tam albo załóż konto, aby zatrzymać je na zawsze.',
      },
      shared: {
        subject: '{{name}} udostępnia Ci filmy',
        title: 'Udostępniono Ci filmy',
        body: '{{name}} daje Ci filmy, nie biorąc Twoich; Twoje filmy zostały usunięte z naszych serwerów. Otrzymane filmy możesz przez 7 dni oglądać i pobierać na stronie transakcji.',
      },
      declined: {
        subject: '{{name}} odrzuca wymianę',
        title: 'Wymiana odrzucona',
        body: 'Transakcja się zakończyła. Twoje filmy zostały od razu usunięte z naszych serwerów; nikt ich nie dostał.',
      },
      closed: {
        subject: 'Transakcja z {{name}} została zamknięta',
        title: 'Transakcja zamknięta',
        body: 'Transakcja nie mogła być kontynuowana (któregoś filmu już nie ma albo konto zostało zamknięte). Twoje filmy zostały od razu usunięte z naszych serwerów; nikt ich nie dostał.',
      },
      expired: {
        subject: 'Transakcja z {{name}} wygasła',
        title: 'Transakcja wygasła',
        body: 'Przez trzy dni nikt nie wykonał ruchu, więc transakcja się zakończyła. Twoje filmy zostały od razu usunięte z naszych serwerów; nikt ich nie dostał.',
      },
    },
    twoFactor: {
      button: 'Otwórz ustawienia bezpieczeństwa',
      notYou: 'Jeśli to nie Ty, natychmiast zmień hasło i napisz do nas.',
      on: {
        subject: 'Logowanie dwuetapowe jest włączone',
        title: 'Logowanie dwuetapowe jest włączone',
        body: 'Cześć, {{name}}! Logowanie hasłem do Twojego konta w {{site}} wymaga teraz także drugiego kroku. Inne urządzenia zostały wylogowane.',
      },
      off: {
        subject: 'Logowanie dwuetapowe jest wyłączone',
        title: 'Logowanie dwuetapowe jest wyłączone',
        body: 'Cześć, {{name}}! Logowanie do Twojego konta w {{site}} nie wymaga już drugiego kroku.',
      },
      reset: {
        subject: 'Logowanie dwuetapowe zostało zresetowane',
        title: 'Logowanie dwuetapowe zostało zresetowane',
        body: 'Cześć, {{name}}! Na Twoją prośbę administrator {{site}} wyłączył logowanie dwuetapowe na Twoim koncie. Możesz je ponownie włączyć w ustawieniach bezpieczeństwa.',
      },
      recoveryUsed: {
        subject: 'Użyto kodu zapasowego',
        title: 'Użyto kodu zapasowego',
        body: 'Cześć, {{name}}! Przed chwilą użyto kodu zapasowego do Twojego konta w {{site}}. Pozostałe kody: {{left}}.',
      },
    },
    links: {
      footer:
        'Otrzymujesz ten e-mail, ponieważ @{{username}} wysyła filmy na ten adres przez {{site}}.',
      invite: {
        subject: '@{{username}} udostępnia Ci filmy',
        title: '{{name}} udostępnia Ci filmy',
        body_one: '@{{username}} wysyła Ci film w {{site}}: „{{title}}”.',
        body_few:
          '@{{username}} wysyła Ci {{count}} filmy w {{site}}, począwszy od „{{title}}”.',
        body_many:
          '@{{username}} wysyła Ci {{count}} filmów w {{site}}, począwszy od „{{title}}”.',
        body_other:
          '@{{username}} wysyła Ci {{count}} filmu w {{site}}, począwszy od „{{title}}”.',
        how: 'Możesz oglądać i pobierać, dopóki link nie wygaśnie: działa do {{date}} (UTC). Aby go otworzyć, poproś o kod; przyjdzie na ten adres.',
        button: 'Otwórz filmy',
      },
      code: {
        subject: 'Kod {{code}} do otwarcia filmów',
        title: 'Twój kod: {{code}}',
        body: 'Wpisz go na stronie linku tymczasowego od @{{username}}.',
        expires:
          'Kod działa przez 15 minut. Jeśli nie prosisz o kod, zignoruj tę wiadomość.',
      },
    },
  },
};
