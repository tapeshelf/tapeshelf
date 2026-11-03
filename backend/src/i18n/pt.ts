export const pt = {
  errors: {
    internal: 'Algo deu errado do nosso lado. Tente de novo mais tarde.',
    generic: 'Não foi possível concluir a solicitação.',
    badRequest: 'A solicitação é inválida.',
    validation: 'Alguns campos estão inválidos.',
    notFound: 'Não encontrado.',
    conflict:
      'Isso entra em conflito com o estado atual. Atualize a página e tente de novo.',
    payloadTooLarge: 'A solicitação é grande demais.',
    tooManyRequests: 'Solicitações demais. Espere um pouco.',
    unauthorized: 'Você precisa entrar para fazer isso.',
    forbidden: 'Você não tem permissão para fazer isso.',
    auth: {
      captchaRequired: 'Confirme que você é humano.',
      captchaFailed: 'A verificação não passou. Tente de novo.',
      captchaUnavailable:
        'A verificação está indisponível agora. Tente mais tarde.',
      invalidCredentials: 'E-mail ou senha incorretos.',
      registrationClosed:
        'As inscrições estão fechadas aqui. Para ter uma conta, fale com quem administra este site.',
      emailTaken: 'Já existe uma conta com este e-mail.',
      usernameTaken: 'Este nome de usuário já está em uso.',
      usernameInvalid:
        'O nome de usuário tem de 3 a 30 caracteres: letras minúsculas, números e sublinhado.',
      usernameReserved: 'Este nome de usuário está reservado.',
      usernameChangeTooSoon_one:
        'Você poderá mudar o nome de usuário de novo daqui a {{count}} dia.',
      usernameChangeTooSoon_many:
        'Você poderá mudar o nome de usuário de novo daqui a {{count}} dias.',
      usernameChangeTooSoon_other:
        'Você poderá mudar o nome de usuário de novo daqui a {{count}} dias.',
      passwordWeak:
        'A senha precisa ter no mínimo 8 caracteres, com uma letra e um número.',
      tokenInvalid: 'Este link é inválido ou já foi usado.',
      tokenExpired: 'Este link expirou. Peça um novo.',
      emailNotVerified: 'Confirme seu e-mail primeiro.',
      emailAlreadyVerified: 'Seu e-mail já está confirmado.',
      accountBanned: 'Esta conta foi suspensa.',
      sessionExpired: 'Sua sessão expirou. Entre de novo.',
      tooManyAttempts_one:
        'Tentativas de login demais. Tente de novo daqui a {{count}} minuto.',
      tooManyAttempts_many:
        'Tentativas de login demais. Tente de novo daqui a {{count}} minutos.',
      tooManyAttempts_other:
        'Tentativas de login demais. Tente de novo daqui a {{count}} minutos.',
      googleNotConfigured: 'O login com o Google não está disponível.',
      googleFailed: 'Não foi possível entrar com o Google. Tente de novo.',
      googleSignupExpired: 'A sessão de cadastro expirou. Comece de novo.',
      wrongPassword: 'A senha atual está incorreta.',
      csrf: 'A solicitação foi bloqueada por segurança. Recarregue a página e tente de novo.',
      twoFactorLogin: 'Digite o código do seu app autenticador.',
      adminGoogle:
        'Administradores entram com a senha e a segunda etapa, não com o Google.',
      googleLinkTwoFactor:
        'Este e-mail pertence a uma conta com login em duas etapas. Entre com a senha dessa conta.',
    },
    twoFactor: {
      required:
        'O painel de administração exige login em duas etapas: ative em Configurações → Segurança.',
      confirm: 'Primeiro confirme que é você com a segunda etapa.',
      invalidCode: 'Este código não confere. Verifique e tente de novo.',
      expired: 'O login demorou demais. Digite sua senha de novo.',
      setupExpired: 'A configuração demorou demais. Comece de novo.',
      needsPassword:
        'O login em duas etapas protege uma senha. Crie uma senha primeiro.',
      admin: 'Um administrador não pode entrar sem a segunda etapa.',
      appExists: 'Já existe um app autenticador configurado.',
      passkeyInvalid: 'A chave de acesso não respondeu. Tente de novo.',
      passkeyLimit: 'Você já tem 10 chaves de acesso.',
      passkeyNotFound: 'Esta chave de acesso não existe mais.',
      noPasskey: 'Esta conta não tem chave de acesso.',
      off: 'O login em duas etapas está desativado.',
    },
    users: {
      notFound: 'Este usuário não existe.',
      pageHidingNotAllowed: 'Ocultar a página é um recurso do Pro.',
      invalidImage:
        'Este arquivo não é uma imagem aceita (JPEG, PNG, WebP ou GIF).',
    },
    exchange: {
      notFound: 'Este pedido não existe.',
      notAllowed: 'Você não pode fazer isso com este pedido.',
      offerChanged:
        'A proposta mudou enquanto isso. Confira o histórico do pedido e tente de novo.',
      videoBeingEdited:
        'Um vídeo desta troca está sendo editado pelo autor agora. Tente de novo quando ele estiver pronto.',
      nothingToRequest: 'Nenhum dos vídeos selecionados pode ser pedido.',
      hintTooEarly:
        'Você poderá ocultar a dica depois de mais algumas visualizações.',
      selfRequest: 'Você não pode pedir seus próprios vídeos.',
      invalidOffer:
        'Uma proposta precisa de pelo menos um vídeo de cada lado, todos disponíveis para os donos.',
      blocked: 'Você não pode enviar pedidos a este usuário.',
      alreadyBlocked: 'Este usuário já está bloqueado.',
      selfBlock: 'Você não pode bloquear a si mesmo.',
    },
    social: {
      selfFollow: 'Você não pode seguir a si mesmo.',
      followNotAllowed: 'Você não pode adicionar este usuário como amigo.',
    },
    editor: {
      invalid: 'Esta edição não pode ser salva: confira os tempos e as áreas.',
      nothing: 'Nada mudou.',
      inProgress:
        'Este vídeo já está sendo editado. Espere terminar ou cancele.',
      notReady: 'O vídeo poderá ser editado depois de processado.',
      proOnly: 'O editor de vídeo é um recurso do Pro.',
      copyOwnOnly: 'Só os seus próprios vídeos podem ser salvos como cópia.',
    },
    invites: {
      notFound: 'Este link de convite não existe.',
      expired: 'Este convite expirou. Peça um novo link.',
      usedUp: 'Este convite já foi usado o máximo de vezes. Peça um novo link.',
      own: 'Este é o seu próprio convite: envie para alguém.',
    },
    deals: {
      notFound:
        'Esta negociação não foi encontrada (ou este não é o navegador em que ela começou).',
      closed: 'Esta negociação terminou.',
      linkNotFound: 'Este link de troca não funciona mais.',
      linkVideos:
        'Escolha vídeos seus já prontos (até 50) para um link de troca.',
      guestsOff: 'Esta pessoa só aceita trocas com usuários cadastrados.',
      uploadsMax: 'Uma negociação aceita até {{max}} vídeos seus.',
      videoInOffer:
        'Este vídeo está na proposta em andamento: altere a proposta primeiro.',
      nothingOffered: 'Envie pelo menos um vídeo seu para oferecer.',
      tooMany:
        'Você tem {{max}} negociações em andamento. Conclua uma antes de começar outra.',
    },
    links: {
      notFound: 'Este link não existe ou não funciona mais.',
      passwordPro: 'Senha em link é um recurso do Pro.',
      tooMany:
        'Você tem {{max}} links ainda funcionando. Revogue alguns primeiro.',
      videoNotAllowed:
        'Só podem ser enviados por link os vídeos que você enviou e os que recebeu, desde que estejam prontos e não tenham sido excluídos.',
      locked: 'Digite primeiro a senha ou o código do e-mail.',
      wrongPassword: 'Senha incorreta.',
      wrongCode: 'O código está incorreto ou expirou. Peça um novo.',
      codeTooSoon:
        'Um código acabou de ser enviado. Você pode pedir outro daqui a um minuto.',
      codeLimit:
        'Códigos demais para este link. Tente de novo daqui a uma hora.',
      noEmail: 'Este link não é para um e-mail específico.',
      emailOff:
        'Este servidor não envia e-mails, então links para uma só pessoa não estão disponíveis.',
      blocked: 'Você não pode adicionar vídeos desta pessoa.',
    },
    anonymousLinks: {
      pro: 'Links anônimos são um recurso do Pro.',
      tooMany: 'Você tem {{max}} links anônimos. Exclua um deles primeiro.',
      notFound: 'Este link não existe ou não funciona mais.',
      nameNeeded:
        'Seu nome revela seu nome de usuário. Escolha um nome para este link.',
      nameNamesNickname: 'Este nome revela seu nome de usuário. Escolha outro.',
    },
    appTokens: {
      scope: 'A extensão do navegador não pode fazer isso.',
      invalid: 'A extensão não está mais conectada. Conecte-a de novo.',
      code: 'O código de conexão expirou ou está errado. Tente conectar de novo.',
      redirect: 'Isso não parece ser a extensão do tapeshelf.',
      notFound: 'Esta conexão não existe.',
    },
    chat: {
      notFriends:
        'Você só pode mandar mensagens para amigos: vocês dois precisam se adicionar.',
      unavailable: 'Este usuário não pode receber mensagens.',
      emptyMessage: 'Escreva algo ou anexe um vídeo.',
      videoNotAttachable:
        'Este vídeo não pode ser anexado. Escolha um vídeo pronto que apareça na sua página.',
      selfMessage: 'Você não pode mandar mensagem para si mesmo.',
      notFound: 'Esta conversa não existe.',
    },
    reports: {
      self: 'Você não pode denunciar a si mesmo nem os seus vídeos.',
    },
    support: {
      notFound: 'Este chamado não foi encontrado.',
      tooMany:
        'Você tem {{count}} chamados abertos. Espere a resposta de um deles ou marque um como resolvido.',
      closed:
        'Este chamado está encerrado. Se o problema continuar, abra um novo.',
      empty: 'Escreva uma mensagem ou adicione uma imagem.',
      tooManyFiles: 'Até {{count}} imagens por mensagem.',
      badImage:
        'Não foi possível ler esta imagem. Use PNG, JPG ou WebP de até 10 MB.',
      notYourVideo: 'Você só pode anexar um vídeo que você mesmo enviou.',
      notRated:
        'Um chamado pode ser avaliado depois de resolvido ou encerrado.',
    },
    site: {
      legalNotFound: 'O responsável por este site não publicou este documento.',
    },
    account: {
      confirmMismatch:
        'Digite seu nome de usuário exatamente como ele é para confirmar.',
      deleted: 'Esta conta foi excluída.',
    },
    billing: {
      disabled: 'Este servidor não tem pagamentos.',
      unavailable: 'Os pagamentos estão indisponíveis agora. Tente mais tarde.',
      signature: 'A assinatura digital não confere.',
      noSubscription: 'Você não tem assinatura.',
    },
    downloads: {
      limitReached:
        'Você já usou todos os {{limit}} downloads deste mês. O próximo fica disponível em {{date}}.',
      busy: 'Outro download ainda está em andamento. Espere ele terminar e tente de novo.',
      ticketInvalid:
        'Este link de download expirou. Comece o download de novo pela página do vídeo.',
      range: 'Esta parte do arquivo não existe.',
    },
    admin: {
      selfAction: 'Você não pode fazer isso com a sua própria conta.',
      adminTarget: 'Remova primeiro a função de administrador.',
      notInTrash: 'Este vídeo não está na lixeira.',
      purged: 'Este vídeo já foi apagado do armazenamento.',
      authorDeleted:
        'O autor excluiu a conta, então o vídeo não pode ser restaurado.',
      alreadyProcessed: 'Este vídeo já foi processado.',
      tierUntilPast: 'A data de término precisa estar no futuro.',
      tiersDisabled: 'Este servidor não tem planos.',
      reportClosed: 'Esta denúncia já foi tratada.',
      reportAction: 'Esta ação não combina com a denúncia.',
      noEmail: 'Esta conta não tem endereço de e-mail.',
      viewAsReadOnly:
        'Você está vendo o site como outro usuário: nada pode ser alterado.',
    },
    categories: {
      exists: 'Você já tem uma categoria com este nome.',
      tooMany: 'Você pode ter até {{max}} categorias.',
    },
    uploads: {
      fileTooLarge: 'O arquivo passa do limite de {{max}}.',
      quotaExceeded:
        'Não há espaço suficiente: {{used}} de {{quota}} já estão em uso.',
      notFound: 'Este envio não existe.',
      notActive: 'Este envio já terminou ou foi cancelado.',
      expired: 'Este envio expirou. Comece de novo.',
      incomplete:
        'Algumas partes do arquivo estão faltando ou danificadas. Tente enviar de novo.',
      sizeMismatch: 'O arquivo enviado não tem o tamanho informado.',
      extensionDailyLimit:
        'Hoje você já salvou {{limit}} vídeos pela extensão, o máximo permitido. A contagem recomeça à meia-noite (UTC).',
    },
    videos: {
      deleteInAdminPanel:
        'Exclua vídeos de outras pessoas no painel de administração: o autor recebe a regra e a sua observação.',
      notFound: 'Este vídeo não existe.',
      notReady: 'O vídeo ainda está sendo processado.',
      categoryNotFound: 'Esta categoria não existe.',
      stackNotFound: 'Esta pilha não existe.',
      stackTooSmall: 'Uma pilha precisa de pelo menos dois vídeos.',
      stackCategories:
        'Os vídeos de uma pilha têm uma só categoria: escolha-a primeiro.',
      frameNotFound: 'Este quadro não existe.',
      timestampOutOfRange: 'Este tempo passa do fim do vídeo.',
      notWatchable: 'Você não tem acesso a este vídeo.',
      playbackTokenInvalid:
        'O link de reprodução expirou. Recarregue a página.',
      downloadNotAllowed: 'Não é permitido baixar este vídeo.',
      alreadyInCollection: 'Este vídeo já está na sua coleção.',
      cannotAddToCollection:
        'Este vídeo não pode ser adicionado à sua coleção.',
      cannotHide: 'Este vídeo não está na sua estante.',
      ownVideoRename:
        'O seu próprio vídeo é renomeado no formulário de edição, e para todos.',
    },
  },
  editor: {
    copySuffix: '(editado)',
  },
  notifications: {
    failReason: {
      corrupted: 'o arquivo está danificado ou não é um vídeo',
      noVideoStream: 'o arquivo não tem faixa de vídeo',
      zeroDuration: 'o vídeo não tem duração',
      tooLong: 'vídeos com mais de 12 horas não são aceitos',
      tooLarge: 'quadros maiores que 4096 px não são aceitos',
      fpsTooHigh: 'taxas acima de 60 fps não são aceitas',
      tooManyStreams: 'o arquivo tem fluxos demais',
      transcodeFailed: 'não foi possível converter o vídeo',
      blocked:
        'este arquivo foi removido por violar as regras e não pode ser enviado de novo',
      internal: 'O processamento falhou. Tente enviar de novo',
    },
  },
  mail: {
    notifications: {
      guest: 'Um convidado',
      anonymous: 'Anônimo',
      manage: 'Escolha quais notificações você recebe: {{url}}',
      unsubscribe: 'Parar de receber e-mails como este: {{url}}',
      andMore_one: ' e mais {{count}}',
      andMore_many: ' e mais {{count}}',
      andMore_other: ' e mais {{count}}',
      REQUEST_RECEIVED: {
        subject: '{{name}} pede “{{title}}”',
        title: 'Novo pedido de vídeo',
        body_one:
          '{{name}} gostaria que você compartilhasse “{{title}}”. Compartilhe de graça, recuse ou proponha uma troca.',
        body_many:
          '{{name}} gostaria que você compartilhasse {{count}} vídeos, a começar por “{{title}}”. Compartilhe de graça, recuse ou proponha uma troca.',
        body_other:
          '{{name}} gostaria que você compartilhasse {{count}} vídeos, a começar por “{{title}}”. Compartilhe de graça, recuse ou proponha uma troca.',
        message: 'A mensagem: “{{message}}”',
        offered_one: 'Em troca, oferece {{count}} vídeo próprio.',
        offered_many: 'Em troca, oferece {{count}} vídeos próprios.',
        offered_other: 'Em troca, oferece {{count}} vídeos próprios.',
        button: 'Abrir o pedido',
      },
      OFFER_RECEIVED: {
        subject: '{{name}} fez uma proposta para você',
        title: 'Contraproposta recebida',
        body: '{{name}} propôs uma troca (rodada {{round}}). Aceite, recuse ou faça a sua própria proposta.',
        bodyDeal:
          '{{name}} oferece “{{gives}}”{{givesMore}} em troca do seu “{{wants}}”{{wantsMore}}. Aceite, recuse ou faça a sua própria proposta.',
        message: 'A mensagem: “{{message}}”',
        button: 'Abrir a negociação',
      },
      REQUEST_SHARED: {
        subject: '{{name}} compartilhou “{{title}}” com você',
        title: 'Compartilhado com você',
        body_one:
          '{{name}} compartilhou “{{title}}” com você de graça. O vídeo já está na sua coleção.',
        body_many:
          '{{name}} compartilhou {{count}} vídeos com você de graça, a começar por “{{title}}”. Eles já estão na sua coleção.',
        body_other:
          '{{name}} compartilhou {{count}} vídeos com você de graça, a começar por “{{title}}”. Eles já estão na sua coleção.',
        button: 'Ver o que você recebeu',
      },
      EXCHANGE_COMPLETED: {
        subject: 'Troca com {{name}} concluída',
        title: 'Troca concluída',
        body: 'Sua troca com {{name}} foi feita: você recebeu {{received}} e deu {{given}}. O que você recebeu já está na sua coleção.',
        button: 'Ver o que você recebeu',
      },
      REQUEST_DECLINED: {
        subject: '{{name}} recusou o pedido de “{{title}}”',
        title: 'Pedido recusado',
        body: '{{name}} recusou. {{comment}}',
        again_one: 'Você pode pedir de novo daqui a {{count}} dia.',
        again_many: 'Você pode pedir de novo daqui a {{count}} dias.',
        again_other: 'Você pode pedir de novo daqui a {{count}} dias.',
        button: 'Abrir o pedido',
      },
      REQUEST_CANCELLED: {
        subject: '{{name}} retirou o pedido de “{{title}}”',
        title: 'Pedido retirado',
        body: '{{name}} cancelou o pedido de “{{title}}”.',
        button: 'Abrir o pedido',
      },
      REQUEST_INVALIDATED: {
        subject: 'O pedido de “{{title}}” mudou',
        title: 'Pedido atualizado pelo sistema',
        body: 'Um vídeo do pedido de “{{title}}” não está mais disponível, então a negociação foi atualizada.',
        bodyClosed:
          'O pedido de “{{title}}” foi encerrado: a outra conta não está mais disponível.',
        bodyExpired:
          'A negociação com um convidado por “{{title}}” expirou: ninguém deu o próximo passo em três dias. Os vídeos do convidado foram apagados.',
        button: 'Abrir o pedido',
      },
      NEW_FOLLOWER: {
        subject: 'Novo seguidor: {{name}}',
        title: 'Novo seguidor',
        body: '{{name}} agora segue a sua coleção. Adicione de volta para vocês virarem amigos e trocarem mensagens.',
        button: 'Abrir a página da pessoa',
      },
      FRIEND_ACCEPTED: {
        subject: 'Agora você e {{name}} são amigos',
        title: 'Novo amigo',
        body: 'Agora você e {{name}} se seguem. Vocês podem trocar mensagens e vídeos.',
        button: 'Abrir a página da pessoa',
      },
      FOLLOWED_NEW_VIDEO: {
        subject: 'Vídeo novo de {{name}}: “{{title}}”',
        title: 'Vídeo novo de {{name}}',
        body: '{{name}} adicionou um vídeo novo, “{{title}}”.',
        bodyPrivate:
          '{{name}} adicionou um vídeo privado novo, “{{title}}”. Você pode pedir que ele seja compartilhado com você.',
        button: 'Abrir o vídeo',
      },
      NEW_MESSAGE: {
        subject: 'Nova mensagem de {{name}}',
        title: 'Nova mensagem',
        body: '{{name}}: “{{preview}}”',
        bodyVideo: '{{name}} enviou um vídeo para você no chat.',
        button: 'Abrir o chat',
      },
      VIDEO_PROCESSED: {
        subject: '“{{title}}” está pronto',
        title: 'Seu vídeo está pronto',
        body: '“{{title}}” foi processado e já pode ser assistido.',
        button: 'Abrir o vídeo',
      },
      VIDEO_FAILED: {
        subject: 'Não foi possível processar “{{title}}”',
        title: 'O processamento falhou',
        body: 'Não foi possível processar “{{title}}”: {{reason}}. Você pode enviar o arquivo de novo.',
        button: 'Abrir minha página',
      },
      VIDEO_REMOVED: {
        subject: '“{{title}}” foi excluído pelo autor',
        title: 'Um vídeo saiu da sua coleção',
        body: '{{author}} excluiu “{{title}}”, que estava na sua coleção. Ele não está mais disponível para ninguém.',
        button: 'Abrir as notificações',
      },
      REPORT_RESOLVED: {
        subject: 'Sua denúncia foi analisada',
        title: 'Denúncia analisada',
        bodyVideo:
          'Analisamos sua denúncia sobre “{{title}}” e tomamos providências. Obrigado por ajudar a manter o {{site}} seguro.',
        bodyUser:
          'Analisamos sua denúncia sobre {{title}} e tomamos providências. Obrigado por ajudar a manter o {{site}} seguro.',
        bodyVideoNone:
          'Analisamos sua denúncia sobre “{{title}}” e não encontramos violação das regras.',
        bodyUserNone:
          'Analisamos sua denúncia sobre {{title}} e não encontramos violação das regras.',
        button: 'Abrir as notificações',
      },
      ADMIN_NOTICE: {
        subject: 'Uma mensagem do {{site}}',
        title: 'Mensagem da equipe do {{site}}',
        body: '{{message}}',
        button: 'Abrir as notificações',
      },
      VIDEO_EDITED: {
        subject: 'Seu vídeo “{{title}}” foi editado por um moderador',
        title: 'Vídeo editado',
        body: 'Um moderador do {{site}} editou seu vídeo “{{title}}” (por exemplo, desfocou uma parte). O link e todo o resto continuam iguais.',
        button: 'Abrir o vídeo',
      },
      VIDEO_EDIT_FAILED: {
        subject: 'A edição de “{{title}}” não deu certo',
        title: 'Edição não salva',
        body: 'Não foi possível fazer a edição do seu vídeo “{{title}}”. O vídeo continua como estava; o editor guarda suas alterações, então você pode tentar de novo.',
        button: 'Abrir o editor',
      },
      SUPPORT_REPLY: {
        subject: 'O suporte respondeu ao seu chamado #{{number}}',
        title: 'O suporte respondeu',
        body: '#{{number}} “{{subject}}”: {{preview}}',
        bodyResolved:
          'O suporte marcou seu chamado #{{number}} “{{subject}}” como resolvido. Se o problema continuar, abra um novo chamado.',
        bodyResolvedWith:
          'O suporte respondeu ao seu chamado #{{number}} “{{subject}}” e o marcou como resolvido: {{preview}}',
        button: 'Abrir o chamado',
      },
      SUPPORT_TICKET: {
        subject: 'Suporte #{{number}}: {{subject}}',
        title: 'Chamado de suporte #{{number}}',
        body: '@{{name}} pede ajuda ({{topic}}): “{{subject}}”. {{preview}}',
        bodyReply:
          '@{{name}} escreveu de novo no chamado #{{number}} “{{subject}}”: {{preview}}',
        button: 'Abrir no painel',
      },
      LINK_OPENED: {
        subject: 'Seu link temporário foi aberto',
        title: 'Link aberto',
        body_one: '@{{name}} abriu seu link temporário com “{{title}}”.',
        body_many:
          '@{{name}} abriu seu link temporário com {{count}} vídeos, a começar por “{{title}}”.',
        body_other:
          '@{{name}} abriu seu link temporário com {{count}} vídeos, a começar por “{{title}}”.',
        bodyGuest_one: 'Alguém abriu seu link temporário com “{{title}}”.',
        bodyGuest_many:
          'Alguém abriu seu link temporário com {{count}} vídeos, a começar por “{{title}}”.',
        bodyGuest_other:
          'Alguém abriu seu link temporário com {{count}} vídeos, a começar por “{{title}}”.',
        button: 'Abrir meus links',
      },
      LINK_SAVED: {
        subject: '@{{name}} salvou vídeos do seu link',
        title: 'Salvo a partir do seu link',
        body_one:
          '@{{name}} colocou “{{title}}”, do seu link temporário, na própria estante.',
        body_many:
          '@{{name}} colocou {{count}} vídeos do seu link temporário na própria estante, a começar por “{{title}}”.',
        body_other:
          '@{{name}} colocou {{count}} vídeos do seu link temporário na própria estante, a começar por “{{title}}”.',
        button: 'Abrir meus links',
      },
      VIDEO_TAKEN_DOWN: {
        subject: 'Seu vídeo “{{title}}” foi removido',
        title: 'Vídeo removido',
        body: 'Removemos seu vídeo “{{title}}” do {{site}}: {{rule}}. Ele não está mais disponível para ninguém.',
        message: 'Observação do moderador: {{message}}',
        appeal: 'Se você acha que foi um engano, escreva para {{email}}.',
        button: 'Abrir as notificações',
      },
      PLAN_EXPIRING: {
        subject: 'Seu plano Pro acaba em {{date}}',
        title: 'O Pro acaba em breve',
        body: 'Seu plano Pro no {{site}} acaba em {{date}} (UTC). Depois disso, sua estante passa para os limites do Free; nada é excluído.',
        page: 'Sua página está oculta agora; quando o Pro acabar, todos vão poder vê-la de novo.',
        anonymousLinks:
          'Quando o Pro acabar, seus links anônimos vão parar de abrir; com o Pro, eles voltam a funcionar.',
        button: 'Abrir seu plano',
      },
      PLAN_PAYMENT_FAILED: {
        subject: 'Não conseguimos renovar seu plano Pro',
        title: 'O pagamento falhou',
        body: 'O pagamento do seu plano Pro no {{site}} não foi aprovado. Atualize a forma de pagamento até {{date}} (UTC), senão sua estante passa para os limites do Free; nada é excluído.',
        button: 'Atualizar forma de pagamento',
      },
      PLAN_EXPIRED: {
        subject: 'Seu plano Pro acabou',
        title: 'O Pro acabou',
        body: 'Sua estante no {{site}} agora tem os limites do Free: {{file}} por vídeo e {{shelf}} no total. Nada foi excluído.',
        bodyOverQuota:
          'Sua estante no {{site}} agora tem os limites do Free: {{file}} por vídeo e {{shelf}} no total. Sua estante ocupa mais do que isso, então novos envios ficam pausados até você liberar espaço. Nada foi excluído.',
        page: 'Sua página voltou a ficar visível para todos: ocultá-la é um recurso do Pro.',
        anonymousLinks:
          'Seus links anônimos não abrem mais; com o Pro, eles voltam a funcionar.',
        button: 'Abrir seu plano',
      },
    },
    supportTopics: {
      QUESTION: 'dúvida',
      BUG: 'relato de erro',
      ACCOUNT: 'conta',
      IDEA: 'ideia',
    },
    takedownRules: {
      SPAM: 'spam ou propaganda',
      ILLEGAL: 'conteúdo ilegal',
      COPYRIGHT: 'violação de direitos autorais',
      ABUSE: 'ofensas ou assédio',
      UNMARKED_ADULT: 'conteúdo sensível sem a marca',
      OTHER: 'violação das regras',
    },
    footer:
      'Você recebeu este e-mail porque uma conta no {{site}} foi criada com este endereço.',
    verify: {
      subject: 'Confirme seu e-mail no {{site}}',
      title: 'Boas-vindas ao {{site}}, {{name}}!',
      body: 'Confirme seu endereço de e-mail para poder enviar vídeos, fazer pedidos, adicionar amigos e mandar mensagens.',
      button: 'Confirmar e-mail',
      expires: 'O link vale por 24 horas.',
    },
    reset: {
      subject: 'Redefina sua senha do {{site}}',
      title: 'Redefinição de senha',
      body: 'Olá, {{name}}. Alguém (esperamos que você) pediu para redefinir a senha da sua conta no {{site}}.',
      button: 'Criar uma nova senha',
      expires:
        'O link vale por 1 hora. Se não foi você que pediu, pode ignorar este e-mail.',
    },
    guestDeal: {
      button: 'Abrir a negociação',
      footer:
        'Você recebeu este e-mail porque informou este endereço numa página de negociação do {{site}}. Nenhuma conta foi criada.',
      saved: {
        subject: 'Sua negociação com {{name}}',
        title: 'Guarde este e-mail',
        body: 'Este botão leva você de volta à sua negociação com {{name}} em qualquer dispositivo. Quando {{name}} responder, escrevemos para você aqui.',
      },
      offer: {
        subject: '{{name}} respondeu à sua proposta',
        title: 'Uma nova proposta',
        body: '{{name}} propôs uma troca diferente. Aceite, responda com a sua ou recuse. A negociação espera mais três dias.',
      },
      accepted: {
        subject: 'A troca com {{name}} foi feita',
        title: 'A troca foi feita',
        body: 'Você pode assistir e baixar os vídeos que recebeu na página da negociação durante 7 dias. Entre ou crie uma conta lá para guardá-los para sempre.',
      },
      shared: {
        subject: '{{name}} compartilhou os vídeos com você',
        title: 'Compartilhado com você',
        body: '{{name}} deu os vídeos a você sem levar os seus; os seus vídeos foram apagados dos nossos servidores. Assista e baixe o que você recebeu na página da negociação durante 7 dias.',
      },
      declined: {
        subject: '{{name}} recusou a troca',
        title: 'A troca foi recusada',
        body: 'A negociação terminou. Seus vídeos foram apagados dos nossos servidores na hora; ninguém ficou com eles.',
      },
      closed: {
        subject: 'A negociação com {{name}} foi encerrada',
        title: 'A negociação foi encerrada',
        body: 'A negociação não pôde continuar (um vídeo não existe mais ou a conta foi encerrada). Seus vídeos foram apagados dos nossos servidores na hora; ninguém ficou com eles.',
      },
      expired: {
        subject: 'A negociação com {{name}} expirou',
        title: 'A negociação expirou',
        body: 'Ninguém deu o próximo passo em três dias, então a negociação terminou. Seus vídeos foram apagados dos nossos servidores na hora; ninguém ficou com eles.',
      },
    },
    twoFactor: {
      button: 'Abrir as configurações de segurança',
      notYou:
        'Se não foi você, troque sua senha imediatamente e escreva para nós.',
      on: {
        subject: 'Login em duas etapas ativado',
        title: 'Login em duas etapas ativado',
        body: 'Olá, {{name}}. Agora, ao entrar com senha na sua conta do {{site}}, a segunda etapa também é pedida. Os outros dispositivos foram desconectados.',
      },
      off: {
        subject: 'Login em duas etapas desativado',
        title: 'Login em duas etapas desativado',
        body: 'Olá, {{name}}. Entrar na sua conta do {{site}} não pede mais a segunda etapa.',
      },
      reset: {
        subject: 'O login em duas etapas foi redefinido',
        title: 'O login em duas etapas foi redefinido',
        body: 'Olá, {{name}}. A seu pedido, um administrador do {{site}} desativou o login em duas etapas da sua conta. Você pode ativá-lo de novo nas configurações de segurança.',
      },
      recoveryUsed: {
        subject: 'Um código de recuperação foi usado',
        title: 'Um código de recuperação foi usado',
        body: 'Olá, {{name}}. Um código de recuperação da sua conta do {{site}} acabou de ser usado. Códigos restantes: {{left}}.',
      },
    },
    links: {
      footer:
        'Você recebeu este e-mail porque @{{username}} enviou vídeos para este endereço pelo {{site}}.',
      invite: {
        subject: '@{{username}} compartilha vídeos com você',
        title: '{{name}} compartilha vídeos com você',
        body_one:
          '@{{username}} enviou um vídeo para você pelo {{site}}: “{{title}}”.',
        body_many:
          '@{{username}} enviou {{count}} vídeos para você pelo {{site}}, a começar por “{{title}}”.',
        body_other:
          '@{{username}} enviou {{count}} vídeos para você pelo {{site}}, a começar por “{{title}}”.',
        how: 'Assista e baixe antes que o link expire: ele funciona até {{date}} (UTC). Para abrir, peça um código; ele chega neste endereço.',
        button: 'Abrir os vídeos',
      },
      code: {
        subject: 'Código {{code}} para abrir os vídeos',
        title: 'Seu código: {{code}}',
        body: 'Digite o código na página do link temporário de @{{username}}.',
        expires:
          'O código vale por 15 minutos. Se você não pediu, ignore este e-mail.',
      },
    },
  },
};
