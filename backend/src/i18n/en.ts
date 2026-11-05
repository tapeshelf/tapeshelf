export const en = {
  errors: {
    deviceUnknown: 'This phone is no longer signed in. Open the app.',
    clientTooOld: 'This version of the app is too old for this server.',
    internal: 'Something went wrong on our side. Please try again later.',
    generic: 'The request could not be completed.',
    badRequest: 'The request is invalid.',
    validation: 'Some fields are invalid.',
    notFound: 'Not found.',
    conflict: 'This conflicts with the current state. Refresh and try again.',
    payloadTooLarge: 'The request is too large.',
    tooManyRequests: 'Too many requests. Please slow down.',
    unauthorized: 'You need to sign in to do that.',
    forbidden: "You don't have permission to do that.",
    auth: {
      captchaRequired: 'Please confirm you are human.',
      captchaFailed: 'The check did not pass. Please try again.',
      captchaUnavailable:
        'The check is unavailable right now. Please try again later.',
      invalidCredentials: 'Wrong email or password.',
      registrationClosed:
        'Sign-ups are closed here. To get an account, ask whoever runs this site.',
      emailTaken: 'An account with this email already exists.',
      usernameTaken: 'This username is already taken.',
      usernameInvalid:
        'A username is 3–30 characters: lowercase letters, digits and underscores.',
      usernameReserved: 'This username is reserved.',
      // i18next picks _one/_other by `count`; Russian keeps one text ("дн.").
      usernameChangeTooSoon_one:
        'You can change your username again in {{count}} day.',
      usernameChangeTooSoon_other:
        'You can change your username again in {{count}} days.',
      passwordWeak:
        'The password must be at least 8 characters and contain a letter and a digit.',
      tokenInvalid: 'This link is invalid or has already been used.',
      tokenExpired: 'This link has expired. Please request a new one.',
      emailNotVerified: 'Please confirm your email address first.',
      emailAlreadyVerified: 'Your email is already confirmed.',
      accountBanned: 'This account has been suspended.',
      sessionExpired: 'Your session has expired. Please sign in again.',
      tooManyAttempts_one:
        'Too many sign-in attempts. Try again in {{count}} minute.',
      tooManyAttempts_other:
        'Too many sign-in attempts. Try again in {{count}} minutes.',
      googleNotConfigured: 'Sign-in with Google is not available.',
      googleFailed: 'Sign-in with Google failed. Please try again.',
      googleSignupExpired:
        'The sign-up session has expired. Please start again.',
      wrongPassword: 'The current password is wrong.',
      csrf: 'The request was blocked for security reasons. Reload the page and try again.',
      twoFactorLogin: 'Enter the code from your authenticator app.',
      adminGoogle:
        'Admins sign in with their password and the second step, not with Google.',
      googleLinkTwoFactor:
        'This email belongs to an account with two-step sign-in. Sign in with its password.',
    },
    /** Two-step sign-in. */
    twoFactor: {
      required:
        'The admin panel needs two-step sign-in: turn it on in Settings → Security.',
      confirm: 'Confirm it is you with the second step first.',
      invalidCode: 'This code does not fit. Check it and try again.',
      expired: 'Signing in took too long. Enter your password again.',
      setupExpired: 'The setup took too long. Please start again.',
      needsPassword:
        'Two-step sign-in protects a password. Set a password first.',
      admin: 'An admin cannot sign in without the second step.',
      appExists: 'An authenticator app is already set up.',
      passkeyInvalid: 'The passkey did not answer. Please try again.',
      passkeyLimit: 'You already have 10 passkeys.',
      passkeyNotFound: 'This passkey is no longer there.',
      noPasskey: 'This account has no passkey.',
      off: 'Two-step sign-in is off.',
    },
    users: {
      notFound: 'This user does not exist.',
      pageHidingNotAllowed: 'Hiding the page comes with Pro.',
      invalidImage:
        'This file is not a supported image (JPEG, PNG, WebP or GIF).',
    },
    exchange: {
      notFound: 'This request does not exist.',
      notAllowed: 'You cannot do that with this request.',
      offerChanged:
        'The offer has changed in the meantime. Review the thread and try again.',
      videoBeingEdited:
        'A video of this exchange is being edited by its author right now. Try again once it is ready.',
      nothingToRequest: 'None of the selected videos can be requested.',
      hintTooEarly: 'You can hide the hint after a few more views.',
      selfRequest: 'You cannot request your own videos.',
      invalidOffer:
        'An offer needs at least one video on each side, all available to their owners.',
      blocked: 'You cannot send requests to this user.',
      alreadyBlocked: 'This user is already blocked.',
      selfBlock: 'You cannot block yourself.',
    },
    social: {
      selfFollow: 'You cannot follow yourself.',
      followNotAllowed: 'You cannot add this user as a friend.',
    },
    editor: {
      invalid: 'This edit cannot be saved: check its times and areas.',
      nothing: 'Nothing has changed.',
      inProgress:
        'This video is being edited already. Wait for it or cancel it.',
      notReady: 'The video can be edited once it is processed.',
      proOnly: 'The video editor comes with Pro.',
      copyOwnOnly: 'Only your own videos can be saved as a copy.',
    },
    invites: {
      notFound: 'This invitation link does not exist.',
      expired: 'This invitation has expired. Ask for a new link.',
      usedUp: 'This invitation has been used up. Ask for a new link.',
      own: 'This is your own invitation: send it to someone.',
    },
    /** Exchanges with guests and exchange links. */
    deals: {
      notFound:
        'This deal is not there (or this browser is not the one it was started in).',
      closed: 'This deal is over.',
      linkNotFound: 'This exchange link no longer works.',
      linkVideos: 'Pick your own ready videos (up to 50) for an exchange link.',
      guestsOff: 'This person takes exchanges from registered users only.',
      uploadsMax: 'A deal takes up to {{max}} of your videos.',
      videoInOffer:
        'This video is in the offer on the table: change the offer first.',
      nothingOffered: 'Upload at least one of your videos to offer.',
      tooMany:
        'You have {{max}} deals going on. Finish one before starting another.',
    },
    links: {
      notFound: 'This link does not exist or no longer works.',
      passwordPro: 'A password on a link comes with Pro.',
      tooMany:
        'You have {{max}} links that still work. Revoke some of them first.',
      videoNotAllowed:
        'Only your own uploads and videos you received can be sent by link — ready and not deleted.',
      locked: 'Enter the password or the code from the email first.',
      wrongPassword: 'Wrong password.',
      wrongCode: 'The code is wrong or has expired. Ask for a new one.',
      codeTooSoon:
        'A code has just been sent. You can ask for another one in a minute.',
      codeLimit: 'Too many codes for this link. Try again in an hour.',
      noEmail: 'This link is not for a particular email.',
      emailOff:
        'This server doesn’t send email, so links for one person aren’t available.',
      blocked: 'You cannot add videos from this person.',
    },
    anonymousLinks: {
      pro: 'Anonymous links come with Pro.',
      tooMany: 'You have {{max}} anonymous links. Delete one of them first.',
      notFound: 'This link does not exist or no longer works.',
      nameNeeded:
        'Your name gives away your nickname. Choose a name for this link.',
      nameNamesNickname:
        'This name gives away your nickname. Choose another one.',
    },
    appTokens: {
      scope: 'The browser extension cannot do this.',
      invalid: 'The extension is no longer connected. Connect it again.',
      code: 'The connection code has expired or is wrong. Try connecting again.',
      redirect: 'This does not look like the tapeshelf extension.',
      notFound: 'This connection does not exist.',
    },
    chat: {
      notFriends:
        'You can message only friends: both of you need to add each other.',
      unavailable: 'This user cannot receive messages.',
      emptyMessage: 'Write something or attach a video.',
      videoNotAttachable:
        'This video cannot be attached. Pick a ready video that is visible on your page.',
      selfMessage: 'You cannot message yourself.',
      notFound: 'This conversation does not exist.',
    },
    reports: {
      self: 'You cannot report yourself or your own videos.',
    },
    support: {
      notFound: 'This request was not found.',
      tooMany:
        'You have {{count}} open requests. Wait for an answer to one of them, or mark one as solved.',
      closed:
        'This request is closed. If the problem is still there, please start a new one.',
      empty: 'Write a message or add a picture.',
      tooManyFiles: 'Up to {{count}} pictures per message.',
      badImage:
        'This picture could not be read. PNG, JPG or WebP, up to 10 MB.',
      notYourVideo: 'You can only attach a video you uploaded yourself.',
      notRated: 'A request can be rated once it is solved or closed.',
    },
    site: {
      legalNotFound:
        'The operator of this site has not published this document.',
    },
    account: {
      confirmMismatch: 'Type your username exactly to confirm.',
      deleted: 'This account has been deleted.',
    },
    billing: {
      disabled: 'This server has no payments.',
      unavailable:
        'Payments are unavailable right now. Please try again later.',
      signature: 'The signature does not match.',
      noSubscription: 'You have no subscription.',
    },
    downloads: {
      limitReached:
        'You have used all {{limit}} downloads for this month. The next one is available on {{date}}.',
      busy: 'Another download is still running. Wait for it to finish, then try again.',
      ticketInvalid:
        'This download link has expired. Start the download again from the video page.',
      range: 'This part of the file does not exist.',
    },
    traffic: {
      limitReached:
        'You have used up this month’s traffic on your plan. It renews at the start of next month.',
      sharerLimitReached:
        'The person who shared this video has used up this month’s traffic. It renews at the start of next month.',
    },
    admin: {
      selfAction: 'You cannot do this to your own account.',
      adminTarget: 'Remove the admin role first.',
      notInTrash: 'This video is not in the trash.',
      purged: 'This video has already been erased from storage.',
      authorDeleted:
        'The author deleted their account, so the video cannot be restored.',
      alreadyProcessed: 'This video is already processed.',
      tierUntilPast: 'The end date must be in the future.',
      tiersDisabled: 'This server has no plans.',
      reportClosed: 'This report has already been handled.',
      reportAction: 'This action does not fit the report.',
      noEmail: 'This account has no email address.',
      viewAsReadOnly:
        'You are viewing the site as another user: nothing can be changed.',
    },
    categories: {
      exists: 'You already have a category with this name.',
      tooMany: 'You can have up to {{max}} categories.',
    },
    uploads: {
      fileTooLarge: 'The file is larger than the {{max}} limit.',
      quotaExceeded:
        'Not enough storage space: {{used}} of {{quota}} is already in use.',
      notFound: 'This upload does not exist.',
      notActive: 'This upload has already finished or was cancelled.',
      expired: 'This upload has expired. Please start it again.',
      incomplete:
        'Some parts of the file are missing or damaged. Please retry the upload.',
      sizeMismatch: 'The uploaded file does not match the announced size.',
      extensionDailyLimit:
        'You have saved {{limit}} videos through the extension today, the most allowed. The count starts again at midnight (UTC).',
    },
    videos: {
      deleteInAdminPanel:
        'Delete other people’s videos in the admin panel: the author is told the rule and your note.',
      notFound: 'This video does not exist.',
      notReady: 'The video is still being processed.',
      categoryNotFound: 'This category does not exist.',
      stackNotFound: 'This stack does not exist.',
      stackTooSmall: 'A stack needs at least two videos.',
      stackCategories:
        'The videos of a stack share one category: choose it first.',
      frameNotFound: 'This frame does not exist.',
      timestampOutOfRange: 'This time is beyond the end of the video.',
      notWatchable: 'You do not have access to this video.',
      playbackTokenInvalid:
        'The playback link has expired. Please reload the page.',
      downloadNotAllowed: 'Downloading this video is not allowed.',
      alreadyInCollection: 'This video is already in your collection.',
      cannotAddToCollection: 'This video cannot be added to your collection.',
      cannotHide: 'This video is not on your shelf.',
      ownVideoRename:
        'Your own video is renamed in its edit form, and for everyone.',
    },
  },
  /** The video editor: a copy's title is the original's with this after it. */
  editor: {
    copySuffix: '(edited)',
  },
  notifications: {
    failReason: {
      corrupted: 'the file is damaged or is not a video',
      noVideoStream: 'the file has no video track',
      zeroDuration: 'the video has no duration',
      tooLong: 'videos longer than 12 hours are not supported',
      tooLarge: 'frames larger than 4096 px are not supported',
      fpsTooHigh: 'frame rates above 60 fps are not supported',
      tooManyStreams: 'the file has too many streams',
      transcodeFailed: 'the video could not be converted',
      blocked:
        'this file was removed for breaking the rules and cannot be uploaded again',
      internal: 'Processing failed. Please try uploading again',
    },
  },
  mail: {
    notifications: {
      guest: 'A guest',
      anonymous: 'Anonymous',
      manage: 'Change which notifications you receive: {{url}}',
      unsubscribe: 'Stop emails like this one: {{url}}',
      andMore_one: ' and {{count}} more',
      andMore_other: ' and {{count}} more',
      REQUEST_RECEIVED: {
        subject: '{{name}} asks for “{{title}}”',
        title: 'New video request',
        body_one:
          '{{name}} would like you to share “{{title}}”. Share it for free, decline, or propose an exchange.',
        body_other:
          '{{name}} would like you to share {{count}} videos, starting with “{{title}}”. Share them for free, decline, or propose an exchange.',
        message: 'Their message: “{{message}}”',
        offered_one: 'In return they offer {{count}} of their videos.',
        offered_other: 'In return they offer {{count}} of their videos.',
        button: 'Open the request',
      },
      OFFER_RECEIVED: {
        subject: '{{name}} made you an offer',
        title: 'Counter-offer received',
        body: '{{name}} proposed an exchange (round {{round}}). Accept it, decline, or make your own offer.',
        bodyDeal:
          '{{name}} offers “{{gives}}”{{givesMore}} for your “{{wants}}”{{wantsMore}}. Accept it, decline, or make your own offer.',
        message: 'Their message: “{{message}}”',
        button: 'Open the thread',
      },
      REQUEST_SHARED: {
        subject: '{{name}} shared “{{title}}” with you',
        title: 'Shared with you',
        body_one:
          '{{name}} shared “{{title}}” with you for free. It is in your collection now.',
        body_other:
          '{{name}} shared {{count}} videos with you for free, starting with “{{title}}”. They are in your collection now.',
        button: 'See what you received',
      },
      EXCHANGE_COMPLETED: {
        subject: 'Exchange with {{name}} completed',
        title: 'Exchange completed',
        body: 'Your exchange with {{name}} is done: you received {{received}}, gave {{given}}. What you received is in your collection now.',
        button: 'See what you received',
      },
      REQUEST_DECLINED: {
        subject: '{{name}} declined the request for “{{title}}”',
        title: 'Request declined',
        body: '{{name}} declined. {{comment}}',
        again_one: 'You can ask for it again in {{count}} day.',
        again_other: 'You can ask for it again in {{count}} days.',
        button: 'Open the request',
      },
      REQUEST_CANCELLED: {
        subject: '{{name}} withdrew the request for “{{title}}”',
        title: 'Request withdrawn',
        body: '{{name}} cancelled their request for “{{title}}”.',
        button: 'Open the request',
      },
      REQUEST_INVALIDATED: {
        subject: 'The request for “{{title}}” changed',
        title: 'Request updated by the system',
        body: 'A video involved in the request for “{{title}}” is no longer available, so the negotiation was updated.',
        bodyClosed:
          'The request for “{{title}}” was closed: the other account is no longer available.',
        bodyExpired:
          'The deal with a guest for “{{title}}” ran out: nobody moved for three days. The guest’s videos were deleted.',
        button: 'Open the request',
      },
      NEW_FOLLOWER: {
        subject: 'New follower: {{name}}',
        title: 'New follower',
        body: '{{name}} now follows your collection. Add them back to become friends and message each other.',
        button: 'Open their page',
      },
      FRIEND_ACCEPTED: {
        subject: 'You and {{name}} are friends now',
        title: 'New friend',
        body: 'You and {{name}} follow each other now. You can send each other messages and videos.',
        button: 'Open their page',
      },
      FOLLOWED_NEW_VIDEO: {
        subject: 'New video from {{name}}: “{{title}}”',
        title: 'New video from {{name}}',
        body: '{{name}} added a new video, “{{title}}”.',
        bodyPrivate:
          '{{name}} added a new private video, “{{title}}”. You can ask them to share it.',
        button: 'Open video',
      },
      NEW_MESSAGE: {
        subject: 'New message from {{name}}',
        title: 'New message',
        body: '{{name}}: “{{preview}}”',
        bodyVideo: '{{name}} sent you a video in the chat.',
        button: 'Open chat',
      },
      VIDEO_PROCESSED: {
        subject: '“{{title}}” is ready',
        title: 'Your video is ready',
        body: '“{{title}}” has been processed and can be watched now.',
        button: 'Open video',
      },
      VIDEO_FAILED: {
        subject: '“{{title}}” could not be processed',
        title: 'Processing failed',
        body: '“{{title}}” could not be processed: {{reason}}. You can upload the file again.',
        button: 'Open my page',
      },
      VIDEO_REMOVED: {
        subject: '“{{title}}” was removed by its author',
        title: 'A video left your collection',
        body: '{{author}} deleted “{{title}}”, which was in your collection. It is no longer available to anyone.',
        button: 'Open notifications',
      },
      REPORT_RESOLVED: {
        subject: 'Your report has been reviewed',
        title: 'Report reviewed',
        bodyVideo:
          'We reviewed your report about “{{title}}” and took action. Thank you for helping keep {{site}} safe.',
        bodyUser:
          'We reviewed your report about {{title}} and took action. Thank you for helping keep {{site}} safe.',
        bodyVideoNone:
          'We reviewed your report about “{{title}}” and found no violation of the rules.',
        bodyUserNone:
          'We reviewed your report about {{title}} and found no violation of the rules.',
        button: 'Open notifications',
      },
      ADMIN_NOTICE: {
        subject: 'A message from {{site}}',
        title: 'Message from the {{site}} team',
        body: '{{message}}',
        button: 'Open notifications',
      },
      VIDEO_EDITED: {
        subject: 'Your video “{{title}}” was edited by a moderator',
        title: 'Video edited',
        body: 'A moderator of {{site}} edited your video “{{title}}” (for example, blurred part of it). The link and everything else stay the same.',
        button: 'Open the video',
      },
      VIDEO_EDIT_FAILED: {
        subject: 'The edit of “{{title}}” did not work out',
        title: 'Edit not saved',
        body: 'The edit of your video “{{title}}” could not be made. The video stays as it was; the editor keeps your changes, so you can try again.',
        button: 'Open the editor',
      },
      SUPPORT_REPLY: {
        subject: 'Support answered your request #{{number}}',
        title: 'Support answered',
        body: '#{{number}} “{{subject}}”: {{preview}}',
        bodyResolved:
          'Support marked your request #{{number}} “{{subject}}” as solved. If the problem is still there, start a new request.',
        bodyResolvedWith:
          'Support answered your request #{{number}} “{{subject}}” and marked it as solved: {{preview}}',
        button: 'Open the request',
      },
      SUPPORT_TICKET: {
        subject: 'Support #{{number}}: {{subject}}',
        title: 'Support request #{{number}}',
        body: '@{{name}} asks for help ({{topic}}): “{{subject}}”. {{preview}}',
        bodyReply:
          '@{{name}} wrote again in #{{number}} “{{subject}}”: {{preview}}',
        button: 'Open in the admin',
      },
      LINK_OPENED: {
        subject: 'Your temporary link was opened',
        title: 'Link opened',
        body_one: '@{{name}} opened your temporary link with “{{title}}”.',
        body_other:
          '@{{name}} opened your temporary link with {{count}} videos, starting with “{{title}}”.',
        bodyGuest_one: 'Someone opened your temporary link with “{{title}}”.',
        bodyGuest_other:
          'Someone opened your temporary link with {{count}} videos, starting with “{{title}}”.',
        button: 'Open my links',
      },
      LINK_SAVED: {
        subject: '@{{name}} saved videos from your link',
        title: 'Saved from your link',
        body_one:
          '@{{name}} put “{{title}}” from your temporary link on their shelf.',
        body_other:
          '@{{name}} put {{count}} videos from your temporary link on their shelf, starting with “{{title}}”.',
        button: 'Open my links',
      },
      VIDEO_TAKEN_DOWN: {
        subject: 'Your video “{{title}}” was removed',
        title: 'Video removed',
        body: 'We removed your video “{{title}}” from {{site}}: {{rule}}. It is no longer available to anyone.',
        message: 'Note from the moderator: {{message}}',
        appeal: 'If you think this is a mistake, write to {{email}}.',
        button: 'Open notifications',
      },
      PLAN_EXPIRING: {
        subject: 'Your Pro plan ends on {{date}}',
        title: 'Pro ends soon',
        body: 'Your Pro plan on {{site}} ends on {{date}} (UTC). After that your shelf gets the Free limits; nothing is deleted.',
        page: 'Your page is hidden now; when Pro ends, everyone will see it again.',
        anonymousLinks:
          'Your anonymous links will stop opening when Pro ends, and work again once you have Pro.',
        button: 'Open your plan',
      },
      PLAN_PAYMENT_FAILED: {
        subject: 'We could not renew your Pro plan',
        title: 'Payment failed',
        body: 'The payment for your Pro plan on {{site}} did not go through. Update your payment method by {{date}} (UTC), or your shelf gets the Free limits; nothing is deleted.',
        button: 'Update payment method',
      },
      PLAN_EXPIRED: {
        subject: 'Your Pro plan has ended',
        title: 'Pro has ended',
        body: 'Your shelf on {{site}} now has the Free limits: {{file}} per video and {{shelf}} in total. Nothing was deleted.',
        bodyOverQuota:
          'Your shelf on {{site}} now has the Free limits: {{file}} per video and {{shelf}} in total. Your shelf holds more than that, so new uploads are paused until you free up space. Nothing was deleted.',
        page: 'Your page is visible to everyone again: hiding it comes with Pro.',
        anonymousLinks:
          'Your anonymous links no longer open; they work again once you have Pro.',
        button: 'Open your plan',
      },
      TRAFFIC_RUNNING_OUT: {
        subject: 'Your traffic is running out',
        title: 'Traffic is running out',
        body: 'You have used {{used}} of this month’s {{limit}} of traffic on {{site}}. When it runs out, your public videos and links stop opening for others until {{date}} (UTC).',
        button: 'Open your plan',
      },
      TRAFFIC_USED_UP: {
        subject: 'This month’s traffic is used up',
        title: 'Traffic used up',
        body: 'This month’s traffic ({{limit}}) on {{site}} is used up. Until {{date}} (UTC) your public videos and links do not open for others, and you cannot watch other people’s videos. Your own videos still play for you.',
        button: 'Open your plan',
      },
    },
    supportTopics: {
      QUESTION: 'question',
      BUG: 'bug report',
      ACCOUNT: 'account',
      IDEA: 'idea',
    },
    takedownRules: {
      SPAM: 'spam or advertising',
      ILLEGAL: 'illegal content',
      COPYRIGHT: 'copyright violation',
      ABUSE: 'insults or harassment',
      UNMARKED_ADULT: 'sensitive content without the mark',
      OTHER: 'a breach of the rules',
    },
    footer:
      'You received this email because an account on {{site}} was created with this address.',
    verify: {
      subject: 'Confirm your email for {{site}}',
      title: 'Welcome to {{site}}, {{name}}!',
      body: 'Confirm your email address to unlock uploads, video requests, friends and messages.',
      button: 'Confirm email',
      expires: 'The link is valid for 24 hours.',
    },
    reset: {
      subject: 'Reset your {{site}} password',
      title: 'Password reset',
      body: 'Hi {{name}}, someone (hopefully you) asked to reset the password for your {{site}} account.',
      button: 'Set a new password',
      expires:
        'The link is valid for 1 hour. If you did not request this, you can ignore this email.',
    },
    /** A guest's deal: {{name}} is the other side's display name. */
    guestDeal: {
      button: 'Open the deal',
      footer:
        'You got this email because you entered this address on a deal page on {{site}}. No account was created.',
      saved: {
        subject: 'Your deal with {{name}}',
        title: 'Keep this email',
        body: 'This button brings you back to your deal with {{name}} from any device. When {{name}} answers, we write to you here.',
      },
      offer: {
        subject: '{{name}} answered your offer',
        title: 'A new offer',
        body: '{{name}} proposed a different exchange. Accept it, answer with your own or decline — the deal waits three more days.',
      },
      accepted: {
        subject: 'The exchange with {{name}} is done',
        title: 'The exchange is done',
        body: 'You can watch and download the videos you received on the deal page for 7 days. Sign in or create an account there to keep them for good.',
      },
      shared: {
        subject: '{{name}} shared the videos with you',
        title: 'Shared with you',
        body: '{{name}} gave you the videos without taking yours; your videos were deleted from our servers. Watch and download yours on the deal page for 7 days.',
      },
      declined: {
        subject: '{{name}} declined the exchange',
        title: 'The exchange was declined',
        body: 'The deal is over. Your videos were deleted from our servers right away; nobody got them.',
      },
      closed: {
        subject: 'The deal with {{name}} is closed',
        title: 'The deal is closed',
        body: 'The deal could not go on (a video is no longer there or the account was closed). Your videos were deleted from our servers right away; nobody got them.',
      },
      expired: {
        subject: 'The deal with {{name}} ran out',
        title: 'The deal ran out',
        body: 'Nobody moved for three days, so the deal ended. Your videos were deleted from our servers right away; nobody got them.',
      },
    },
    /** Two-step sign-in: every change is mailed. */
    twoFactor: {
      button: 'Open security settings',
      notYou:
        'If this was not you, change your password at once and write to us.',
      on: {
        subject: 'Two-step sign-in is on',
        title: 'Two-step sign-in is on',
        body: 'Hi {{name}}, signing in to your {{site}} account with the password now also asks for the second step. Other devices were signed out.',
      },
      off: {
        subject: 'Two-step sign-in is off',
        title: 'Two-step sign-in is off',
        body: 'Hi {{name}}, signing in to your {{site}} account no longer asks for the second step.',
      },
      reset: {
        subject: 'Two-step sign-in was reset',
        title: 'Two-step sign-in was reset',
        body: 'Hi {{name}}, at your request an admin of {{site}} turned off two-step sign-in for your account. You can turn it on again in the security settings.',
      },
      recoveryUsed: {
        subject: 'A recovery code was used',
        title: 'A recovery code was used',
        body: 'Hi {{name}}, a recovery code of your {{site}} account was just used. Codes left: {{left}}.',
      },
    },
    /** A temporary link for one address: the link, then the code that opens it. */
    links: {
      footer:
        'You received this email because @{{username}} sent videos to this address on {{site}}.',
      invite: {
        subject: '@{{username}} shares videos with you',
        title: '{{name}} shares videos with you',
        body_one: '@{{username}} sent you a video on {{site}}: “{{title}}”.',
        body_other:
          '@{{username}} sent you {{count}} videos on {{site}}, starting with “{{title}}”.',
        how: 'Watch them and download them before the link runs out: it works until {{date}} (UTC). To open it, ask for a code — it comes to this address.',
        button: 'Open the videos',
      },
      code: {
        subject: 'Code {{code}} to open the videos',
        title: 'Your code: {{code}}',
        body: 'Enter it on the page of the temporary link from @{{username}}.',
        expires:
          'The code works for 15 minutes. If you did not ask for it, ignore this email.',
      },
    },
  },
} as const;
