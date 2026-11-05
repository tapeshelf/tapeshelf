export const id = {
  errors: {
    clientTooOld: 'Versi aplikasi ini terlalu lama untuk server ini.',
    internal: 'Terjadi kesalahan di pihak kami. Silakan coba lagi nanti.',
    generic: 'Permintaan tidak dapat diselesaikan.',
    badRequest: 'Permintaan tidak valid.',
    validation: 'Beberapa kolom tidak valid.',
    notFound: 'Tidak ditemukan.',
    conflict:
      'Ini bertentangan dengan keadaan saat ini. Muat ulang halaman dan coba lagi.',
    payloadTooLarge: 'Permintaan terlalu besar.',
    tooManyRequests: 'Terlalu banyak permintaan. Mohon lebih pelan.',
    unauthorized: 'Anda perlu masuk untuk melakukan itu.',
    forbidden: 'Anda tidak punya izin untuk melakukan itu.',
    auth: {
      captchaRequired: 'Mohon konfirmasi bahwa Anda manusia.',
      captchaFailed: 'Pemeriksaan tidak lolos. Silakan coba lagi.',
      captchaUnavailable:
        'Pemeriksaan sedang tidak tersedia. Silakan coba lagi nanti.',
      invalidCredentials: 'Email atau kata sandi salah.',
      registrationClosed:
        'Pendaftaran di sini ditutup. Untuk mendapatkan akun, tanyakan kepada pengelola situs ini.',
      emailTaken: 'Sudah ada akun dengan email ini.',
      usernameTaken: 'Nama pengguna ini sudah dipakai.',
      usernameInvalid:
        'Nama pengguna terdiri dari 3–30 karakter: huruf kecil, angka, dan garis bawah.',
      usernameReserved: 'Nama pengguna ini dicadangkan.',
      usernameChangeTooSoon_other:
        'Anda bisa mengganti nama pengguna lagi dalam {{count}} hari.',
      passwordWeak:
        'Kata sandi minimal 8 karakter dan harus berisi huruf dan angka.',
      tokenInvalid: 'Tautan ini tidak valid atau sudah dipakai.',
      tokenExpired: 'Tautan ini sudah kedaluwarsa. Silakan minta tautan baru.',
      emailNotVerified: 'Silakan konfirmasi alamat email Anda terlebih dahulu.',
      emailAlreadyVerified: 'Email Anda sudah dikonfirmasi.',
      accountBanned: 'Akun ini telah ditangguhkan.',
      sessionExpired: 'Sesi Anda sudah berakhir. Silakan masuk lagi.',
      tooManyAttempts_other:
        'Terlalu banyak percobaan masuk. Coba lagi dalam {{count}} menit.',
      googleNotConfigured: 'Masuk dengan Google tidak tersedia.',
      googleFailed: 'Gagal masuk dengan Google. Silakan coba lagi.',
      googleSignupExpired:
        'Sesi pendaftaran sudah berakhir. Silakan mulai lagi.',
      wrongPassword: 'Kata sandi saat ini salah.',
      csrf: 'Permintaan diblokir demi keamanan. Muat ulang halaman dan coba lagi.',
      twoFactorLogin: 'Masukkan kode dari aplikasi autentikator Anda.',
      adminGoogle:
        'Admin masuk dengan kata sandi dan langkah kedua, bukan dengan Google.',
      googleLinkTwoFactor:
        'Email ini milik akun yang memakai masuk dua langkah. Masuklah dengan kata sandinya.',
    },
    twoFactor: {
      required:
        'Panel admin memerlukan masuk dua langkah: aktifkan di Pengaturan → Keamanan.',
      confirm: 'Konfirmasi dulu bahwa ini Anda dengan langkah kedua.',
      invalidCode: 'Kode ini tidak cocok. Periksa lalu coba lagi.',
      expired: 'Proses masuk terlalu lama. Masukkan kata sandi Anda lagi.',
      setupExpired: 'Penyiapan terlalu lama. Silakan mulai lagi.',
      needsPassword:
        'Masuk dua langkah melindungi kata sandi. Buat kata sandi terlebih dahulu.',
      admin: 'Admin tidak bisa masuk tanpa langkah kedua.',
      appExists: 'Aplikasi autentikator sudah disiapkan.',
      passkeyInvalid: 'Kunci sandi tidak merespons. Silakan coba lagi.',
      passkeyLimit: 'Anda sudah punya 10 kunci sandi.',
      passkeyNotFound: 'Kunci sandi ini sudah tidak ada.',
      noPasskey: 'Akun ini tidak punya kunci sandi.',
      off: 'Masuk dua langkah nonaktif.',
    },
    users: {
      notFound: 'Pengguna ini tidak ada.',
      pageHidingNotAllowed: 'Menyembunyikan halaman tersedia dengan Pro.',
      invalidImage:
        'File ini bukan gambar yang didukung (JPEG, PNG, WebP, atau GIF).',
    },
    exchange: {
      notFound: 'Permintaan ini tidak ada.',
      notAllowed: 'Anda tidak bisa melakukan itu pada permintaan ini.',
      offerChanged:
        'Tawaran sudah berubah sementara itu. Tinjau percakapannya dan coba lagi.',
      videoBeingEdited:
        'Salah satu video dalam pertukaran ini sedang diedit oleh pembuatnya. Coba lagi setelah selesai.',
      nothingToRequest: 'Tidak ada video terpilih yang bisa diminta.',
      hintTooEarly:
        'Anda bisa menyembunyikan petunjuk ini setelah beberapa kali lagi melihatnya.',
      selfRequest: 'Anda tidak bisa meminta video Anda sendiri.',
      invalidOffer:
        'Tawaran memerlukan minimal satu video di setiap sisi, dan semuanya tersedia bagi pemiliknya.',
      blocked: 'Anda tidak bisa mengirim permintaan kepada pengguna ini.',
      alreadyBlocked: 'Pengguna ini sudah diblokir.',
      selfBlock: 'Anda tidak bisa memblokir diri sendiri.',
    },
    social: {
      selfFollow: 'Anda tidak bisa mengikuti diri sendiri.',
      followNotAllowed:
        'Anda tidak bisa menambahkan pengguna ini sebagai teman.',
    },
    editor: {
      invalid: 'Hasil edit ini tidak bisa disimpan: periksa waktu dan areanya.',
      nothing: 'Tidak ada yang berubah.',
      inProgress:
        'Video ini sedang diedit. Tunggu sampai selesai atau batalkan.',
      notReady: 'Video bisa diedit setelah selesai diproses.',
      proOnly: 'Editor video tersedia dengan Pro.',
      copyOwnOnly:
        'Hanya video Anda sendiri yang bisa disimpan sebagai salinan.',
    },
    invites: {
      notFound: 'Tautan undangan ini tidak ada.',
      expired: 'Undangan ini sudah kedaluwarsa. Minta tautan baru.',
      usedUp: 'Undangan ini sudah habis terpakai. Minta tautan baru.',
      own: 'Ini undangan Anda sendiri: kirimkan kepada seseorang.',
    },
    deals: {
      notFound:
        'Kesepakatan ini tidak ada (atau browser ini bukan tempat kesepakatan dimulai).',
      closed: 'Kesepakatan ini sudah berakhir.',
      linkNotFound: 'Tautan tukar ini sudah tidak berfungsi.',
      linkVideos:
        'Pilih video Anda sendiri yang sudah siap (hingga 50) untuk tautan tukar.',
      guestsOff: 'Orang ini hanya menerima pertukaran dari pengguna terdaftar.',
      uploadsMax: 'Satu kesepakatan menerima hingga {{max}} video Anda.',
      videoInOffer:
        'Video ini ada dalam tawaran yang sedang berlaku: ubah dulu tawarannya.',
      nothingOffered: 'Unggah minimal satu video Anda untuk ditawarkan.',
      tooMany:
        'Anda punya {{max}} kesepakatan yang sedang berjalan. Selesaikan salah satunya sebelum memulai yang baru.',
    },
    links: {
      notFound: 'Tautan ini tidak ada atau sudah tidak berfungsi.',
      passwordPro: 'Kata sandi pada tautan tersedia dengan Pro.',
      tooMany:
        'Anda punya {{max}} tautan yang masih berlaku. Cabut beberapa terlebih dahulu.',
      videoNotAllowed:
        'Hanya unggahan Anda sendiri dan video yang Anda terima yang bisa dikirim lewat tautan, dan harus sudah siap serta tidak terhapus.',
      locked: 'Masukkan dulu kata sandi atau kode dari email.',
      wrongPassword: 'Kata sandi salah.',
      wrongCode: 'Kode salah atau sudah kedaluwarsa. Minta kode baru.',
      codeTooSoon:
        'Kode baru saja dikirim. Anda bisa meminta kode lain dalam satu menit.',
      codeLimit:
        'Terlalu banyak kode untuk tautan ini. Coba lagi dalam satu jam.',
      noEmail: 'Tautan ini tidak ditujukan untuk email tertentu.',
      emailOff:
        'Server ini tidak mengirim email, jadi tautan untuk satu orang tidak tersedia.',
      blocked: 'Anda tidak bisa menambahkan video dari orang ini.',
    },
    anonymousLinks: {
      pro: 'Tautan anonim tersedia dengan Pro.',
      tooMany:
        'Anda sudah punya {{max}} tautan anonim. Hapus salah satunya terlebih dahulu.',
      notFound: 'Tautan ini tidak ada atau sudah tidak berfungsi.',
      nameNeeded:
        'Nama Anda membocorkan nama pengguna Anda. Pilih nama untuk tautan ini.',
      nameNamesNickname:
        'Nama ini membocorkan nama pengguna Anda. Pilih nama lain.',
    },
    appTokens: {
      scope: 'Ekstensi browser tidak dapat melakukan ini.',
      invalid: 'Ekstensi sudah tidak terhubung. Hubungkan lagi.',
      code: 'Kode koneksi sudah kedaluwarsa atau salah. Coba hubungkan lagi.',
      redirect: 'Ini tidak tampak seperti ekstensi tapeshelf.',
      notFound: 'Koneksi ini tidak ada.',
    },
    chat: {
      notFriends:
        'Anda hanya bisa mengirim pesan kepada teman: kalian berdua harus saling menambahkan.',
      unavailable: 'Pengguna ini tidak bisa menerima pesan.',
      emptyMessage: 'Tulis sesuatu atau lampirkan video.',
      videoNotAttachable:
        'Video ini tidak bisa dilampirkan. Pilih video siap yang terlihat di halaman Anda.',
      selfMessage: 'Anda tidak bisa mengirim pesan kepada diri sendiri.',
      notFound: 'Percakapan ini tidak ada.',
    },
    reports: {
      self: 'Anda tidak bisa melaporkan diri sendiri atau video Anda sendiri.',
    },
    support: {
      notFound: 'Tiket ini tidak ditemukan.',
      tooMany:
        'Anda punya {{count}} tiket yang terbuka. Tunggu jawaban untuk salah satunya, atau tandai salah satunya sebagai selesai.',
      closed:
        'Tiket ini sudah ditutup. Jika masalahnya masih ada, silakan buat tiket baru.',
      empty: 'Tulis pesan atau tambahkan gambar.',
      tooManyFiles: 'Maksimal {{count}} gambar per pesan.',
      badImage:
        'Gambar ini tidak bisa dibaca. Gunakan PNG, JPG, atau WebP, maksimal 10 MB.',
      notYourVideo:
        'Anda hanya bisa melampirkan video yang Anda unggah sendiri.',
      notRated: 'Tiket bisa dinilai setelah selesai atau ditutup.',
    },
    site: {
      legalNotFound: 'Pengelola situs ini belum memublikasikan dokumen ini.',
    },
    account: {
      confirmMismatch: 'Ketik nama pengguna Anda persis untuk konfirmasi.',
      deleted: 'Akun ini telah dihapus.',
    },
    billing: {
      disabled: 'Server ini tidak menerima pembayaran.',
      unavailable: 'Pembayaran sedang tidak tersedia. Silakan coba lagi nanti.',
      signature: 'Tanda tangan tidak cocok.',
      noSubscription: 'Anda tidak punya langganan.',
    },
    downloads: {
      limitReached:
        'Anda sudah memakai semua {{limit}} unduhan bulan ini. Unduhan berikutnya tersedia pada {{date}}.',
      busy: 'Unduhan lain masih berjalan. Tunggu sampai selesai, lalu coba lagi.',
      ticketInvalid:
        'Tautan unduhan ini sudah kedaluwarsa. Mulai unduhan lagi dari halaman video.',
      range: 'Bagian file ini tidak ada.',
    },
    traffic: {
      limitReached:
        'Anda sudah memakai semua trafik bulan ini di paket Anda. Trafik diperbarui pada awal bulan depan.',
      sharerLimitReached:
        'Orang yang membagikan video ini sudah memakai semua trafik bulan ini. Trafik diperbarui pada awal bulan depan.',
    },
    admin: {
      selfAction: 'Anda tidak bisa melakukan ini pada akun Anda sendiri.',
      adminTarget: 'Cabut dulu peran admin.',
      notInTrash: 'Video ini tidak ada di sampah.',
      purged: 'Video ini sudah dihapus dari penyimpanan.',
      authorDeleted:
        'Pembuatnya sudah menghapus akunnya, jadi video tidak bisa dipulihkan.',
      alreadyProcessed: 'Video ini sudah diproses.',
      tierUntilPast: 'Tanggal berakhir harus di masa depan.',
      tiersDisabled: 'Server ini tidak punya paket.',
      reportClosed: 'Laporan ini sudah ditangani.',
      reportAction: 'Tindakan ini tidak sesuai dengan laporan.',
      noEmail: 'Akun ini tidak punya alamat email.',
      viewAsReadOnly:
        'Anda melihat situs sebagai pengguna lain: tidak ada yang bisa diubah.',
    },
    categories: {
      exists: 'Anda sudah punya kategori dengan nama ini.',
      tooMany: 'Anda bisa punya hingga {{max}} kategori.',
    },
    uploads: {
      fileTooLarge: 'File melebihi batas {{max}}.',
      quotaExceeded:
        'Ruang penyimpanan tidak cukup: {{used}} dari {{quota}} sudah terpakai.',
      notFound: 'Unggahan ini tidak ada.',
      notActive: 'Unggahan ini sudah selesai atau dibatalkan.',
      expired: 'Unggahan ini sudah kedaluwarsa. Silakan mulai lagi.',
      incomplete:
        'Beberapa bagian file hilang atau rusak. Silakan ulangi unggahan.',
      sizeMismatch:
        'File yang diunggah tidak sesuai dengan ukuran yang disebutkan.',
      extensionDailyLimit:
        'Hari ini Anda sudah menyimpan {{limit}} video melalui ekstensi, jumlah maksimum yang diizinkan. Hitungan dimulai lagi pada tengah malam (UTC).',
    },
    videos: {
      deleteInAdminPanel:
        'Hapus video orang lain di panel admin: pembuatnya akan diberi tahu aturan yang dilanggar dan catatan Anda.',
      notFound: 'Video ini tidak ada.',
      notReady: 'Video masih diproses.',
      categoryNotFound: 'Kategori ini tidak ada.',
      stackNotFound: 'Tumpukan ini tidak ada.',
      stackTooSmall: 'Tumpukan memerlukan minimal dua video.',
      stackCategories:
        'Video dalam satu tumpukan memakai satu kategori yang sama: pilih kategorinya dulu.',
      frameNotFound: 'Frame ini tidak ada.',
      timestampOutOfRange: 'Waktu ini melewati akhir video.',
      notWatchable: 'Anda tidak punya akses ke video ini.',
      playbackTokenInvalid:
        'Tautan pemutaran sudah kedaluwarsa. Silakan muat ulang halaman.',
      downloadNotAllowed: 'Video ini tidak boleh diunduh.',
      alreadyInCollection: 'Video ini sudah ada di koleksi Anda.',
      cannotAddToCollection:
        'Video ini tidak bisa ditambahkan ke koleksi Anda.',
      cannotHide: 'Video ini tidak ada di rak Anda.',
      ownVideoRename:
        'Video Anda sendiri diganti namanya di formulir editnya, dan berlaku untuk semua orang.',
    },
  },
  editor: {
    copySuffix: '(diedit)',
  },
  notifications: {
    failReason: {
      corrupted: 'file rusak atau bukan video',
      noVideoStream: 'file tidak memiliki trek video',
      zeroDuration: 'video tidak memiliki durasi',
      tooLong: 'video yang lebih dari 12 jam tidak didukung',
      tooLarge: 'frame yang lebih besar dari 4096 px tidak didukung',
      fpsTooHigh: 'frame rate di atas 60 fps tidak didukung',
      tooManyStreams: 'file memiliki terlalu banyak stream',
      transcodeFailed: 'video tidak dapat dikonversi',
      blocked:
        'file ini dihapus karena melanggar aturan dan tidak dapat diunggah lagi',
      internal: 'Pemrosesan gagal. Silakan coba unggah lagi',
    },
  },
  mail: {
    notifications: {
      guest: 'Seorang tamu',
      anonymous: 'Anonim',
      manage: 'Ubah notifikasi yang Anda terima: {{url}}',
      unsubscribe: 'Berhenti menerima email seperti ini: {{url}}',
      andMore_other: ' dan {{count}} lainnya',
      REQUEST_RECEIVED: {
        subject: '{{name}} meminta “{{title}}”',
        title: 'Permintaan video baru',
        body_other:
          '{{name}} ingin Anda membagikan “{{title}}” ({{count}} video). Bagikan gratis, tolak, atau ajukan pertukaran.',
        message: 'Pesannya: “{{message}}”',
        offered_other: 'Sebagai gantinya, dia menawarkan {{count}} videonya.',
        button: 'Buka permintaan',
      },
      OFFER_RECEIVED: {
        subject: '{{name}} memberi Anda tawaran',
        title: 'Tawaran balik diterima',
        body: '{{name}} mengajukan pertukaran (putaran {{round}}). Terima, tolak, atau ajukan tawaran Anda sendiri.',
        bodyDeal:
          '{{name}} menawarkan “{{gives}}”{{givesMore}} untuk video Anda “{{wants}}”{{wantsMore}}. Terima, tolak, atau ajukan tawaran Anda sendiri.',
        message: 'Pesannya: “{{message}}”',
        button: 'Buka percakapan',
      },
      REQUEST_SHARED: {
        subject: '{{name}} membagikan “{{title}}” kepada Anda',
        title: 'Dibagikan kepada Anda',
        body_other:
          '{{name}} membagikan “{{title}}” ({{count}} video) kepada Anda secara gratis. Sekarang sudah ada di koleksi Anda.',
        button: 'Lihat yang Anda terima',
      },
      EXCHANGE_COMPLETED: {
        subject: 'Pertukaran dengan {{name}} selesai',
        title: 'Pertukaran selesai',
        body: 'Pertukaran Anda dengan {{name}} sudah selesai: Anda menerima {{received}}, memberikan {{given}}. Yang Anda terima sekarang ada di koleksi Anda.',
        button: 'Lihat yang Anda terima',
      },
      REQUEST_DECLINED: {
        subject: '{{name}} menolak permintaan untuk “{{title}}”',
        title: 'Permintaan ditolak',
        body: '{{name}} menolak. {{comment}}',
        again_other: 'Anda bisa memintanya lagi dalam {{count}} hari.',
        button: 'Buka permintaan',
      },
      REQUEST_CANCELLED: {
        subject: '{{name}} menarik permintaan untuk “{{title}}”',
        title: 'Permintaan ditarik',
        body: '{{name}} membatalkan permintaannya untuk “{{title}}”.',
        button: 'Buka permintaan',
      },
      REQUEST_INVALIDATED: {
        subject: 'Permintaan untuk “{{title}}” berubah',
        title: 'Permintaan diperbarui oleh sistem',
        body: 'Salah satu video dalam permintaan untuk “{{title}}” tidak tersedia lagi, jadi negosiasinya diperbarui.',
        bodyClosed:
          'Permintaan untuk “{{title}}” ditutup: akun pihak lain tidak tersedia lagi.',
        bodyExpired:
          'Kesepakatan dengan tamu untuk “{{title}}” kedaluwarsa: tidak ada yang bergerak selama tiga hari. Video milik tamu sudah dihapus.',
        button: 'Buka permintaan',
      },
      NEW_FOLLOWER: {
        subject: 'Pengikut baru: {{name}}',
        title: 'Pengikut baru',
        body: '{{name}} sekarang mengikuti koleksi Anda. Tambahkan dia kembali agar kalian berteman dan bisa saling mengirim pesan.',
        button: 'Buka halamannya',
      },
      FRIEND_ACCEPTED: {
        subject: 'Anda dan {{name}} sekarang berteman',
        title: 'Teman baru',
        body: 'Anda dan {{name}} sekarang saling mengikuti. Kalian bisa saling mengirim pesan dan video.',
        button: 'Buka halamannya',
      },
      FOLLOWED_NEW_VIDEO: {
        subject: 'Video baru dari {{name}}: “{{title}}”',
        title: 'Video baru dari {{name}}',
        body: '{{name}} menambahkan video baru, “{{title}}”.',
        bodyPrivate:
          '{{name}} menambahkan video privat baru, “{{title}}”. Anda bisa memintanya untuk membagikannya.',
        button: 'Buka video',
      },
      NEW_MESSAGE: {
        subject: 'Pesan baru dari {{name}}',
        title: 'Pesan baru',
        body: '{{name}}: “{{preview}}”',
        bodyVideo: '{{name}} mengirimi Anda video di obrolan.',
        button: 'Buka obrolan',
      },
      VIDEO_PROCESSED: {
        subject: '“{{title}}” sudah siap',
        title: 'Video Anda sudah siap',
        body: '“{{title}}” sudah diproses dan bisa ditonton sekarang.',
        button: 'Buka video',
      },
      VIDEO_FAILED: {
        subject: '“{{title}}” gagal diproses',
        title: 'Pemrosesan gagal',
        body: '“{{title}}” gagal diproses: {{reason}}. Anda bisa mengunggah file itu lagi.',
        button: 'Buka halaman saya',
      },
      VIDEO_REMOVED: {
        subject: '“{{title}}” dihapus oleh pembuatnya',
        title: 'Sebuah video keluar dari koleksi Anda',
        body: '{{author}} menghapus “{{title}}”, yang ada di koleksi Anda. Video ini tidak lagi tersedia bagi siapa pun.',
        button: 'Buka notifikasi',
      },
      REPORT_RESOLVED: {
        subject: 'Laporan Anda sudah ditinjau',
        title: 'Laporan ditinjau',
        bodyVideo:
          'Kami sudah meninjau laporan Anda tentang “{{title}}” dan mengambil tindakan. Terima kasih sudah membantu menjaga {{site}} tetap aman.',
        bodyUser:
          'Kami sudah meninjau laporan Anda tentang {{title}} dan mengambil tindakan. Terima kasih sudah membantu menjaga {{site}} tetap aman.',
        bodyVideoNone:
          'Kami sudah meninjau laporan Anda tentang “{{title}}” dan tidak menemukan pelanggaran aturan.',
        bodyUserNone:
          'Kami sudah meninjau laporan Anda tentang {{title}} dan tidak menemukan pelanggaran aturan.',
        button: 'Buka notifikasi',
      },
      ADMIN_NOTICE: {
        subject: 'Pesan dari {{site}}',
        title: 'Pesan dari tim {{site}}',
        body: '{{message}}',
        button: 'Buka notifikasi',
      },
      VIDEO_EDITED: {
        subject: 'Video Anda “{{title}}” diedit oleh moderator',
        title: 'Video diedit',
        body: 'Moderator {{site}} mengedit video Anda “{{title}}” (misalnya, memburamkan sebagian gambar). Tautan dan semua hal lainnya tetap sama.',
        button: 'Buka video',
      },
      VIDEO_EDIT_FAILED: {
        subject: 'Hasil edit “{{title}}” gagal dibuat',
        title: 'Hasil edit tidak tersimpan',
        body: 'Hasil edit video Anda “{{title}}” gagal dibuat. Video tetap seperti semula; editor menyimpan perubahan Anda, jadi Anda bisa mencoba lagi.',
        button: 'Buka editor',
      },
      SUPPORT_REPLY: {
        subject: 'Tim dukungan menjawab tiket #{{number}}',
        title: 'Tim dukungan menjawab',
        body: '#{{number}} “{{subject}}”: {{preview}}',
        bodyResolved:
          'Tim dukungan menandai tiket #{{number}} “{{subject}}” sebagai selesai. Jika masalahnya masih ada, buat tiket baru.',
        bodyResolvedWith:
          'Tim dukungan menjawab tiket #{{number}} “{{subject}}” dan menandainya sebagai selesai: {{preview}}',
        button: 'Buka tiket',
      },
      SUPPORT_TICKET: {
        subject: 'Dukungan #{{number}}: {{subject}}',
        title: 'Tiket dukungan #{{number}}',
        body: '@{{name}} meminta bantuan ({{topic}}): “{{subject}}”. {{preview}}',
        bodyReply:
          '@{{name}} menulis lagi di #{{number}} “{{subject}}”: {{preview}}',
        button: 'Buka di panel admin',
      },
      LINK_OPENED: {
        subject: 'Tautan sementara Anda dibuka',
        title: 'Tautan dibuka',
        body_other:
          '@{{name}} membuka tautan sementara Anda berisi “{{title}}” ({{count}} video).',
        bodyGuest_other:
          'Seseorang membuka tautan sementara Anda berisi “{{title}}” ({{count}} video).',
        button: 'Buka tautan saya',
      },
      LINK_SAVED: {
        subject: '@{{name}} menyimpan video dari tautan Anda',
        title: 'Disimpan dari tautan Anda',
        body_other:
          '@{{name}} menaruh “{{title}}” ({{count}} video) dari tautan sementara Anda di raknya.',
        button: 'Buka tautan saya',
      },
      VIDEO_TAKEN_DOWN: {
        subject: 'Video Anda “{{title}}” dihapus',
        title: 'Video dihapus',
        body: 'Kami menghapus video Anda “{{title}}” dari {{site}}: {{rule}}. Video ini tidak lagi tersedia bagi siapa pun.',
        message: 'Catatan dari moderator: {{message}}',
        appeal: 'Jika menurut Anda ini keliru, tulis ke {{email}}.',
        button: 'Buka notifikasi',
      },
      PLAN_EXPIRING: {
        subject: 'Paket Pro Anda berakhir pada {{date}}',
        title: 'Pro segera berakhir',
        body: 'Paket Pro Anda di {{site}} berakhir pada {{date}} (UTC). Setelah itu rak Anda mendapat batas Free; tidak ada yang dihapus.',
        page: 'Halaman Anda sekarang tersembunyi; saat Pro berakhir, semua orang akan bisa melihatnya lagi.',
        anonymousLinks:
          'Saat Pro berakhir, tautan anonim Anda tidak bisa dibuka lagi; tautan itu akan berfungsi kembali begitu Anda punya Pro.',
        button: 'Buka paket Anda',
      },
      PLAN_PAYMENT_FAILED: {
        subject: 'Kami tidak bisa memperpanjang paket Pro Anda',
        title: 'Pembayaran gagal',
        body: 'Pembayaran paket Pro Anda di {{site}} tidak berhasil. Perbarui metode pembayaran sebelum {{date}} (UTC), atau rak Anda akan mendapat batas Free; tidak ada yang dihapus.',
        button: 'Perbarui metode pembayaran',
      },
      PLAN_EXPIRED: {
        subject: 'Paket Pro Anda sudah berakhir',
        title: 'Pro sudah berakhir',
        body: 'Rak Anda di {{site}} sekarang memakai batas Free: {{file}} per video dan total {{shelf}}. Tidak ada yang dihapus.',
        bodyOverQuota:
          'Rak Anda di {{site}} sekarang memakai batas Free: {{file}} per video dan total {{shelf}}. Isi rak Anda melebihi batas itu, jadi unggahan baru dijeda sampai Anda mengosongkan ruang. Tidak ada yang dihapus.',
        page: 'Halaman Anda kembali terlihat oleh semua orang: menyembunyikan halaman tersedia dengan Pro.',
        anonymousLinks:
          'Tautan anonim Anda tidak bisa dibuka lagi; tautan itu akan berfungsi kembali begitu Anda punya Pro.',
        button: 'Buka paket Anda',
      },
      TRAFFIC_RUNNING_OUT: {
        subject: 'Trafik Anda hampir habis',
        title: 'Trafik hampir habis',
        body: 'Anda sudah memakai {{used}} dari {{limit}} trafik bulan ini di {{site}}. Saat trafik habis, video publik dan tautan Anda tidak bisa dibuka orang lain sampai {{date}} (UTC).',
        button: 'Buka paket Anda',
      },
      TRAFFIC_USED_UP: {
        subject: 'Trafik bulan ini sudah habis',
        title: 'Trafik sudah habis',
        body: 'Trafik bulan ini ({{limit}}) di {{site}} sudah habis. Sampai {{date}} (UTC), video publik dan tautan Anda tidak bisa dibuka orang lain, dan Anda tidak bisa menonton video orang lain. Video Anda sendiri tetap bisa diputar seperti biasa.',
        button: 'Buka paket Anda',
      },
    },
    supportTopics: {
      QUESTION: 'pertanyaan',
      BUG: 'laporan bug',
      ACCOUNT: 'akun',
      IDEA: 'ide',
    },
    takedownRules: {
      SPAM: 'spam atau iklan',
      ILLEGAL: 'konten ilegal',
      COPYRIGHT: 'pelanggaran hak cipta',
      ABUSE: 'hinaan atau perundungan',
      UNMARKED_ADULT: 'konten sensitif tanpa tanda',
      OTHER: 'pelanggaran aturan',
    },
    footer:
      'Anda menerima email ini karena sebuah akun di {{site}} dibuat dengan alamat ini.',
    verify: {
      subject: 'Konfirmasi email Anda untuk {{site}}',
      title: 'Selamat datang di {{site}}, {{name}}!',
      body: 'Konfirmasi alamat email Anda untuk membuka fitur unggah, permintaan video, teman, dan pesan.',
      button: 'Konfirmasi email',
      expires: 'Tautan berlaku selama 24 jam.',
    },
    reset: {
      subject: 'Atur ulang kata sandi {{site}} Anda',
      title: 'Atur ulang kata sandi',
      body: 'Halo {{name}}, seseorang (semoga Anda sendiri) meminta pengaturan ulang kata sandi untuk akun {{site}} Anda.',
      button: 'Buat kata sandi baru',
      expires:
        'Tautan berlaku selama 1 jam. Jika Anda tidak memintanya, abaikan saja email ini.',
    },
    guestDeal: {
      button: 'Buka kesepakatan',
      footer:
        'Anda menerima email ini karena memasukkan alamat ini di halaman kesepakatan di {{site}}. Tidak ada akun yang dibuat.',
      saved: {
        subject: 'Kesepakatan Anda dengan {{name}}',
        title: 'Simpan email ini',
        body: 'Tombol ini membawa Anda kembali ke kesepakatan dengan {{name}} dari perangkat mana pun. Saat {{name}} menjawab, kami akan mengabari Anda di sini.',
      },
      offer: {
        subject: '{{name}} menjawab tawaran Anda',
        title: 'Tawaran baru',
        body: '{{name}} mengajukan pertukaran yang berbeda. Terima, jawab dengan tawaran Anda sendiri, atau tolak; kesepakatan menunggu tiga hari lagi.',
      },
      accepted: {
        subject: 'Pertukaran dengan {{name}} selesai',
        title: 'Pertukaran selesai',
        body: 'Anda bisa menonton dan mengunduh video yang Anda terima di halaman kesepakatan selama 7 hari. Masuk atau buat akun di sana untuk menyimpannya selamanya.',
      },
      shared: {
        subject: '{{name}} membagikan video kepada Anda',
        title: 'Dibagikan kepada Anda',
        body: '{{name}} memberikan videonya tanpa mengambil video Anda; video Anda sudah dihapus dari server kami. Tonton dan unduh video Anda di halaman kesepakatan selama 7 hari.',
      },
      declined: {
        subject: '{{name}} menolak pertukaran',
        title: 'Pertukaran ditolak',
        body: 'Kesepakatan sudah berakhir. Video Anda langsung dihapus dari server kami; tidak ada yang mendapatkannya.',
      },
      closed: {
        subject: 'Kesepakatan dengan {{name}} ditutup',
        title: 'Kesepakatan ditutup',
        body: 'Kesepakatan tidak bisa dilanjutkan (salah satu video sudah tidak ada atau akunnya ditutup). Video Anda langsung dihapus dari server kami; tidak ada yang mendapatkannya.',
      },
      expired: {
        subject: 'Kesepakatan dengan {{name}} kedaluwarsa',
        title: 'Kesepakatan kedaluwarsa',
        body: 'Tidak ada yang bergerak selama tiga hari, jadi kesepakatan berakhir. Video Anda langsung dihapus dari server kami; tidak ada yang mendapatkannya.',
      },
    },
    twoFactor: {
      button: 'Buka pengaturan keamanan',
      notYou:
        'Jika ini bukan Anda, segera ganti kata sandi dan tulis kepada kami.',
      on: {
        subject: 'Masuk dua langkah aktif',
        title: 'Masuk dua langkah aktif',
        body: 'Halo {{name}}, masuk ke akun {{site}} Anda dengan kata sandi sekarang juga memerlukan langkah kedua. Perangkat lain telah dikeluarkan.',
      },
      off: {
        subject: 'Masuk dua langkah nonaktif',
        title: 'Masuk dua langkah nonaktif',
        body: 'Halo {{name}}, masuk ke akun {{site}} Anda tidak lagi memerlukan langkah kedua.',
      },
      reset: {
        subject: 'Masuk dua langkah diatur ulang',
        title: 'Masuk dua langkah diatur ulang',
        body: 'Halo {{name}}, atas permintaan Anda, admin {{site}} menonaktifkan masuk dua langkah untuk akun Anda. Anda bisa mengaktifkannya lagi di pengaturan keamanan.',
      },
      recoveryUsed: {
        subject: 'Kode pemulihan telah dipakai',
        title: 'Kode pemulihan telah dipakai',
        body: 'Halo {{name}}, salah satu kode pemulihan akun {{site}} Anda baru saja dipakai. Sisa kode: {{left}}.',
      },
    },
    links: {
      footer:
        'Anda menerima email ini karena @{{username}} mengirim video ke alamat ini di {{site}}.',
      invite: {
        subject: '@{{username}} membagikan video kepada Anda',
        title: '{{name}} membagikan video kepada Anda',
        body_other:
          '@{{username}} mengirimi Anda video di {{site}}: “{{title}}” ({{count}} video).',
        how: 'Tonton dan unduh sebelum tautan kedaluwarsa: tautan berlaku hingga {{date}} (UTC). Untuk membukanya, minta kode; kode akan dikirim ke alamat ini.',
        button: 'Buka video',
      },
      code: {
        subject: 'Kode {{code}} untuk membuka video',
        title: 'Kode Anda: {{code}}',
        body: 'Masukkan kode ini di halaman tautan sementara dari @{{username}}.',
        expires:
          'Kode berlaku selama 15 menit. Jika Anda tidak memintanya, abaikan email ini.',
      },
    },
  },
} as const;
