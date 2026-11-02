import { matchFaq } from './faq-match';

const FAQ = [
  { key: 'free', question: 'Is tapeshelf free?', answer: 'Yes, with limits.', url: 'u1' },
  {
    key: 'download',
    question: 'Can people download my videos?',
    answer: 'Only with a ticket.',
    url: 'u2',
  },
  { key: 'delete', question: 'Как удалить аккаунт?', answer: 'В настройках, внизу.', url: 'u3' },
  {
    key: 'formats',
    question: 'Which formats can I upload?',
    answer: 'Most videos: mp4, mov.',
    url: 'u4',
  },
];

describe('matchFaq', () => {
  it('suggests the questions that share words with the subject, the best first', () => {
    expect(matchFaq('download videos', FAQ, 3).map((f) => f.key)).toEqual(['download']);
    expect(matchFaq('upload formats', FAQ, 3).map((f) => f.key)).toEqual(['formats']);
    // Russian endings: "удаление аккаунта" finds "Как удалить аккаунт?".
    expect(matchFaq('удаление аккаунта', FAQ, 3).map((f) => f.key)).toEqual(['delete']);
  });

  it('suggests nothing for short or unrelated words', () => {
    expect(matchFaq('hi', FAQ, 3)).toEqual([]);
    expect(matchFaq('weather tomorrow', FAQ, 3)).toEqual([]);
    expect(matchFaq('', FAQ, 3)).toEqual([]);
  });
});
