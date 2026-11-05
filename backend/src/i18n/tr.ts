export const tr = {
  errors: {
    clientTooOld: 'Uygulamanın bu sürümü bu sunucu için çok eski.',
    internal:
      'Bizim tarafımızda bir sorun oluştu. Lütfen daha sonra yeniden deneyin.',
    generic: 'İşlem tamamlanamadı.',
    badRequest: 'Geçersiz istek.',
    validation: 'Bazı alanlar geçersiz.',
    notFound: 'Bulunamadı.',
    conflict:
      'Bu işlem güncel durumla çakışıyor. Sayfayı yenileyip yeniden deneyin.',
    payloadTooLarge: 'Gönderilen veri çok büyük.',
    tooManyRequests: 'Çok fazla istek gönderildi. Lütfen biraz yavaşlayın.',
    unauthorized: 'Bunu yapmak için giriş yapmanız gerekiyor.',
    forbidden: 'Bunu yapma izniniz yok.',
    auth: {
      captchaRequired: 'Lütfen insan olduğunuzu doğrulayın.',
      captchaFailed: 'Doğrulama başarısız oldu. Lütfen yeniden deneyin.',
      captchaUnavailable:
        'Doğrulama şu anda kullanılamıyor. Lütfen daha sonra yeniden deneyin.',
      invalidCredentials: 'E-posta veya şifre yanlış.',
      registrationClosed:
        'Burada kayıtlar kapalı. Hesap almak için bu siteyi yöneten kişiye sorun.',
      emailTaken: 'Bu e-posta adresiyle zaten bir hesap var.',
      usernameTaken: 'Bu kullanıcı adı zaten alınmış.',
      usernameInvalid:
        'Kullanıcı adı 3–30 karakter olmalı: küçük Latin harfleri, rakamlar ve alt çizgi.',
      usernameReserved: 'Bu kullanıcı adı ayrılmış.',
      usernameChangeTooSoon_one:
        'Kullanıcı adınızı {{count}} gün sonra yeniden değiştirebilirsiniz.',
      usernameChangeTooSoon_other:
        'Kullanıcı adınızı {{count}} gün sonra yeniden değiştirebilirsiniz.',
      passwordWeak:
        'Şifre en az 8 karakter olmalı, bir harf ve bir rakam içermeli.',
      tokenInvalid: 'Bu bağlantı geçersiz ya da daha önce kullanılmış.',
      tokenExpired:
        'Bu bağlantının süresi dolmuş. Lütfen yeni bir bağlantı isteyin.',
      emailNotVerified: 'Lütfen önce e-posta adresinizi onaylayın.',
      emailAlreadyVerified: 'E-posta adresiniz zaten onaylanmış.',
      accountBanned: 'Bu hesap askıya alındı.',
      sessionExpired: 'Oturumunuzun süresi doldu. Lütfen yeniden giriş yapın.',
      tooManyAttempts_one:
        'Çok fazla giriş denemesi yapıldı. {{count}} dakika sonra yeniden deneyin.',
      tooManyAttempts_other:
        'Çok fazla giriş denemesi yapıldı. {{count}} dakika sonra yeniden deneyin.',
      googleNotConfigured: 'Google ile giriş kullanılamıyor.',
      googleFailed: 'Google ile giriş başarısız oldu. Lütfen yeniden deneyin.',
      googleSignupExpired:
        'Kayıt oturumunun süresi doldu. Lütfen baştan başlayın.',
      wrongPassword: 'Mevcut şifre yanlış.',
      csrf: 'İstek güvenlik nedeniyle engellendi. Sayfayı yenileyip yeniden deneyin.',
      twoFactorLogin: 'Doğrulama uygulamanızdaki kodu girin.',
      adminGoogle:
        'Yöneticiler Google ile değil, şifre ve ikinci adımla giriş yapar.',
      googleLinkTwoFactor:
        'Bu e-posta, iki adımlı girişi açık bir hesaba ait. O hesabın şifresiyle giriş yapın.',
    },
    twoFactor: {
      required:
        'Yönetim paneli için iki adımlı giriş gerekiyor: Ayarlar → Güvenlik bölümünden açın.',
      confirm: 'Önce ikinci adımla siz olduğunuzu doğrulayın.',
      invalidCode: 'Bu kod uymadı. Kontrol edip yeniden deneyin.',
      expired: 'Giriş çok uzun sürdü. Şifrenizi yeniden girin.',
      setupExpired: 'Kurulum çok uzun sürdü. Lütfen baştan başlayın.',
      needsPassword:
        'İki adımlı giriş bir şifreyi korur. Önce bir şifre belirleyin.',
      admin: 'Yöneticiler ikinci adım olmadan giriş yapamaz.',
      appExists: 'Bir doğrulama uygulaması zaten kurulu.',
      passkeyInvalid: 'Geçiş anahtarı yanıt vermedi. Lütfen yeniden deneyin.',
      passkeyLimit: 'Zaten 10 geçiş anahtarınız var.',
      passkeyNotFound: 'Bu geçiş anahtarı artık yok.',
      noPasskey: 'Bu hesabın geçiş anahtarı yok.',
      off: 'İki adımlı giriş kapalı.',
    },
    users: {
      notFound: 'Böyle bir kullanıcı yok.',
      pageHidingNotAllowed: 'Sayfayı gizlemek Pro’ya dahil.',
      invalidImage:
        'Bu dosya desteklenen bir görsel değil (JPEG, PNG, WebP veya GIF).',
    },
    exchange: {
      notFound: 'Böyle bir istek yok.',
      notAllowed: 'Bu istekle bunu yapamazsınız.',
      offerChanged:
        'Teklif bu arada değişti. Görüşmeye göz atıp yeniden deneyin.',
      videoBeingEdited:
        'Bu takastaki bir video şu anda yükleyeni tarafından düzenleniyor. Video hazır olduğunda yeniden deneyin.',
      nothingToRequest: 'Seçilen videoların hiçbiri istenemiyor.',
      hintTooEarly: 'İpucunu birkaç gösterimden sonra gizleyebilirsiniz.',
      selfRequest: 'Kendi videolarınızı isteyemezsiniz.',
      invalidOffer:
        'Bir teklifin her iki tarafında da en az bir video olmalı ve hepsi hâlâ sahiplerinde bulunmalı.',
      blocked: 'Bu kullanıcıya istek gönderemezsiniz.',
      alreadyBlocked: 'Bu kullanıcı zaten engellenmiş.',
      selfBlock: 'Kendinizi engelleyemezsiniz.',
    },
    social: {
      selfFollow: 'Kendinizi takip edemezsiniz.',
      followNotAllowed: 'Bu kullanıcıyı arkadaş olarak ekleyemezsiniz.',
    },
    editor: {
      invalid:
        'Bu düzenleme kaydedilemiyor: zamanları ve alanları kontrol edin.',
      nothing: 'Hiçbir şey değişmedi.',
      inProgress:
        'Bu video zaten düzenleniyor. Bitmesini bekleyin ya da iptal edin.',
      notReady: 'Video, işlendikten sonra düzenlenebilir.',
      proOnly: 'Video düzenleyici Pro’ya dahil.',
      copyOwnOnly:
        'Yalnızca kendi videolarınızı kopya olarak kaydedebilirsiniz.',
    },
    invites: {
      notFound: 'Böyle bir davet bağlantısı yok.',
      expired: 'Bu davetin süresi doldu. Yeni bir bağlantı isteyin.',
      usedUp: 'Bu davetin kullanım hakkı doldu. Yeni bir bağlantı isteyin.',
      own: 'Bu sizin davetiniz: birine gönderin.',
    },
    deals: {
      notFound:
        'Bu takas bulunamadı (ya da bu tarayıcı, takasın başlatıldığı tarayıcı değil).',
      closed: 'Bu takas sona erdi.',
      linkNotFound: 'Bu takas bağlantısı artık çalışmıyor.',
      linkVideos:
        'Takas bağlantısı için kendi hazır videolarınızdan seçin (en fazla 50).',
      guestsOff: 'Bu kişi yalnızca kayıtlı kullanıcılarla takas yapıyor.',
      uploadsMax: 'Bir takasa en fazla {{max}} videonuzu yükleyebilirsiniz.',
      videoInOffer:
        'Bu video şu anki teklifte yer alıyor: önce teklifi değiştirin.',
      nothingOffered:
        'Teklif etmek için kendi videolarınızdan en az birini yükleyin.',
      tooMany:
        'Devam eden {{max}} takasınız var. Yenisine başlamadan önce birini bitirin.',
    },
    links: {
      notFound: 'Böyle bir bağlantı yok ya da artık çalışmıyor.',
      passwordPro: 'Bağlantıya şifre koymak Pro’ya dahil.',
      tooMany:
        'Hâlâ geçerli {{max}} bağlantınız var. Önce bazılarını iptal edin.',
      videoNotAllowed:
        'Bağlantıyla yalnızca hazır ve silinmemiş videolar gönderilebilir: kendi yüklemeleriniz ve size gelenler.',
      locked: 'Önce şifreyi ya da e-postadaki kodu girin.',
      wrongPassword: 'Şifre yanlış.',
      wrongCode: 'Kod yanlış ya da süresi dolmuş. Yeni bir kod isteyin.',
      codeTooSoon:
        'Az önce bir kod gönderildi. Bir dakika sonra yenisini isteyebilirsiniz.',
      codeLimit:
        'Bu bağlantı için çok fazla kod istendi. Bir saat sonra yeniden deneyin.',
      noEmail: 'Bu bağlantı belirli bir e-posta adresine bağlı değil.',
      emailOff:
        'Bu sunucu e-posta göndermiyor, bu yüzden tek kişilik bağlantılar kullanılamıyor.',
      blocked: 'Bu kişinin videolarını ekleyemezsiniz.',
    },
    anonymousLinks: {
      pro: 'Anonim bağlantılar Pro’ya dahil.',
      tooMany: 'Zaten {{max}} anonim bağlantınız var. Önce birini silin.',
      notFound: 'Böyle bir bağlantı yok ya da artık çalışmıyor.',
      nameNeeded:
        'Adınız kullanıcı adınızı ele veriyor. Bu bağlantı için bir ad seçin.',
      nameNamesNickname:
        'Bu ad kullanıcı adınızı ele veriyor. Başka bir ad seçin.',
    },
    appTokens: {
      scope: 'Tarayıcı uzantısı bunu yapamaz.',
      invalid: 'Uzantı artık bağlı değil. Yeniden bağlayın.',
      code: 'Kodun süresi dolmuş ya da kod yanlış. Uzantıyı yeniden bağlamayı deneyin.',
      redirect: 'Bu, tapeshelf uzantısına benzemiyor.',
      notFound: 'Böyle bir bağlı uygulama yok.',
    },
    chat: {
      notFriends:
        'Yalnızca arkadaşlarınıza mesaj yazabilirsiniz: ikinizin de birbirinizi eklemesi gerekiyor.',
      unavailable: 'Bu kullanıcı mesaj alamıyor.',
      emptyMessage: 'Bir şey yazın ya da bir video ekleyin.',
      videoNotAttachable:
        'Bu video eklenemiyor. Sayfanızda görünen, hazır bir video seçin.',
      selfMessage: 'Kendinize mesaj yazamazsınız.',
      notFound: 'Böyle bir sohbet yok.',
    },
    reports: {
      self: 'Kendinizi ya da kendi videolarınızı şikayet edemezsiniz.',
    },
    support: {
      notFound: 'Bu talep bulunamadı.',
      tooMany:
        '{{count}} açık talebiniz var. Birinin yanıtlanmasını bekleyin ya da birini çözüldü olarak işaretleyin.',
      closed:
        'Bu talep kapatıldı. Sorun devam ediyorsa lütfen yeni bir talep açın.',
      empty: 'Bir mesaj yazın ya da bir görsel ekleyin.',
      tooManyFiles: 'Bir mesajda en fazla {{count}} görsel olabilir.',
      badImage: 'Bu görsel okunamadı. PNG, JPG veya WebP, en fazla 10 MB.',
      notYourVideo: 'Yalnızca kendi yüklediğiniz bir videoyu ekleyebilirsiniz.',
      notRated:
        'Bir talep, çözüldükten ya da kapatıldıktan sonra değerlendirilebilir.',
    },
    site: {
      legalNotFound: 'Bu sitenin işletmecisi bu belgeyi yayımlamadı.',
    },
    account: {
      confirmMismatch: 'Onaylamak için kullanıcı adınızı tam olarak yazın.',
      deleted: 'Bu hesap silindi.',
    },
    billing: {
      disabled: 'Bu sunucuda ödeme alınmıyor.',
      unavailable:
        'Ödemeler şu anda kullanılamıyor. Lütfen daha sonra yeniden deneyin.',
      signature: 'İmza eşleşmiyor.',
      noSubscription: 'Aboneliğiniz yok.',
    },
    downloads: {
      limitReached:
        'Bu ayki {{limit}} indirme hakkınızın hepsini kullandınız. Bir sonraki indirme {{date}} tarihinde açılıyor.',
      busy: 'Başka bir indirme hâlâ sürüyor. Bitmesini bekleyip yeniden deneyin.',
      ticketInvalid:
        'Bu indirme bağlantısının süresi doldu. İndirmeyi video sayfasından yeniden başlatın.',
      range: 'Dosyanın bu kısmı yok.',
    },
    traffic: {
      limitReached:
        'Planınızın bu ayki trafiğinin hepsini kullandınız. Gelecek ayın başında yenilenir.',
      sharerLimitReached:
        'Bu videoyu paylaşan kişi bu ayki trafiğinin hepsini kullandı. Gelecek ayın başında yenilenir.',
    },
    admin: {
      selfAction: 'Bunu kendi hesabınıza uygulayamazsınız.',
      adminTarget: 'Önce yönetici rolünü kaldırın.',
      notInTrash: 'Bu video çöp kutusunda değil.',
      purged: 'Bu video depolamadan zaten silindi.',
      authorDeleted: 'Yükleyen hesabını sildiği için video geri yüklenemez.',
      alreadyProcessed: 'Bu video zaten işlendi.',
      tierUntilPast: 'Bitiş tarihi gelecekte olmalı.',
      tiersDisabled: 'Bu sunucuda plan yok.',
      reportClosed: 'Bu şikayet zaten ele alındı.',
      reportAction: 'Bu işlem şikayete uymuyor.',
      noEmail: 'Bu hesabın e-posta adresi yok.',
      viewAsReadOnly:
        'Siteyi başka bir kullanıcının gözünden görüyorsunuz: hiçbir şey değiştirilemez.',
    },
    categories: {
      exists: 'Bu adla zaten bir kategoriniz var.',
      tooMany: 'En fazla {{max}} kategori oluşturabilirsiniz.',
    },
    uploads: {
      fileTooLarge: 'Dosya {{max}} sınırından büyük.',
      quotaExceeded:
        'Yeterli depolama alanı yok: {{used}} / {{quota}} zaten kullanılıyor.',
      notFound: 'Böyle bir yükleme yok.',
      notActive: 'Bu yükleme zaten tamamlandı ya da iptal edildi.',
      expired: 'Bu yüklemenin süresi doldu. Lütfen yeniden başlatın.',
      incomplete:
        'Dosyanın bazı parçaları eksik ya da bozuk. Lütfen yüklemeyi yeniden deneyin.',
      sizeMismatch: 'Yüklenen dosya bildirilen boyutla eşleşmiyor.',
      extensionDailyLimit:
        'Bugün uzantı üzerinden {{limit}} video kaydettiniz; izin verilen en yüksek sayı bu. Sayaç gece yarısı (UTC) sıfırlanır.',
    },
    videos: {
      deleteInAdminPanel:
        'Başkalarının videolarını yönetim panelinden silin: yükleyene ihlal edilen kural ve notunuz iletilir.',
      notFound: 'Böyle bir video yok.',
      notReady: 'Video hâlâ işleniyor.',
      categoryNotFound: 'Böyle bir kategori yok.',
      stackNotFound: 'Böyle bir yığın yok.',
      stackTooSmall: 'Bir yığında en az iki video olmalı.',
      stackCategories:
        'Bir yığındaki videoların kategorisi ortaktır: önce kategoriyi seçin.',
      frameNotFound: 'Böyle bir kare yok.',
      timestampOutOfRange: 'Bu an videonun bitişinden sonra.',
      notWatchable: 'Bu videoya erişiminiz yok.',
      playbackTokenInvalid:
        'Oynatma bağlantısının süresi doldu. Lütfen sayfayı yenileyin.',
      downloadNotAllowed: 'Bu video indirilemez.',
      alreadyInCollection: 'Bu video zaten koleksiyonunuzda.',
      cannotAddToCollection: 'Bu video koleksiyonunuza eklenemez.',
      cannotHide: 'Bu video rafınızda değil.',
      ownVideoRename:
        'Kendi videonuzun adı, düzenleme formunda ve herkes için değiştirilir.',
    },
  },
  editor: {
    copySuffix: '(düzenlenmiş)',
  },
  notifications: {
    failReason: {
      corrupted: 'dosya bozuk ya da video değil',
      noVideoStream: 'dosyada görüntü akışı yok',
      zeroDuration: 'videonun süresi yok',
      tooLong: '12 saatten uzun videolar desteklenmiyor',
      tooLarge: '4096 pikselden büyük kareler desteklenmiyor',
      fpsTooHigh: '60 fps üzerindeki kare hızları desteklenmiyor',
      tooManyStreams: 'dosyada çok fazla akış var',
      transcodeFailed: 'video dönüştürülemedi',
      blocked:
        'bu dosya kuralları ihlal ettiği için kaldırıldı ve yeniden yüklenemez',
      internal: 'İşleme başarısız oldu. Lütfen yeniden yüklemeyi deneyin',
    },
  },
  mail: {
    notifications: {
      guest: 'Bir misafir',
      anonymous: 'Anonim',
      manage: 'Hangi bildirimleri alacağınızı değiştirin: {{url}}',
      unsubscribe: 'Bunun gibi e-postaları durdur: {{url}}',
      andMore_one: ' ve {{count}} video daha',
      andMore_other: ' ve {{count}} video daha',
      REQUEST_RECEIVED: {
        subject: '{{name}}, “{{title}}” videosunu istiyor',
        title: 'Yeni video isteği',
        body_one:
          '{{name}}, “{{title}}” videosunu kendisiyle paylaşmanızı istiyor. Ücretsiz paylaşın, reddedin ya da takas önerin.',
        body_other:
          '{{name}}, “{{title}}” ile başlayan {{count}} videoyu kendisiyle paylaşmanızı istiyor. Ücretsiz paylaşın, reddedin ya da takas önerin.',
        message: 'Mesajı: “{{message}}”',
        offered_one:
          'Karşılığında kendi videolarından {{count}} tanesini teklif ediyor.',
        offered_other:
          'Karşılığında kendi videolarından {{count}} tanesini teklif ediyor.',
        button: 'İsteği aç',
      },
      OFFER_RECEIVED: {
        subject: '{{name}} size bir teklif yaptı',
        title: 'Karşı teklif geldi',
        body: '{{name}} bir takas önerdi ({{round}}. tur). Kabul edin, reddedin ya da kendi teklifinizi yapın.',
        bodyDeal:
          '{{name}}, sizin “{{wants}}”{{wantsMore}} karşılığında “{{gives}}”{{givesMore}} teklif ediyor. Kabul edin, reddedin ya da kendi teklifinizi yapın.',
        message: 'Mesajı: “{{message}}”',
        button: 'Görüşmeyi aç',
      },
      REQUEST_SHARED: {
        subject: '{{name}}, “{{title}}” videosunu sizinle paylaştı',
        title: 'Sizinle paylaşıldı',
        body_one:
          '{{name}}, “{{title}}” videosunu sizinle ücretsiz paylaştı. Video artık koleksiyonunuzda.',
        body_other:
          '{{name}}, “{{title}}” ile başlayan {{count}} videoyu sizinle ücretsiz paylaştı. Videolar artık koleksiyonunuzda.',
        button: 'Alınan videoları gör',
      },
      EXCHANGE_COMPLETED: {
        subject: '{{name}} ile takas tamamlandı',
        title: 'Takas tamamlandı',
        body: '{{name}} ile takasınız tamamlandı: {{received}} video aldınız, {{given}} video verdiniz. Aldıklarınız artık koleksiyonunuzda.',
        button: 'Alınan videoları gör',
      },
      REQUEST_DECLINED: {
        subject: '{{name}}, “{{title}}” isteğinizi reddetti',
        title: 'İstek reddedildi',
        body: '{{name}} reddetti. {{comment}}',
        again_one: '{{count}} gün sonra yeniden isteyebilirsiniz.',
        again_other: '{{count}} gün sonra yeniden isteyebilirsiniz.',
        button: 'İsteği aç',
      },
      REQUEST_CANCELLED: {
        subject: '{{name}}, “{{title}}” isteğini geri çekti',
        title: 'İstek geri çekildi',
        body: '{{name}}, “{{title}}” için yaptığı isteği iptal etti.',
        button: 'İsteği aç',
      },
      REQUEST_INVALIDATED: {
        subject: '“{{title}}” isteği değişti',
        title: 'İstek sistem tarafından güncellendi',
        body: '“{{title}}” isteğindeki videolardan biri artık mevcut değil, bu yüzden görüşme güncellendi.',
        bodyClosed:
          '“{{title}}” isteği kapatıldı: diğer hesap artık mevcut değil.',
        bodyExpired:
          'Bir misafirle “{{title}}” için yapılan takasın süresi doldu: üç gün boyunca kimse adım atmadı. Misafirin videoları silindi.',
        button: 'İsteği aç',
      },
      NEW_FOLLOWER: {
        subject: 'Yeni takipçi: {{name}}',
        title: 'Yeni takipçi',
        body: '{{name}} artık koleksiyonunuzu takip ediyor. Arkadaş olup birbirinize mesaj yazabilmek için siz de onu ekleyin.',
        button: 'Sayfasını aç',
      },
      FRIEND_ACCEPTED: {
        subject: '{{name}} ile artık arkadaşsınız',
        title: 'Yeni arkadaş',
        body: '{{name}} ile artık birbirinizi takip ediyorsunuz. Birbirinize mesaj ve video gönderebilirsiniz.',
        button: 'Sayfasını aç',
      },
      FOLLOWED_NEW_VIDEO: {
        subject: '{{name}} yeni bir video ekledi: “{{title}}”',
        title: '{{name}} yeni bir video ekledi',
        body: '{{name}} yeni bir video ekledi: “{{title}}”.',
        bodyPrivate:
          '{{name}} yeni bir özel video ekledi: “{{title}}”. Sizinle paylaşmasını isteyebilirsiniz.',
        button: 'Videoyu aç',
      },
      NEW_MESSAGE: {
        subject: 'Yeni mesaj: {{name}}',
        title: 'Yeni mesaj',
        body: '{{name}}: “{{preview}}”',
        bodyVideo: '{{name}} sohbette size bir video gönderdi.',
        button: 'Sohbeti aç',
      },
      VIDEO_PROCESSED: {
        subject: '“{{title}}” hazır',
        title: 'Videonuz hazır',
        body: '“{{title}}” işlendi, artık izlenebilir.',
        button: 'Videoyu aç',
      },
      VIDEO_FAILED: {
        subject: '“{{title}}” işlenemedi',
        title: 'İşleme başarısız oldu',
        body: '“{{title}}” işlenemedi: {{reason}}. Dosyayı yeniden yükleyebilirsiniz.',
        button: 'Sayfamı aç',
      },
      VIDEO_REMOVED: {
        subject: '“{{title}}” yükleyeni tarafından kaldırıldı',
        title: 'Bir video koleksiyonunuzdan çıktı',
        body: '{{author}}, koleksiyonunuzdaki “{{title}}” videosunu sildi. Artık kimse bu videoya erişemiyor.',
        button: 'Bildirimleri aç',
      },
      REPORT_RESOLVED: {
        subject: 'Şikayetiniz incelendi',
        title: 'Şikayet incelendi',
        bodyVideo:
          '“{{title}}” hakkındaki şikayetinizi inceledik ve gerekli önlemi aldık. {{site}} güvenli kalsın diye yardım ettiğiniz için teşekkürler.',
        bodyUser:
          '{{title}} adlı kullanıcı hakkındaki şikayetinizi inceledik ve gerekli önlemi aldık. {{site}} güvenli kalsın diye yardım ettiğiniz için teşekkürler.',
        bodyVideoNone:
          '“{{title}}” hakkındaki şikayetinizi inceledik ve kurallara aykırı bir durum bulmadık.',
        bodyUserNone:
          '{{title}} adlı kullanıcı hakkındaki şikayetinizi inceledik ve kurallara aykırı bir durum bulmadık.',
        button: 'Bildirimleri aç',
      },
      ADMIN_NOTICE: {
        subject: '{{site}} ekibinden bir mesaj',
        title: '{{site}} ekibinden mesaj',
        body: '{{message}}',
        button: 'Bildirimleri aç',
      },
      VIDEO_EDITED: {
        subject: '“{{title}}” videonuz bir moderatör tarafından düzenlendi',
        title: 'Video düzenlendi',
        body: 'Bir {{site}} moderatörü “{{title}}” videonuzu düzenledi (örneğin bir kısmını bulanıklaştırdı). Bağlantı ve diğer her şey aynı kaldı.',
        button: 'Videoyu aç',
      },
      VIDEO_EDIT_FAILED: {
        subject: '“{{title}}” düzenlemesi yapılamadı',
        title: 'Düzenleme kaydedilmedi',
        body: '“{{title}}” videonuzdaki düzenleme yapılamadı. Video olduğu gibi duruyor; değişiklikleriniz düzenleyicide bekliyor, yeniden deneyebilirsiniz.',
        button: 'Düzenleyiciyi aç',
      },
      SUPPORT_REPLY: {
        subject: 'Destek ekibi #{{number}} numaralı talebinizi yanıtladı',
        title: 'Destek yanıtladı',
        body: '#{{number}} “{{subject}}”: {{preview}}',
        bodyResolved:
          'Destek ekibi #{{number}} “{{subject}}” talebinizi çözüldü olarak işaretledi. Sorun devam ediyorsa yeni bir talep açın.',
        bodyResolvedWith:
          'Destek ekibi #{{number}} “{{subject}}” talebinizi yanıtladı ve çözüldü olarak işaretledi: {{preview}}',
        button: 'Talebi aç',
      },
      SUPPORT_TICKET: {
        subject: 'Destek #{{number}}: {{subject}}',
        title: 'Destek talebi #{{number}}',
        body: '@{{name}} yardım istiyor ({{topic}}): “{{subject}}”. {{preview}}',
        bodyReply:
          '@{{name}}, #{{number}} “{{subject}}” talebine yeniden yazdı: {{preview}}',
        button: 'Yönetim panelinde aç',
      },
      LINK_OPENED: {
        subject: 'Geçici bağlantınız açıldı',
        title: 'Bağlantı açıldı',
        body_one:
          '@{{name}}, “{{title}}” videosunu içeren geçici bağlantınızı açtı.',
        body_other:
          '@{{name}}, “{{title}}” ile başlayan {{count}} videoluk geçici bağlantınızı açtı.',
        bodyGuest_one:
          'Biri, “{{title}}” videosunu içeren geçici bağlantınızı açtı.',
        bodyGuest_other:
          'Biri, “{{title}}” ile başlayan {{count}} videoluk geçici bağlantınızı açtı.',
        button: 'Bağlantılarımı aç',
      },
      LINK_SAVED: {
        subject: '@{{name}} bağlantınızdaki videoları kaydetti',
        title: 'Bağlantınızdan kaydedildi',
        body_one:
          '@{{name}}, geçici bağlantınızdaki “{{title}}” videosunu kendi rafına ekledi.',
        body_other:
          '@{{name}}, geçici bağlantınızdaki “{{title}}” ile başlayan {{count}} videoyu kendi rafına ekledi.',
        button: 'Bağlantılarımı aç',
      },
      VIDEO_TAKEN_DOWN: {
        subject: '“{{title}}” videonuz kaldırıldı',
        title: 'Video kaldırıldı',
        body: '“{{title}}” videonuzu {{site}} üzerinden kaldırdık. Sebep: {{rule}}. Artık kimse bu videoya erişemiyor.',
        message: 'Moderatörün notu: {{message}}',
        appeal:
          'Bunun bir hata olduğunu düşünüyorsanız {{email}} adresine yazın.',
        button: 'Bildirimleri aç',
      },
      PLAN_EXPIRING: {
        subject: 'Pro planınız {{date}} tarihinde sona eriyor',
        title: 'Pro yakında sona eriyor',
        body: '{{site}} üzerindeki Pro planınız {{date}} (UTC) tarihinde sona eriyor. Bundan sonra rafınızda Free sınırları geçerli olur; hiçbir şey silinmez.',
        page: 'Sayfanız şu anda gizli; Pro sona erdiğinde herkes onu yeniden görebilecek.',
        anonymousLinks:
          'Pro sona erdiğinde anonim bağlantılarınız açılmaz olur; tekrar Pro’ya geçtiğinizde yeniden çalışır.',
        button: 'Planı aç',
      },
      PLAN_PAYMENT_FAILED: {
        subject: 'Pro planınızı yenileyemedik',
        title: 'Ödeme başarısız',
        body: '{{site}} üzerindeki Pro planınızın ödemesi gerçekleşmedi. Ödeme yönteminizi {{date}} (UTC) tarihine kadar güncelleyin; aksi halde rafınızda Free sınırları geçerli olur. Hiçbir şey silinmez.',
        button: 'Ödeme yöntemini güncelle',
      },
      PLAN_EXPIRED: {
        subject: 'Pro planınız sona erdi',
        title: 'Pro sona erdi',
        body: '{{site}} üzerindeki rafınızda artık Free sınırları geçerli: video başına {{file}}, toplamda {{shelf}}. Hiçbir şey silinmedi.',
        bodyOverQuota:
          '{{site}} üzerindeki rafınızda artık Free sınırları geçerli: video başına {{file}}, toplamda {{shelf}}. Rafınızda bundan fazlası olduğu için siz yer açana kadar yeni yüklemeler duraklatıldı. Hiçbir şey silinmedi.',
        page: 'Sayfanız yeniden herkese görünüyor: sayfayı gizlemek Pro’ya dahil.',
        anonymousLinks:
          'Anonim bağlantılarınız artık açılmıyor; tekrar Pro’ya geçtiğinizde yeniden çalışır.',
        button: 'Planı aç',
      },
      TRAFFIC_RUNNING_OUT: {
        subject: 'Trafiğiniz bitmek üzere',
        title: 'Trafik bitmek üzere',
        body: '{{site}} üzerindeki bu ayki {{limit}} trafiğinizin {{used}} kadarını kullandınız. Trafik bittiğinde herkese açık videolarınız ve bağlantılarınız {{date}} (UTC) tarihine kadar başkaları için açılmaz.',
        button: 'Planı aç',
      },
      TRAFFIC_USED_UP: {
        subject: 'Bu ayki trafiğiniz tükendi',
        title: 'Trafik tükendi',
        body: '{{site}} üzerindeki bu ayki trafiğiniz ({{limit}}) tükendi. {{date}} (UTC) tarihine kadar herkese açık videolarınız ve bağlantılarınız başkaları için açılmaz, siz de başkalarının videolarını izleyemezsiniz. Kendi videolarınızı her zamanki gibi izleyebilirsiniz.',
        button: 'Planı aç',
      },
    },
    supportTopics: {
      QUESTION: 'soru',
      BUG: 'hata bildirimi',
      ACCOUNT: 'hesap',
      IDEA: 'fikir',
    },
    takedownRules: {
      SPAM: 'spam veya reklam',
      ILLEGAL: 'yasa dışı içerik',
      COPYRIGHT: 'telif hakkı ihlali',
      ABUSE: 'hakaret veya taciz',
      UNMARKED_ADULT: 'işaretlenmemiş hassas içerik',
      OTHER: 'kural ihlali',
    },
    footer:
      'Bu e-postayı, bu adresle bir {{site}} hesabı oluşturulduğu için aldınız.',
    verify: {
      subject: '{{site}} için e-posta adresinizi onaylayın',
      title: 'Hoş geldiniz, {{name}}! {{site}} hesabınız hazır.',
      body: 'Video yükleyebilmek, video isteyebilmek, arkadaş ekleyebilmek ve mesajlaşabilmek için e-posta adresinizi onaylayın.',
      button: 'E-postayı onayla',
      expires: 'Bağlantı 24 saat geçerli.',
    },
    reset: {
      subject: '{{site}} şifrenizi sıfırlayın',
      title: 'Şifre sıfırlama',
      body: 'Merhaba {{name}}, biri (umarız sizsinizdir) {{site}} hesabınızın şifresini sıfırlamak istedi.',
      button: 'Yeni şifre belirle',
      expires:
        'Bağlantı 1 saat geçerli. Bu isteği siz yapmadıysanız bu e-postayı yok sayabilirsiniz.',
    },
    guestDeal: {
      button: 'Takası aç',
      footer:
        'Bu e-postayı, {{site}} üzerindeki bir takas sayfasına bu adresi girdiğiniz için aldınız. Hesap oluşturulmadı.',
      saved: {
        subject: '{{name}} ile takasınız',
        title: 'Bu e-postayı saklayın',
        body: 'Bu düğmeyle {{name}} ile takasınıza her cihazdan geri dönebilirsiniz. {{name}} yanıt verdiğinde size bu adrese yazarız.',
      },
      offer: {
        subject: '{{name}} teklifinize yanıt verdi',
        title: 'Yeni teklif',
        body: '{{name}} farklı bir takas önerdi. Kabul edin, kendi teklifinizle yanıt verin ya da reddedin. Takas üç gün daha bekler.',
      },
      accepted: {
        subject: '{{name}} ile takas tamamlandı',
        title: 'Takas tamamlandı',
        body: 'Aldığınız videoları takas sayfasında 7 gün boyunca izleyip indirebilirsiniz. Kalıcı olarak saklamak için aynı sayfada giriş yapın ya da hesap oluşturun.',
      },
      shared: {
        subject: '{{name}} videoları sizinle paylaştı',
        title: 'Sizinle paylaşıldı',
        body: '{{name}} videolarını sizinkileri almadan verdi; sizin videolarınız sunucularımızdan silindi. Size verilenleri takas sayfasında 7 gün boyunca izleyip indirebilirsiniz.',
      },
      declined: {
        subject: '{{name}} takası reddetti',
        title: 'Takas reddedildi',
        body: 'Takas sona erdi. Videolarınız sunucularımızdan hemen silindi; kimse onları almadı.',
      },
      closed: {
        subject: '{{name}} ile takas kapandı',
        title: 'Takas kapandı',
        body: 'Takas devam edemedi (bir video artık yok ya da hesap kapatıldı). Videolarınız sunucularımızdan hemen silindi; kimse onları almadı.',
      },
      expired: {
        subject: '{{name}} ile takasın süresi doldu',
        title: 'Takasın süresi doldu',
        body: 'Üç gün boyunca kimse adım atmadığı için takas sona erdi. Videolarınız sunucularımızdan hemen silindi; kimse onları almadı.',
      },
    },
    twoFactor: {
      button: 'Güvenlik ayarlarını aç',
      notYou:
        'Bunu siz yapmadıysanız hemen şifrenizi değiştirin ve bize yazın.',
      on: {
        subject: 'İki adımlı giriş açıldı',
        title: 'İki adımlı giriş açıldı',
        body: 'Merhaba {{name}}, {{site}} hesabınıza şifreyle girerken artık ikinci adım da isteniyor. Diğer cihazlardaki oturumlar kapatıldı.',
      },
      off: {
        subject: 'İki adımlı giriş kapatıldı',
        title: 'İki adımlı giriş kapatıldı',
        body: 'Merhaba {{name}}, {{site}} hesabınıza girerken artık ikinci adım istenmiyor.',
      },
      reset: {
        subject: 'İki adımlı giriş sıfırlandı',
        title: 'İki adımlı giriş sıfırlandı',
        body: 'Merhaba {{name}}, isteğiniz üzerine bir {{site}} yöneticisi hesabınızdaki iki adımlı girişi kapattı. Güvenlik ayarlarından yeniden açabilirsiniz.',
      },
      recoveryUsed: {
        subject: 'Bir kurtarma kodu kullanıldı',
        title: 'Bir kurtarma kodu kullanıldı',
        body: 'Merhaba {{name}}, {{site}} hesabınızın kurtarma kodlarından biri az önce kullanıldı. Kalan kod: {{left}}.',
      },
    },
    links: {
      footer:
        'Bu e-postayı, @{{username}} bu adrese {{site}} üzerinden video gönderdiği için aldınız.',
      invite: {
        subject: '@{{username}} sizinle video paylaşıyor',
        title: '{{name}} sizinle video paylaşıyor',
        body_one:
          '@{{username}} size {{site}} üzerinden bir video gönderdi: “{{title}}”.',
        body_other:
          '@{{username}} size {{site}} üzerinden “{{title}}” ile başlayan {{count}} video gönderdi.',
        how: 'Bağlantının süresi dolmadan videoları izleyip indirin: bağlantı {{date}} (UTC) tarihine kadar geçerli. Açmak için kod isteyin; kod bu adrese gelir.',
        button: 'Videoları aç',
      },
      code: {
        subject: 'Videoları açmak için kod: {{code}}',
        title: 'Kodunuz: {{code}}',
        body: 'Kodu, @{{username}} tarafından gönderilen geçici bağlantının sayfasına girin.',
        expires:
          'Kod 15 dakika geçerli. Kodu siz istemediyseniz bu e-postayı yok sayın.',
      },
    },
  },
} as const;
