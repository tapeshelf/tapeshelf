export const ko = {
  errors: {
    internal: '서버에 문제가 생겼어요. 나중에 다시 시도해 주세요.',
    generic: '요청을 처리하지 못했어요.',
    badRequest: '잘못된 요청이에요.',
    validation: '올바르지 않은 항목이 있어요.',
    notFound: '찾을 수 없어요.',
    conflict: '현재 상태와 맞지 않아요. 새로고침하고 다시 시도하세요.',
    payloadTooLarge: '요청이 너무 커요.',
    tooManyRequests: '요청이 너무 많아요. 잠시 후에 다시 시도하세요.',
    unauthorized: '로그인해야 할 수 있어요.',
    forbidden: '이 작업을 할 권한이 없어요.',
    auth: {
      captchaRequired: '사람인지 확인해 주세요.',
      captchaFailed: '확인을 통과하지 못했어요. 다시 시도해 주세요.',
      captchaUnavailable:
        '지금은 확인을 할 수 없어요. 나중에 다시 시도해 주세요.',
      invalidCredentials: '이메일 또는 비밀번호가 틀렸어요.',
      registrationClosed:
        '이곳은 가입이 닫혀 있어요. 계정이 필요하면 이 사이트 운영자에게 문의하세요.',
      emailTaken: '이 이메일로 가입된 계정이 이미 있어요.',
      usernameTaken: '이미 사용 중인 사용자 이름이에요.',
      usernameInvalid:
        '사용자 이름은 3~30자의 영문 소문자, 숫자, 밑줄(_)로 만들어요.',
      usernameReserved: '쓸 수 없는 사용자 이름이에요.',
      usernameChangeTooSoon_other:
        '{{count}}일 후에 사용자 이름을 다시 바꿀 수 있어요.',
      passwordWeak:
        '비밀번호는 8자 이상이어야 하고 문자와 숫자가 하나 이상씩 들어가야 해요.',
      tokenInvalid: '유효하지 않거나 이미 사용한 링크예요.',
      tokenExpired: '만료된 링크예요. 새 링크를 요청하세요.',
      emailNotVerified: '먼저 이메일 주소를 인증하세요.',
      emailAlreadyVerified: '이미 인증된 이메일이에요.',
      accountBanned: '이용이 정지된 계정이에요.',
      sessionExpired: '세션이 만료됐어요. 다시 로그인하세요.',
      tooManyAttempts_other:
        '로그인 시도가 너무 많아요. {{count}}분 후에 다시 시도하세요.',
      googleNotConfigured: 'Google 로그인을 사용할 수 없어요.',
      googleFailed: 'Google 로그인에 실패했어요. 다시 시도해 주세요.',
      googleSignupExpired: '가입 세션이 만료됐어요. 처음부터 다시 시작하세요.',
      wrongPassword: '현재 비밀번호가 틀렸어요.',
      csrf: '보안상의 이유로 요청이 차단됐어요. 페이지를 새로고침하고 다시 시도하세요.',
      twoFactorLogin: '인증 앱에 표시된 코드를 입력하세요.',
      adminGoogle:
        '관리자는 Google로 로그인할 수 없어요. 비밀번호와 2단계 인증으로 로그인하세요.',
      googleLinkTwoFactor:
        '이 이메일의 계정은 2단계 인증을 쓰고 있어요. 그 계정의 비밀번호로 로그인하세요.',
    },
    twoFactor: {
      required:
        '관리자 페이지를 열려면 2단계 인증이 필요해요. 설정 → 보안에서 켜세요.',
      confirm: '먼저 2단계 인증으로 본인임을 확인하세요.',
      invalidCode: '코드가 맞지 않아요. 확인하고 다시 시도하세요.',
      expired: '로그인 시간이 너무 오래 걸렸어요. 비밀번호를 다시 입력하세요.',
      setupExpired: '설정 시간이 너무 오래 걸렸어요. 처음부터 다시 시작하세요.',
      needsPassword:
        '2단계 인증은 비밀번호를 보호하는 기능이에요. 먼저 비밀번호를 설정하세요.',
      admin: '관리자는 2단계 인증 없이 로그인할 수 없어요.',
      appExists: '이미 인증 앱이 등록되어 있어요.',
      passkeyInvalid: '패스키가 응답하지 않았어요. 다시 시도해 주세요.',
      passkeyLimit: '패스키가 이미 10개 있어요.',
      passkeyNotFound: '이 패스키는 더 이상 없어요.',
      noPasskey: '이 계정에는 패스키가 없어요.',
      off: '2단계 인증이 꺼져 있어요.',
    },
    users: {
      notFound: '존재하지 않는 사용자예요.',
      pageHidingNotAllowed: '페이지 숨기기는 Pro에서 쓸 수 있어요.',
      invalidImage: '지원하지 않는 이미지 파일이에요 (JPEG, PNG, WebP, GIF).',
    },
    exchange: {
      notFound: '존재하지 않는 요청이에요.',
      notAllowed: '이 요청에서는 그렇게 할 수 없어요.',
      offerChanged:
        '그사이 제안이 바뀌었어요. 대화 내용을 확인하고 다시 시도하세요.',
      videoBeingEdited:
        '이 교환에 포함된 동영상을 업로더가 지금 편집하고 있어요. 편집이 끝나면 다시 시도하세요.',
      nothingToRequest: '선택한 동영상 중 요청할 수 있는 동영상이 없어요.',
      hintTooEarly: '안내를 몇 번 더 본 다음에 숨길 수 있어요.',
      selfRequest: '내 동영상은 요청할 수 없어요.',
      invalidOffer:
        '제안에는 양쪽에 동영상이 하나 이상 있어야 하고, 모두 소유자가 이용할 수 있는 동영상이어야 해요.',
      blocked: '이 사용자에게는 요청을 보낼 수 없어요.',
      alreadyBlocked: '이미 차단한 사용자예요.',
      selfBlock: '나 자신은 차단할 수 없어요.',
    },
    social: {
      selfFollow: '나 자신은 팔로우할 수 없어요.',
      followNotAllowed: '이 사용자는 친구로 추가할 수 없어요.',
    },
    editor: {
      invalid: '이 편집 내용은 저장할 수 없어요. 시간과 영역을 확인하세요.',
      nothing: '바뀐 내용이 없어요.',
      inProgress:
        '이미 편집 중인 동영상이에요. 끝날 때까지 기다리거나 취소하세요.',
      notReady: '처리가 끝나야 동영상을 편집할 수 있어요.',
      proOnly: '동영상 편집기는 Pro에서 쓸 수 있어요.',
      copyOwnOnly: '내 동영상만 사본으로 저장할 수 있어요.',
    },
    invites: {
      notFound: '존재하지 않는 초대 링크예요.',
      expired: '만료된 초대예요. 새 링크를 부탁하세요.',
      usedUp: '사용 횟수가 끝난 초대예요. 새 링크를 부탁하세요.',
      own: '내 초대 링크예요. 다른 사람에게 보내세요.',
    },
    deals: {
      notFound:
        '거래를 찾을 수 없어요. 거래를 시작한 브라우저가 아닐 수도 있어요.',
      closed: '끝난 거래예요.',
      linkNotFound: '이 교환 링크는 더 이상 작동하지 않아요.',
      linkVideos:
        '교환 링크에는 처리가 끝난 내 동영상을 최대 50개까지 고르세요.',
      guestsOff: '이 사용자는 가입한 사람과만 교환해요.',
      uploadsMax: '거래 하나에 내 동영상을 최대 {{max}}개까지 넣을 수 있어요.',
      videoInOffer:
        '이 동영상은 지금 제안에 들어 있어요. 먼저 제안을 바꾸세요.',
      nothingOffered: '제안할 내 동영상을 하나 이상 업로드하세요.',
      tooMany:
        '진행 중인 거래가 {{max}}건이에요. 새 거래를 시작하려면 하나를 먼저 끝내세요.',
    },
    links: {
      notFound: '존재하지 않거나 더 이상 작동하지 않는 링크예요.',
      passwordPro: '링크 비밀번호는 Pro에서 쓸 수 있어요.',
      tooMany: '유효한 링크가 {{max}}개 있어요. 먼저 몇 개를 취소하세요.',
      videoNotAllowed:
        '처리가 끝났고 삭제되지 않은, 내가 업로드했거나 받은 동영상만 링크로 보낼 수 있어요.',
      locked: '먼저 비밀번호나 이메일로 받은 코드를 입력하세요.',
      wrongPassword: '비밀번호가 틀렸어요.',
      wrongCode: '코드가 틀렸거나 만료됐어요. 새 코드를 받으세요.',
      codeTooSoon: '방금 코드를 보냈어요. 1분 뒤에 다시 받을 수 있어요.',
      codeLimit:
        '이 링크로 받은 코드가 너무 많아요. 1시간 뒤에 다시 시도하세요.',
      noEmail: '특정 이메일용 링크가 아니에요.',
      blocked: '이 사용자의 동영상은 담을 수 없어요.',
    },
    anonymousLinks: {
      pro: '익명 링크는 Pro에서 쓸 수 있어요.',
      tooMany: '익명 링크가 {{max}}개 있어요. 먼저 하나를 삭제하세요.',
      notFound: '존재하지 않거나 더 이상 작동하지 않는 링크예요.',
      nameNeeded:
        '내 표시 이름에 사용자 이름이 드러나요. 이 링크에 쓸 이름을 정하세요.',
      nameNamesNickname:
        '이 이름에 사용자 이름이 드러나요. 다른 이름을 고르세요.',
    },
    appTokens: {
      scope: '브라우저 확장 프로그램으로는 할 수 없는 작업이에요.',
      invalid: '확장 프로그램 연결이 끊겼어요. 다시 연결하세요.',
      code: '연결 코드가 만료됐거나 올바르지 않아요. 다시 연결해 보세요.',
      redirect: 'tapeshelf 확장 프로그램이 아닌 것 같아요.',
      notFound: '존재하지 않는 연결이에요.',
    },
    chat: {
      notFriends:
        '메시지는 친구끼리만 보낼 수 있어요. 서로 친구로 추가해야 해요.',
      unavailable: '이 사용자에게는 메시지를 보낼 수 없어요.',
      emptyMessage: '내용을 입력하거나 동영상을 첨부하세요.',
      videoNotAttachable:
        '이 동영상은 첨부할 수 없어요. 내 페이지에 보이는, 처리가 끝난 동영상을 고르세요.',
      selfMessage: '나 자신에게는 메시지를 보낼 수 없어요.',
      notFound: '존재하지 않는 대화예요.',
    },
    reports: {
      self: '나 자신이나 내 동영상은 신고할 수 없어요.',
    },
    support: {
      notFound: '문의를 찾을 수 없어요.',
      tooMany:
        '답변을 기다리는 문의가 {{count}}건 있어요. 답변을 받거나 하나를 해결됨으로 표시한 뒤 다시 남겨 주세요.',
      closed: '종료된 문의예요. 문제가 계속되면 새 문의를 남겨 주세요.',
      empty: '메시지를 입력하거나 이미지를 추가하세요.',
      tooManyFiles:
        '메시지 하나에 이미지는 최대 {{count}}개까지 올릴 수 있어요.',
      badImage:
        '이미지를 읽지 못했어요. PNG, JPG, WebP 이미지를 10MB까지 올릴 수 있어요.',
      notYourVideo: '내가 업로드한 동영상만 첨부할 수 있어요.',
      notRated: '해결됐거나 종료된 문의만 평가할 수 있어요.',
    },
    site: {
      legalNotFound: '이 사이트 운영자가 이 문서를 게시하지 않았어요.',
    },
    account: {
      confirmMismatch: '확인하려면 사용자 이름을 정확히 입력하세요.',
      deleted: '삭제된 계정이에요.',
    },
    billing: {
      disabled: '이 서버에는 결제 기능이 없어요.',
      unavailable: '지금은 결제를 이용할 수 없어요. 나중에 다시 시도해 주세요.',
      signature: '서명이 일치하지 않아요.',
      noSubscription: '구독이 없어요.',
    },
    downloads: {
      limitReached:
        '이번 달 다운로드 {{limit}}회를 모두 썼어요. 다음 다운로드는 {{date}}부터 가능해요.',
      busy: '다른 다운로드가 아직 진행 중이에요. 끝난 다음 다시 시도하세요.',
      ticketInvalid:
        '만료된 다운로드 링크예요. 동영상 페이지에서 다시 다운로드하세요.',
      range: '파일에 이 부분이 없어요.',
    },
    admin: {
      selfAction: '내 계정에는 이 작업을 할 수 없어요.',
      adminTarget: '먼저 관리자 역할을 해제하세요.',
      notInTrash: '휴지통에 없는 동영상이에요.',
      purged: '이미 저장소에서 완전히 지워진 동영상이에요.',
      authorDeleted: '업로더가 계정을 삭제해서 동영상을 복원할 수 없어요.',
      alreadyProcessed: '이미 처리된 동영상이에요.',
      tierUntilPast: '종료일은 미래 날짜여야 해요.',
      tiersDisabled: '이 서버에는 요금제가 없어요.',
      reportClosed: '이미 처리된 신고예요.',
      reportAction: '이 신고에는 맞지 않는 조치예요.',
      noEmail: '이 계정에는 이메일 주소가 없어요.',
      viewAsReadOnly:
        '다른 사용자로 사이트를 보고 있어요. 아무것도 바꿀 수 없어요.',
    },
    categories: {
      exists: '같은 이름의 카테고리가 이미 있어요.',
      tooMany: '카테고리는 최대 {{max}}개까지 만들 수 있어요.',
    },
    uploads: {
      fileTooLarge: '파일이 크기 제한({{max}})을 넘었어요.',
      quotaExceeded:
        '저장 공간이 부족해요. 이미 {{quota}} 중 {{used}}를 쓰고 있어요.',
      notFound: '존재하지 않는 업로드예요.',
      notActive: '이미 끝났거나 취소된 업로드예요.',
      expired: '만료된 업로드예요. 다시 시작하세요.',
      incomplete: '파일 일부가 없거나 손상됐어요. 다시 업로드하세요.',
      sizeMismatch: '업로드한 파일이 알려 준 크기와 달라요.',
      extensionDailyLimit:
        '오늘 확장 프로그램으로 저장할 수 있는 동영상 {{limit}}개를 모두 저장했어요. 개수는 자정(UTC)에 초기화돼요.',
    },
    videos: {
      deleteInAdminPanel:
        '다른 사람의 동영상은 관리자 페이지에서 삭제하세요. 업로더에게 위반한 규칙과 메모가 전달돼요.',
      notFound: '존재하지 않는 동영상이에요.',
      notReady: '동영상을 아직 처리하고 있어요.',
      categoryNotFound: '존재하지 않는 카테고리예요.',
      stackNotFound: '존재하지 않는 묶음이에요.',
      stackTooSmall: '묶음에는 동영상이 2개 이상 있어야 해요.',
      stackCategories:
        '묶음 안의 동영상은 모두 같은 카테고리에 속해요. 먼저 카테고리를 고르세요.',
      frameNotFound: '존재하지 않는 프레임이에요.',
      timestampOutOfRange: '동영상 길이를 넘는 시점이에요.',
      notWatchable: '이 동영상을 볼 권한이 없어요.',
      playbackTokenInvalid: '재생 링크가 만료됐어요. 페이지를 새로고침하세요.',
      downloadNotAllowed: '이 동영상은 다운로드할 수 없어요.',
      alreadyInCollection: '이미 내 컬렉션에 있는 동영상이에요.',
      cannotAddToCollection: '이 동영상은 내 컬렉션에 추가할 수 없어요.',
      cannotHide: '내 선반에 없는 동영상이에요.',
      ownVideoRename:
        '내 동영상의 제목은 동영상 정보에서 바꾸고, 모두에게 바뀌어요.',
    },
  },
  editor: {
    copySuffix: '(편집본)',
  },
  notifications: {
    failReason: {
      corrupted: '파일이 손상됐거나 동영상이 아니에요',
      noVideoStream: '파일에 영상 트랙이 없어요',
      zeroDuration: '동영상 길이가 0이에요',
      tooLong: '12시간이 넘는 동영상은 지원하지 않아요',
      tooLarge: '4096px보다 큰 프레임은 지원하지 않아요',
      fpsTooHigh: '60fps가 넘는 프레임 레이트는 지원하지 않아요',
      tooManyStreams: '파일에 스트림이 너무 많아요',
      transcodeFailed: '동영상을 변환하지 못했어요',
      blocked: '규칙 위반으로 삭제된 파일이라 다시 업로드할 수 없어요',
      internal: '처리하지 못했어요. 다시 업로드해 보세요',
    },
  },
  mail: {
    notifications: {
      guest: '게스트',
      anonymous: '익명',
      manage: '받을 알림 바꾸기: {{url}}',
      andMore_other: ' 외 {{count}}개',
      REQUEST_RECEIVED: {
        subject: '{{name}}님이 ‘{{title}}’ 동영상을 요청했어요',
        title: '새 동영상 요청',
        body_other:
          '{{name}}님이 ‘{{title}}’ 동영상(총 {{count}}개)을 공유해 달라고 요청했어요. 무료로 공유하거나, 거절하거나, 교환을 제안하세요.',
        message: '보낸 메시지: “{{message}}”',
        offered_other: '대신 자기 동영상 {{count}}개를 제안했어요.',
        button: '요청 열기',
      },
      OFFER_RECEIVED: {
        subject: '{{name}}님이 제안을 보냈어요',
        title: '역제안을 받았어요',
        body: '{{name}}님이 교환을 제안했어요 ({{round}}차). 수락하거나, 거절하거나, 내 제안을 보내세요.',
        bodyDeal:
          '{{name}}님이 내 ‘{{wants}}’{{wantsMore}} 대신 ‘{{gives}}’{{givesMore}} 동영상을 제안했어요. 수락하거나, 거절하거나, 내 제안을 보내세요.',
        message: '보낸 메시지: “{{message}}”',
        button: '대화 열기',
      },
      REQUEST_SHARED: {
        subject: '{{name}}님이 ‘{{title}}’ 동영상을 공유했어요',
        title: '공유받은 동영상',
        body_other:
          '{{name}}님이 ‘{{title}}’ 동영상(총 {{count}}개)을 무료로 공유했어요. 이제 내 컬렉션에 있어요.',
        button: '받은 동영상 보기',
      },
      EXCHANGE_COMPLETED: {
        subject: '{{name}}님과 교환을 마쳤어요',
        title: '교환 완료',
        body: '{{name}}님과 교환을 마쳤어요. {{received}}개를 받고 {{given}}개를 줬어요. 받은 동영상은 이제 내 컬렉션에 있어요.',
        button: '받은 동영상 보기',
      },
      REQUEST_DECLINED: {
        subject: '{{name}}님이 ‘{{title}}’ 요청을 거절했어요',
        title: '요청 거절됨',
        body: '{{name}}님이 거절했어요. {{comment}}',
        again_other: '{{count}}일 후에 다시 요청할 수 있어요.',
        button: '요청 열기',
      },
      REQUEST_CANCELLED: {
        subject: '{{name}}님이 ‘{{title}}’ 요청을 취소했어요',
        title: '요청 취소됨',
        body: '{{name}}님이 ‘{{title}}’ 동영상 요청을 취소했어요.',
        button: '요청 열기',
      },
      REQUEST_INVALIDATED: {
        subject: '‘{{title}}’ 요청이 바뀌었어요',
        title: '시스템이 요청을 업데이트했어요',
        body: '‘{{title}}’ 요청에 포함된 동영상 중 더 이상 볼 수 없는 것이 있어서 진행 상황이 업데이트됐어요.',
        bodyClosed:
          '‘{{title}}’ 요청이 종료됐어요. 상대 계정을 더 이상 이용할 수 없어요.',
        bodyExpired:
          '게스트와 하던 ‘{{title}}’ 거래가 만료됐어요. 3일 동안 아무도 응답하지 않았어요. 게스트의 동영상은 삭제됐어요.',
        button: '요청 열기',
      },
      NEW_FOLLOWER: {
        subject: '새 팔로워: {{name}}님',
        title: '새 팔로워',
        body: '{{name}}님이 내 컬렉션을 팔로우하기 시작했어요. 나도 친구로 추가하면 친구가 되어 메시지를 주고받을 수 있어요.',
        button: '상대 페이지 열기',
      },
      FRIEND_ACCEPTED: {
        subject: '이제 {{name}}님과 친구예요',
        title: '새 친구',
        body: '이제 {{name}}님과 서로 팔로우해요. 메시지와 동영상을 주고받을 수 있어요.',
        button: '상대 페이지 열기',
      },
      FOLLOWED_NEW_VIDEO: {
        subject: '{{name}}님의 새 동영상: ‘{{title}}’',
        title: '{{name}}님의 새 동영상',
        body: '{{name}}님이 ‘{{title}}’ 동영상을 새로 추가했어요.',
        bodyPrivate:
          '{{name}}님이 ‘{{title}}’ 비공개 동영상을 새로 추가했어요. 공유해 달라고 요청할 수 있어요.',
        button: '동영상 열기',
      },
      NEW_MESSAGE: {
        subject: '{{name}}님의 새 메시지',
        title: '새 메시지',
        body: '{{name}}: “{{preview}}”',
        bodyVideo: '{{name}}님이 채팅으로 동영상을 보냈어요.',
        button: '채팅 열기',
      },
      VIDEO_PROCESSED: {
        subject: '‘{{title}}’ 동영상이 준비됐어요',
        title: '동영상이 준비됐어요',
        body: '‘{{title}}’ 동영상 처리가 끝났어요. 이제 볼 수 있어요.',
        button: '동영상 열기',
      },
      VIDEO_FAILED: {
        subject: '‘{{title}}’ 동영상을 처리하지 못했어요',
        title: '처리 실패',
        body: '‘{{title}}’ 동영상을 처리하지 못했어요. 이유: {{reason}}. 파일을 다시 업로드할 수 있어요.',
        button: '내 페이지 열기',
      },
      VIDEO_REMOVED: {
        subject: '업로더가 ‘{{title}}’ 동영상을 삭제했어요',
        title: '컬렉션에서 동영상이 빠졌어요',
        body: '{{author}}님이 내 컬렉션에 있던 ‘{{title}}’ 동영상을 삭제했어요. 이제 아무도 이 동영상을 볼 수 없어요.',
        button: '알림 열기',
      },
      REPORT_RESOLVED: {
        subject: '신고 검토가 끝났어요',
        title: '신고 검토 완료',
        bodyVideo:
          '‘{{title}}’ 동영상에 대한 신고를 검토하고 조치했어요. {{site}}의 안전을 지키는 데 힘을 보태 줘서 고마워요.',
        bodyUser:
          '{{title}}님에 대한 신고를 검토하고 조치했어요. {{site}}의 안전을 지키는 데 힘을 보태 줘서 고마워요.',
        bodyVideoNone:
          '‘{{title}}’ 동영상에 대한 신고를 검토했지만 규칙 위반을 찾지 못했어요.',
        bodyUserNone:
          '{{title}}님에 대한 신고를 검토했지만 규칙 위반을 찾지 못했어요.',
        button: '알림 열기',
      },
      ADMIN_NOTICE: {
        subject: '{{site}}의 메시지',
        title: '{{site}} 팀의 메시지',
        body: '{{message}}',
        button: '알림 열기',
      },
      VIDEO_EDITED: {
        subject: '운영진이 내 ‘{{title}}’ 동영상을 수정했어요',
        title: '동영상 수정됨',
        body: '{{site}} 운영진이 내 ‘{{title}}’ 동영상을 수정했어요(예: 일부를 흐리게 처리). 링크를 비롯한 나머지는 그대로예요.',
        button: '동영상 열기',
      },
      VIDEO_EDIT_FAILED: {
        subject: '‘{{title}}’ 동영상 편집에 실패했어요',
        title: '편집이 저장되지 않았어요',
        body: '내 ‘{{title}}’ 동영상을 편집하지 못했어요. 동영상은 그대로이고, 수정한 내용은 편집기에 남아 있어서 다시 시도할 수 있어요.',
        button: '편집기 열기',
      },
      SUPPORT_REPLY: {
        subject: '고객 지원팀이 #{{number}}번 문의에 답변했어요',
        title: '고객 지원팀 답변',
        body: '#{{number}} ‘{{subject}}’: {{preview}}',
        bodyResolved:
          '고객 지원팀이 #{{number}}번 문의 ‘{{subject}}’ 건을 해결됨으로 표시했어요. 문제가 계속되면 새 문의를 남겨 주세요.',
        bodyResolvedWith:
          '고객 지원팀이 #{{number}}번 문의 ‘{{subject}}’ 건에 답변하고 해결됨으로 표시했어요: {{preview}}',
        button: '문의 열기',
      },
      SUPPORT_TICKET: {
        subject: '문의 #{{number}}: {{subject}}',
        title: '#{{number}}번 문의',
        body: '@{{name}}님의 문의({{topic}}): ‘{{subject}}’. {{preview}}',
        bodyReply:
          '@{{name}}님이 #{{number}}번 문의 ‘{{subject}}’에 다시 글을 남겼어요: {{preview}}',
        button: '관리자 페이지에서 열기',
      },
      LINK_OPENED: {
        subject: '누군가 내 임시 링크를 열었어요',
        title: '링크 열림',
        body_other:
          '@{{name}}님이 ‘{{title}}’ 동영상(총 {{count}}개)이 담긴 내 임시 링크를 열었어요.',
        bodyGuest_other:
          '누군가 ‘{{title}}’ 동영상(총 {{count}}개)이 담긴 내 임시 링크를 열었어요.',
        button: '내 링크 열기',
      },
      LINK_SAVED: {
        subject: '@{{name}}님이 내 링크의 동영상을 담았어요',
        title: '내 링크에서 담아 감',
        body_other:
          '@{{name}}님이 내 임시 링크에서 ‘{{title}}’ 동영상(총 {{count}}개)을 자기 선반에 담았어요.',
        button: '내 링크 열기',
      },
      VIDEO_TAKEN_DOWN: {
        subject: '내 ‘{{title}}’ 동영상이 삭제됐어요',
        title: '동영상 삭제됨',
        body: '{{site}}에서 내 ‘{{title}}’ 동영상을 삭제했어요. 사유: {{rule}}. 이제 아무도 이 동영상을 볼 수 없어요.',
        message: '운영진 메모: {{message}}',
        appeal: '잘못된 조치라고 생각하면 {{email}} 주소로 연락해 주세요.',
        button: '알림 열기',
      },
      PLAN_EXPIRING: {
        subject: 'Pro 요금제가 {{date}}에 끝나요',
        title: 'Pro가 곧 끝나요',
        body: '{{site}}의 Pro 요금제가 {{date}}(UTC)에 끝나요. 그 후에는 선반에 Free 한도가 적용돼요. 삭제되는 건 없어요.',
        page: '지금은 내 페이지를 숨겨 두었어요. Pro가 끝나면 다시 모두에게 보여요.',
        anonymousLinks:
          'Pro가 끝나면 익명 링크가 열리지 않아요. Pro를 다시 시작하면 다시 열려요.',
        button: '내 요금제 열기',
      },
      PLAN_PAYMENT_FAILED: {
        subject: 'Pro 요금제를 갱신하지 못했어요',
        title: '결제 실패',
        body: '{{site}}의 Pro 요금제 결제가 되지 않았어요. {{date}}(UTC)까지 결제 수단을 업데이트하지 않으면 선반에 Free 한도가 적용돼요. 삭제되는 건 없어요.',
        button: '결제 수단 업데이트',
      },
      PLAN_EXPIRED: {
        subject: 'Pro 요금제가 끝났어요',
        title: 'Pro가 끝났어요',
        body: '이제 {{site}}의 내 선반에 Free 한도가 적용돼요. 동영상 1개당 {{file}}, 전체 {{shelf}}까지예요. 삭제된 건 없어요.',
        bodyOverQuota:
          '이제 {{site}}의 내 선반에 Free 한도가 적용돼요. 동영상 1개당 {{file}}, 전체 {{shelf}}까지예요. 선반에 그보다 많이 담겨 있어서 공간을 비울 때까지 새 업로드가 멈춰요. 삭제된 건 없어요.',
        page: '내 페이지가 다시 모두에게 보여요. 페이지 숨기기는 Pro에서 쓸 수 있어요.',
        anonymousLinks:
          '익명 링크가 더 이상 열리지 않아요. Pro를 다시 시작하면 다시 열려요.',
        button: '내 요금제 열기',
      },
    },
    supportTopics: {
      QUESTION: '질문',
      BUG: '오류 신고',
      ACCOUNT: '계정',
      IDEA: '아이디어',
    },
    takedownRules: {
      SPAM: '스팸 또는 광고',
      ILLEGAL: '불법 콘텐츠',
      COPYRIGHT: '저작권 침해',
      ABUSE: '모욕 또는 괴롭힘',
      UNMARKED_ADULT: '민감한 콘텐츠인데 표시가 없음',
      OTHER: '규칙 위반',
    },
    footer: '이 주소로 {{site}} 계정이 만들어져서 보내 드리는 메일이에요.',
    verify: {
      subject: '{{site}} 이메일 인증',
      title: '{{name}}님, {{site}}에 오신 걸 환영해요!',
      body: '이메일 주소를 인증하면 업로드, 동영상 요청, 친구, 메시지를 쓸 수 있어요.',
      button: '이메일 인증하기',
      expires: '링크는 24시간 동안 유효해요.',
    },
    reset: {
      subject: '{{site}} 비밀번호 재설정',
      title: '비밀번호 재설정',
      body: '{{name}}님, 누군가(아마 본인이겠죠) {{site}} 계정의 비밀번호 재설정을 요청했어요.',
      button: '새 비밀번호 설정',
      expires:
        '링크는 1시간 동안 유효해요. 요청한 적이 없다면 이 메일은 무시하세요.',
    },
    guestDeal: {
      button: '거래 열기',
      footer:
        '{{site}}의 거래 페이지에 이 주소를 입력해서 보내 드리는 메일이에요. 계정은 만들어지지 않았어요.',
      saved: {
        subject: '{{name}}님과의 거래',
        title: '이 메일을 보관하세요',
        body: '이 버튼을 누르면 어느 기기에서든 {{name}}님과의 거래로 돌아올 수 있어요. {{name}}님이 응답하면 이 주소로 알려 드려요.',
      },
      offer: {
        subject: '{{name}}님이 내 제안에 응답했어요',
        title: '새 제안',
        body: '{{name}}님이 다른 교환을 제안했어요. 수락하거나, 내 제안으로 응답하거나, 거절하세요. 거래 기간은 3일 늘어났어요.',
      },
      accepted: {
        subject: '{{name}}님과 교환을 마쳤어요',
        title: '교환 완료',
        body: '받은 동영상은 거래 페이지에서 7일 동안 보고 다운로드할 수 있어요. 계속 가지고 있으려면 거래 페이지에서 로그인하거나 계정을 만드세요.',
      },
      shared: {
        subject: '{{name}}님이 동영상을 공유했어요',
        title: '공유받은 동영상',
        body: '{{name}}님이 내 동영상은 받지 않고 동영상을 줬어요. 내 동영상은 서버에서 삭제됐어요. 받은 동영상은 거래 페이지에서 7일 동안 보고 다운로드할 수 있어요.',
      },
      declined: {
        subject: '{{name}}님이 교환을 거절했어요',
        title: '교환이 거절됐어요',
        body: '거래가 끝났어요. 내 동영상은 바로 서버에서 삭제됐고, 아무도 받지 않았어요.',
      },
      closed: {
        subject: '{{name}}님과의 거래가 종료됐어요',
        title: '거래 종료',
        body: '거래를 계속할 수 없게 됐어요(동영상이 없어졌거나 계정이 해지됐어요). 내 동영상은 바로 서버에서 삭제됐고, 아무도 받지 않았어요.',
      },
      expired: {
        subject: '{{name}}님과의 거래가 만료됐어요',
        title: '거래 만료',
        body: '3일 동안 아무도 응답하지 않아서 거래가 끝났어요. 내 동영상은 바로 서버에서 삭제됐고, 아무도 받지 않았어요.',
      },
    },
    twoFactor: {
      button: '보안 설정 열기',
      notYou:
        '본인이 한 일이 아니라면 바로 비밀번호를 바꾸고 저희에게 연락해 주세요.',
      on: {
        subject: '2단계 인증을 켰어요',
        title: '2단계 인증을 켰어요',
        body: '{{name}}님, 이제 {{site}} 계정에 비밀번호로 로그인하면 2단계 인증도 거쳐야 해요. 다른 기기에서는 로그아웃됐어요.',
      },
      off: {
        subject: '2단계 인증을 껐어요',
        title: '2단계 인증을 껐어요',
        body: '{{name}}님, 이제 {{site}} 계정에 로그인할 때 2단계 인증을 거치지 않아요.',
      },
      reset: {
        subject: '2단계 인증이 초기화됐어요',
        title: '2단계 인증이 초기화됐어요',
        body: '{{name}}님, 요청에 따라 {{site}} 관리자가 계정의 2단계 인증을 껐어요. 보안 설정에서 다시 켤 수 있어요.',
      },
      recoveryUsed: {
        subject: '복구 코드를 사용했어요',
        title: '복구 코드를 사용했어요',
        body: '{{name}}님, 방금 {{site}} 계정의 복구 코드가 사용됐어요. 남은 코드: {{left}}개',
      },
    },
    links: {
      footer:
        '@{{username}}님이 {{site}}에서 이 주소로 동영상을 보내서 받은 메일이에요.',
      invite: {
        subject: '@{{username}}님이 동영상을 공유했어요',
        title: '{{name}}님이 동영상을 공유했어요',
        body_other:
          '@{{username}}님이 {{site}}에서 ‘{{title}}’ 동영상(총 {{count}}개)을 보냈어요.',
        how: '링크가 만료되기 전에 보고 다운로드하세요. 링크는 {{date}}(UTC)까지 유효해요. 열려면 코드를 받으세요. 코드는 이 주소로 와요.',
        button: '동영상 열기',
      },
      code: {
        subject: '동영상을 여는 코드 {{code}}',
        title: '코드: {{code}}',
        body: '@{{username}}님이 보낸 임시 링크 페이지에 이 코드를 입력하세요.',
        expires:
          '코드는 15분 동안 유효해요. 요청한 적이 없다면 이 메일은 무시하세요.',
      },
    },
  },
} as const;
