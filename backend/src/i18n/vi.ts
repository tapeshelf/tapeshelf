export const vi = {
  errors: {
    internal: 'Đã xảy ra lỗi ở phía chúng tôi. Hãy thử lại sau.',
    generic: 'Không thể hoàn tất yêu cầu.',
    badRequest: 'Yêu cầu không hợp lệ.',
    validation: 'Một số trường không hợp lệ.',
    notFound: 'Không tìm thấy.',
    conflict:
      'Thao tác này mâu thuẫn với trạng thái hiện tại. Hãy tải lại trang và thử lại.',
    payloadTooLarge: 'Yêu cầu quá lớn.',
    tooManyRequests: 'Quá nhiều yêu cầu. Hãy chậm lại một chút.',
    unauthorized: 'Bạn cần đăng nhập để làm việc này.',
    forbidden: 'Bạn không có quyền làm việc này.',
    auth: {
      captchaRequired: 'Hãy xác nhận bạn không phải là robot.',
      captchaFailed: 'Bước kiểm tra không thành công. Hãy thử lại.',
      captchaUnavailable: 'Bước kiểm tra hiện không khả dụng. Hãy thử lại sau.',
      invalidCredentials: 'Sai email hoặc mật khẩu.',
      registrationClosed:
        'Trang này đã đóng đăng ký. Để có tài khoản, hãy hỏi người quản lý trang.',
      emailTaken: 'Đã có tài khoản dùng email này.',
      usernameTaken: 'Tên người dùng này đã có người dùng.',
      usernameInvalid:
        'Tên người dùng gồm 3–30 ký tự: chữ cái Latinh thường, chữ số và dấu gạch dưới.',
      usernameReserved: 'Tên người dùng này đã được giữ trước.',
      usernameChangeTooSoon_other:
        'Bạn có thể đổi lại tên người dùng sau {{count}} ngày.',
      passwordWeak:
        'Mật khẩu phải có ít nhất 8 ký tự, gồm cả chữ cái và chữ số.',
      tokenInvalid: 'Liên kết này không hợp lệ hoặc đã được sử dụng.',
      tokenExpired: 'Liên kết này đã hết hạn. Hãy yêu cầu liên kết mới.',
      emailNotVerified: 'Hãy xác nhận địa chỉ email của bạn trước.',
      emailAlreadyVerified: 'Email của bạn đã được xác nhận.',
      accountBanned: 'Tài khoản này đã bị khóa.',
      sessionExpired: 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.',
      tooManyAttempts_other:
        'Quá nhiều lần thử đăng nhập. Hãy thử lại sau {{count}} phút.',
      googleNotConfigured: 'Không thể đăng nhập bằng Google.',
      googleFailed: 'Không đăng nhập được bằng Google. Hãy thử lại.',
      googleSignupExpired: 'Phiên đăng ký đã hết hạn. Hãy bắt đầu lại.',
      wrongPassword: 'Mật khẩu hiện tại không đúng.',
      csrf: 'Yêu cầu đã bị chặn vì lý do bảo mật. Hãy tải lại trang và thử lại.',
      twoFactorLogin: 'Hãy nhập mã từ ứng dụng xác thực.',
      adminGoogle:
        'Quản trị viên đăng nhập bằng mật khẩu và bước thứ hai, không dùng Google.',
      googleLinkTwoFactor:
        'Email này thuộc về một tài khoản có bật đăng nhập hai bước. Hãy đăng nhập bằng mật khẩu của tài khoản đó.',
    },
    twoFactor: {
      required:
        'Trang quản trị yêu cầu đăng nhập hai bước: hãy bật trong Cài đặt → Bảo mật.',
      confirm: 'Hãy xác nhận đó là bạn bằng bước thứ hai trước.',
      invalidCode: 'Mã này không đúng. Hãy kiểm tra và thử lại.',
      expired: 'Đăng nhập mất quá nhiều thời gian. Hãy nhập lại mật khẩu.',
      setupExpired: 'Thiết lập mất quá nhiều thời gian. Hãy bắt đầu lại.',
      needsPassword:
        'Đăng nhập hai bước bảo vệ mật khẩu. Hãy đặt mật khẩu trước.',
      admin: 'Quản trị viên không thể đăng nhập mà không có bước thứ hai.',
      appExists: 'Ứng dụng xác thực đã được thiết lập.',
      passkeyInvalid: 'Khóa truy cập không phản hồi. Hãy thử lại.',
      passkeyLimit: 'Bạn đã có 10 khóa truy cập.',
      passkeyNotFound: 'Khóa truy cập này không còn nữa.',
      noPasskey: 'Tài khoản này không có khóa truy cập.',
      off: 'Đăng nhập hai bước đang tắt.',
    },
    users: {
      notFound: 'Người dùng này không tồn tại.',
      pageHidingNotAllowed: 'Ẩn trang là tính năng của Pro.',
      invalidImage:
        'Tệp này không phải ảnh được hỗ trợ (JPEG, PNG, WebP hoặc GIF).',
    },
    exchange: {
      notFound: 'Yêu cầu này không tồn tại.',
      notAllowed: 'Bạn không thể làm việc này với yêu cầu này.',
      offerChanged:
        'Đề nghị đã thay đổi trong lúc đó. Hãy xem lại cuộc trao đổi và thử lại.',
      videoBeingEdited:
        'Tác giả đang chỉnh sửa một video trong cuộc trao đổi này. Hãy thử lại khi video đã sẵn sàng.',
      nothingToRequest: 'Không video nào trong số đã chọn có thể yêu cầu được.',
      hintTooEarly: 'Bạn có thể ẩn gợi ý này sau vài lần xem nữa.',
      selfRequest: 'Bạn không thể yêu cầu video của chính mình.',
      invalidOffer:
        'Đề nghị cần có ít nhất một video ở mỗi bên, và mọi video đều phải còn khả dụng với chủ sở hữu của chúng.',
      blocked: 'Bạn không thể gửi yêu cầu cho người dùng này.',
      alreadyBlocked: 'Người dùng này đã bị chặn.',
      selfBlock: 'Bạn không thể tự chặn mình.',
    },
    social: {
      selfFollow: 'Bạn không thể tự theo dõi mình.',
      followNotAllowed: 'Bạn không thể thêm người dùng này làm bạn.',
    },
    editor: {
      invalid:
        'Không thể lưu bản chỉnh sửa này: hãy kiểm tra thời gian và các vùng.',
      nothing: 'Chưa có gì thay đổi.',
      inProgress: 'Video này đang được chỉnh sửa. Hãy chờ xong hoặc hủy.',
      notReady: 'Có thể chỉnh sửa video sau khi video được xử lý xong.',
      proOnly: 'Trình chỉnh sửa video là tính năng của Pro.',
      copyOwnOnly: 'Chỉ video của chính bạn mới lưu thành bản sao được.',
    },
    invites: {
      notFound: 'Liên kết mời này không tồn tại.',
      expired: 'Lời mời này đã hết hạn. Hãy xin một liên kết mới.',
      usedUp: 'Lời mời này đã hết lượt dùng. Hãy xin một liên kết mới.',
      own: 'Đây là lời mời của chính bạn: hãy gửi nó cho người khác.',
    },
    deals: {
      notFound:
        'Không có giao dịch này (hoặc đây không phải trình duyệt đã bắt đầu giao dịch).',
      closed: 'Giao dịch này đã kết thúc.',
      linkNotFound: 'Liên kết trao đổi này không còn hoạt động.',
      linkVideos:
        'Hãy chọn video của chính bạn đã sẵn sàng (tối đa 50) cho liên kết trao đổi.',
      guestsOff: 'Người này chỉ nhận trao đổi từ người dùng đã đăng ký.',
      uploadsMax: 'Một giao dịch nhận tối đa {{max}} video của bạn.',
      videoInOffer:
        'Video này nằm trong đề nghị đang chờ: hãy thay đổi đề nghị trước.',
      nothingOffered: 'Hãy tải lên ít nhất một video của bạn để đề nghị.',
      tooMany:
        'Bạn đang có {{max}} giao dịch. Hãy hoàn tất một giao dịch trước khi bắt đầu giao dịch khác.',
    },
    links: {
      notFound: 'Liên kết này không tồn tại hoặc không còn hoạt động.',
      passwordPro: 'Mật khẩu cho liên kết là tính năng của Pro.',
      tooMany:
        'Bạn đang có {{max}} liên kết còn hiệu lực. Hãy thu hồi bớt một số trước.',
      videoNotAllowed:
        'Chỉ gửi được qua liên kết những video bạn tự tải lên và video bạn đã nhận — đã sẵn sàng và chưa bị xóa.',
      locked: 'Hãy nhập mật khẩu hoặc mã trong email trước.',
      wrongPassword: 'Sai mật khẩu.',
      wrongCode: 'Mã sai hoặc đã hết hạn. Hãy yêu cầu mã mới.',
      codeTooSoon: 'Mã vừa được gửi. Bạn có thể yêu cầu mã khác sau một phút.',
      codeLimit:
        'Đã gửi quá nhiều mã cho liên kết này. Hãy thử lại sau một giờ.',
      noEmail: 'Liên kết này không dành riêng cho email nào.',
      blocked: 'Bạn không thể thêm video từ người này.',
    },
    anonymousLinks: {
      pro: 'Liên kết ẩn danh là tính năng của Pro.',
      tooMany:
        'Bạn đang có {{max}} liên kết ẩn danh. Hãy xóa một liên kết trước.',
      notFound: 'Liên kết này không tồn tại hoặc không còn hoạt động.',
      nameNeeded:
        'Tên hiển thị của bạn để lộ tên người dùng. Hãy đặt một tên cho liên kết này.',
      nameNamesNickname:
        'Tên này để lộ tên người dùng của bạn. Hãy chọn tên khác.',
    },
    appTokens: {
      scope: 'Tiện ích mở rộng trình duyệt không làm được việc này.',
      invalid: 'Tiện ích mở rộng không còn được kết nối. Hãy kết nối lại.',
      code: 'Mã kết nối đã hết hạn hoặc không đúng. Hãy thử kết nối lại.',
      redirect: 'Đây có vẻ không phải tiện ích mở rộng tapeshelf.',
      notFound: 'Kết nối này không tồn tại.',
    },
    chat: {
      notFriends:
        'Bạn chỉ nhắn tin được với bạn bè: cả hai cần thêm nhau làm bạn.',
      unavailable: 'Không thể nhắn tin cho người dùng này.',
      emptyMessage: 'Hãy viết gì đó hoặc đính kèm một video.',
      videoNotAttachable:
        'Không thể đính kèm video này. Hãy chọn một video đã sẵn sàng và đang hiện trên trang của bạn.',
      selfMessage: 'Bạn không thể tự nhắn tin cho mình.',
      notFound: 'Cuộc trò chuyện này không tồn tại.',
    },
    reports: {
      self: 'Bạn không thể báo cáo chính mình hoặc video của mình.',
    },
    support: {
      notFound: 'Không tìm thấy phiếu hỗ trợ này.',
      tooMany:
        'Bạn đang có {{count}} phiếu hỗ trợ mở. Hãy chờ trả lời cho một phiếu, hoặc đánh dấu một phiếu là đã giải quyết.',
      closed:
        'Phiếu hỗ trợ này đã đóng. Nếu vấn đề vẫn còn, hãy tạo phiếu mới.',
      empty: 'Hãy viết tin nhắn hoặc thêm ảnh.',
      tooManyFiles: 'Mỗi tin nhắn tối đa {{count}} ảnh.',
      badImage:
        'Không đọc được ảnh này. Chỉ nhận PNG, JPG hoặc WebP, tối đa 10 MB.',
      notYourVideo: 'Bạn chỉ có thể đính kèm video do chính bạn tải lên.',
      notRated:
        'Chỉ đánh giá được phiếu hỗ trợ khi đã giải quyết hoặc đã đóng.',
    },
    site: {
      legalNotFound: 'Đơn vị vận hành trang này chưa công bố tài liệu này.',
    },
    account: {
      confirmMismatch: 'Hãy nhập chính xác tên người dùng của bạn để xác nhận.',
      deleted: 'Tài khoản này đã bị xóa.',
    },
    billing: {
      disabled: 'Máy chủ này không có thanh toán.',
      unavailable: 'Thanh toán hiện không khả dụng. Hãy thử lại sau.',
      signature: 'Chữ ký không khớp.',
      noSubscription: 'Bạn không có gói đăng ký nào.',
    },
    downloads: {
      limitReached:
        'Bạn đã dùng hết {{limit}} lượt tải xuống của tháng này. Lượt tiếp theo có vào {{date}}.',
      busy: 'Một lượt tải xuống khác vẫn đang chạy. Hãy chờ nó xong rồi thử lại.',
      ticketInvalid:
        'Liên kết tải xuống này đã hết hạn. Hãy bắt đầu tải lại từ trang video.',
      range: 'Phần này của tệp không tồn tại.',
    },
    admin: {
      selfAction: 'Bạn không thể làm việc này với tài khoản của chính mình.',
      adminTarget: 'Hãy gỡ vai trò quản trị viên trước.',
      notInTrash: 'Video này không nằm trong thùng rác.',
      purged: 'Video này đã bị xóa khỏi bộ lưu trữ.',
      authorDeleted: 'Tác giả đã xóa tài khoản, nên không thể khôi phục video.',
      alreadyProcessed: 'Video này đã được xử lý.',
      tierUntilPast: 'Ngày kết thúc phải ở tương lai.',
      tiersDisabled: 'Máy chủ này không có gói.',
      reportClosed: 'Báo cáo này đã được xử lý.',
      reportAction: 'Thao tác này không phù hợp với báo cáo.',
      noEmail: 'Tài khoản này không có địa chỉ email.',
      viewAsReadOnly:
        'Bạn đang xem trang dưới tư cách người dùng khác: không thể thay đổi gì.',
    },
    categories: {
      exists: 'Bạn đã có danh mục với tên này.',
      tooMany: 'Bạn có thể có tối đa {{max}} danh mục.',
    },
    uploads: {
      fileTooLarge: 'Tệp vượt quá giới hạn {{max}}.',
      quotaExceeded: 'Không đủ dung lượng: đã dùng {{used}} / {{quota}}.',
      notFound: 'Lượt tải lên này không tồn tại.',
      notActive: 'Lượt tải lên này đã kết thúc hoặc đã bị hủy.',
      expired: 'Lượt tải lên này đã hết hạn. Hãy bắt đầu lại.',
      incomplete:
        'Một số phần của tệp bị thiếu hoặc bị hỏng. Hãy thử tải lên lại.',
      sizeMismatch: 'Tệp đã tải lên không khớp với dung lượng đã khai báo.',
      extensionDailyLimit:
        'Hôm nay bạn đã lưu {{limit}} video qua tiện ích mở rộng, mức tối đa cho phép. Số lượng sẽ được tính lại từ nửa đêm (UTC).',
    },
    videos: {
      deleteInAdminPanel:
        'Hãy xóa video của người khác trong trang quản trị: tác giả sẽ được báo quy định bị vi phạm và ghi chú của bạn.',
      notFound: 'Video này không tồn tại.',
      notReady: 'Video vẫn đang được xử lý.',
      categoryNotFound: 'Danh mục này không tồn tại.',
      stackNotFound: 'Chồng video này không tồn tại.',
      stackTooSmall: 'Một chồng cần ít nhất hai video.',
      stackCategories:
        'Các video trong một chồng dùng chung một danh mục: hãy chọn danh mục trước.',
      frameNotFound: 'Khung hình này không tồn tại.',
      timestampOutOfRange: 'Thời điểm này nằm sau khi video kết thúc.',
      notWatchable: 'Bạn không có quyền xem video này.',
      playbackTokenInvalid: 'Liên kết phát đã hết hạn. Hãy tải lại trang.',
      downloadNotAllowed: 'Không được phép tải xuống video này.',
      alreadyInCollection: 'Video này đã có trong bộ sưu tập của bạn.',
      cannotAddToCollection: 'Không thể thêm video này vào bộ sưu tập của bạn.',
      cannotHide: 'Video này không có trên kệ của bạn.',
      ownVideoRename:
        'Video của chính bạn được đổi tên trong biểu mẫu chỉnh sửa, và đổi cho mọi người.',
    },
  },
  editor: {
    copySuffix: '(đã chỉnh sửa)',
  },
  notifications: {
    failReason: {
      corrupted: 'tệp bị hỏng hoặc không phải video',
      noVideoStream: 'tệp không có luồng hình',
      zeroDuration: 'video không có thời lượng',
      tooLong: 'không hỗ trợ video dài hơn 12 giờ',
      tooLarge: 'không hỗ trợ khung hình lớn hơn 4096 px',
      fpsTooHigh: 'không hỗ trợ tốc độ khung hình trên 60 fps',
      tooManyStreams: 'tệp có quá nhiều luồng',
      transcodeFailed: 'không chuyển đổi được video',
      blocked: 'tệp này đã bị gỡ vì vi phạm quy định và không thể tải lên lại',
      internal: 'Xử lý thất bại. Hãy thử tải lên lại',
    },
  },
  mail: {
    notifications: {
      guest: 'Một vị khách',
      anonymous: 'Người ẩn danh',
      manage: 'Thay đổi những thông báo bạn nhận: {{url}}',
      unsubscribe: 'Ngừng nhận email như thế này: {{url}}',
      andMore_other: ' và {{count}} video khác',
      REQUEST_RECEIVED: {
        subject: '{{name}} yêu cầu “{{title}}”',
        title: 'Yêu cầu video mới',
        body_other:
          '{{name}} muốn bạn chia sẻ {{count}} video, bắt đầu với “{{title}}”. Bạn có thể chia sẻ miễn phí, từ chối hoặc đề nghị trao đổi.',
        message: 'Lời nhắn của họ: “{{message}}”',
        offered_other: 'Để đổi lại, họ đề nghị {{count}} video của mình.',
        button: 'Mở yêu cầu',
      },
      OFFER_RECEIVED: {
        subject: '{{name}} đã gửi bạn một đề nghị',
        title: 'Bạn nhận được đề nghị khác',
        body: '{{name}} đã đề nghị trao đổi (lượt {{round}}). Bạn có thể chấp nhận, từ chối hoặc đưa ra đề nghị của mình.',
        bodyDeal:
          '{{name}} đề nghị “{{gives}}”{{givesMore}} để đổi lấy “{{wants}}”{{wantsMore}} của bạn. Bạn có thể chấp nhận, từ chối hoặc đưa ra đề nghị của mình.',
        message: 'Lời nhắn của họ: “{{message}}”',
        button: 'Mở cuộc trao đổi',
      },
      REQUEST_SHARED: {
        subject: '{{name}} đã chia sẻ “{{title}}” với bạn',
        title: 'Được chia sẻ với bạn',
        body_other:
          '{{name}} đã chia sẻ miễn phí {{count}} video với bạn, bắt đầu với “{{title}}”. Video giờ đã có trong bộ sưu tập của bạn.',
        button: 'Xem những gì bạn nhận được',
      },
      EXCHANGE_COMPLETED: {
        subject: 'Đã trao đổi xong với {{name}}',
        title: 'Trao đổi hoàn tất',
        body: 'Cuộc trao đổi của bạn với {{name}} đã xong: bạn nhận {{received}}, đã gửi {{given}}. Những gì bạn nhận giờ đã có trong bộ sưu tập của bạn.',
        button: 'Xem những gì bạn nhận được',
      },
      REQUEST_DECLINED: {
        subject: '{{name}} đã từ chối yêu cầu “{{title}}”',
        title: 'Yêu cầu bị từ chối',
        body: '{{name}} đã từ chối. {{comment}}',
        again_other: 'Bạn có thể yêu cầu lại sau {{count}} ngày.',
        button: 'Mở yêu cầu',
      },
      REQUEST_CANCELLED: {
        subject: '{{name}} đã rút lại yêu cầu “{{title}}”',
        title: 'Yêu cầu đã bị rút lại',
        body: '{{name}} đã hủy yêu cầu “{{title}}”.',
        button: 'Mở yêu cầu',
      },
      REQUEST_INVALIDATED: {
        subject: 'Yêu cầu “{{title}}” đã thay đổi',
        title: 'Hệ thống đã cập nhật yêu cầu',
        body: 'Một video trong yêu cầu “{{title}}” không còn khả dụng, nên cuộc trao đổi đã được cập nhật.',
        bodyClosed:
          'Yêu cầu “{{title}}” đã bị đóng: tài khoản bên kia không còn khả dụng.',
        bodyExpired:
          'Giao dịch với khách cho “{{title}}” đã hết hạn: ba ngày không ai thực hiện bước tiếp theo. Video của khách đã bị xóa.',
        button: 'Mở yêu cầu',
      },
      NEW_FOLLOWER: {
        subject: 'Người theo dõi mới: {{name}}',
        title: 'Người theo dõi mới',
        body: '{{name}} giờ đang theo dõi bộ sưu tập của bạn. Hãy thêm lại họ để thành bạn bè và nhắn tin cho nhau.',
        button: 'Mở trang của họ',
      },
      FRIEND_ACCEPTED: {
        subject: 'Bạn và {{name}} giờ đã là bạn bè',
        title: 'Bạn mới',
        body: 'Bạn và {{name}} giờ theo dõi lẫn nhau. Hai bạn có thể gửi tin nhắn và video cho nhau.',
        button: 'Mở trang của họ',
      },
      FOLLOWED_NEW_VIDEO: {
        subject: 'Video mới từ {{name}}: “{{title}}”',
        title: 'Video mới từ {{name}}',
        body: '{{name}} đã thêm một video mới, “{{title}}”.',
        bodyPrivate:
          '{{name}} đã thêm một video riêng tư mới, “{{title}}”. Bạn có thể nhờ họ chia sẻ.',
        button: 'Mở video',
      },
      NEW_MESSAGE: {
        subject: 'Tin nhắn mới từ {{name}}',
        title: 'Tin nhắn mới',
        body: '{{name}}: “{{preview}}”',
        bodyVideo: '{{name}} đã gửi cho bạn một video trong cuộc trò chuyện.',
        button: 'Mở cuộc trò chuyện',
      },
      VIDEO_PROCESSED: {
        subject: '“{{title}}” đã sẵn sàng',
        title: 'Video của bạn đã sẵn sàng',
        body: '“{{title}}” đã được xử lý xong và có thể xem ngay.',
        button: 'Mở video',
      },
      VIDEO_FAILED: {
        subject: 'Không xử lý được “{{title}}”',
        title: 'Xử lý thất bại',
        body: 'Không xử lý được “{{title}}”: {{reason}}. Bạn có thể tải tệp lên lại.',
        button: 'Mở trang của tôi',
      },
      VIDEO_REMOVED: {
        subject: 'Tác giả đã xóa “{{title}}”',
        title: 'Một video đã rời khỏi bộ sưu tập của bạn',
        body: '{{author}} đã xóa “{{title}}”, video có trong bộ sưu tập của bạn. Giờ không ai xem được video này nữa.',
        button: 'Mở thông báo',
      },
      REPORT_RESOLVED: {
        subject: 'Báo cáo của bạn đã được xem xét',
        title: 'Đã xem xét báo cáo',
        bodyVideo:
          'Chúng tôi đã xem xét báo cáo của bạn về “{{title}}” và đã xử lý. Cảm ơn bạn đã giúp {{site}} an toàn hơn.',
        bodyUser:
          'Chúng tôi đã xem xét báo cáo của bạn về {{title}} và đã xử lý. Cảm ơn bạn đã giúp {{site}} an toàn hơn.',
        bodyVideoNone:
          'Chúng tôi đã xem xét báo cáo của bạn về “{{title}}” và không thấy vi phạm quy định.',
        bodyUserNone:
          'Chúng tôi đã xem xét báo cáo của bạn về {{title}} và không thấy vi phạm quy định.',
        button: 'Mở thông báo',
      },
      ADMIN_NOTICE: {
        subject: 'Tin nhắn từ {{site}}',
        title: 'Tin nhắn từ đội ngũ {{site}}',
        body: '{{message}}',
        button: 'Mở thông báo',
      },
      VIDEO_EDITED: {
        subject: 'Video “{{title}}” của bạn đã được kiểm duyệt viên chỉnh sửa',
        title: 'Video đã được chỉnh sửa',
        body: 'Một kiểm duyệt viên của {{site}} đã chỉnh sửa video “{{title}}” của bạn (ví dụ: làm mờ một phần). Liên kết và mọi thứ khác vẫn giữ nguyên.',
        button: 'Mở video',
      },
      VIDEO_EDIT_FAILED: {
        subject: 'Chỉnh sửa “{{title}}” không thành công',
        title: 'Chưa lưu được bản chỉnh sửa',
        body: 'Không thực hiện được chỉnh sửa cho video “{{title}}” của bạn. Video vẫn giữ nguyên; trình chỉnh sửa vẫn giữ các thay đổi của bạn, nên bạn có thể thử lại.',
        button: 'Mở trình chỉnh sửa',
      },
      SUPPORT_REPLY: {
        subject: 'Bộ phận hỗ trợ đã trả lời phiếu #{{number}} của bạn',
        title: 'Bộ phận hỗ trợ đã trả lời',
        body: '#{{number}} “{{subject}}”: {{preview}}',
        bodyResolved:
          'Bộ phận hỗ trợ đã đánh dấu phiếu #{{number}} “{{subject}}” của bạn là đã giải quyết. Nếu vấn đề vẫn còn, hãy tạo phiếu mới.',
        bodyResolvedWith:
          'Bộ phận hỗ trợ đã trả lời phiếu #{{number}} “{{subject}}” của bạn và đánh dấu là đã giải quyết: {{preview}}',
        button: 'Mở phiếu hỗ trợ',
      },
      SUPPORT_TICKET: {
        subject: 'Hỗ trợ #{{number}}: {{subject}}',
        title: 'Phiếu hỗ trợ #{{number}}',
        body: '@{{name}} cần giúp đỡ ({{topic}}): “{{subject}}”. {{preview}}',
        bodyReply:
          '@{{name}} vừa viết thêm trong #{{number}} “{{subject}}”: {{preview}}',
        button: 'Mở trong trang quản trị',
      },
      LINK_OPENED: {
        subject: 'Liên kết tạm thời của bạn đã được mở',
        title: 'Liên kết đã được mở',
        body_other:
          '@{{name}} đã mở liên kết tạm thời của bạn với {{count}} video, bắt đầu với “{{title}}”.',
        bodyGuest_other:
          'Có người đã mở liên kết tạm thời của bạn với {{count}} video, bắt đầu với “{{title}}”.',
        button: 'Mở liên kết của tôi',
      },
      LINK_SAVED: {
        subject: '@{{name}} đã lưu video từ liên kết của bạn',
        title: 'Đã lưu từ liên kết của bạn',
        body_other:
          '@{{name}} đã đưa {{count}} video từ liên kết tạm thời của bạn lên kệ của họ, bắt đầu với “{{title}}”.',
        button: 'Mở liên kết của tôi',
      },
      VIDEO_TAKEN_DOWN: {
        subject: 'Video “{{title}}” của bạn đã bị gỡ',
        title: 'Video đã bị gỡ',
        body: 'Chúng tôi đã gỡ video “{{title}}” của bạn khỏi {{site}}: {{rule}}. Giờ không ai xem được video này nữa.',
        message: 'Ghi chú của kiểm duyệt viên: {{message}}',
        appeal: 'Nếu bạn cho rằng đây là nhầm lẫn, hãy viết tới {{email}}.',
        button: 'Mở thông báo',
      },
      PLAN_EXPIRING: {
        subject: 'Gói Pro của bạn kết thúc vào {{date}}',
        title: 'Pro sắp kết thúc',
        body: 'Gói Pro của bạn trên {{site}} kết thúc vào {{date}} (UTC). Sau đó kệ của bạn sẽ theo giới hạn của Free; không có gì bị xóa.',
        page: 'Trang của bạn hiện đang ẩn; khi Pro kết thúc, mọi người sẽ lại thấy trang.',
        anonymousLinks:
          'Các liên kết ẩn danh của bạn sẽ ngừng mở được khi Pro kết thúc, và hoạt động lại khi bạn có lại Pro.',
        button: 'Mở gói của bạn',
      },
      PLAN_PAYMENT_FAILED: {
        subject: 'Chúng tôi không gia hạn được gói Pro của bạn',
        title: 'Thanh toán thất bại',
        body: 'Thanh toán gói Pro của bạn trên {{site}} không thành công. Hãy cập nhật phương thức thanh toán trước {{date}} (UTC), nếu không kệ của bạn sẽ theo giới hạn của Free; không có gì bị xóa.',
        button: 'Cập nhật phương thức thanh toán',
      },
      PLAN_EXPIRED: {
        subject: 'Gói Pro của bạn đã kết thúc',
        title: 'Pro đã kết thúc',
        body: 'Kệ của bạn trên {{site}} giờ theo giới hạn của Free: {{file}} mỗi video và tổng cộng {{shelf}}. Không có gì bị xóa.',
        bodyOverQuota:
          'Kệ của bạn trên {{site}} giờ theo giới hạn của Free: {{file}} mỗi video và tổng cộng {{shelf}}. Kệ của bạn đang chứa nhiều hơn mức đó, nên việc tải lên mới tạm dừng cho tới khi bạn giải phóng dung lượng. Không có gì bị xóa.',
        page: 'Trang của bạn đã hiện lại với mọi người: ẩn trang là tính năng của Pro.',
        anonymousLinks:
          'Các liên kết ẩn danh của bạn không còn mở được; chúng sẽ hoạt động lại khi bạn có lại Pro.',
        button: 'Mở gói của bạn',
      },
    },
    supportTopics: {
      QUESTION: 'câu hỏi',
      BUG: 'báo lỗi',
      ACCOUNT: 'tài khoản',
      IDEA: 'ý tưởng',
    },
    takedownRules: {
      SPAM: 'spam hoặc quảng cáo',
      ILLEGAL: 'nội dung bất hợp pháp',
      COPYRIGHT: 'vi phạm bản quyền',
      ABUSE: 'xúc phạm hoặc quấy rối',
      UNMARKED_ADULT: 'nội dung nhạy cảm chưa được đánh dấu',
      OTHER: 'vi phạm quy định',
    },
    footer:
      'Bạn nhận được email này vì một tài khoản trên {{site}} đã được tạo bằng địa chỉ này.',
    verify: {
      subject: 'Xác nhận email của bạn cho {{site}}',
      title: 'Chào mừng bạn đến với {{site}}, {{name}}!',
      body: 'Hãy xác nhận địa chỉ email để mở khóa tải lên, yêu cầu video, bạn bè và tin nhắn.',
      button: 'Xác nhận email',
      expires: 'Liên kết có hiệu lực trong 24 giờ.',
    },
    reset: {
      subject: 'Đặt lại mật khẩu {{site}} của bạn',
      title: 'Đặt lại mật khẩu',
      body: 'Chào {{name}}, có người (hy vọng là bạn) đã yêu cầu đặt lại mật khẩu cho tài khoản {{site}} của bạn.',
      button: 'Đặt mật khẩu mới',
      expires:
        'Liên kết có hiệu lực trong 1 giờ. Nếu bạn không yêu cầu việc này, hãy bỏ qua email này.',
    },
    guestDeal: {
      button: 'Mở giao dịch',
      footer:
        'Bạn nhận được email này vì đã nhập địa chỉ này trên một trang giao dịch của {{site}}. Không có tài khoản nào được tạo.',
      saved: {
        subject: 'Giao dịch của bạn với {{name}}',
        title: 'Hãy giữ email này',
        body: 'Nút này đưa bạn trở lại giao dịch với {{name}} từ bất kỳ thiết bị nào. Khi {{name}} trả lời, chúng tôi sẽ viết cho bạn ở đây.',
      },
      offer: {
        subject: '{{name}} đã trả lời đề nghị của bạn',
        title: 'Một đề nghị mới',
        body: '{{name}} đã đề nghị một cuộc trao đổi khác. Bạn có thể chấp nhận, trả lời bằng đề nghị của mình hoặc từ chối — giao dịch chờ thêm ba ngày nữa.',
      },
      accepted: {
        subject: 'Đã trao đổi xong với {{name}}',
        title: 'Trao đổi đã hoàn tất',
        body: 'Bạn có thể xem và tải xuống các video đã nhận trên trang giao dịch trong 7 ngày. Hãy đăng nhập hoặc tạo tài khoản ở đó để giữ chúng mãi mãi.',
      },
      shared: {
        subject: '{{name}} đã chia sẻ video với bạn',
        title: 'Được chia sẻ với bạn',
        body: '{{name}} đã tặng bạn video mà không lấy video của bạn; video của bạn đã bị xóa khỏi máy chủ của chúng tôi. Hãy xem và tải xuống video của bạn trên trang giao dịch trong 7 ngày.',
      },
      declined: {
        subject: '{{name}} đã từ chối trao đổi',
        title: 'Cuộc trao đổi đã bị từ chối',
        body: 'Giao dịch đã kết thúc. Video của bạn đã bị xóa khỏi máy chủ của chúng tôi ngay; không ai nhận được chúng.',
      },
      closed: {
        subject: 'Giao dịch với {{name}} đã đóng',
        title: 'Giao dịch đã đóng',
        body: 'Giao dịch không thể tiếp tục (một video không còn nữa hoặc tài khoản đã bị đóng). Video của bạn đã bị xóa khỏi máy chủ của chúng tôi ngay; không ai nhận được chúng.',
      },
      expired: {
        subject: 'Giao dịch với {{name}} đã hết hạn',
        title: 'Giao dịch đã hết hạn',
        body: 'Ba ngày không ai thực hiện bước tiếp theo, nên giao dịch đã kết thúc. Video của bạn đã bị xóa khỏi máy chủ của chúng tôi ngay; không ai nhận được chúng.',
      },
    },
    twoFactor: {
      button: 'Mở cài đặt bảo mật',
      notYou:
        'Nếu không phải bạn, hãy đổi mật khẩu ngay và viết cho chúng tôi.',
      on: {
        subject: 'Đăng nhập hai bước đã bật',
        title: 'Đăng nhập hai bước đã bật',
        body: 'Chào {{name}}, giờ khi đăng nhập tài khoản {{site}} bằng mật khẩu, bạn sẽ cần thêm bước thứ hai. Các thiết bị khác đã bị đăng xuất.',
      },
      off: {
        subject: 'Đăng nhập hai bước đã tắt',
        title: 'Đăng nhập hai bước đã tắt',
        body: 'Chào {{name}}, đăng nhập tài khoản {{site}} của bạn không còn yêu cầu bước thứ hai nữa.',
      },
      reset: {
        subject: 'Đăng nhập hai bước đã được đặt lại',
        title: 'Đăng nhập hai bước đã được đặt lại',
        body: 'Chào {{name}}, theo yêu cầu của bạn, một quản trị viên của {{site}} đã tắt đăng nhập hai bước cho tài khoản của bạn. Bạn có thể bật lại trong cài đặt bảo mật.',
      },
      recoveryUsed: {
        subject: 'Một mã khôi phục đã được sử dụng',
        title: 'Một mã khôi phục đã được sử dụng',
        body: 'Chào {{name}}, một mã khôi phục của tài khoản {{site}} của bạn vừa được sử dụng. Số mã còn lại: {{left}}.',
      },
    },
    links: {
      footer:
        'Bạn nhận được email này vì @{{username}} đã gửi video tới địa chỉ này trên {{site}}.',
      invite: {
        subject: '@{{username}} chia sẻ video với bạn',
        title: '{{name}} chia sẻ video với bạn',
        body_other:
          '@{{username}} đã gửi cho bạn {{count}} video trên {{site}}, bắt đầu với “{{title}}”.',
        how: 'Hãy xem và tải xuống trước khi liên kết hết hạn: liên kết có hiệu lực đến {{date}} (UTC). Để mở, hãy yêu cầu mã — mã sẽ được gửi tới địa chỉ này.',
        button: 'Mở video',
      },
      code: {
        subject: 'Mã {{code}} để mở video',
        title: 'Mã của bạn: {{code}}',
        body: 'Hãy nhập mã trên trang liên kết tạm thời từ @{{username}}.',
        expires:
          'Mã có hiệu lực trong 15 phút. Nếu bạn không yêu cầu mã, hãy bỏ qua email này.',
      },
    },
  },
} as const;
